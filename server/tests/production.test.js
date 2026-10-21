import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import app from '../app.js';
import handler from '../../api/index.mjs';
import { createActionToken, createRateLimiter, isTrustedOrigin, tokenHash, validateProductionConfig } from '../security.js';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('liveness and public question library respond', async () => {
  const live = await fetch(`${baseUrl}/api/health/live`);
  assert.equal(live.status, 200);
  assert.equal((await live.json()).status, 'ok');
  assert.equal(live.headers.get('x-content-type-options'), 'nosniff');
  const questions = await fetch(`${baseUrl}/api/questions`).then(response => response.json());
  assert.equal(questions.length, 318);
  assert.ok(questions.every(question => question.topic && question.link && question.diff));
});

test('serverless liveness does not depend on database or app configuration', async () => {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler({ url: '/api/health/live' }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('unsafe requests reject foreign origins', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(response.status, 403);
});

test('action tokens are random and only their hashes are stored', () => {
  const first = createActionToken(); const second = createActionToken();
  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.equal(tokenHash(first).length, 64);
  assert.notEqual(tokenHash(first), first);
});

test('rate limiter blocks requests beyond its fixed window limit', () => {
  const limit = createRateLimiter({ windowMs: 60_000, limit: 1, message: 'slow down' });
  const makeRes = () => ({ headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
  let nextCalls = 0;
  const req = { ip: 'test-client' };
  const first = makeRes(); limit(req, first, () => nextCalls++);
  const second = makeRes(); limit(req, second, () => nextCalls++);
  assert.equal(nextCalls, 1);
  assert.equal(second.statusCode, 429);
  assert.equal(Number(second.headers['Retry-After']) > 0, true);
});

test('origin policy permits configured site and rejects unknown origins', () => {
  const previousOrigin = process.env.CLIENT_ORIGIN;
  const previousAppUrl = process.env.APP_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    process.env.CLIENT_ORIGIN = 'https://prepflow.example';
    process.env.APP_URL = 'https://prepflow.example/';
    assert.equal(isTrustedOrigin('https://prepflow.example'), true);
    assert.equal(isTrustedOrigin('https://attacker.invalid'), false);
  } finally {
    if (previousOrigin === undefined) delete process.env.CLIENT_ORIGIN; else process.env.CLIENT_ORIGIN = previousOrigin;
    if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('Vercel deployment domains are trusted when explicit origins are not configured', () => {
  const previousOrigin = process.env.CLIENT_ORIGIN;
  const previousAppUrl = process.env.APP_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercelUrl = process.env.VERCEL_URL;
  const previousProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.CLIENT_ORIGIN;
    delete process.env.APP_URL;
    process.env.VERCEL_URL = 'prepflow-preview.vercel.app';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prepflow-silk.vercel.app';
    assert.equal(isTrustedOrigin('https://prepflow-preview.vercel.app'), true);
    assert.equal(isTrustedOrigin('https://prepflow-silk.vercel.app'), true);
    assert.equal(isTrustedOrigin('https://unknown.vercel.app'), false);
  } finally {
    if (previousOrigin === undefined) delete process.env.CLIENT_ORIGIN; else process.env.CLIENT_ORIGIN = previousOrigin;
    if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousVercelUrl === undefined) delete process.env.VERCEL_URL; else process.env.VERCEL_URL = previousVercelUrl;
    if (previousProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL; else process.env.VERCEL_PROJECT_PRODUCTION_URL = previousProductionUrl;
  }
});

test('production login startup needs database and JWT config but not email configuration', () => {
  const names = ['NODE_ENV', 'MONGODB_URI', 'JWT_SECRET', 'APP_URL', 'CLIENT_ORIGIN', 'RESEND_API_KEY', 'EMAIL_FROM'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb+srv://example.invalid/prepflow';
    process.env.JWT_SECRET = 'test-secret-with-more-than-thirty-two-characters';
    for (const name of ['APP_URL', 'CLIENT_ORIGIN', 'RESEND_API_KEY', 'EMAIL_FROM']) delete process.env[name];
    assert.doesNotThrow(() => validateProductionConfig());
    delete process.env.JWT_SECRET;
    assert.throws(() => validateProductionConfig(), /JWT_SECRET/);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
