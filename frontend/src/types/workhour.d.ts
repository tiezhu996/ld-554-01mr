export interface MonthlyWorkHourRow {
  employeeId: number;
  employeeNo: string;
  name: string;
  storeName: string;
  workDays: number;
  totalHours: number;
  overtimeHours: number;
  anomalyDays: number;
}

export interface WorkHourAnomaly {
  employeeId: number;
  employeeNo: string;
  name: string;
  date: string;
  reason: string;
}

export interface MonthlyWorkHourResult {
  month: string;
  startDate: string;
  endDate: string;
  list: MonthlyWorkHourRow[];
  anomalies: WorkHourAnomaly[];
}
