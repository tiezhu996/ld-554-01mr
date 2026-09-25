import { Op, type WhereOptions } from 'sequelize';
import { Employee, Shift, Store } from '../models/index.js';
import { ShiftType, ShiftTypeLabel, UserRole, type ShiftTypeValue } from '../constants/enums.js';
import { toCsv } from '../utils/excel-export.js';
import type { AuthUser } from '../types/request.js';

const MINUTES_PER_DAY = 24 * 60;
const REGULAR_MINUTES_PER_DAY = 8 * 60;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface ShiftRecord {
  id: number;
  employeeId: number;
  date: string;
  shiftType: ShiftTypeValue;
  startTime: string;
  endTime: string;
  storeId: number;
  Employee?: { name: string; employeeNo: string } | null;
  Store?: { name: string } | null;
}

export interface WorkHourRow {
  employeeId: number;
  employeeNo: string;
  employeeName: string;
  storeName: string;
  workDays: number;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  exceptionDays: number;
}

export interface WorkHourException {
  employeeId: number;
  employeeNo: string;
  employeeName: string;
  date: string;
  reason: string;
  shiftIds: number[];
}

export interface MonthlyWorkHourSummary {
  month: string;
  list: WorkHourRow[];
  exceptions: WorkHourException[];
  totals: {
    workDays: number;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    exceptionDays: number;
  };
}

function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0, seconds = 0] = time.split(':').map(Number);
  return hours * 60 + minutes + Math.round(seconds / 60);
}

/** 班次相对当天午夜的分钟区间；跨午夜时结束时间顺延到次日（+24h） */
function shiftInterval(shift: Pick<ShiftRecord, 'startTime' | 'endTime'>) {
  const start = timeToMinutes(shift.startTime);
  let end = timeToMinutes(shift.endTime);
  if (end < start) end += MINUTES_PER_DAY;
  return { start, end };
}

export function crossesMidnight(shift: Pick<ShiftRecord, 'startTime' | 'endTime'>): boolean {
  return timeToMinutes(shift.endTime) < timeToMinutes(shift.startTime);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function monthRange(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end };
}

/** 工时归属日期：普通班算当天，跨午夜的班次算到次日 */
export function attributedDate(shift: Pick<ShiftRecord, 'date' | 'startTime' | 'endTime'>): string {
  return crossesMidnight(shift) ? addDays(shift.date, 1) : shift.date;
}

function describeShift(shift: ShiftRecord): string {
  return `${ShiftTypeLabel[shift.shiftType]} ${shift.startTime.slice(0, 5)}-${shift.endTime.slice(0, 5)}`;
}

/** 同一天内两两重叠的班次对；零时长班次不参与重叠判断 */
export function findOverlapPairs(shifts: ShiftRecord[]): Array<[ShiftRecord, ShiftRecord]> {
  const pairs: Array<[ShiftRecord, ShiftRecord]> = [];
  const sorted = [...shifts].sort((a, b) => shiftInterval(a).start - shiftInterval(b).start || a.id - b.id);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const first = shiftInterval(sorted[i]);
      const second = shiftInterval(sorted[j]);
      if (first.end <= first.start || second.end <= second.start) continue;
      if (first.start < second.end && second.start < first.end) {
        pairs.push([sorted[i], sorted[j]]);
      }
    }
  }
  return pairs;
}

const toHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

