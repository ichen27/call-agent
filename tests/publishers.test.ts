import { afterEach, describe, expect, it, vi } from 'vitest';
import { __testing, createOutboxPublisher } from '../src/workers/publishers.js';
import type { OutboxEvent } from '../src/types.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function sampleEvent(type = 'OrderCreated'): OutboxEvent {
  return {
    id: 1,
    storeId: 'store-1',
    aggregateType: 'ORDER',
    aggregateId: 'order-1',
    eventType: type,
    payload: { orderId: 'order-1' },
    status: 'PENDING',
    attempts: 0,
    createdAt: '2026-02-22T00:00:00.000Z',
    nextAttemptAt: '2026-02-22T00:00:00.000Z'
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('outbox publisher factory', () => {
  it('builds a payload envelope with metadata', () => {
    const payload = __testing.toPublishPayload(sampleEvent());
    expect(payload.kind).toBe('outbox_publish');
    expect(payload.event_id).toBe(1);
    expect(payload.aggregate_type).toBe('ORDER');
  });

  it('uses webhook transport when configured', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    process.env.OUTBOX_PUBLISH_TRANSPORT = 'webhook';
    process.env.OUTBOX_WEBHOOK_URL = 'https://example.test/outbox';
    process.env.OUTBOX_WEBHOOK_AUTH_BEARER = 'secret-token';

    const publisher = createOutboxPublisher();
    await publisher.publish(sampleEvent());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    if (!firstCall) {
      throw new Error('expected fetch call');
    }
    expect(firstCall[0]).toBe('https://example.test/outbox');
    const init = firstCall[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret-token');
  });

  it('throws when webhook transport is missing a url', () => {
    process.env.OUTBOX_PUBLISH_TRANSPORT = 'webhook';
    delete process.env.OUTBOX_WEBHOOK_URL;
    expect(() => createOutboxPublisher()).toThrow(/OUTBOX_WEBHOOK_URL/);
  });

  it('treats non-2xx webhook responses as publish failures', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad', { status: 500, statusText: 'Internal Error' })) as typeof fetch;

    process.env.OUTBOX_PUBLISH_TRANSPORT = 'webhook';
    process.env.OUTBOX_WEBHOOK_URL = 'https://example.test/outbox';

    const publisher = createOutboxPublisher();
    await expect(publisher.publish(sampleEvent())).rejects.toThrow(/webhook publish failed/);
  });

  it('supports deterministic failure simulation in stdout mode', async () => {
    process.env.OUTBOX_PUBLISH_TRANSPORT = 'stdout';
    process.env.OUTBOX_FAIL_EVENT_TYPE = 'OrderCreated';
    const publisher = createOutboxPublisher();
    await expect(publisher.publish(sampleEvent())).rejects.toThrow(/simulated publish failure/);
  });
});
