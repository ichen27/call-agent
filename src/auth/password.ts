import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGO = 'pbkdf2_sha256';
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

export function hashPassword(password: string, salt?: string): string {
  const actualSalt = salt ?? randomBytes(12).toString('hex');
  const digest = pbkdf2Sync(password, actualSalt, ITERATIONS, KEY_LENGTH, 'sha256').toString('hex');
  return `${ALGO}$${ITERATIONS}$${actualSalt}$${digest}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 4) {
    return false;
  }

  const [algo, iterationsRaw, salt, expectedDigest] = parts;
  if (algo !== ALGO || !salt || !expectedDigest) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const actualDigest = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256').toString('hex');
  const expectedBuffer = Buffer.from(expectedDigest, 'hex');
  const actualBuffer = Buffer.from(actualDigest, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
