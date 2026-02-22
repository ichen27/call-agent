import type { AppRepository } from '../store/repository.js';
import type { OutboxPublisher } from './publishers.js';

export interface OutboxWorkerOptions {
  batchLimit: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  storeId?: string;
  now?: () => Date;
}

export interface OutboxWorkerResult {
  selected: number;
  sent: number;
  failed: number;
  deadLettered: number;
}

export function computeBackoffDelayMs(attempts: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponent = Math.max(0, attempts - 1);
  const delay = baseDelayMs * 2 ** exponent;
  return Math.min(delay, maxDelayMs);
}

export async function processOutboxBatch(
  repository: AppRepository,
  publisher: OutboxPublisher,
  options: OutboxWorkerOptions
): Promise<OutboxWorkerResult> {
  const now = options.now ?? (() => new Date());
  const selected = await repository.listOutboxDue(options.batchLimit, options.storeId);

  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const event of selected) {
    try {
      await publisher.publish(event);
      await repository.markOutboxSent(event.id);
      sent += 1;
    } catch {
      const nextAttempts = event.attempts + 1;
      if (nextAttempts >= options.maxAttempts) {
        await repository.markOutboxDeadLetter(event.id);
        deadLettered += 1;
        continue;
      }

      const delay = computeBackoffDelayMs(nextAttempts, options.baseDelayMs, options.maxDelayMs);
      const nextAttemptAt = new Date(now().getTime() + delay).toISOString();
      await repository.markOutboxFailed(event.id, nextAttemptAt);
      failed += 1;
    }
  }

  return {
    selected: selected.length,
    sent,
    failed,
    deadLettered
  };
}
