import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'prepflow_session';
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export const createActionToken = () => randomBytes(32).toString('base64url');

export function setSessionCookie(res, value) {
  const options = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=604800'];
  if (process.env.NODE_ENV === 'production') options.push('Secure');
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(value)}; ${options.join('; ')}`);
}

export function clearSessionCookie(res) {
  const options = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') options.push('Secure');
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${options.join('; ')}`);
}

export function createRateLimiter({ windowMs, limit, message }) {
  const clients = new Map();
  let lastCleanup = Date.now();
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastCleanup > windowMs) {
      for (const [key, entry] of clients) if (entry.resetAt <= now) clients.delete(key);
      lastCleanup = now;
    }
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = clients.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(key, entry);
    }
    entry.count += 1;
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return res.status(429).json({ message });
    }
    next();
  };
}

export function isTrustedOrigin(origin) {
  if (!origin) return true;
  const configured = (process.env.CLIENT_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  if (process.env.APP_URL) configured.push(process.env.APP_URL.replace(/\/$/, ''));
  for (const domain of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (domain) configured.push(`https://${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`);
  }
  if (configured.length) return configured.includes(origin);
  if (process.env.NODE_ENV === 'production') return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export async function sendAccountEmail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email delivery is not configured.');
    console.info(JSON.stringify({ event: 'development_email', to, subject, text }));
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
}

export function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  // Email delivery is only needed for verification/reset flows; it must not prevent existing users from logging in.
  const required = ['MONGODB_URI', 'JWT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
  if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production.');
}

export function reportApplicationError(event) {
  const endpoint = process.env.ERROR_WEBHOOK_URL;
  if (!endpoint) return;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ERROR_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${process.env.ERROR_WEBHOOK_TOKEN}`;
  fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(event), signal: AbortSignal.timeout(3000) })
    .catch(error => console.error(JSON.stringify({ event: 'error_report_delivery_failed', error: error.message })));
}

export function getAppUrl() {
  const vercelDomain = process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const appUrl = process.env.APP_URL || (vercelDomain ? `https://${vercelDomain.replace(/^https?:\/\//, '')}` : process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');
  if (!appUrl) throw new Error('APP_URL is required in production.');
  return appUrl.replace(/\/$/, '');
}