/** 纯函数：按规则汇总一个月的员工工时，便于单测。休息班不计；冲突当天不计。 */
export function buildMonthlySummary(shifts: ShiftRecord[], month: string): MonthlyWorkHourSummary {
  const { start, end } = monthRange(month);
  const inMonth = (date: string) => date >= start && date <= end;

  const employees = new Map<number, { name: string; employeeNo: string; stores: Set<string> }>();
  for (const shift of shifts) {
    const info = employees.get(shift.employeeId) ?? { name: '', employeeNo: '', stores: new Set<string>() };
    info.name = shift.Employee?.name ?? info.name;
    info.employeeNo = shift.Employee?.employeeNo ?? info.employeeNo;
    if (shift.Store?.name) info.stores.add(shift.Store.name);
    employees.set(shift.employeeId, info);
  }

  // 休息班不计工时，也不参与重叠判断
  const workable = shifts.filter((shift) => shift.shiftType !== ShiftType.REST);

  // 同一员工同一天多段重叠班次 → 当天不计入总工时，冲突原因列入异常
  const groups = new Map<string, ShiftRecord[]>();
  for (const shift of workable) {
    const key = `${shift.employeeId}|${shift.date}`;
    const group = groups.get(key) ?? [];
    group.push(shift);
    groups.set(key, group);
  }

  const excludedShiftIds = new Set<number>();
  const exceptions: WorkHourException[] = [];
  for (const group of groups.values()) {
    const pairs = findOverlapPairs(group);
    if (!pairs.length) continue;
    for (const shift of group) excludedShiftIds.add(shift.id);
    // 仅当被剔除班次的工时本应落入本月时才列入本月异常
    if (!group.some((shift) => inMonth(attributedDate(shift)))) continue;
    const first = group[0];
    exceptions.push({
      employeeId: first.employeeId,
      employeeNo: first.Employee?.employeeNo ?? '',
      employeeName: first.Employee?.name ?? '',
      date: first.date,
      reason: pairs.map(([a, b]) => `班次时间重叠：${describeShift(a)} 与 ${describeShift(b)}`).join('；'),
      shiftIds: group.map((shift) => shift.id).sort((a, b) => a - b)
    });
  }

  // 按 员工+归属日 累计工时（分钟）
  const dailyMinutes = new Map<string, number>();
  for (const shift of workable) {
    if (excludedShiftIds.has(shift.id)) continue;
    const date = attributedDate(shift);
    if (!inMonth(date)) continue;
    const { start: from, end: to } = shiftInterval(shift);
    const key = `${shift.employeeId}|${date}`;
    dailyMinutes.set(key, (dailyMinutes.get(key) ?? 0) + (to - from));
  }

  // 单日超过 8 小时的部分算加班
  const perEmployee = new Map<number, { workDays: number; totalMinutes: number; overtimeMinutes: number }>();
  for (const [key, minutes] of dailyMinutes) {
    const employeeId = Number(key.split('|')[0]);
    const overtime = Math.max(0, minutes - REGULAR_MINUTES_PER_DAY);
    const row = perEmployee.get(employeeId) ?? { workDays: 0, totalMinutes: 0, overtimeMinutes: 0 };
    row.workDays += 1;
    row.totalMinutes += minutes;
    row.overtimeMinutes += overtime;
    perEmployee.set(employeeId, row);
  }

  const exceptionDays = new Map<number, number>();
  for (const exception of exceptions) {
    exceptionDays.set(exception.employeeId, (exceptionDays.get(exception.employeeId) ?? 0) + 1);
  }

  const employeeIds = new Set([...perEmployee.keys(), ...exceptionDays.keys()]);
  const list: WorkHourRow[] = [...employeeIds]
    .map((employeeId) => {
      const info = employees.get(employeeId);
      const row = perEmployee.get(employeeId) ?? { workDays: 0, totalMinutes: 0, overtimeMinutes: 0 };
      return {
        employeeId,
        employeeNo: info?.employeeNo ?? '',
        employeeName: info?.name ?? '',
        storeName: info ? [...info.stores].join('、') : '',
        workDays: row.workDays,
        totalHours: toHours(row.totalMinutes),
        regularHours: toHours(row.totalMinutes - row.overtimeMinutes),
        overtimeHours: toHours(row.overtimeMinutes),
        exceptionDays: exceptionDays.get(employeeId) ?? 0
      };
    })
    .sort((a, b) => a.employeeId - b.employeeId);

  exceptions.sort((a, b) => a.date.localeCompare(b.date) || a.employeeId - b.employeeId);

  const totalMinutes = [...perEmployee.values()].reduce((sum, row) => sum + row.totalMinutes, 0);
  const overtimeMinutes = [...perEmployee.values()].reduce((sum, row) => sum + row.overtimeMinutes, 0);

  return {
    month,
    list,
    exceptions,
    totals: {
      workDays: [...perEmployee.values()].reduce((sum, row) => sum + row.workDays, 0),
      totalHours: toHours(totalMinutes),
      regularHours: toHours(totalMinutes - overtimeMinutes),
      overtimeHours: toHours(overtimeMinutes),
      exceptionDays: exceptions.length
    }
  };
}

