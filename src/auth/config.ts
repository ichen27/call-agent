import { hashPassword } from './password.js';
import type { ConfiguredAuthUser } from './types.js';

const DEFAULT_USERS: ConfiguredAuthUser[] = [
  {
    userId: 'staff-1',
    storeId: 'store-1',
    email: 'staff@store.test',
    role: 'STAFF',
    passwordHash: 'pbkdf2_sha256$100000$staffsalt001$98a63c3ab1915f2b4a93348c96a1ce2bddd33acb758c7ea1a5a9f2112857751c',
    active: true
  },
  {
    userId: 'manager-1',
    storeId: 'store-1',
    email: 'manager@store.test',
    role: 'MANAGER',
    passwordHash: 'pbkdf2_sha256$100000$managersalt01$24df85cc71a92729aa1a940f129e91d5c8a4f11e8a5273b5c26e26ad308e9884',
    active: true
  }
];

interface AuthUsersJsonEntry {
  userId: string;
  storeId: string;
  email: string;
  role: 'STAFF' | 'MANAGER';
  password?: string;
  passwordHash?: string;
  active?: boolean;
}

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

export function isNonLocalEnv(): boolean {
  const env = (process.env.NODE_ENV ?? 'development').toLowerCase();
  return env !== 'development' && env !== 'test';
}

export function jwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-insecure-secret';
}

export function jwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN ?? '8h';
}

export function configuredUsers(): ConfiguredAuthUser[] {
  const raw = process.env.AUTH_USERS_JSON;
  if (!raw) return DEFAULT_USERS;

  try {
    const parsed = JSON.parse(raw) as AuthUsersJsonEntry[];
    const normalized = parsed
      .map((entry) => {
        if (!entry.userId || !entry.storeId || !entry.email || !entry.role) {
          return undefined;
        }

        const passwordHash = entry.passwordHash ?? (entry.password ? hashPassword(entry.password) : undefined);
        if (!passwordHash) {
          return undefined;
        }

        const user: ConfiguredAuthUser = {
          userId: entry.userId,
          storeId: entry.storeId,
          email: entry.email,
          role: entry.role,
          passwordHash,
          active: entry.active !== false
        };
        return user;
      })
      .filter((entry): entry is ConfiguredAuthUser => Boolean(entry));

    return normalized.length > 0 ? normalized : DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

export function validateRuntimeSecurityConfig(): void {
  if (!isNonLocalEnv()) {
    return;
  }

  if (isAuthRequired() && jwtSecret() === 'dev-insecure-secret') {
    throw new Error('JWT_SECRET is required in non-local environments when auth is enabled');
  }

  const internalApiKey = process.env.INTERNAL_API_KEY;
  if (!internalApiKey || internalApiKey.trim().length < 8) {
    throw new Error('INTERNAL_API_KEY is required in non-local environments');
  }

  const telephonyToken = process.env.TELEPHONY_WEBHOOK_TOKEN;
  const telephonySecret = process.env.TELEPHONY_WEBHOOK_SECRET;
  if ((!telephonyToken || telephonyToken.trim().length < 8) && (!telephonySecret || telephonySecret.trim().length < 8)) {
    throw new Error('configure TELEPHONY_WEBHOOK_TOKEN or TELEPHONY_WEBHOOK_SECRET in non-local environments');
  }
}
