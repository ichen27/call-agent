import { getDbConfig } from '../db/config.js';
import { createPostgresStore } from '../store/factory.js';
import { createOutboxPublisher } from './publishers.js';
import { processOutboxBatch } from './outboxRunner.js';
import type { OutboxStatus } from '../types.js';

async function loadOutboxBacklogCounts(
  store: ReturnType<typeof createPostgresStore>,
  storeId?: string
): Promise<Record<OutboxStatus, number>> {
  const [pending, failed, deadLetter, sent] = await Promise.all([
    store.listOutbox(storeId, 'PENDING'),
    store.listOutbox(storeId, 'FAILED'),
    store.listOutbox(storeId, 'DEAD_LETTER'),
    store.listOutbox(storeId, 'SENT')
  ]);
  return {
    PENDING: pending.length,
    FAILED: failed.length,
    DEAD_LETTER: deadLetter.length,
    SENT: sent.length
  };
}

async function runOutboxWorkerOnce(limit: number): Promise<void> {
  const config = getDbConfig();
  if (config.backend !== 'postgres') {
    throw new Error('Outbox worker requires STORE_BACKEND=postgres');
  }

  const storeId = process.env.OUTBOX_STORE_ID;
  const store = createPostgresStore();
  const publisher = createOutboxPublisher();
  const before = await loadOutboxBacklogCounts(store, storeId);
  const workerOptions = {
    batchLimit: limit,
    maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 5),
    baseDelayMs: Number(process.env.OUTBOX_BASE_DELAY_MS ?? 1000),
    maxDelayMs: Number(process.env.OUTBOX_MAX_DELAY_MS ?? 60000)
  };
  const result = await processOutboxBatch(store, publisher, {
    ...workerOptions,
    ...(storeId ? { storeId } : {})
  });
  const after = await loadOutboxBacklogCounts(store, storeId);

  console.log(JSON.stringify({ kind: 'outbox_worker_result', store_id: storeId ?? null, ...result, backlog_before: before, backlog_after: after }));
  if (result.deadLettered > 0) {
    console.error(
      JSON.stringify({
        kind: 'outbox_dead_letter_alert',
        store_id: storeId ?? null,
        dead_lettered_in_batch: result.deadLettered,
        total_dead_letter: after.DEAD_LETTER
      })
    );
  }
}

const limit = Number(process.env.OUTBOX_BATCH_LIMIT ?? 100);
runOutboxWorkerOnce(Number.isFinite(limit) && limit > 0 ? limit : 100).catch((error) => {
  console.error(error);
  process.exit(1);
});