/** 门店数据范围：老板可看全部或指定门店，店长只能看自己门店 */
function resolveStoreScope(query: Record<string, unknown>, user?: AuthUser): number | null {
  if (!user || user.role === UserRole.OWNER) {
    if (query.storeId === undefined || query.storeId === null || query.storeId === '') return null;
    const storeId = Number(query.storeId);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      throw Object.assign(new Error('门店参数不正确'), { status: 400 });
    }
    return storeId;
  }
  // 未分配门店的店长返回不可能命中的 id，结果为空
  return user.storeId ?? -1;
}

export async function getMonthlyWorkHours(query: Record<string, unknown>, user?: AuthUser) {
  const month = String(query.month ?? '');
  if (!MONTH_PATTERN.test(month)) {
    throw Object.assign(new Error('月份格式不正确，应为 YYYY-MM'), { status: 400 });
  }
  const storeId = resolveStoreScope(query, user);
  const { start, end } = monthRange(month);
  const where: WhereOptions = {
    // 上月最后一天跨午夜的班次工时算到本月，需要一并取出
    date: { [Op.between]: [addDays(start, -1), end] }
  };
  if (storeId !== null) Object.assign(where, { storeId });
  const shifts = await Shift.findAll({
    where,
    include: [
      { model: Employee, attributes: ['name', 'employeeNo'] },
      { model: Store, attributes: ['name'] }
    ],
    order: [
      ['date', 'ASC'],
      ['id', 'ASC']
    ]
  });
  const records = shifts.map((shift) => shift.get({ plain: true }) as ShiftRecord);
  return { storeId, ...buildMonthlySummary(records, month) };
}

export async function exportMonthlyWorkHours(query: Record<string, unknown>, user?: AuthUser) {
  const summary = await getMonthlyWorkHours(query, user);
  const rows = summary.list.map((row) => ({
    员工: row.employeeName,
    工号: row.employeeNo,
    门店: row.storeName,
    出勤天数: row.workDays,
    '总工时(小时)': row.totalHours,
    '正常工时(小时)': row.regularHours,
    '加班工时(小时)': row.overtimeHours,
    异常天数: row.exceptionDays
  }));
  rows.push({
    员工: '合计',
    工号: '',
    门店: '',
    出勤天数: summary.totals.workDays,
    '总工时(小时)': summary.totals.totalHours,
    '正常工时(小时)': summary.totals.regularHours,
    '加班工时(小时)': summary.totals.overtimeHours,
    异常天数: summary.totals.exceptionDays
  });
  const exceptionRows = summary.exceptions.map((exception) => ({
    员工: exception.employeeName,
    工号: exception.employeeNo,
    日期: exception.date,
    冲突原因: exception.reason
  }));
  const csv = [
    `员工月度工时统计（${summary.month}）`,
    toCsv(rows),
    '',
    '异常记录（冲突当天未计入总工时）',
    exceptionRows.length ? toCsv(exceptionRows) : '无'
  ].join('\n');
  // 带 BOM 头，保证 Excel 打开中文不乱码
  return { filename: `月度工时-${summary.month}.csv`, csv: `\uFEFF${csv}` };
}
