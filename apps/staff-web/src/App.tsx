import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';

type OrderStatus = 'NEW' | 'ACCEPTED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'REJECTED' | 'CANCELED';
type StoreMode = 'OPEN' | 'BUSY' | 'CLOSED';

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
  totalCents: number;
  createdAt: string;
  ackedClientIds: string[];
}

interface RealtimeEnvelope {
  event_id: number;
  store_id: string;
  event_type: string;
}

const SESSION_KEY = 'staff-ui-session';
const CLIENT_ID = 'staff-web-1';

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
  const [connection, setConnection] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [storeMode, setStoreMode] = useState<StoreMode>('OPEN');
  const [menuItemId, setMenuItemId] = useState('item-burrito');
  const [menuAvailability, setMenuAvailability] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | undefined>();
  const lastEventIdRef = useRef(0);

  const sortedOrders = useMemo(() => [...orders].sort((a, b) => b.orderNumber - a.orderNumber), [orders]);

  useEffect(() => {
    if (!session) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    void loadOrders(session, setOrders);
    connectRealtime(session, setConnection, wsRef, reconnectRef, lastEventIdRef, (eventId) => {
      if (eventId > lastEventIdRef.current) {
        lastEventIdRef.current = eventId;
      }
      beep();
      void loadOrders(session, setOrders);
    });

    return () => {
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
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
          <span>{connection}</span>
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
            onClick={() => void updateStoreMode(session, storeMode)}
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
            onClick={() => void updateItemAvailability(session, menuItemId, menuAvailability)}
            title={session.role !== 'MANAGER' ? 'Manager only' : ''}
          >
            Update item
          </button>
        </div>
      </section>

      <section>
        <h2>Orders</h2>
        <div className="orders">
          {sortedOrders.map((order) => (
            <article key={order.id} className="card">
              <h3>#{order.orderNumber} {order.status}</h3>
              <p>{order.customerName}</p>
              <p>${(order.totalCents / 100).toFixed(2)}</p>
              <p>{new Date(order.createdAt).toLocaleTimeString()}</p>
              <div className="row">
                <button onClick={() => void ackOrder(session, order.id).then(() => loadOrders(session, setOrders))}>Ack</button>
                <button onClick={() => void setStatus(session, order.id, 'ACCEPTED').then(() => loadOrders(session, setOrders))}>Accept</button>
                <button onClick={() => void setStatus(session, order.id, 'IN_PROGRESS').then(() => loadOrders(session, setOrders))}>In Progress</button>
                <button onClick={() => void setStatus(session, order.id, 'READY').then(() => loadOrders(session, setOrders))}>Ready</button>
                <button onClick={() => void setStatus(session, order.id, 'COMPLETED').then(() => loadOrders(session, setOrders))}>Complete</button>
              </div>
            </article>
          ))}
        </div>
      </section>
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

async function loadOrders(session: Session, setOrders: (orders: Order[]) => void): Promise<void> {
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
    totalCents: Number(order.totalCents),
    createdAt: String(order.createdAt),
    ackedClientIds: (order.ackedClientIds as string[]) ?? []
  }));
  setOrders(mapped);
}

function connectRealtime(
  session: Session,
  setConnection: (state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED') => void,
  wsRef: MutableRefObject<WebSocket | null>,
  reconnectRef: MutableRefObject<number | undefined>,
  lastEventIdRef: MutableRefObject<number>,
  onEvent: (eventId: number) => void
) {
  setConnection('CONNECTING');
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${encodeURIComponent(session.token)}&store_id=${encodeURIComponent(session.storeId)}`);
  wsRef.current = ws;

  ws.onopen = () => {
    setConnection('CONNECTED');
    void replaySince(session, lastEventIdRef.current, onEvent);
  };
  ws.onclose = () => {
    setConnection('DISCONNECTED');
    reconnectRef.current = window.setTimeout(
      () => connectRealtime(session, setConnection, wsRef, reconnectRef, lastEventIdRef, onEvent),
      2000
    );
  };
  ws.onerror = () => setConnection('DISCONNECTED');
  ws.onmessage = (message) => {
    try {
      const event = JSON.parse(String(message.data)) as RealtimeEnvelope;
      if (event.store_id === session.storeId) {
        onEvent(event.event_id);
      }
    } catch {
      // no-op; invalid envelope ignored
    }
  };
}

async function replaySince(session: Session, sinceId: number, onEvent: (eventId: number) => void): Promise<void> {
  const response = await fetch(`/api/stores/${encodeURIComponent(session.storeId)}/events?since_id=${sinceId}`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (!response.ok) return;
  const body = (await response.json()) as { events: Array<{ id: number }> };
  for (const event of body.events) {
    onEvent(event.id);
  }
}

async function ackOrder(session: Session, orderId: string): Promise<void> {
  await fetch(`/api/orders/${orderId}/ack`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ client_id: CLIENT_ID })
  });
}

async function setStatus(session: Session, orderId: string, status: OrderStatus): Promise<void> {
  await fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
}

async function updateStoreMode(session: Session, mode: StoreMode): Promise<void> {
  await fetch(`/api/stores/${session.storeId}/mode`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ mode })
  });
}

async function updateItemAvailability(session: Session, itemId: string, isAvailable: boolean): Promise<void> {
  await fetch(`/api/menu/items/${itemId}/availability`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ is_available: isAvailable })
  });
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
