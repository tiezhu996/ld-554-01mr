import type { NextFunction, Request, Response } from 'express';
import * as workhourService from '../services/workhour.service.js';
import { success } from '../utils/response.js';

export async function monthly(req: Request, res: Response, next: NextFunction) {
  try {
    success(res, await workhourService.getMonthlyWorkHours(req.query, req.user));
  } catch (error) {
    next(error);
  }
}

export async function exportMonthly(req: Request, res: Response, next: NextFunction) {
  try {
    const csv = await workhourService.exportMonthlyWorkHours(req.query, req.user);
    const filename = encodeURIComponent(`月度工时-${String(req.query.month ?? '')}.csv`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
}
