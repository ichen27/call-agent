import express from 'express';
import { z } from 'zod';
import { OrderService } from './orderService.js';
import type { OrderStatus, StoreMode } from './types.js';
import { safeLog } from './logger.js';
import { VoiceTools } from './voice/tools.js';
import { handleCallerUtterance } from './voice/stateMachine.js';
import { createRepository } from './store/factory.js';
import { asyncRoute } from './http/asyncRoute.js';
import { errorMiddleware } from './http/errorMiddleware.js';
import { AuthService } from './auth/service.js';
import { authenticateRequest, requireRole } from './auth/middleware.js';

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
  const { repository: db, backend } = createRepository();
  const orderService = new OrderService(db);
  const voiceTools = new VoiceTools(db, orderService);
  const authService = new AuthService(db);

  app.use(express.json());
  app.use(authenticateRequest(authService));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'call-agent', backend });
  });

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        store_id: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(1)
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const loggedIn = await authService.login(parsed.data.store_id, parsed.data.email, parsed.data.password);
    if (!loggedIn) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'invalid credentials' } });
    }

    res.json({ token: loggedIn.token, user: { id: loggedIn.user.userId, role: loggedIn.user.role, store_id: loggedIn.user.storeId, email: loggedIn.user.email } });
  }));

  app.get('/api/auth/me', asyncRoute(async (req, res) => {
    if (!req.auth) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'missing bearer token' } });
    }
    res.json({ id: req.auth.userId, role: req.auth.role, store_id: req.auth.storeId, email: req.auth.email });
  }));

  app.get('/api/stores/:storeId/menu', asyncRoute(async (req, res) => {
    const storeId = z.string().parse(req.params.storeId);
    res.json({ items: await db.getMenu(storeId) });
  }));

  app.patch('/api/menu/items/:itemId/availability', requireRole('MANAGER'), asyncRoute(async (req, res) => {
    const body = z.object({ is_available: z.boolean() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const itemId = z.string().parse(req.params.itemId);
    const item = await db.setItemAvailability(itemId, body.data.is_available);
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'item not found' } });
    res.json({ id: item.id, is_available: item.isAvailable });
  }));

  app.patch('/api/stores/:storeId/mode', requireRole('MANAGER'), asyncRoute(async (req, res) => {
    const body = z.object({ mode: modeSchema }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const storeId = z.string().parse(req.params.storeId);
    const mode = await db.setStoreMode(storeId, body.data.mode as StoreMode);
    if (!mode) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'store not found' } });
    res.json({ mode });
  }));

  app.post('/api/orders', asyncRoute(async (req, res) => {
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

    const order = await orderService.createOrder(command);

    safeLog('info', 'order created', { request_id: req.header('x-request-id'), order_id: order.id, store_id: order.storeId });
    res.status(201).json({ id: order.id, order_number: order.orderNumber, status: order.status, created_at: order.createdAt });
  }));

  app.get('/api/orders', asyncRoute(async (req, res) => {
    const storeId = z.string().parse(req.query.store_id);
    const statuses =
      typeof req.query.status === 'string'
        ? req.query.status
            .split(',')
            .map((s) => statusSchema.safeParse(s.trim()))
            .filter((result): result is { success: true; data: OrderStatus } => result.success)
            .map((result) => result.data)
        : undefined;
    const orders = await db.listOrders(storeId, statuses);
    res.json({ orders, next_cursor: null });
  }));

  app.get('/api/orders/:orderId', asyncRoute(async (req, res) => {
    const orderId = z.string().parse(req.params.orderId);
    const order = await db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'order not found' } });
    }
    const events = await db.getEventsForOrder(order.id);
    res.json({ order, events });
  }));

  app.patch('/api/orders/:orderId', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const body = z.object({ status: statusSchema }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const orderId = z.string().parse(req.params.orderId);
    const actorId = req.auth?.userId ?? req.header('x-user-id') ?? 'staff';
    const order = await orderService.updateStatus(orderId, body.data.status as OrderStatus, actorId);
    res.json({ id: order.id, status: order.status });
  }));

  app.post('/api/orders/:orderId/ack', requireRole('STAFF'), asyncRoute(async (req, res) => {
    const body = z.object({ client_id: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.flatten() });
    const orderId = z.string().parse(req.params.orderId);
    await orderService.ackOrder(orderId, body.data.client_id);
    res.json({ acked: true });
  }));

  app.get('/api/stores/:storeId/events', asyncRoute(async (req, res) => {
    const since = Number(req.query.since_id ?? 0);
    const storeId = z.string().parse(req.params.storeId);
    const events = await db.getEventsSince(storeId, Number.isNaN(since) ? 0 : since);
    const next = events.length ? events[events.length - 1]?.id : since;
    res.json({ events, next_since_id: next });
  }));

  app.get('/api/internal/outbox', asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        store_id: z.string().optional(),
        status: z.enum(['PENDING', 'SENT', 'FAILED', 'DEAD_LETTER']).optional()
      })
      .safeParse(req.query);

    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const events = await db.listOutbox(parsed.data.store_id, parsed.data.status);
    res.json({ events });
  }));

  app.post('/api/internal/outbox/publish', asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        store_id: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional()
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const result = await db.publishOutbox(parsed.data.store_id, parsed.data.limit ?? 100);
    res.json(result);
  }));

  app.post('/api/telephony/inbound', asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        call_id: z.string().min(1),
        store_id: z.string().min(1).default('store-1'),
        from: z.string().min(4),
        utterance: z.string().default('')
      })
      .safeParse(req.body);

    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await db.getCallSession(parsed.data.call_id);
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
    const step = await handleCallerUtterance(mutableSession, parsed.data.utterance, voiceTools);
    await db.setCallSession(step.session);

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
  }));

  app.post('/api/telephony/status', asyncRoute(async (req, res) => {
    const parsed = z
      .object({
        call_id: z.string().min(1),
        status: z.enum(['completed', 'failed', 'canceled'])
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const session = await db.getCallSession(parsed.data.call_id);
    if (session) {
      session.endedAt = new Date().toISOString();
      await db.setCallSession(session);
    }
    res.json({ ok: true });
  }));

  app.use(errorMiddleware);

  return { app, db, orderService };
}
