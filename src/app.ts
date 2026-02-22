import express from 'express';
import { z } from 'zod';
import { MemoryStore } from './store/memory.js';
import { OrderService } from './orderService.js';
import type { OrderStatus, StoreMode } from './types.js';
import { safeLog } from './logger.js';
import { VoiceTools } from './voice/tools.js';
import { handleCallerUtterance } from './voice/stateMachine.js';

const statusSchema = z.enum(['NEW', 'ACCEPTED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'REJECTED', 'CANCELED']);
const modeSchema = z.enum(['OPEN', 'BUSY', 'CLOSED']);

const createOrderSchema = z.object({
  store_id: z.string(),
  customer_name: z.string().min(1),
  customer_phone: z.string().min(4),
  items: z
    .array(
      z.object({
        item_id: z.string(),
        item_name_snapshot: z.string(),
        qty: z.number().int().positive(),
        base_price_cents: z.number().int().nonnegative(),
        modifiers_snapshot_json: z.array(z.record(z.union([z.string(), z.number()]))),
        special_instructions: z.string().optional(),
        line_total_cents: z.number().int().nonnegative()
      })
    )
    .min(1),
  total_cents: z.number().int().nonnegative(),
  notes: z.string().optional(),
  call_id: z.string().optional()
});

export function createApp() {
  const app = express();
  const db = new MemoryStore();
  const orderService = new OrderService(db);
  const voiceTools = new VoiceTools(db, orderService);

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'call-agent' });
  });

  app.get('/api/stores/:storeId/menu', (req, res) => {
    res.json({ items: db.getMenu(req.params.storeId) });
  });

  app.patch('/api/menu/items/:itemId/availability', (req, res) => {
    const body = z.object({ is_available: z.boolean() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const item = db.setItemAvailability(req.params.itemId, body.data.is_available);
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'item not found' } });
    res.json({ id: item.id, is_available: item.isAvailable });
  });

  app.patch('/api/stores/:storeId/mode', (req, res) => {
    const body = z.object({ mode: modeSchema }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const mode = db.setStoreMode(req.params.storeId, body.data.mode as StoreMode);
    if (!mode) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'store not found' } });
    res.json({ mode });
  });

  app.post('/api/orders', (req, res) => {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) return res.status(400).json({ error: { code: 'MISSING_IDEMPOTENCY_KEY' } });
    const body = createOrderSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    const command = {
      idempotencyKey,
      storeId: body.data.store_id,
      customerName: body.data.customer_name,
      customerPhone: body.data.customer_phone,
      items: body.data.items.map((it) => {
        const built = {
          itemId: it.item_id,
          itemNameSnapshot: it.item_name_snapshot,
          qty: it.qty,
          basePriceCents: it.base_price_cents,
          modifiersSnapshotJson: it.modifiers_snapshot_json,
          lineTotalCents: it.line_total_cents
        };
        if (it.special_instructions) {
          return { ...built, specialInstructions: it.special_instructions };
        }
        return built;
      }),
      totalCents: body.data.total_cents
    };
    if (body.data.notes) {
      Object.assign(command, { notes: body.data.notes });
    }
    if (body.data.call_id) {
      Object.assign(command, { callId: body.data.call_id });
    }

    const order = orderService.createOrder(command);

    safeLog('info', 'order created', { request_id: req.header('x-request-id'), order_id: order.id, store_id: order.storeId });
    res.status(201).json({ id: order.id, order_number: order.orderNumber, status: order.status, created_at: order.createdAt });
  });

  app.get('/api/orders', (req, res) => {
    const storeId = z.string().parse(req.query.store_id);
    const statuses =
      typeof req.query.status === 'string'
        ? req.query.status
            .split(',')
            .map((s) => statusSchema.safeParse(s.trim()))
            .filter((result): result is { success: true; data: OrderStatus } => result.success)
            .map((result) => result.data)
        : undefined;
    const orders = db.listOrders(storeId, statuses);
    res.json({ orders, next_cursor: null });
  });

  app.get('/api/orders/:orderId', (req, res) => {
    const order = db.getOrderById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'order not found' } });
    }
    const events = db.getEventsForOrder(order.id);
    res.json({ order, events });
  });

  app.patch('/api/orders/:orderId', (req, res) => {
    const body = z.object({ status: statusSchema }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });

    try {
      const order = orderService.updateStatus(req.params.orderId, body.data.status as OrderStatus, req.header('x-user-id') ?? 'staff');
      res.json({ id: order.id, status: order.status });
    } catch (error) {
      return res.status(400).json({ error: { code: 'INVALID_STATUS_CHANGE', message: (error as Error).message } });
    }
  });

  app.post('/api/orders/:orderId/ack', (req, res) => {
    const body = z.object({ client_id: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    try {
      orderService.ackOrder(req.params.orderId, body.data.client_id);
      res.json({ acked: true });
    } catch {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'order not found' } });
    }
  });

  app.get('/api/stores/:storeId/events', (req, res) => {
    const since = Number(req.query.since_id ?? 0);
    const events = db.getEventsSince(req.params.storeId, Number.isNaN(since) ? 0 : since);
    const next = events.length ? events[events.length - 1]?.id : since;
    res.json({ events, next_since_id: next });
  });

  app.get('/api/internal/outbox', (req, res) => {
    const parsed = z
      .object({
        store_id: z.string().optional(),
        status: z.enum(['PENDING', 'SENT', 'FAILED']).optional()
      })
      .safeParse(req.query);

    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const events = db.listOutbox(parsed.data.store_id, parsed.data.status);
    res.json({ events });
  });

  app.post('/api/internal/outbox/publish', (req, res) => {
    const parsed = z
      .object({
        store_id: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional()
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = db.publishOutbox(parsed.data.store_id, parsed.data.limit ?? 100);
    res.json(result);
  });

  app.post('/api/telephony/inbound', (req, res) => {
    const parsed = z
      .object({
        call_id: z.string().min(1),
        store_id: z.string().min(1).default('store-1'),
        from: z.string().min(4),
        utterance: z.string().default('')
      })
      .safeParse(req.body);

    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = db.callSessions.get(parsed.data.call_id);
    const session =
      existing ??
      ({
        callId: parsed.data.call_id,
        storeId: parsed.data.store_id,
        state: 'GREETING',
        callerPhone: parsed.data.from,
        draftItems: [],
        handoff: false
      } as const);
    const mutableSession = existing ?? { ...session };
    const step = handleCallerUtterance(mutableSession, parsed.data.utterance, voiceTools);
    db.callSessions.set(step.session.callId, step.session);

    safeLog('info', 'telephony inbound processed', {
      call_id: step.session.callId,
      store_id: step.session.storeId,
      session_state: step.session.state,
      handoff: step.session.handoff
    });

    res.json({
      call_id: step.session.callId,
      state: step.session.state,
      response: step.response,
      handoff: step.session.handoff,
      created_order_id: step.session.createdOrderId
    });
  });

  app.post('/api/telephony/status', (req, res) => {
    const parsed = z
      .object({
        call_id: z.string().min(1),
        status: z.enum(['completed', 'failed', 'canceled'])
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const session = db.callSessions.get(parsed.data.call_id);
    if (session) {
      session.endedAt = new Date().toISOString();
      db.callSessions.set(session.callId, session);
    }
    res.json({ ok: true });
  });

  return { app, db, orderService };
}
