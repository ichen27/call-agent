export type StoreBackend = 'memory' | 'postgres';

export interface DbConfig {
  backend: StoreBackend;
  databaseUrl?: string;
}

export function getDbConfig(): DbConfig {
  const backendRaw = (process.env.STORE_BACKEND ?? 'memory').toLowerCase();
  const backend: StoreBackend = backendRaw === 'postgres' ? 'postgres' : 'memory';

  if (process.env.DATABASE_URL) {
    return { backend, databaseUrl: process.env.DATABASE_URL };
  }
  return { backend };
}
