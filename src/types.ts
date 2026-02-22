export type StoreMode = 'OPEN' | 'BUSY' | 'CLOSED';
export type OrderStatus = 'NEW' | 'ACCEPTED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'REJECTED' | 'CANCELED';

export interface MenuItem {
  id: string;
  storeId: string;
  name: string;
  basePriceCents: number;
  isAvailable: boolean;
}

export interface OrderItemInput {
  itemId: string;
  itemNameSnapshot: string;
  qty: number;
  basePriceCents: number;
  modifiersSnapshotJson: Array<Record<string, string | number>>;
  specialInstructions?: string;
  lineTotalCents: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  storeId: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  items: OrderItemInput[];
  totalCents: number;
  notes?: string;
  callId?: string;
  createdAt: string;
  updatedAt: string;
  ackedClientIds: string[];
}

export interface OrderEvent {
  id: number;
  storeId: string;
  orderId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export type OutboxStatus = 'PENDING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';

export interface OutboxEvent {
  id: number;
  storeId: string;
  aggregateType: 'ORDER';
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  sentAt?: string;
}

export interface CallSession {
  callId: string;
  storeId: string;
  state: string;
  callerPhone: string;
  customerName?: string;
  draftItems: Array<{ itemId: string; qty: number }>;
  pendingClarification?: string[];
  createdOrderId?: string;
  handoff: boolean;
  endedAt?: string;
}
