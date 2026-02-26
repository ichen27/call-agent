import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';

type OrderStatus = 'NEW' | 'ACCEPTED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'REJECTED' | 'CANCELED';
type StoreMode = 'OPEN' | 'BUSY' | 'CLOSED';
type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
type RejectReason = 'OUT_OF_STOCK' | 'KITCHEN_OVERLOADED' | 'STORE_CLOSING' | 'UNABLE_TO_FULFILL';

interface Session {
  token: string;
  storeId: string;
  email: string;
  role: 'STAFF' | 'MANAGER';
}

interface Order {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  totalCents: number;
  createdAt: string;
  promisedTime?: string;
  notes?: string;
  rejectReason?: string;
  ackedClientIds: string[];
}

interface OrderDetail {
  order: Order & {
    items: Array<{
      itemId: string;
      itemNameSnapshot: string;
      qty: number;
      lineTotalCents: number;
      specialInstructions?: string;
    }>;
  };
  events: Array<{ id: number; eventType: string; createdAt: string; payload: Record<string, unknown> }>;
}

interface RealtimeEnvelope {
  event_id: number;
  store_id: string;
  event_type: string;
}

const SESSION_KEY = 'staff-ui-session';
const CLIENT_ID = 'staff-web-1';

function cursorKey(storeId: string): string {
  return `staff-ui-cursor:${storeId}`;
}

function unreadKey(storeId: string): string {
  return `staff-ui-unread:${storeId}`;
}

