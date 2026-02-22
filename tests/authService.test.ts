import { afterEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/service.js';

const backup = { ...process.env };

afterEach(() => {
  process.env = { ...backup };
});

describe('auth service', () => {
  it('logs in seeded user and verifies token', () => {
    delete process.env.AUTH_USERS_JSON;
    process.env.JWT_SECRET = 'test-secret';

    const auth = new AuthService();
    const result = auth.login('store-1', 'manager@store.test', 'password123');
    expect(result).toBeDefined();
    if (!result) {
      throw new Error('expected login result');
    }

    const verified = auth.verify(result.token);
    expect(verified?.email).toBe('manager@store.test');
    expect(verified?.role).toBe('MANAGER');
  });

  it('rejects invalid credentials', () => {
    delete process.env.AUTH_USERS_JSON;
    const auth = new AuthService();
    const result = auth.login('store-1', 'manager@store.test', 'wrong');
    expect(result).toBeUndefined();
  });
});
