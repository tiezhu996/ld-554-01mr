export const scheduleRoutes = [
  { path: '/schedule', name: 'schedule', component: () => import('@/pages/schedule/ScheduleWeek.vue'), meta: { roles: ['OWNER', 'MANAGER', 'EMPLOYEE'] } },
  { path: '/schedule/work-hours', name: 'schedule-work-hours', component: () => import('@/pages/schedule/ScheduleWorkHours.vue'), meta: { roles: ['OWNER', 'MANAGER'] } }
];
