import type { ShiftType } from '@/constants/enums';

export interface Shift {
  id: number;
  employeeId: number;
  employee?: { name: string; employeeNo: string };
  date: string;
  shiftType: keyof typeof ShiftType;
  startTime: string;
  endTime: string;
  storeId: number;
  status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN';
}

export interface MonthlyWorkHourRow {
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
  storeId: number | null;
  list: MonthlyWorkHourRow[];
  exceptions: WorkHourException[];
  totals: {
    workDays: number;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    exceptionDays: number;
  };
}
