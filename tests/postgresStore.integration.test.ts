import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { PostgresStore } from '../src/store/postgres.js';

const databaseUrl = process.env.DATABASE_URL;
const hasDb = Boolean(databaseUrl);

const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('PostgresStore integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const store = new PostgresStore(pool);

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
    await pool.query('TRUNCATE TABLE idempotency_keys, order_items, order_events, outbox_events, orders, call_sessions RESTART IDENTITY');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('enforces idempotent order creation and single outbox append', async () => {
    const command = {
      storeId: 'store-1',
      idempotencyKey: 'pg-idem-1',
      customerName: 'Casey',
      customerPhone: '+15550001111',
      items: [
        {
          itemId: 'item-burrito',
          itemNameSnapshot: 'Chicken Burrito',
          qty: 1,
          basePriceCents: 1299,
          modifiersSnapshotJson: [],
          lineTotalCents: 1299
        }
      ],
      totalCents: 1299,
      callId: 'call-pg-1'
    };

    const first = await store.createOrder(command);
    const second = await store.createOrder(command);

    expect(first.id).toBe(second.id);
    expect(first.orderNumber).toBe(second.orderNumber);

    const outbox = await store.listOutbox('store-1', 'PENDING');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.eventType).toBe('OrderCreated');
  });

  it('rejects invalid status transitions and keeps events consistent', async () => {
    const created = await store.createOrder({
      storeId: 'store-1',
      idempotencyKey: 'pg-idem-2',
      customerName: 'Reese',
      customerPhone: '+15550002222',
      items: [
        {
          itemId: 'item-bowl',
          itemNameSnapshot: 'Veggie Bowl',
          qty: 1,
          basePriceCents: 1199,
          modifiersSnapshotJson: [],
          lineTotalCents: 1199
        }
      ],
      totalCents: 1199
    });

    await expect(store.updateOrderStatus(created.id, 'READY', 'staff-1')).rejects.toThrow(/invalid transition/i);

    const events = await store.getEventsForOrder(created.id);
    expect(events.map((event) => event.eventType)).toEqual(['OrderCreated']);
  });

  it('supports events replay and outbox sent/failed marks', async () => {
    const created = await store.createOrder({
      storeId: 'store-1',
      idempotencyKey: 'pg-idem-3',
      customerName: 'Alex',
      customerPhone: '+15550003333',
      items: [
        {
          itemId: 'item-burrito',
          itemNameSnapshot: 'Chicken Burrito',
          qty: 1,
          basePriceCents: 1299,
          modifiersSnapshotJson: [],
          lineTotalCents: 1299
        }
      ],
      totalCents: 1299
    });

    await store.ackOrder(created.id, 'tablet-a');
    const replay = await store.getEventsSince('store-1', 0);
    expect(replay.length).toBeGreaterThanOrEqual(2);

    const pending = await store.listOutbox('store-1', 'PENDING');
    const first = pending[0];
    expect(first).toBeDefined();
    if (!first) {
      throw new Error('missing pending outbox event');
    }

    const failed = await store.markOutboxFailed(first.id, new Date(Date.now() + 1000).toISOString());
    expect(failed?.status).toBe('FAILED');

    const sent = await store.markOutboxSent(first.id);
    expect(sent?.status).toBe('SENT');
    expect(sent?.sentAt).toBeDefined();
  });

  it('loads auth users from persistent staff_users storage', async () => {
    const manager = await store.getAuthUserByEmail('store-1', 'manager@store.test');
    expect(manager).toBeDefined();
    expect(manager?.role).toBe('MANAGER');
    expect(manager?.active).toBe(true);
    expect(manager?.passwordHash).toContain('pbkdf2_sha256$');
  });
});
