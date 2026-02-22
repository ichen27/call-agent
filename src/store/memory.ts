import type { CallSession, MenuItem, Order, OrderEvent, OrderItemInput, OrderStatus, OutboxEvent, OutboxStatus, StoreMode } from '../types.js';

interface CreateOrderInput {
  storeId: string;
  customerName: string;
  customerPhone: string;
  items: OrderItemInput[];
  totalCents: number;
  notes?: string;
  callId?: string;
  idempotencyKey: string;
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['ACCEPTED', 'REJECTED', 'CANCELED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['READY', 'CANCELED'],
  READY: ['COMPLETED', 'CANCELED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELED: []
};

export class MemoryStore {
  private orderSeq = 1000;
  private eventSeq = 1;
  private outboxSeq = 1;

  readonly stores = new Map<string, { id: string; mode: StoreMode; defaultPrepMins: number }>([
    ['store-1', { id: 'store-1', mode: 'OPEN', defaultPrepMins: 20 }]
  ]);

  readonly menuItems = new Map<string, MenuItem>([
    ['item-burrito', { id: 'item-burrito', storeId: 'store-1', name: 'Chicken Burrito', basePriceCents: 1299, isAvailable: true }],
    ['item-bowl', { id: 'item-bowl', storeId: 'store-1', name: 'Veggie Bowl', basePriceCents: 1199, isAvailable: true }]
  ]);

  readonly orders = new Map<string, Order>();
  readonly events: OrderEvent[] = [];
  readonly outboxEvents: OutboxEvent[] = [];
  readonly idempotency = new Map<string, string>();
  readonly callSessions = new Map<string, CallSession>();

  getMenu(storeId: string): MenuItem[] {
    return [...this.menuItems.values()].filter((item) => item.storeId === storeId);
  }

  setItemAvailability(itemId: string, isAvailable: boolean): MenuItem | undefined {
    const item = this.menuItems.get(itemId);
    if (!item) return undefined;
    item.isAvailable = isAvailable;
    return item;
  }

  setStoreMode(storeId: string, mode: StoreMode): StoreMode | undefined {
    const store = this.stores.get(storeId);
    if (!store) return undefined;
    store.mode = mode;
    return store.mode;
  }

  getStoreMode(storeId: string): StoreMode {
    return this.stores.get(storeId)?.mode ?? 'CLOSED';
  }

  createOrder(input: CreateOrderInput): Order {
    const existingOrderId = this.idempotency.get(`${input.storeId}:${input.idempotencyKey}`);
    if (existingOrderId) {
      const existing = this.orders.get(existingOrderId);
      if (!existing) throw new Error('idempotency key points to missing order');
      return existing;
    }

    const now = new Date().toISOString();
    const orderId = `order-${this.orderSeq}`;
    const order: Order = {
      id: orderId,
      orderNumber: this.orderSeq,
      storeId: input.storeId,
      status: 'NEW',
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      items: input.items,
      totalCents: input.totalCents,
      createdAt: now,
      updatedAt: now,
      ackedClientIds: []
    };
    if (input.notes) {
      order.notes = input.notes;
    }
    if (input.callId) {
      order.callId = input.callId;
    }

    this.orderSeq += 1;
    this.orders.set(orderId, order);
    this.idempotency.set(`${input.storeId}:${input.idempotencyKey}`, orderId);
    this.appendEvent(order.storeId, order.id, 'OrderCreated', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status
    });

    return order;
  }

  listOrders(storeId: string, statuses?: OrderStatus[]): Order[] {
    return [...this.orders.values()].filter((order) => {
      const inStore = order.storeId === storeId;
      const inStatus = !statuses || statuses.includes(order.status);
      return inStore && inStatus;
    });
  }

  getOrderById(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getEventsForOrder(orderId: string): OrderEvent[] {
    return this.events.filter((event) => event.orderId === orderId);
  }

  updateOrderStatus(orderId: string, nextStatus: OrderStatus, actorId: string): Order {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('order not found');
    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`invalid transition: ${order.status} -> ${nextStatus}`);
    }
    order.status = nextStatus;
    order.updatedAt = new Date().toISOString();
    this.appendEvent(order.storeId, order.id, 'OrderStatusChanged', {
      actorId,
      status: nextStatus
    });
    return order;
  }

  ackOrder(orderId: string, clientId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order) throw new Error('order not found');
    if (!order.ackedClientIds.includes(clientId)) {
      order.ackedClientIds.push(clientId);
      this.appendEvent(order.storeId, order.id, 'OrderAcked', { clientId });
    }
    return true;
  }

  getEventsSince(storeId: string, sinceId: number): OrderEvent[] {
    return this.events.filter((event) => event.storeId === storeId && event.id > sinceId);
  }

  listOutbox(storeId?: string, status?: OutboxStatus): OutboxEvent[] {
    return this.outboxEvents.filter((event) => {
      const storeMatch = !storeId || event.storeId === storeId;
      const statusMatch = !status || event.status === status;
      return storeMatch && statusMatch;
    });
  }

  publishOutbox(storeId?: string, limit = 100): { publishedCount: number; events: OutboxEvent[] } {
    const selected = this.outboxEvents
      .filter((event) => event.status === 'PENDING' && (!storeId || event.storeId === storeId))
      .slice(0, limit);

    const now = new Date().toISOString();
    for (const event of selected) {
      event.status = 'SENT';
      event.attempts += 1;
      event.sentAt = now;
    }

    return { publishedCount: selected.length, events: selected };
  }

  private appendEvent(storeId: string, orderId: string, eventType: string, payload: Record<string, unknown>): void {
    const event: OrderEvent = {
      id: this.eventSeq,
      storeId,
      orderId,
      eventType,
      payload,
      createdAt: new Date().toISOString()
    };

    this.events.push(event);
    this.outboxEvents.push({
      id: this.outboxSeq,
      storeId,
      aggregateType: 'ORDER',
      aggregateId: orderId,
      eventType,
      payload,
      status: 'PENDING',
      attempts: 0,
      createdAt: event.createdAt
    });

    this.eventSeq += 1;
    this.outboxSeq += 1;
  }
}
