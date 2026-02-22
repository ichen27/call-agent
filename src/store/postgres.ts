import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { CallSession, MenuItem, Order, OrderEvent, OrderItemInput, OrderStatus, OutboxEvent, OutboxStatus, StoreMode } from '../types.js';
import type { AppRepository, CreateOrderInput, OutboxPublishResult } from './repository.js';

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['ACCEPTED', 'REJECTED', 'CANCELED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELED'],
  IN_PROGRESS: ['READY', 'CANCELED'],
  READY: ['COMPLETED', 'CANCELED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELED: []
};

interface OrderRow extends QueryResultRow {
  id: string;
  order_number: number;
  store_id: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  total_cents: number;
  notes: string | null;
  call_id: string | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow extends QueryResultRow {
  item_id: string;
  item_name_snapshot: string;
  qty: number;
  base_price_cents: number;
  modifiers_snapshot_json: Array<Record<string, string | number>>;
  special_instructions: string | null;
  line_total_cents: number;
}

export class PostgresStore implements AppRepository {
  constructor(private readonly pool: Pool) {}

  asyncHealthCheck(): Promise<unknown> {
    return this.pool.query('SELECT 1');
  }

  getMenu(_storeId: string): MenuItem[] {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  setItemAvailability(_itemId: string, _isAvailable: boolean): MenuItem | undefined {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  setStoreMode(_storeId: string, _mode: StoreMode): StoreMode | undefined {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  getStoreMode(_storeId: string): StoreMode {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  createOrder(_input: CreateOrderInput): Order {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  listOrders(_storeId: string, _statuses?: OrderStatus[]): Order[] {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  getOrderById(_orderId: string): Order | undefined {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  getEventsForOrder(_orderId: string): OrderEvent[] {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  updateOrderStatus(_orderId: string, _nextStatus: OrderStatus, _actorId: string): Order {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  ackOrder(_orderId: string, _clientId: string): boolean {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  getEventsSince(_storeId: string, _sinceId: number): OrderEvent[] {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  listOutbox(_storeId?: string, _status?: OutboxStatus): OutboxEvent[] {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  publishOutbox(_storeId?: string, _limit?: number): OutboxPublishResult {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  getCallSession(_callId: string): CallSession | undefined {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  setCallSession(_session: CallSession): void {
    throw new Error('Use async methods not supported by sync app path yet');
  }

  // Async API to be wired in Phase 2 app async cutover
  async createOrderAsync(input: CreateOrderInput): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const idem = await client.query<{ order_id: string }>(
        'SELECT order_id FROM idempotency_keys WHERE store_id = $1 AND key = $2',
        [input.storeId, input.idempotencyKey]
      );

      if (idem.rows[0]?.order_id) {
        const existing = await this.getOrderByIdAsync(idem.rows[0].order_id, client);
        if (!existing) {
          throw new Error('idempotency key points to missing order');
        }
        await client.query('COMMIT');
        return existing;
      }

      const orderId = randomUUID();
      const created = await client.query<OrderRow>(
        `INSERT INTO orders (id, store_id, status, customer_name, customer_phone, total_cents, notes, call_id)
         VALUES ($1, $2, 'NEW', $3, $4, $5, $6, $7)
         RETURNING *`,
        [orderId, input.storeId, input.customerName, input.customerPhone, input.totalCents, input.notes ?? null, input.callId ?? null]
      );

      const orderRow = created.rows[0];
      if (!orderRow) {
        throw new Error('order insert failed');
      }

      for (const item of input.items) {
        await client.query(
          `INSERT INTO order_items (order_id, item_id, item_name_snapshot, qty, base_price_cents, modifiers_snapshot_json, special_instructions, line_total_cents)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
          [
            orderRow.id,
            item.itemId,
            item.itemNameSnapshot,
            item.qty,
            item.basePriceCents,
            JSON.stringify(item.modifiersSnapshotJson),
            item.specialInstructions ?? null,
            item.lineTotalCents
          ]
        );
      }

      await client.query('INSERT INTO idempotency_keys (store_id, key, order_id) VALUES ($1, $2, $3)', [
        input.storeId,
        input.idempotencyKey,
        orderRow.id
      ]);

      await this.appendEventAsync(client, orderRow.store_id, orderRow.id, 'OrderCreated', {
        orderId: orderRow.id,
        orderNumber: orderRow.order_number,
        status: orderRow.status
      });

      await client.query('COMMIT');
      const items = await this.getOrderItemsAsync(orderRow.id);
      return this.toOrder(orderRow, items, []);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrderByIdAsync(orderId: string, txClient?: PoolClient): Promise<Order | undefined> {
    const client = txClient ?? (await this.pool.connect());
    try {
      const orderRes = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [orderId]);
      const row = orderRes.rows[0];
      if (!row) return undefined;
      const [items, events] = await Promise.all([this.getOrderItemsAsync(orderId), this.getEventsForOrderAsync(orderId)]);
      const ackedClientIds = events
        .filter((event) => event.eventType === 'OrderAcked')
        .map((event) => event.payload.clientId)
        .filter((value): value is string => typeof value === 'string');
      return this.toOrder(row, items, ackedClientIds);
    } finally {
      if (!txClient) {
        client.release();
      }
    }
  }

  async listOutboxAsync(storeId?: string, status?: OutboxStatus): Promise<OutboxEvent[]> {
    const values: unknown[] = [];
    const where: string[] = [];

    if (storeId) {
      values.push(storeId);
      where.push(`store_id = $${values.length}`);
    }
    if (status) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.pool.query(
      `SELECT id, store_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempts, created_at, sent_at
       FROM outbox_events ${whereSql} ORDER BY id ASC`,
      values
    );

    return result.rows.map((row) => {
      const event: OutboxEvent = {
        id: Number(row.id),
        storeId: String(row.store_id),
        aggregateType: 'ORDER',
        aggregateId: String(row.aggregate_id),
        eventType: String(row.event_type),
        payload: row.payload_json as Record<string, unknown>,
        status: row.status as OutboxStatus,
        attempts: Number(row.attempts),
        createdAt: String(row.created_at)
      };
      if (row.sent_at) {
        event.sentAt = String(row.sent_at);
      }
      return event;
    });
  }

  async publishOutboxAsync(storeId?: string, limit = 100): Promise<OutboxPublishResult> {
    const values: unknown[] = ['PENDING'];
    let whereSql = 'WHERE status = $1';
    if (storeId) {
      values.push(storeId);
      whereSql += ` AND store_id = $${values.length}`;
    }
    values.push(limit);

    const selected = await this.pool.query(
      `SELECT id FROM outbox_events ${whereSql} ORDER BY id ASC LIMIT $${values.length}`,
      values
    );

    if (selected.rows.length === 0) {
      return { publishedCount: 0, events: [] };
    }

    const ids = selected.rows.map((row) => Number(row.id));
    const updated = await this.pool.query(
      `UPDATE outbox_events
       SET status = 'SENT', attempts = attempts + 1, sent_at = now()
       WHERE id = ANY($1::bigint[])
       RETURNING id, store_id, aggregate_id, event_type, payload_json, status, attempts, created_at, sent_at`,
      [ids]
    );

    const events: OutboxEvent[] = updated.rows.map((row) => {
      const event: OutboxEvent = {
        id: Number(row.id),
        storeId: String(row.store_id),
        aggregateType: 'ORDER',
        aggregateId: String(row.aggregate_id),
        eventType: String(row.event_type),
        payload: row.payload_json as Record<string, unknown>,
        status: row.status as OutboxStatus,
        attempts: Number(row.attempts),
        createdAt: String(row.created_at)
      };
      if (row.sent_at) {
        event.sentAt = String(row.sent_at);
      }
      return event;
    });

    return { publishedCount: events.length, events };
  }

  async updateOrderStatusAsync(orderId: string, nextStatus: OrderStatus, actorId: string): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentRes = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
      const current = currentRes.rows[0];
      if (!current) {
        throw new Error('order not found');
      }
      const allowed = STATUS_TRANSITIONS[current.status];
      if (!allowed.includes(nextStatus)) {
        throw new Error(`invalid transition: ${current.status} -> ${nextStatus}`);
      }

      const updatedRes = await client.query<OrderRow>(
        'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [nextStatus, orderId]
      );
      const updated = updatedRes.rows[0];
      if (!updated) {
        throw new Error('order update failed');
      }

      await this.appendEventAsync(client, updated.store_id, updated.id, 'OrderStatusChanged', { actorId, status: nextStatus });
      await client.query('COMMIT');

      const [items, events] = await Promise.all([this.getOrderItemsAsync(orderId), this.getEventsForOrderAsync(orderId)]);
      const ackedClientIds = events
        .filter((event) => event.eventType === 'OrderAcked')
        .map((event) => event.payload.clientId)
        .filter((value): value is string => typeof value === 'string');
      return this.toOrder(updated, items, ackedClientIds);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ackOrderAsync(orderId: string, clientId: string): Promise<boolean> {
    const existing = await this.pool.query<{ id: number }>(
      `SELECT id
       FROM order_events
       WHERE order_id = $1 AND event_type = 'OrderAcked' AND payload_json->>'clientId' = $2
       LIMIT 1`,
      [orderId, clientId]
    );
    if (existing.rows[0]) return true;

    const order = await this.pool.query<{ id: string; store_id: string }>('SELECT id, store_id FROM orders WHERE id = $1', [orderId]);
    const row = order.rows[0];
    if (!row) throw new Error('order not found');

    const client = await this.pool.connect();
    try {
      await this.appendEventAsync(client, row.store_id, row.id, 'OrderAcked', { clientId });
    } finally {
      client.release();
    }
    return true;
  }

  async getEventsSinceAsync(storeId: string, sinceId: number): Promise<OrderEvent[]> {
    const result = await this.pool.query(
      `SELECT id, store_id, order_id, event_type, payload_json, created_at
       FROM order_events
       WHERE store_id = $1 AND id > $2
       ORDER BY id ASC`,
      [storeId, sinceId]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      storeId: String(row.store_id),
      orderId: String(row.order_id),
      eventType: String(row.event_type),
      payload: row.payload_json as Record<string, unknown>,
      createdAt: String(row.created_at)
    }));
  }

  async getEventsForOrderAsync(orderId: string): Promise<OrderEvent[]> {
    const result = await this.pool.query(
      `SELECT id, store_id, order_id, event_type, payload_json, created_at
       FROM order_events
       WHERE order_id = $1
       ORDER BY id ASC`,
      [orderId]
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      storeId: String(row.store_id),
      orderId: String(row.order_id),
      eventType: String(row.event_type),
      payload: row.payload_json as Record<string, unknown>,
      createdAt: String(row.created_at)
    }));
  }

  async upsertCallSessionAsync(session: CallSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO call_sessions (call_id, store_id, state, caller_phone, customer_name, draft_items_json, pending_clarification_json, created_order_id, handoff, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
       ON CONFLICT (call_id) DO UPDATE SET
         store_id = EXCLUDED.store_id,
         state = EXCLUDED.state,
         caller_phone = EXCLUDED.caller_phone,
         customer_name = EXCLUDED.customer_name,
         draft_items_json = EXCLUDED.draft_items_json,
         pending_clarification_json = EXCLUDED.pending_clarification_json,
         created_order_id = EXCLUDED.created_order_id,
         handoff = EXCLUDED.handoff,
         ended_at = EXCLUDED.ended_at`,
      [
        session.callId,
        session.storeId,
        session.state,
        session.callerPhone,
        session.customerName ?? null,
        JSON.stringify(session.draftItems),
        session.pendingClarification ? JSON.stringify(session.pendingClarification) : null,
        session.createdOrderId ?? null,
        session.handoff,
        session.endedAt ?? null
      ]
    );
  }

  async getCallSessionAsync(callId: string): Promise<CallSession | undefined> {
    const result = await this.pool.query(
      `SELECT call_id, store_id, state, caller_phone, customer_name, draft_items_json, pending_clarification_json, created_order_id, handoff, ended_at
       FROM call_sessions WHERE call_id = $1`,
      [callId]
    );
    const row = result.rows[0];
    if (!row) return undefined;

    const session: CallSession = {
      callId: String(row.call_id),
      storeId: String(row.store_id),
      state: String(row.state),
      callerPhone: String(row.caller_phone),
      draftItems: (row.draft_items_json as Array<{ itemId: string; qty: number }>) ?? [],
      handoff: Boolean(row.handoff),
      ...(row.customer_name ? { customerName: String(row.customer_name) } : {}),
      ...(row.pending_clarification_json ? { pendingClarification: row.pending_clarification_json as string[] } : {}),
      ...(row.created_order_id ? { createdOrderId: String(row.created_order_id) } : {}),
      ...(row.ended_at ? { endedAt: String(row.ended_at) } : {})
    };
    return session;
  }

  private async getOrderItemsAsync(orderId: string): Promise<OrderItemInput[]> {
    const result = await this.pool.query<OrderItemRow>(
      `SELECT item_id, item_name_snapshot, qty, base_price_cents, modifiers_snapshot_json, special_instructions, line_total_cents
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC`,
      [orderId]
    );

    return result.rows.map((row) => ({
      itemId: row.item_id,
      itemNameSnapshot: row.item_name_snapshot,
      qty: row.qty,
      basePriceCents: row.base_price_cents,
      modifiersSnapshotJson: row.modifiers_snapshot_json,
      lineTotalCents: row.line_total_cents,
      ...(row.special_instructions ? { specialInstructions: row.special_instructions } : {})
    }));
  }

  private toOrder(row: OrderRow, items: OrderItemInput[], ackedClientIds: string[]): Order {
    const order: Order = {
      id: row.id,
      orderNumber: row.order_number,
      storeId: row.store_id,
      status: row.status,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      items,
      totalCents: row.total_cents,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ackedClientIds
    };
    if (row.notes) {
      order.notes = row.notes;
    }
    if (row.call_id) {
      order.callId = row.call_id;
    }
    return order;
  }

  private async appendEventAsync(client: PoolClient, storeId: string, orderId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO order_events (store_id, order_id, event_type, payload_json)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [storeId, orderId, eventType, JSON.stringify(payload)]
    );

    await client.query(
      `INSERT INTO outbox_events (store_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempts)
       VALUES ($1, 'ORDER', $2, $3, $4::jsonb, 'PENDING', 0)`,
      [storeId, orderId, eventType, JSON.stringify(payload)]
    );
  }
}
