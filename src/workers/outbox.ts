import { getDbConfig } from '../db/config.js';
import { createPostgresStore } from '../store/factory.js';
import { createOutboxPublisher } from './publishers.js';

async function runOutboxWorkerOnce(limit: number): Promise<void> {
  const config = getDbConfig();
  if (config.backend !== 'postgres') {
    throw new Error('Outbox worker requires STORE_BACKEND=postgres');
  }

  const store = createPostgresStore();
  const publisher = createOutboxPublisher();
  const pending = await store.listOutbox(undefined, 'PENDING');
  const selected = pending.slice(0, limit);

  let sent = 0;
  let failed = 0;
  for (const event of selected) {
    try {
      await publisher.publish(event);
      await store.markOutboxSent(event.id);
      sent += 1;
    } catch (error) {
      await store.markOutboxFailed(event.id);
      failed += 1;
      console.error({ eventId: event.id, error: (error as Error).message }, 'outbox publish failed');
    }
  }

  console.log(`outbox publish completed: sent=${sent} failed=${failed} selected=${selected.length}`);
}

const limit = Number(process.env.OUTBOX_BATCH_LIMIT ?? 100);
runOutboxWorkerOnce(Number.isFinite(limit) && limit > 0 ? limit : 100).catch((error) => {
  console.error(error);
  process.exit(1);
});
