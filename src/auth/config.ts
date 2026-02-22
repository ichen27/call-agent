import type { AuthUser } from './types.js';

const DEFAULT_USERS: AuthUser[] = [
  {
    userId: 'staff-1',
    storeId: 'store-1',
    email: 'staff@store.test',
    role: 'STAFF',
    password: 'password123'
  },
  {
    userId: 'manager-1',
    storeId: 'store-1',
    email: 'manager@store.test',
    role: 'MANAGER',
    password: 'password123'
  }
];

export function isAuthRequired(): boolean {
  const configured = process.env.AUTH_REQUIRED;
  if (configured !== undefined) {
    return configured.toLowerCase() === 'true';
  }

  const env = (process.env.NODE_ENV ?? 'development').toLowerCase();
  if (env === 'development' || env === 'test') {
    return false;
  }
  return true;
}

export function jwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-insecure-secret';
}

export function jwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN ?? '8h';
}

export function configuredUsers(): AuthUser[] {
  const raw = process.env.AUTH_USERS_JSON;
  if (!raw) return DEFAULT_USERS;

  try {
    const parsed = JSON.parse(raw) as AuthUser[];
    return parsed;
  } catch {
    return DEFAULT_USERS;
  }
}
