import { z } from 'zod';
import type { OrderItemInput } from '../types.js';
import type { AppRepository } from '../store/repository.js';
import type { OrderService } from '../orderService.js';

const createOrderArgs = z.object({
  storeId: z.string(),
  callId: z.string(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(4),
  items: z.array(z.object({ itemId: z.string(), qty: z.number().int().positive() })).min(1)
});

const validateItemArgs = z.object({ storeId: z.string(), query: z.string().min(1) });
const storeModeArgs = z.object({ storeId: z.string() });
const handoffArgs = z.object({
  storeId: z.string().min(1),
  callId: z.string().min(1),
  reason: z.string().min(1),
  callerPhone: z.string().min(4),
  customerName: z.string().optional(),
  draftItems: z.array(z.object({ itemId: z.string(), itemName: z.string(), qty: z.number().int().positive() })).default([])
});

export type ToolName = 'get_store_mode' | 'validate_item' | 'create_order' | 'handoff';

type ToolResult =
  | { type: 'mode'; mode: 'OPEN' | 'BUSY' | 'CLOSED'; defaultPrepMins: number }
  | { type: 'matches'; matches: Array<{ id: string; name: string; price: number }> }
  | { type: 'order_created'; orderId: string; orderNumber: number }
  | { type: 'order_blocked'; reason: string }
  | { type: 'handoff'; reason: string };

function isOrderIntakeEnabled(): boolean {
  const raw = process.env.ORDER_INTAKE_ENABLED;
  if (!raw) return true;
  return raw.toLowerCase() !== 'false';
}

export class VoiceTools {
  private readonly allowed = new Set<ToolName>(['get_store_mode', 'validate_item', 'create_order', 'handoff']);

  constructor(
    private readonly db: AppRepository,
    private readonly orderService: OrderService
  ) {}

  async execute(action: ToolName, rawArgs: unknown): Promise<ToolResult> {
    if (!this.allowed.has(action)) {
      throw new Error(`tool action not allowed: ${action}`);
    }

    if (action === 'get_store_mode') {
      const args = storeModeArgs.parse(rawArgs);
      const store = await this.db.getStoreById(args.storeId);
      return {
        type: 'mode',
        mode: store?.mode ?? (await this.db.getStoreMode(args.storeId)),
        defaultPrepMins: store?.defaultPrepMins ?? 20
      };
    }

    if (action === 'validate_item') {
      const args = validateItemArgs.parse(rawArgs);
      const normalized = args.query.toLowerCase();
      const matches = (await this.db.getMenu(args.storeId))
        .filter((item) => item.isAvailable && item.name.toLowerCase().includes(normalized))
        .map((item) => ({ id: item.id, name: item.name, price: item.basePriceCents }));
      return { type: 'matches', matches };
    }

    if (action === 'create_order') {
      if (!isOrderIntakeEnabled()) {
        return { type: 'order_blocked', reason: 'order_intake_disabled' };
      }

      const args = createOrderArgs.parse(rawArgs);
      const menu = await this.db.getMenu(args.storeId);
      const items: OrderItemInput[] = args.items.map((draft) => {
        const item = menu.find((entry) => entry.id === draft.itemId);
        if (!item || !item.isAvailable) {
          throw new Error(`item unavailable: ${draft.itemId}`);
        }
        const built: OrderItemInput = {
          itemId: item.id,
          itemNameSnapshot: item.name,
          qty: draft.qty,
          basePriceCents: item.basePriceCents,
          modifiersSnapshotJson: [],
          lineTotalCents: item.basePriceCents * draft.qty
        };
        return built;
      });

      const total = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
      const order = await this.orderService.createOrder({
        idempotencyKey: args.callId,
        storeId: args.storeId,
        customerName: args.customerName,
        customerPhone: args.customerPhone,
        items,
        totalCents: total,
        callId: args.callId
      });

      return { type: 'order_created', orderId: order.id, orderNumber: order.orderNumber };
    }

    const args = handoffArgs.parse(rawArgs);
    await this.db.appendStoreEvent(args.storeId, `call-${args.callId}`, 'CallHandoffRequested', {
      callId: args.callId,
      reason: args.reason,
      callerPhone: args.callerPhone,
      customerName: args.customerName,
      draftItems: args.draftItems
    });
    return { type: 'handoff', reason: args.reason };
  }
}
