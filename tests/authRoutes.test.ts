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

async function loginAndGetToken(app: ReturnType<typeof createApp>['app'], email: string) {
  const response = await request(app).post('/api/auth/login').send({
    store_id: 'store-1',
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
});
