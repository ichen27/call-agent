import { getDbConfig } from '../db/config.js';
import { createPostgresStore } from '../store/factory.js';
import { createOutboxPublisher } from './publishers.js';
import { processOutboxBatch } from './outboxRunner.js';

async function runOutboxWorkerOnce(limit: number): Promise<void> {
  const config = getDbConfig();
  if (config.backend !== 'postgres') {
    throw new Error('Outbox worker requires STORE_BACKEND=postgres');
  }

  const store = createPostgresStore();
  const publisher = createOutboxPublisher();
  const result = await processOutboxBatch(store, publisher, {
    batchLimit: limit,
    maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 5),
    baseDelayMs: Number(process.env.OUTBOX_BASE_DELAY_MS ?? 1000),
    maxDelayMs: Number(process.env.OUTBOX_MAX_DELAY_MS ?? 60000)
  });

  console.log(
    `outbox publish completed: selected=${result.selected} sent=${result.sent} failed=${result.failed} dead_lettered=${result.deadLettered}`
  );
}

const limit = Number(process.env.OUTBOX_BATCH_LIMIT ?? 100);
runOutboxWorkerOnce(Number.isFinite(limit) && limit > 0 ? limit : 100).catch((error) => {
  console.error(error);
  process.exit(1);
});
