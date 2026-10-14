import { Request, Response, NextFunction } from 'express';
import { canAccessScreen, isAdminRole, ScreenId } from '../services/rbacDefaults';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

export function requireScreen(screenId: ScreenId, level: 'view' | 'edit') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const allowed = canAccessScreen(
      user.role,
      user.status,
      user.screenPermissions as any,
      screenId,
      level
    );
    if (!allowed) {
      return res.status(403).json({ success: false, error: `Not authorized for ${screenId} (${level})` });
    }
    next();
  };
}
