import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const backupEnv = { ...process.env };

function buildOrderBody() {
  return {
    store_id: 'store-1',
    customer_name: 'Auth Test User',
    customer_phone: '+15555550123',
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
}

async function loginAndGetToken(app: ReturnType<typeof createApp>['app'], email: string, storeId = 'store-1') {
  const response = await request(app).post('/api/auth/login').send({
    store_id: storeId,
    email,
    password: 'password123'
  });
  expect(response.status).toBe(200);
  return response.body.token as string;
}

describe('auth route enforcement', () => {
  beforeEach(() => {
    process.env = { ...backupEnv };
    process.env.AUTH_REQUIRED = 'true';
    process.env.JWT_SECRET = 'auth-routes-secret';
  });

  afterEach(() => {
    process.env = { ...backupEnv };
  });

  it('rejects missing token on protected staff route when auth is required', async () => {
    const { app } = createApp();
    const created = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'auth-required-order')
      .send(buildOrderBody())
      .expect(201);

    await request(app).patch(`/api/orders/${created.body.id}`).send({ status: 'ACCEPTED' }).expect(401);
  });

  it('allows staff token for staff route and blocks manager-only route', async () => {
    const { app } = createApp();
    const staffToken = await loginAndGetToken(app, 'staff@store.test');
    const created = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'auth-staff-order')
      .send(buildOrderBody())
      .expect(201);

    await request(app)
      .patch(`/api/orders/${created.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    await request(app)
      .patch('/api/stores/store-1/mode')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ mode: 'BUSY' })
      .expect(403);
  });

  it('permits protected route without token when auth is disabled', async () => {
    process.env.AUTH_REQUIRED = 'false';
    const { app } = createApp();
    const created = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'auth-disabled-order')
      .send(buildOrderBody())
      .expect(201);

    await request(app).patch(`/api/orders/${created.body.id}`).send({ status: 'ACCEPTED' }).expect(200);
  });

  it('enforces store scoping for authenticated users', async () => {
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        userId: 'manager-1',
        storeId: 'store-1',
        email: 'manager@store.test',
        role: 'MANAGER',
        password: 'password123'
      },
      {
        userId: 'manager-2',
        storeId: 'store-2',
        email: 'manager2@store.test',
        role: 'MANAGER',
        password: 'password123'
      }
    ]);

    const { app } = createApp();
    const store2Token = await loginAndGetToken(app, 'manager2@store.test', 'store-2');
    const created = await request(app)
      .post('/api/orders')
      .set('Idempotency-Key', 'auth-store-scope-order')
      .send(buildOrderBody())
      .expect(201);

    await request(app)
      .patch(`/api/orders/${created.body.id}`)
      .set('Authorization', `Bearer ${store2Token}`)
      .send({ status: 'ACCEPTED' })
      .expect(403);

    await request(app).get('/api/stores/store-1/events').set('Authorization', `Bearer ${store2Token}`).expect(403);
  });
});
