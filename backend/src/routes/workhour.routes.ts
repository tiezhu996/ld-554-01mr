import { Router } from 'express';
import * as controller from '../controllers/workhour.controller.js';
import { UserRole } from '../constants/enums.js';
import { requireRoles } from '../middlewares/rbac.middleware.js';

export const workhourRoutes = Router();

workhourRoutes.get('/monthly', requireRoles([UserRole.OWNER, UserRole.MANAGER]), controller.monthly);
workhourRoutes.get('/monthly/export', requireRoles([UserRole.OWNER, UserRole.MANAGER]), controller.exportMonthly);
