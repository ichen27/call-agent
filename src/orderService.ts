import type { OrderItemInput, OrderStatus } from './types.js';
import type { MemoryStore } from './store/memory.js';

export interface CreateOrderCommand {
  storeId: string;
  idempotencyKey: string;
  customerName: string;
  customerPhone: string;
  items: OrderItemInput[];
  totalCents: number;
  notes?: string;
  callId?: string;
}

export class OrderService {
  constructor(private readonly db: MemoryStore) {}

  createOrder(command: CreateOrderCommand) {
    return this.db.createOrder(command);
  }

  updateStatus(orderId: string, status: OrderStatus, actorId: string) {
    return this.db.updateOrderStatus(orderId, status, actorId);
  }

  ackOrder(orderId: string, clientId: string) {
    return this.db.ackOrder(orderId, clientId);
  }
}
