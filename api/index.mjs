import app from '../server/app.js';
import { connectDatabase } from '../server/db.js';

export default async function handler(req, res) {
  const path = (req.url || '').split('?')[0];
  if (path === '/api/health/live') {
    app(req, res);
    return;
  }
  try {
    await connectDatabase();
    app(req, res);
  } catch (error) {
    if (path === '/api/health/ready') {
      app(req, res);
      return;
    }
    console.error(JSON.stringify({ event: 'serverless_request_failed', errorName: error.name, errorCode: error.code }));
    if (!res.headersSent) res.status(500).json({ message: 'Something went wrong.' });
    else res.end();
  }
}
