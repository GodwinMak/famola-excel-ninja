import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService';
import { User } from '../models/User';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing bearer token' });
  }

  try {
    const payload = verifyToken(token);
    const user = await User.findByPk(payload.sub);
    if (!user || user.status !== 'Active') {
      return res.status(401).json({ success: false, error: 'User not found or not active' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
