import request from 'supertest';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const envBackup = { ...process.env };

describe('internal and telephony security', () => {
  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('enforces INTERNAL_API_KEY on internal outbox endpoints when configured', async () => {
    process.env.INTERNAL_API_KEY = 'internal-secret';
    const { app } = createApp();

    await request(app).get('/api/internal/outbox').expect(401);
    await request(app).post('/api/internal/outbox/replay').send({}).expect(401);

    const authorized = await request(app).get('/api/internal/outbox').set('x-internal-api-key', 'internal-secret').expect(200);
    expect(Array.isArray(authorized.body.events)).toBe(true);
    const replay = await request(app)
      .post('/api/internal/outbox/replay')
      .set('x-internal-api-key', 'internal-secret')
      .send({ limit: 10 })
      .expect(200);
    expect(typeof replay.body.replayed_count).toBe('number');
  });

  it('enforces TELEPHONY_WEBHOOK_TOKEN on telephony endpoints when configured', async () => {
    process.env.TELEPHONY_WEBHOOK_TOKEN = 'telephony-secret';
    const { app } = createApp();

    await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: 'call-sec-1', store_id: 'store-1', from: '+15550001111', utterance: 'hello' })
      .expect(401);

    await request(app)
      .post('/api/telephony/inbound')
      .set('x-telephony-token', 'telephony-secret')
      .send({ call_id: 'call-sec-1', store_id: 'store-1', from: '+15550001111', utterance: 'hello' })
      .expect(200);
  });

  it('enforces TELEPHONY_WEBHOOK_SECRET signature when configured', async () => {
    process.env.TELEPHONY_WEBHOOK_SECRET = 'telephony-hmac-secret';
    const { app } = createApp();

    const body = { call_id: 'call-sec-2', store_id: 'store-1', from: '+15550001111', utterance: 'hello' };
    const serialized = JSON.stringify(body);
    const signature = createHmac('sha256', 'telephony-hmac-secret').update(serialized).digest('hex');

    await request(app).post('/api/telephony/inbound').send(body).expect(401);

    await request(app)
      .post('/api/telephony/inbound')
      .set('x-telephony-signature', `sha256=${signature}`)
      .send(body)
      .expect(200);
  });

  it('rate limits telephony inbound requests deterministically', async () => {
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    process.env.RATE_LIMIT_TELEPHONY_MAX = '2';
    const { app } = createApp();

    await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: 'call-rate-1', store_id: 'store-1', from: '+15550001111', utterance: 'hello' })
      .expect(200);
    await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: 'call-rate-2', store_id: 'store-1', from: '+15550001111', utterance: 'hello' })
      .expect(200);

    const limited = await request(app)
      .post('/api/telephony/inbound')
      .send({ call_id: 'call-rate-3', store_id: 'store-1', from: '+15550001111', utterance: 'hello' })
      .expect(429);

    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });

  it('fails fast in non-local runtime when required secrets are missing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_REQUIRED = 'true';
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.TELEPHONY_WEBHOOK_TOKEN;
    delete process.env.TELEPHONY_WEBHOOK_SECRET;

    expect(() => createApp()).toThrow(/JWT_SECRET is required/i);
  });
});
