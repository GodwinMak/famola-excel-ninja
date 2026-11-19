import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { User } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_insecure_secret_change_me';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

export interface JwtPayload {
  sub: string;
  role: string;
}

export function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function compareSecret(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(user: User): string {
  const payload: JwtPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    status: user.status,
    screenPermissions: user.screenPermissions,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}
