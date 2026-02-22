import type { OutboxEvent } from '../types.js';

export interface OutboxPublisher {
  publish(event: OutboxEvent): Promise<void>;
}

class StdoutPublisher implements OutboxPublisher {
  async publish(event: OutboxEvent): Promise<void> {
    const failType = process.env.OUTBOX_FAIL_EVENT_TYPE;
    if (failType && event.eventType === failType) {
      throw new Error(`simulated publish failure for ${event.eventType}`);
    }

    // Placeholder transport publisher; replace with queue/pubsub publisher in next phase.
    console.log(
      JSON.stringify({
        kind: 'outbox_publish',
        event_id: event.id,
        store_id: event.storeId,
        event_type: event.eventType,
        aggregate_id: event.aggregateId
      })
    );
  }
}

export function createOutboxPublisher(): OutboxPublisher {
  return new StdoutPublisher();
}
