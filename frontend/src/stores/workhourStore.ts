import { defineStore } from 'pinia';
import { fetchMonthlyWorkHours } from '@/api/workhour';
import type { MonthlyWorkHourResult, MonthlyWorkHourRow, WorkHourAnomaly } from '@/types/workhour';

export const useWorkhourStore = defineStore('workhours', {
  state: () => ({
    list: [] as MonthlyWorkHourRow[],
    anomalies: [] as WorkHourAnomaly[],
    month: '',
    loading: false
  }),
  actions: {
    async load(params: Record<string, unknown>) {
      this.loading = true;
      try {
        const response = await fetchMonthlyWorkHours(params) as { data: MonthlyWorkHourResult };
        this.list = response.data.list;
        this.anomalies = response.data.anomalies;
        this.month = response.data.month;
      } finally {
        this.loading = false;
      }
    }
  }
});
