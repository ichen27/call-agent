import { z } from 'zod';
import type { OrderItemInput } from '../types.js';
import type { MemoryStore } from '../store/memory.js';
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
const handoffArgs = z.object({ reason: z.string().min(1) });

export type ToolName = 'get_store_mode' | 'validate_item' | 'create_order' | 'handoff';

type ToolResult =
  | { type: 'mode'; mode: 'OPEN' | 'BUSY' | 'CLOSED' }
  | { type: 'matches'; matches: Array<{ id: string; name: string; price: number }> }
  | { type: 'order_created'; orderId: string; orderNumber: number }
  | { type: 'handoff'; reason: string };

export class VoiceTools {
  private readonly allowed = new Set<ToolName>(['get_store_mode', 'validate_item', 'create_order', 'handoff']);

  constructor(
    private readonly db: MemoryStore,
    private readonly orderService: OrderService
  ) {}

  execute(action: ToolName, rawArgs: unknown): ToolResult {
    if (!this.allowed.has(action)) {
      throw new Error(`tool action not allowed: ${action}`);
    }

    if (action === 'get_store_mode') {
      const args = storeModeArgs.parse(rawArgs);
      return { type: 'mode', mode: this.db.getStoreMode(args.storeId) };
    }

    if (action === 'validate_item') {
      const args = validateItemArgs.parse(rawArgs);
      const normalized = args.query.toLowerCase();
      const matches = this.db
        .getMenu(args.storeId)
        .filter((item) => item.isAvailable && item.name.toLowerCase().includes(normalized))
        .map((item) => ({ id: item.id, name: item.name, price: item.basePriceCents }));
      return { type: 'matches', matches };
    }

    if (action === 'create_order') {
      const args = createOrderArgs.parse(rawArgs);
      const menu = this.db.getMenu(args.storeId);
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
      const order = this.orderService.createOrder({
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
    return { type: 'handoff', reason: args.reason };
  }
}
