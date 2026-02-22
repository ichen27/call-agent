import type { ErrorRequestHandler } from 'express';
import { safeLog } from '../logger.js';

function classifyError(error: Error): { status: number; code: string; message: string } {
  const text = error.message.toLowerCase();

  if (text.includes('invalid transition')) {
    return { status: 400, code: 'INVALID_STATUS_CHANGE', message: error.message };
  }
  if (text.includes('not found')) {
    return { status: 404, code: 'NOT_FOUND', message: 'resource not found' };
  }
  if (text.includes('database') || text.includes('connection') || text.includes('timeout') || text.includes('query')) {
    return { status: 503, code: 'DB_UNAVAILABLE', message: 'database unavailable' };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'internal server error' };
}

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
  const error = err instanceof Error ? err : new Error('unknown error');
  const mapped = classifyError(error);

  safeLog('error', 'request failed', {
    request_id: req.header('x-request-id'),
    method: req.method,
    path: req.path,
    error_code: mapped.code,
    error_message: error.message
  });

  res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
};
