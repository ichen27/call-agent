import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const envBackup = { ...process.env };

describe('realtime routes', () => {
  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('requires INTERNAL_API_KEY for realtime publish when configured', async () => {
    process.env.INTERNAL_API_KEY = 'internal-secret';
    const realtime = {
      publish: vi.fn(() => 0),
      connectedCount: vi.fn(() => 0),
      attachUpgrade: vi.fn()
    };
    const { app } = createApp({ realtimeGateway: realtime });

    await request(app)
      .post('/api/internal/realtime/publish')
      .send({
        kind: 'outbox_publish',
        event_id: 1,
        store_id: 'store-1',
        event_type: 'OrderCreated',
        aggregate_id: 'order-1',
        aggregate_type: 'ORDER',
        attempts: 0,
        created_at: '2026-02-22T00:00:00.000Z',
        payload: {}
      })
      .expect(401);
  });

  it('publishes event to realtime gateway endpoint', async () => {
    process.env.INTERNAL_API_KEY = 'internal-secret';
    const realtime = {
      publish: vi.fn(() => 2),
      connectedCount: vi.fn(() => 2),
      attachUpgrade: vi.fn()
    };
    const { app } = createApp({ realtimeGateway: realtime });

    const response = await request(app)
      .post('/api/internal/realtime/publish')
      .set('x-internal-api-key', 'internal-secret')
      .send({
        kind: 'outbox_publish',
        event_id: 99,
        store_id: 'store-1',
        event_type: 'OrderCreated',
        aggregate_id: 'order-99',
        aggregate_type: 'ORDER',
        attempts: 0,
        created_at: '2026-02-22T00:00:00.000Z',
        payload: { orderId: 'order-99' }
      })
      .expect(200);

    expect(response.body.delivered).toBe(2);
    expect(realtime.publish).toHaveBeenCalledTimes(1);
  });
});
