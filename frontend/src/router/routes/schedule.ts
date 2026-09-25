export const scheduleRoutes = [
  { path: '/schedule', name: 'schedule', component: () => import('@/pages/schedule/ScheduleWeek.vue'), meta: { roles: ['OWNER', 'MANAGER', 'EMPLOYEE'] } },
  { path: '/schedule/monthly', name: 'schedule-monthly', component: () => import('@/pages/schedule/ScheduleMonthly.vue'), meta: { roles: ['OWNER', 'MANAGER'] } }
];
