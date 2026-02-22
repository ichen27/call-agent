import type { Duplex } from 'node:stream';
import { createHash } from 'node:crypto';
import type { AuthService } from '../auth/service.js';

export interface RealtimeEnvelope {
  kind: 'outbox_publish';
  event_id: number;
  store_id: string;
  event_type: string;
  aggregate_id: string;
  aggregate_type: string;
  attempts: number;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface RealtimeFanout {
  publish(event: RealtimeEnvelope): number;
  connectedCount(storeId?: string): number;
}

interface RealtimeClient {
  socket: Duplex;
}

export class RealtimeGateway implements RealtimeFanout {
  private readonly clientsByStore = new Map<string, Set<RealtimeClient>>();

  attachUpgrade(
    requestUrl: string | undefined,
    headers: Record<string, string | string[] | undefined>,
    socket: Duplex,
    authService: AuthService
  ): void {
    const url = new URL(requestUrl ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token');
    const storeId = url.searchParams.get('store_id');
    const keyHeader = headers['sec-websocket-key'];
    const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
    if (!token || !storeId || !key) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const auth = authService.verify(token);
    if (!auth || auth.storeId !== storeId) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = computeWebSocketAccept(key);
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n'
      ].join('\r\n')
    );

    const client: RealtimeClient = { socket };
    const bucket = this.clientsByStore.get(storeId) ?? new Set<RealtimeClient>();
    bucket.add(client);
    this.clientsByStore.set(storeId, bucket);

    const heartbeat = setInterval(() => {
      if (socket.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      socket.write(Buffer.from([0x89, 0x00]));
    }, 25000);

    const cleanup = () => {
      clearInterval(heartbeat);
      bucket.delete(client);
      if (bucket.size === 0) {
        this.clientsByStore.delete(storeId);
      }
    };

    socket.on('close', cleanup);
    socket.on('error', cleanup);
  }

  publish(event: RealtimeEnvelope): number {
    const clients = this.clientsByStore.get(event.store_id);
    if (!clients || clients.size === 0) {
      return 0;
    }
    const frame = encodeTextFrame(JSON.stringify(event));
    for (const client of clients) {
      if (!client.socket.destroyed) {
        client.socket.write(frame);
      }
    }
    return clients.size;
  }

  connectedCount(storeId?: string): number {
    if (storeId) {
      return this.clientsByStore.get(storeId)?.size ?? 0;
    }
    let total = 0;
    for (const clients of this.clientsByStore.values()) {
      total += clients.size;
    }
    return total;
  }
}

function computeWebSocketAccept(key: string): string {
  return createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;
  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }
  if (length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
}
