import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';

describe('memory store outbox and order detail behavior', () => {
  it('creates outbox records for order lifecycle events', () => {
    const store = new MemoryStore();

    const created = store.createOrder({
      storeId: 'store-1',
      idempotencyKey: 'idem-1',
      customerName: 'Taylor',
      customerPhone: '+15551230000',
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

    store.updateOrderStatus(created.id, 'ACCEPTED', 'staff-1');
    store.ackOrder(created.id, 'tablet-1');

    const orderEvents = store.getEventsForOrder(created.id);
    expect(orderEvents.map((event) => event.eventType)).toEqual(['OrderCreated', 'OrderStatusChanged', 'OrderAcked']);

    const outbox = store.listOutbox('store-1', 'PENDING');
    expect(outbox).toHaveLength(3);
    expect(outbox.every((event) => event.aggregateId === created.id)).toBe(true);
  });

  it('marks selected outbox events as sent', () => {
    const store = new MemoryStore();
    const first = store.createOrder({
      storeId: 'store-1',
      idempotencyKey: 'idem-2',
      customerName: 'Alex',
      customerPhone: '+15550000001',
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

    store.updateOrderStatus(first.id, 'ACCEPTED', 'staff-1');

    const publish = store.publishOutbox('store-1', 1);
    expect(publish.publishedCount).toBe(1);

    const sent = store.listOutbox('store-1', 'SENT');
    const pending = store.listOutbox('store-1', 'PENDING');
    expect(sent).toHaveLength(1);
    expect(pending.length).toBeGreaterThan(0);
  });
});
