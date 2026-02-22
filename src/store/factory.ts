import { Pool } from 'pg';
import { getDbConfig } from '../db/config.js';
import type { AppRepository } from './repository.js';
import { MemoryStore } from './memory.js';
import { PostgresStore } from './postgres.js';

export function createRepository(): { repository: AppRepository; backend: 'memory' | 'postgres' } {
  const config = getDbConfig();

  if (config.backend === 'postgres') {
    if (!config.databaseUrl) {
      throw new Error('STORE_BACKEND=postgres requires DATABASE_URL');
    }
    return { repository: createPostgresStore(), backend: 'postgres' };
  }

  return { repository: new MemoryStore(), backend: 'memory' };
}

export function createPostgresStore(): PostgresStore {
  const config = getDbConfig();
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  return new PostgresStore(new Pool({ connectionString: config.databaseUrl }));
}
