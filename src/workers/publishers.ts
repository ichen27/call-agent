import type { OutboxEvent } from '../types.js';

export interface OutboxPublisher {
  publish(event: OutboxEvent): Promise<void>;
}

interface OutboxPublishPayload {
  kind: 'outbox_publish';
  event_id: number;
  store_id: string;
  event_type: string;
  aggregate_id: string;
  aggregate_type: string;
  attempts: number;
  created_at: string;
  payload: Record<string, unknown>;
}

function shouldSimulateFailure(event: OutboxEvent): boolean {
  const failType = process.env.OUTBOX_FAIL_EVENT_TYPE;
  return Boolean(failType && event.eventType === failType);
}

function toPublishPayload(event: OutboxEvent): OutboxPublishPayload {
  return {
    kind: 'outbox_publish',
    event_id: event.id,
    store_id: event.storeId,
    event_type: event.eventType,
    aggregate_id: event.aggregateId,
    aggregate_type: event.aggregateType,
    attempts: event.attempts,
    created_at: event.createdAt,
    payload: event.payload
  };
}

class StdoutPublisher implements OutboxPublisher {
  async publish(event: OutboxEvent): Promise<void> {
    if (shouldSimulateFailure(event)) {
      throw new Error(`simulated publish failure for ${event.eventType}`);
    }

    console.log(JSON.stringify(toPublishPayload(event)));
  }
}

class WebhookPublisher implements OutboxPublisher {
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
    private readonly authBearer?: string
  ) {}

  async publish(event: OutboxEvent): Promise<void> {
    if (shouldSimulateFailure(event)) {
      throw new Error(`simulated publish failure for ${event.eventType}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.authBearer ? { authorization: `Bearer ${this.authBearer}` } : {})
        },
        body: JSON.stringify(toPublishPayload(event)),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`webhook publish failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`webhook publish timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

class RealtimeGatewayPublisher implements OutboxPublisher {
  constructor(
    private readonly gatewayUrl: string,
    private readonly timeoutMs: number,
    private readonly internalApiKey?: string
  ) {}

  async publish(event: OutboxEvent): Promise<void> {
    if (shouldSimulateFailure(event)) {
      throw new Error(`simulated publish failure for ${event.eventType}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.gatewayUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.internalApiKey ? { 'x-internal-api-key': this.internalApiKey } : {})
        },
        body: JSON.stringify(toPublishPayload(event)),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`realtime publish failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`realtime publish timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createOutboxPublisher(): OutboxPublisher {
  const transport = (process.env.OUTBOX_PUBLISH_TRANSPORT ?? 'stdout').toLowerCase();
  if (transport === 'stdout') {
    return new StdoutPublisher();
  }
  if (transport === 'webhook') {
    const url = process.env.OUTBOX_WEBHOOK_URL;
    if (!url) {
      throw new Error('OUTBOX_WEBHOOK_URL is required when OUTBOX_PUBLISH_TRANSPORT=webhook');
    }
    const timeoutMs = Number(process.env.OUTBOX_WEBHOOK_TIMEOUT_MS ?? 5000);
    return new WebhookPublisher(
      url,
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
      process.env.OUTBOX_WEBHOOK_AUTH_BEARER
    );
  }
  if (transport === 'ws') {
    const gatewayUrl = process.env.OUTBOX_REALTIME_PUBLISH_URL ?? 'http://localhost:3000/api/internal/realtime/publish';
    const timeoutMs = Number(process.env.OUTBOX_REALTIME_TIMEOUT_MS ?? 5000);
    return new RealtimeGatewayPublisher(
      gatewayUrl,
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
      process.env.INTERNAL_API_KEY
    );
  }

  throw new Error(`Unsupported outbox transport: ${transport}`);
}

export const __testing = {
  toPublishPayload
};
