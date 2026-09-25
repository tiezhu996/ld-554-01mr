import { defineStore } from 'pinia';
import { fetchMonthlyWorkHours } from '@/api/shift';
import type { MonthlyWorkHourRow, WorkHourException } from '@/types/shift';

interface WorkhourState {
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
  loading: boolean;
}

export const useWorkhourStore = defineStore('workhours', {
  state: (): WorkhourState => ({
    month: '',
    storeId: null,
    list: [],
    exceptions: [],
    totals: { workDays: 0, totalHours: 0, regularHours: 0, overtimeHours: 0, exceptionDays: 0 },
    loading: false
  }),
  actions: {
    async load(params: { month: string; storeId?: number }) {
      this.loading = true;
      try {
        const response = await fetchMonthlyWorkHours(params) as {
          data: Omit<WorkhourState, 'loading'>;
        };
        this.month = response.data.month;
        this.storeId = response.data.storeId;
        this.list = response.data.list;
        this.exceptions = response.data.exceptions;
        this.totals = response.data.totals;
      } finally {
        this.loading = false;
      }
    }
  }
});
