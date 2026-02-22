import pino from 'pino';

const PHONE_RE = /\+?\d[\d\s\-()]{7,}\d/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

function redactSensitiveText(text: string): string {
  return text.replace(PHONE_RE, '[REDACTED_PHONE]').replace(EMAIL_RE, '[REDACTED_EMAIL]');
}

export function safeLog(level: 'info' | 'warn' | 'error', message: string, payload?: Record<string, unknown>): void {
  const serialized = payload ? JSON.stringify(payload) : undefined;
  const redactedPayload = serialized ? JSON.parse(redactSensitiveText(serialized)) : undefined;
  logger[level]({ ...redactedPayload }, redactSensitiveText(message));
}
