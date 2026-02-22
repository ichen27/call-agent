import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { getDbConfig } from './config.js';

function migrationsDir(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  return join(here, '../../migrations');
}

async function runMigrations(): Promise<void> {
  const config = getDbConfig();
  if (config.backend !== 'postgres' || !config.databaseUrl) {
    throw new Error('Migration requires STORE_BACKEND=postgres and DATABASE_URL');
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir())
      .filter((entry) => entry.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const already = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (already.rowCount && already.rowCount > 0) {
        continue;
      }

      const sql = readFileSync(join(migrationsDir(), file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied migration: ${file}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exit(1);
});
