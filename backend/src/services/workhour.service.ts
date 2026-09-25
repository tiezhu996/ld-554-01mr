import { Op, type WhereOptions } from 'sequelize';
import { Shift, Employee, Store } from '../models/index.js';
import { ShiftType, UserRole, type ShiftTypeValue } from '../constants/enums.js';
import { storeScope } from './scope.service.js';
import { toCsv } from '../utils/excel-export.js';
import type { AuthUser } from '../types/request.js';

const REGULAR_MINUTES_PER_DAY = 8 * 60;
const MINUTES_PER_DAY = 24 * 60;

const ShiftTypeText: Record<ShiftTypeValue, string> = {
  [ShiftType.MORNING]: '早班',
  [ShiftType.AFTERNOON]: '中班',
  [ShiftType.NIGHT]: '晚班',
  [ShiftType.REST]: '休息'
};

export interface WorkHourShiftInput {
  employeeId: number;
  date: string;
  shiftType: ShiftTypeValue;
  startTime: string;
  endTime: string;
  Employee?: { employeeNo: string; name: string } | null;
  Store?: { name: string } | null;
}

interface ShiftInterval {
  shift: WorkHourShiftInput;
  start: number;
  end: number;
}

interface EmployeeBucket {
  employee: WorkHourShiftInput['Employee'];
  store: WorkHourShiftInput['Store'];
  byDate: Map<string, WorkHourShiftInput[]>;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function toInterval(shift: WorkHourShiftInput): ShiftInterval {
  const start = toMinutes(shift.startTime);
  let end = toMinutes(shift.endTime);
  if (end < start) end += MINUTES_PER_DAY;
  return { shift, start, end };
}

function formatTime(time: string) {
  return time.slice(0, 5);
}

function findConflicts(intervals: ShiftInterval[]) {
  const reasons: string[] = [];
  for (let i = 0; i < intervals.length; i += 1) {
    for (let j = i + 1; j < intervals.length; j += 1) {
      const a = intervals[i];
      const b = intervals[j];
      const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (overlap > 0) {
        const labelA = `${ShiftTypeText[a.shift.shiftType]} ${formatTime(a.shift.startTime)}-${formatTime(a.shift.endTime)}`;
        const labelB = `${ShiftTypeText[b.shift.shiftType]} ${formatTime(b.shift.startTime)}-${formatTime(b.shift.endTime)}`;
        reasons.push(`班次重叠：${labelA} 与 ${labelB} 时间重叠 ${overlap} 分钟`);
      }
    }
  }
  return reasons;
}

function roundHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

export function summarizeWorkHours(shifts: WorkHourShiftInput[]) {
  const buckets = new Map<number, EmployeeBucket>();
  for (const shift of shifts) {
    let bucket = buckets.get(shift.employeeId);
    if (!bucket) {
      bucket = { employee: shift.Employee ?? null, store: shift.Store ?? null, byDate: new Map() };
      buckets.set(shift.employeeId, bucket);
    }
    const dayShifts = bucket.byDate.get(shift.date) ?? [];
    dayShifts.push(shift);
    bucket.byDate.set(shift.date, dayShifts);
  }

  const list: Array<Record<string, unknown>> = [];
  const anomalies: Array<Record<string, unknown>> = [];

  for (const [employeeId, bucket] of buckets) {
    let totalMinutes = 0;
    let overtimeMinutes = 0;
    let workDays = 0;
    let anomalyDays = 0;
    const employeeNo = bucket.employee?.employeeNo ?? `EMP-${employeeId}`;
    const name = bucket.employee?.name ?? `员工 ${employeeId}`;

    for (const [date, dayShifts] of bucket.byDate) {
      const workShifts = dayShifts.filter((shift) => shift.shiftType !== ShiftType.REST);
      if (!workShifts.length) continue;
      const intervals = workShifts.map(toInterval);
      const conflicts = findConflicts(intervals);
      if (conflicts.length) {
        anomalyDays += 1;
        anomalies.push({ employeeId, employeeNo, name, date, reason: conflicts.join('；') });
        continue;
      }
      const dayMinutes = intervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0);
      totalMinutes += dayMinutes;
      overtimeMinutes += Math.max(0, dayMinutes - REGULAR_MINUTES_PER_DAY);
      workDays += 1;
    }

    if (!workDays && !anomalyDays) continue;
    list.push({
      employeeId,
      employeeNo,
      name,
      storeName: bucket.store?.name ?? '',
      workDays,
      totalHours: roundHours(totalMinutes),
      overtimeHours: roundHours(overtimeMinutes),
      anomalyDays
    });
  }

  list.sort((a, b) => String(a.employeeNo).localeCompare(String(b.employeeNo)));
  anomalies.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return { list, anomalies };
}

export async function getMonthlyWorkHours(query: Record<string, unknown>, user?: AuthUser) {
  const month = String(query.month ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw Object.assign(new Error('请提供有效的月份（格式 YYYY-MM）'), { status: 400 });
  }
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const endDate = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);

  const where: WhereOptions = { ...storeScope(user), date: { [Op.between]: [startDate, endDate] } };
  if (query.storeId && user?.role === UserRole.OWNER) Object.assign(where, { storeId: Number(query.storeId) });

  const shifts = (await Shift.findAll({
    where,
    include: [Employee, Store],
    order: [['date', 'ASC'], ['startTime', 'ASC']]
  })) as unknown as WorkHourShiftInput[];

  const { list, anomalies } = summarizeWorkHours(shifts);
  return { month, startDate, endDate, list, anomalies };
}

export async function exportMonthlyWorkHours(query: Record<string, unknown>, user?: AuthUser) {
  const { month, list, anomalies } = await getMonthlyWorkHours(query, user);
  const rows = list.map((row) => ({
    员工工号: row.employeeNo,
    姓名: row.name,
    门店: row.storeName,
    月份: month,
    计薪天数: row.workDays,
    '总工时(小时)': row.totalHours,
    '加班工时(小时)': row.overtimeHours,
    异常天数: row.anomalyDays,
    异常说明: (anomalies as Array<{ employeeId: unknown; date: unknown; reason: unknown }>)
      .filter((anomaly) => anomaly.employeeId === row.employeeId)
      .map((anomaly) => `${anomaly.date} ${anomaly.reason}`)
      .join('；')
  }));
  return toCsv(rows as Array<Record<string, unknown>>);
}
