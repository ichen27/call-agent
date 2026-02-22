import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const databaseUrl = process.env.DATABASE_URL;
const hasDb = Boolean(databaseUrl);
const describeIfDb = hasDb ? describe : describe.skip;
const envBackup = { ...process.env };

describeIfDb('Postgres API integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    const migrationsDir = join(fileURLToPath(new URL('.', import.meta.url)), '../migrations');
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }
  });

  beforeEach(async () => {
    process.env = { ...envBackup };
    process.env.STORE_BACKEND = 'postgres';
    process.env.DATABASE_URL = databaseUrl;
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'postgres-api-test-secret';
    await pool.query('TRUNCATE TABLE idempotency_keys, order_items, order_events, outbox_events, orders, call_sessions RESTART IDENTITY');
  });

  afterAll(async () => {
    process.env = { ...envBackup };
    await pool.end();
  });

  it('supports login, idempotent create, and status transitions via HTTP routes', async () => {
    const { app } = createApp();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ store_id: 'store-1', email: 'staff@store.test', password: 'password123' })
      .expect(200);
    const token = String(login.body.token);

    const orderBody = {
      store_id: 'store-1',
      customer_name: 'API Integration',
      customer_phone: '+15550009999',
      items: [
        {
          item_id: 'item-burrito',
          item_name_snapshot: 'Chicken Burrito',
          qty: 1,
          base_price_cents: 1299,
          modifiers_snapshot_json: [],
          line_total_cents: 1299
        }
      ],
      total_cents: 1299
    };

    const first = await request(app).post('/api/orders').set('Idempotency-Key', 'pg-api-idem').send(orderBody).expect(201);
    const second = await request(app).post('/api/orders').set('Idempotency-Key', 'pg-api-idem').send(orderBody).expect(201);
    expect(first.body.id).toBe(second.body.id);

    await request(app)
      .patch(`/api/orders/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    await request(app)
      .post(`/api/orders/${first.body.id}/ack`)
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: 'tablet-pg-1' })
      .expect(200);

    const events = await request(app)
      .get('/api/stores/store-1/events')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(events.body.events.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects invalid store scope token access', async () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        userId: 'manager-a',
        storeId: 'store-1',
        email: 'manager-a@store.test',
        role: 'MANAGER',
        password: 'password123'
      },
      {
        userId: 'manager-b',
        storeId: 'store-2',
        email: 'manager-b@store.test',
        role: 'MANAGER',
        password: 'password123'
      }
    ]);

    const { app } = createApp();
    const login = await request(app)
      .post('/api/auth/login')
      .send({ store_id: 'store-2', email: 'manager-b@store.test', password: 'password123' })
      .expect(200);
    const token = String(login.body.token);

    await request(app).get('/api/stores/store-1/events').set('Authorization', `Bearer ${token}`).expect(403);
  });
});