function loadCursor(storeId: string): number {
  const raw = localStorage.getItem(cursorKey(storeId));
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function saveCursor(storeId: string, value: number): void {
  localStorage.setItem(cursorKey(storeId), String(value));
}

function loadUnread(storeId: string): string[] {
  const raw = localStorage.getItem(unreadKey(storeId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUnread(storeId: string, ids: string[]): void {
  localStorage.setItem(unreadKey(storeId), JSON.stringify(ids));
}

function markUnread(existing: string[], orders: Order[]): string[] {
  const merged = new Set(existing);
  for (const order of orders) {
    const unread = order.status === 'NEW' && !order.ackedClientIds.includes(CLIENT_ID);
    if (unread) {
      merged.add(order.id);
    }
  }
  return [...merged];
}

function clearUnread(existing: string[], orderId: string): string[] {
  return existing.filter((id) => id !== orderId);
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Session;
    } catch {
      return null;
    }
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('DISCONNECTED');
  const [storeMode, setStoreMode] = useState<StoreMode>('OPEN');
  const [menuItemId, setMenuItemId] = useState('item-burrito');
  const [menuAvailability, setMenuAvailability] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectReason>('OUT_OF_STOCK');
  const [rejectNote, setRejectNote] = useState('');
  const [promisedTime, setPromisedTime] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [unreadOrderIds, setUnreadOrderIds] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | undefined>();
  const pollingRef = useRef<number | undefined>();
  const lastEventIdRef = useRef(0);

  const sortedOrders = useMemo(() => [...orders].sort((a, b) => b.orderNumber - a.orderNumber), [orders]);

  useEffect(() => {
    if (!session) return;

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    lastEventIdRef.current = loadCursor(session.storeId);
    const persistedUnread = loadUnread(session.storeId);
    setUnreadOrderIds(persistedUnread);

    void loadOrders(session, setOrders, setUnreadOrderIds, persistedUnread, (nextUnread) => {
      saveUnread(session.storeId, nextUnread);
    });

    connectRealtime(
      session,
      setConnection,
      wsRef,
      reconnectRef,
      pollingRef,
      lastEventIdRef,
      async (eventId) => {
        if (eventId > lastEventIdRef.current) {
          lastEventIdRef.current = eventId;
          saveCursor(session.storeId, eventId);
        }
        beep();
        await loadOrders(session, setOrders, setUnreadOrderIds, loadUnread(session.storeId), (nextUnread) => {
          saveUnread(session.storeId, nextUnread);
        });
      }
    );

    return () => {
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      wsRef.current?.close();
    };
  }, [session]);

  if (!session) {
    return <Login onSession={setSession} />;
  }

  return (
    <div className="page">
      <header>
        <h1>Staff Orders</h1>
        <div className="meta">
          <span>{session.email}</span>
          <span>{session.role}</span>
          <span className={`chip ${connection.toLowerCase()}`}>{connection}</span>
          <button
            onClick={() => {
              localStorage.removeItem(SESSION_KEY);
              setSession(null);
            }}
          >
            Log out
          </button>
        </div>
      </header>

      {actionError ? <p className="error">{actionError}</p> : null}
      {actionInfo ? <p className="info">{actionInfo}</p> : null}

      <section className="controls">
        <h2>Store Controls</h2>
        <div className="row">
          <select value={storeMode} onChange={(e) => setStoreMode(e.target.value as StoreMode)}>
            <option value="OPEN">OPEN</option>
            <option value="BUSY">BUSY</option>
            <option value="CLOSED">CLOSED</option>
          </select>
          <button
            disabled={session.role !== 'MANAGER'}
            onClick={async () => {
              const ok = await updateStoreMode(session, storeMode);
              if (ok) {
                setActionInfo('Store mode updated');
                setActionError(null);
              } else {
                setActionError('Failed to update store mode');
              }
            }}
            title={session.role !== 'MANAGER' ? 'Manager only' : ''}
          >
            Update mode
          </button>
        </div>

        <div className="row">
          <input value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)} placeholder="item id" />
          <label>
            <input type="checkbox" checked={menuAvailability} onChange={(e) => setMenuAvailability(e.target.checked)} />
            Available
          </label>
          <button
            disabled={session.role !== 'MANAGER'}
            onClick={async () => {
              const ok = await updateItemAvailability(session, menuItemId, menuAvailability);
              if (ok) {
                setActionInfo('Menu item updated');
                setActionError(null);
              } else {
                setActionError('Failed to update menu item');
              }
            }}
            title={session.role !== 'MANAGER' ? 'Manager only' : ''}
          >
            Update item
          </button>
        </div>
      </section>

      <section>
        <h2>Orders</h2>
        <div className="orders">
          {sortedOrders.map((order) => {
            const unread = unreadOrderIds.includes(order.id);
            return (
              <article key={order.id} className="card">
                <h3>
                  #{order.orderNumber} {order.status} {unread ? <span className="badge">NEW</span> : null}
                </h3>
                <p>{order.customerName}</p>
                <p>${(order.totalCents / 100).toFixed(2)}</p>
                <p>{new Date(order.createdAt).toLocaleTimeString()}</p>
                <div className="row">
                  <button
                    onClick={async () => {
                      const ok = await ackOrder(session, order.id);
                      if (!ok) {
                        setActionError('Ack failed');
                        return;
                      }
                      const nextUnread = clearUnread(unreadOrderIds, order.id);
                      setUnreadOrderIds(nextUnread);
                      saveUnread(session.storeId, nextUnread);
                      await loadOrders(session, setOrders, setUnreadOrderIds, nextUnread, (updated) => saveUnread(session.storeId, updated));
                    }}
                  >
                    Ack
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await setStatus(session, order.id, 'ACCEPTED');
                      if (!ok) {
                        setActionError('Accept failed');
                        return;
                      }
                      await loadOrders(session, setOrders, setUnreadOrderIds, unreadOrderIds, (updated) => saveUnread(session.storeId, updated));
                    }}
                  >
                    Accept
                  </button>
                  <button onClick={() => void setStatusAndReload(session, order.id, 'IN_PROGRESS', unreadOrderIds, setOrders, setUnreadOrderIds)}>
                    In Progress
                  </button>
                  <button onClick={() => void setStatusAndReload(session, order.id, 'READY', unreadOrderIds, setOrders, setUnreadOrderIds)}>
                    Ready
                  </button>
                  <button onClick={() => void setStatusAndReload(session, order.id, 'COMPLETED', unreadOrderIds, setOrders, setUnreadOrderIds)}>
                    Complete
                  </button>
                </div>
                <div className="row">
                  <button
                    onClick={async () => {
                      setSelectedOrderId(order.id);
                      const nextUnread = clearUnread(unreadOrderIds, order.id);
                      setUnreadOrderIds(nextUnread);
                      saveUnread(session.storeId, nextUnread);
                      await loadOrderDetail(session, order.id, setDetail, setLoadingDetail, setActionError);
                    }}
                  >
                    Details
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selectedOrderId ? (
        <aside className="drawer">
          <div className="drawer-header">
            <h2>Order Detail</h2>
            <button
              onClick={() => {
                setSelectedOrderId(null);
                setDetail(null);
                setRejectNote('');
                setPromisedTime('');
              }}
            >
              Close
            </button>
          </div>

          {loadingDetail ? <p>Loading…</p> : null}
          {!loadingDetail && detail ? (
            <>
              <p>
                <strong>#{detail.order.orderNumber}</strong> {detail.order.status}
              </p>
              <p>{detail.order.customerName}</p>
              <p>{detail.order.customerPhone}</p>
              <p>${(detail.order.totalCents / 100).toFixed(2)}</p>

              <a className="call-link" href={`tel:${detail.order.customerPhone}`}>
                Call customer
              </a>

              <h3>Items</h3>
              <ul>
                {detail.order.items.map((item) => (
                  <li key={`${item.itemId}-${item.itemNameSnapshot}`}>
                    {item.qty} x {item.itemNameSnapshot} (${(item.lineTotalCents / 100).toFixed(2)})
                  </li>
                ))}
              </ul>

              <h3>Reject order</h3>
              <div className="row">
                <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value as RejectReason)}>
                  <option value="OUT_OF_STOCK">Out of stock</option>
                  <option value="KITCHEN_OVERLOADED">Kitchen overloaded</option>
                  <option value="STORE_CLOSING">Store closing</option>
                  <option value="UNABLE_TO_FULFILL">Unable to fulfill</option>
                </select>
              </div>
              <div className="row">
                <input
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Optional note"
                />
              </div>
              <div className="row">
                <input
                  value={promisedTime}
                  onChange={(e) => setPromisedTime(e.target.value)}
                  placeholder="Promised time (ISO-8601)"
                />
              </div>
              <div className="row">
                <button
                  onClick={async () => {
                    if (!rejectReason) {
                      setActionError('Reject reason is required');
                      return;
                    }
                    const ok = await setStatus(session, detail.order.id, 'REJECTED', {
                      reject_reason: rejectReason,
                      note: rejectNote || undefined,
                      promised_time: promisedTime || undefined
                    });
                    if (!ok) {
                      setActionError('Reject update failed');
                      return;
                    }
                    await loadOrders(session, setOrders, setUnreadOrderIds, unreadOrderIds, (updated) => saveUnread(session.storeId, updated));
                    await loadOrderDetail(session, detail.order.id, setDetail, setLoadingDetail, setActionError);
                    setActionError(null);
                    setActionInfo('Order updated');
                  }}
                >
                  Reject
                </button>
              </div>

              <h3>Audit trail</h3>
              <ul>
                {detail.events.map((event) => (
                  <li key={event.id}>
                    #{event.id} {event.eventType} at {new Date(event.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

function Login({ onSession }: { onSession: (s: Session) => void }) {
  const [storeId, setStoreId] = useState('store-1');
  const [email, setEmail] = useState('manager@store.test');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="login">
      <h1>Staff Login</h1>
      <input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="store id" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
      <button
        onClick={async () => {
          setError(null);
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ store_id: storeId, email, password })
          });
          if (!response.ok) {
            setError('login failed');
            return;
          }
          const body = (await response.json()) as { token: string; user: { role: 'STAFF' | 'MANAGER'; email: string; store_id: string } };
          onSession({ token: body.token, role: body.user.role, email: body.user.email, storeId: body.user.store_id });
        }}
      >
        Sign in
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

async function setStatusAndReload(
  session: Session,
  orderId: string,
  status: OrderStatus,
  unreadIds: string[],
  setOrders: (orders: Order[]) => void,
  setUnreadOrderIds: (ids: string[]) => void
): Promise<void> {
  const ok = await setStatus(session, orderId, status);
  if (!ok) {
    return;
  }
  await loadOrders(session, setOrders, setUnreadOrderIds, unreadIds, (updated) => saveUnread(session.storeId, updated));
}

async function loadOrders(
  session: Session,
  setOrders: (orders: Order[]) => void,
  setUnreadOrderIds: (ids: string[]) => void,
  existingUnread: string[],
  onUnread: (ids: string[]) => void
): Promise<void> {
  const response = await fetch(`/api/orders?store_id=${encodeURIComponent(session.storeId)}`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (!response.ok) return;
  const body = (await response.json()) as { orders: Array<Record<string, unknown>> };
  const mapped: Order[] = body.orders.map((order) => ({
    id: String(order.id),
    orderNumber: Number(order.orderNumber),
    status: order.status as OrderStatus,
    customerName: String(order.customerName),
    customerPhone: String(order.customerPhone ?? ''),
    totalCents: Number(order.totalCents),
    createdAt: String(order.createdAt),
    promisedTime: typeof order.promisedTime === 'string' ? order.promisedTime : undefined,
    notes: typeof order.notes === 'string' ? order.notes : undefined,
    rejectReason: typeof order.rejectReason === 'string' ? order.rejectReason : undefined,
    ackedClientIds: (order.ackedClientIds as string[]) ?? []
  }));
  setOrders(mapped);
  const nextUnread = markUnread(existingUnread, mapped);
  setUnreadOrderIds(nextUnread);
  onUnread(nextUnread);
}

function connectRealtime(
  session: Session,
  setConnection: (state: ConnectionState) => void,
  wsRef: MutableRefObject<WebSocket | null>,
  reconnectRef: MutableRefObject<number | undefined>,
  pollingRef: MutableRefObject<number | undefined>,
  lastEventIdRef: MutableRefObject<number>,
  onEvent: (eventId: number) => Promise<void>
) {
  setConnection('CONNECTING');
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${encodeURIComponent(session.token)}&store_id=${encodeURIComponent(session.storeId)}`);
  wsRef.current = ws;

  const startPolling = () => {
    if (pollingRef.current) return;
    pollingRef.current = window.setInterval(() => {
      void replaySince(session, lastEventIdRef.current, async (eventId) => {
        if (eventId > lastEventIdRef.current) {
          lastEventIdRef.current = eventId;
          saveCursor(session.storeId, eventId);
          await onEvent(eventId);
        }
      });
    }, 7000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = undefined;
    }
  };

  ws.onopen = () => {
    setConnection('CONNECTED');
    stopPolling();
    void replaySince(session, lastEventIdRef.current, async (eventId) => {
      if (eventId > lastEventIdRef.current) {
        lastEventIdRef.current = eventId;
        saveCursor(session.storeId, eventId);
        await onEvent(eventId);
      }
    });
  };
  ws.onclose = () => {
    setConnection('DISCONNECTED');
    startPolling();
    reconnectRef.current = window.setTimeout(
      () => connectRealtime(session, setConnection, wsRef, reconnectRef, pollingRef, lastEventIdRef, onEvent),
      2000
    );
  };
  ws.onerror = () => {
    setConnection('DISCONNECTED');
    startPolling();
  };
  ws.onmessage = (message) => {
    try {
      const event = JSON.parse(String(message.data)) as RealtimeEnvelope;
      if (event.store_id === session.storeId && event.event_id > lastEventIdRef.current) {
        lastEventIdRef.current = event.event_id;
        saveCursor(session.storeId, event.event_id);
        void onEvent(event.event_id);
      }
    } catch {
      // no-op; invalid envelope ignored
    }
  };
}

async function replaySince(session: Session, sinceId: number, onEvent: (eventId: number) => Promise<void>): Promise<void> {
  const response = await fetch(`/api/stores/${encodeURIComponent(session.storeId)}/events?since_id=${sinceId}`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (!response.ok) return;
  const body = (await response.json()) as { events: Array<{ id: number }> };
  for (const event of body.events) {
    await onEvent(event.id);
  }
}

async function loadOrderDetail(
  session: Session,
  orderId: string,
  setDetail: (detail: OrderDetail | null) => void,
  setLoading: (value: boolean) => void,
  setError: (message: string | null) => void
): Promise<void> {
  setLoading(true);
  setError(null);
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (!response.ok) {
    setLoading(false);
    setError('Failed to load order details');
    return;
  }
  const body = (await response.json()) as {
    order: Record<string, unknown>;
    events: Array<{ id: number; eventType: string; createdAt: string; payload: Record<string, unknown> }>;
  };
  const detail: OrderDetail = {
    order: {
      id: String(body.order.id),
      orderNumber: Number(body.order.orderNumber),
      status: body.order.status as OrderStatus,
      customerName: String(body.order.customerName),
      customerPhone: String(body.order.customerPhone),
      totalCents: Number(body.order.totalCents),
      createdAt: String(body.order.createdAt),
      promisedTime: typeof body.order.promisedTime === 'string' ? body.order.promisedTime : undefined,
      notes: typeof body.order.notes === 'string' ? body.order.notes : undefined,
      rejectReason: typeof body.order.rejectReason === 'string' ? body.order.rejectReason : undefined,
      ackedClientIds: (body.order.ackedClientIds as string[]) ?? [],
      items: ((body.order.items as Array<Record<string, unknown>>) ?? []).map((item) => ({
        itemId: String(item.itemId),
        itemNameSnapshot: String(item.itemNameSnapshot),
        qty: Number(item.qty),
        lineTotalCents: Number(item.lineTotalCents),
        specialInstructions: typeof item.specialInstructions === 'string' ? item.specialInstructions : undefined
      }))
    },
    events: body.events
  };

  setDetail(detail);
  setLoading(false);
}

async function ackOrder(session: Session, orderId: string): Promise<boolean> {
  const response = await fetch(`/api/orders/${orderId}/ack`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ client_id: CLIENT_ID })
  });
  return response.ok;
}

async function setStatus(
  session: Session,
  orderId: string,
  status: OrderStatus,
  extra?: { reject_reason?: string; note?: string; promised_time?: string }
): Promise<boolean> {
  const response = await fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ status, ...extra })
  });
  return response.ok;
}

async function updateStoreMode(session: Session, mode: StoreMode): Promise<boolean> {
  const response = await fetch(`/api/stores/${session.storeId}/mode`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ mode })
  });
  return response.ok;
}

async function updateItemAvailability(session: Session, itemId: string, isAvailable: boolean): Promise<boolean> {
  const response = await fetch(`/api/menu/items/${itemId}/availability`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ is_available: isAvailable })
  });
  return response.ok;
}

function beep() {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = 760;
  oscillator.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.11);
}
