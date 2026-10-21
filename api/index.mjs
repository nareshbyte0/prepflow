import { randomUUID } from 'node:crypto';
import { connectDatabase } from '../server/db.js';

export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  if (path === '/api/health/live') {
    res.status(200).json({ status: 'ok' });
    return;
  }
  const requestId = randomUUID();
  try {
    await connectDatabase();
    const { default: app } = await import('../server/app.js');
    app(req, res);
  } catch (error) {
    const configurationError = /^(MONGODB_URI(?: \(or legacy mongodb\))? is required|JWT_SECRET is required|Missing production configuration:|JWT_SECRET must be at least 32 characters)/.test(error.message || '');
    const status = path === '/api/health/ready' || configurationError ? 503 : 500;
    const message = configurationError ? error.message : path === '/api/health/ready' ? 'Database is unavailable.' : 'Something went wrong.';
    console.error(JSON.stringify({ event: 'serverless_request_failed', requestId, errorName: error.name, errorCode: error.code, configurationError: configurationError ? error.message : undefined }));
    if (!res.headersSent) res.status(status).json({ message, requestId, ...(path === '/api/health/ready' ? { status: 'unavailable' } : {}) });
    else res.end();
  }
}
