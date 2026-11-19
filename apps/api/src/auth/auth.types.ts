import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

export interface AuthUser {
  sub: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface SafeUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}
