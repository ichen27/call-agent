import { randomUUID } from 'node:crypto';
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

interface WorkerExecutionOptions {
  limit: number;
  storeId?: string;
  runId: string;
}

async function executeSingleBatch(
  store: ReturnType<typeof createPostgresStore>,
  options: WorkerExecutionOptions
): Promise<void> {
  const publisher = createOutboxPublisher();
  const before = await loadOutboxBacklogCounts(store, options.storeId);
  const workerOptions = {
    batchLimit: options.limit,
    maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 5),
    baseDelayMs: Number(process.env.OUTBOX_BASE_DELAY_MS ?? 1000),
    maxDelayMs: Number(process.env.OUTBOX_MAX_DELAY_MS ?? 60000)
  };
  const result = await processOutboxBatch(store, publisher, {
    ...workerOptions,
    ...(options.storeId ? { storeId: options.storeId } : {})
  });
  const after = await loadOutboxBacklogCounts(store, options.storeId);

  console.log(
    JSON.stringify({
      kind: 'outbox_worker_result',
      run_id: options.runId,
      store_id: options.storeId ?? null,
      ...result,
      backlog_before: before,
      backlog_after: after,
      metric: 'outbox_backlog',
      metric_value: after.PENDING + after.FAILED
    })
  );
  if (result.deadLettered > 0) {
    console.error(
      JSON.stringify({
        kind: 'outbox_dead_letter_alert',
        run_id: options.runId,
        store_id: options.storeId ?? null,
        dead_lettered_in_batch: result.deadLettered,
        total_dead_letter: after.DEAD_LETTER,
        metric: 'outbox_publish_failures_total',
        metric_value: result.deadLettered
      })
    );
  }
}

async function replayDeadLetter(
  store: ReturnType<typeof createPostgresStore>,
  storeId: string | undefined,
  limit: number,
  runId: string
): Promise<void> {
  const replayed = await store.replayDeadLetters(storeId, limit);
  console.log(
    JSON.stringify({
      kind: 'outbox_dead_letter_replay',
      run_id: runId,
      store_id: storeId ?? null,
      replayed_count: replayed.length
    })
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOutboxWorker(): Promise<void> {
  const config = getDbConfig();
  if (config.backend !== 'postgres') {
    throw new Error('Outbox worker requires STORE_BACKEND=postgres');
  }

  const runId = randomUUID();
  const storeId = process.env.OUTBOX_STORE_ID;
  const limit = Number(process.env.OUTBOX_BATCH_LIMIT ?? 100);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 100;
  const store = createPostgresStore();

  const mode = (process.env.OUTBOX_MODE ?? 'once').toLowerCase();
  if (mode === 'replay-dead-letter') {
    await replayDeadLetter(store, storeId, safeLimit, runId);
    return;
  }

  if (mode === 'loop') {
    const intervalMsRaw = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000);
    const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw > 100 ? intervalMsRaw : 2000;
    let running = true;
    const stop = () => {
      running = false;
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    while (running) {
      await executeSingleBatch(store, {
        limit: safeLimit,
        ...(storeId ? { storeId } : {}),
        runId
      });
      await sleep(intervalMs);
    }

    console.log(JSON.stringify({ kind: 'outbox_worker_shutdown', run_id: runId, store_id: storeId ?? null }));
    return;
  }

  await executeSingleBatch(store, {
    limit: safeLimit,
    ...(storeId ? { storeId } : {}),
    runId
  });
}

runOutboxWorker().catch((error) => {
  console.error(error);
  process.exit(1);
});
