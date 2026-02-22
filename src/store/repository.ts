import type { CallSession, MenuItem, Order, OrderEvent, OrderItemInput, OrderStatus, OutboxEvent, OutboxStatus, StoreMode } from '../types.js';

export interface CreateOrderInput {
  storeId: string;
  customerName: string;
  customerPhone: string;
  items: OrderItemInput[];
  totalCents: number;
  notes?: string;
  callId?: string;
  idempotencyKey: string;
}

export interface OutboxPublishResult {
  publishedCount: number;
  events: OutboxEvent[];
}

export interface AppRepository {
  getMenu(storeId: string): MenuItem[];
  setItemAvailability(itemId: string, isAvailable: boolean): MenuItem | undefined;
  setStoreMode(storeId: string, mode: StoreMode): StoreMode | undefined;
  getStoreMode(storeId: string): StoreMode;

  createOrder(input: CreateOrderInput): Order;
  listOrders(storeId: string, statuses?: OrderStatus[]): Order[];
  getOrderById(orderId: string): Order | undefined;
  getEventsForOrder(orderId: string): OrderEvent[];
  updateOrderStatus(orderId: string, nextStatus: OrderStatus, actorId: string): Order;
  ackOrder(orderId: string, clientId: string): boolean;
  getEventsSince(storeId: string, sinceId: number): OrderEvent[];

  listOutbox(storeId?: string, status?: OutboxStatus): OutboxEvent[];
  publishOutbox(storeId?: string, limit?: number): OutboxPublishResult;

  getCallSession(callId: string): CallSession | undefined;
  setCallSession(session: CallSession): void;
}
