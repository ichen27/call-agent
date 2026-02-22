import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('password hashing', () => {
  it('verifies the correct password', () => {
    const hashed = hashPassword('password123', 'seeded-salt');
    expect(verifyPassword('password123', hashed)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const hashed = hashPassword('password123', 'seeded-salt');
    expect(verifyPassword('wrong-password', hashed)).toBe(false);
  });

  it('rejects malformed hash payloads', () => {
    expect(verifyPassword('password123', 'invalid')).toBe(false);
  });
});
