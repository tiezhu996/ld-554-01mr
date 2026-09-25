import { request } from '@/utils/request';

export function fetchMonthlyWorkHours(params: Record<string, unknown>) {
  return request.get('/workhours/monthly', { params });
}

export function exportMonthlyWorkHours(params: Record<string, unknown>) {
  return request.get('/workhours/monthly/export', { params, responseType: 'blob' });
}
