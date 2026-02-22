import { getDbConfig } from '../db/config.js';
import { createPostgresStore } from '../store/factory.js';

async function runOutboxWorkerOnce(limit: number): Promise<void> {
  const config = getDbConfig();
  if (config.backend !== 'postgres') {
    throw new Error('Outbox worker requires STORE_BACKEND=postgres');
  }

  const store = createPostgresStore();
  const result = await store.publishOutboxAsync(undefined, limit);
  console.log(`outbox publish completed: ${result.publishedCount}`);
}

const limit = Number(process.env.OUTBOX_BATCH_LIMIT ?? 100);
runOutboxWorkerOnce(Number.isFinite(limit) && limit > 0 ? limit : 100).catch((error) => {
  console.error(error);
  process.exit(1);
});
