import { createServer } from 'node:http';
import { createApp } from './app.js';
import { RealtimeGateway } from './realtime/gateway.js';

const port = Number(process.env.PORT ?? 3000);
const realtimeGateway = new RealtimeGateway();
const { app, authService } = createApp({ realtimeGateway });
const server = createServer(app);

server.on('upgrade', (request, socket) => {
  const headers: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    headers[key.toLowerCase()] = value;
  }
  realtimeGateway.attachUpgrade(request.url, headers, socket, authService);
});

server.listen(port, () => {
  console.log(`call-agent listening on ${port}`);
});
