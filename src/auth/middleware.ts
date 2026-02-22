import type { NextFunction, Request, Response } from 'express';
import { isAuthRequired } from './config.js';
import type { AuthService } from './service.js';
import type { UserRole } from './types.js';

const roleRank: Record<UserRole, number> = {
  STAFF: 1,
  MANAGER: 2
};

export function authenticateRequest(auth: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header) {
      next();
      return;
    }

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'invalid authorization header' } });
      return;
    }

    const context = auth.verify(token);
    if (!context) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'invalid token' } });
      return;
    }

    req.auth = context;
    next();
  };
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      if (!isAuthRequired()) {
        next();
        return;
      }

      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'missing bearer token' } });
      return;
    }

    if (roleRank[req.auth.role] < roleRank[role]) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'insufficient role' } });
      return;
    }

    next();
  };
}
