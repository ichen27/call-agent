import { afterEach, describe, expect, it } from 'vitest';
import { createRepository } from '../src/store/factory.js';

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

describe('store factory', () => {
  it('uses memory backend by default', () => {
    delete process.env.STORE_BACKEND;
    delete process.env.DATABASE_URL;

    const built = createRepository();
    expect(built.backend).toBe('memory');
  });

  it('fails fast when postgres backend is selected for sync app', () => {
    process.env.STORE_BACKEND = 'postgres';
    process.env.DATABASE_URL = 'postgres://localhost:5432/test';

    expect(() => createRepository()).toThrow(/async app cutover/);
  });
});
