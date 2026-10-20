import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import User from './models/User.js';
import Progress from './models/Progress.js';
import { requireAuth } from './middleware/auth.js';
import { getJwtSecret } from './db.js';
import { clearSessionCookie, createActionToken, createRateLimiter, getAppUrl, isTrustedOrigin, reportApplicationError, sendAccountEmail, setSessionCookie, tokenHash, validateProductionConfig } from './security.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const questions = require('../questions.json');
const app = express();
validateProductionConfig();

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const startedAt = Date.now();
  res.on('finish', () => console.info(JSON.stringify({ event: 'http_request', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt })));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://assets.leetcode.com https://*.leetcode.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(cors({ origin(origin, callback) { callback(null, isTrustedOrigin(origin) ? origin : false); }, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', createRateLimiter({ windowMs: 60_000, limit: 180, message: 'Too many requests. Wait a minute and try again.' }));

const token = user => jwt.sign({ sub: user.id, ver: user.tokenVersion }, getJwtSecret(), { expiresIn: '7d' });
const profile = user => ({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, dailyGoal: user.dailyGoal || 3 });
const authRateLimit = createRateLimiter({ windowMs: 15 * 60_000, limit: 10, message: 'Too many sign-in attempts. Try again in 15 minutes.' });
const emailRateLimit = createRateLimiter({ windowMs: 60 * 60_000, limit: 5, message: 'Too many email requests. Try again in an hour.' });
const leetcodeRateLimit = createRateLimiter({ windowMs: 60_000, limit: 10, message: 'LeetCode sync is being requested too often. Wait a minute and try again.' });
const requireSafeOrigin = (req, res, next) => {
  const origin = req.get('origin');
  const sameOrigin = origin && origin === `${req.protocol}://${req.get('host')}`;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin && !isTrustedOrigin(origin)) return res.status(403).json({ message: 'This request origin is not allowed.' });
  next();
};
app.use('/api', requireSafeOrigin);
app.get('/api/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/health/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable', database: ready ? 'connected' : 'disconnected' });
});
function parseLeetcodeUsername(value) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!input) return '';
  let username = input;
  try {
    if (input.includes('/') || /^https?:/i.test(input)) {
      const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (!['leetcode.com', 'www.leetcode.com'].includes(url.hostname.toLowerCase())) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      username = parts[0] === 'u' ? (parts.length === 2 ? parts[1] : '') : (parts.length === 1 ? parts[0] : '');
    }
  } catch { return null; }
  return username.length <= 40 && /^[a-zA-Z0-9_-]+$/.test(username) ? username : null;
}

app.get('/api/questions', (_req, res) => res.json(questions));
app.post('/api/auth/signup', authRateLimit, async (req, res, next) => { try {
  const { name, email, password } = req.body || {};
  const rawLeetcodeUsername = typeof req.body?.leetcodeUsername === 'string' ? req.body.leetcodeUsername : '';
  const leetcodeUsername = rawLeetcodeUsername.trim() ? parseLeetcodeUsername(rawLeetcodeUsername) : '';
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: 'Enter a name (up to 60 characters), a valid email, and a password between 8 and 128 characters.' });
  }
  if (leetcodeUsername === null) {
    return res.status(400).json({ message: 'Enter a valid LeetCode username or leetcode.com profile link.' });
  }
  if (await User.exists({ email: email.trim().toLowerCase() })) return res.status(409).json({ message: 'An account already exists for this email.' });
  const verifyToken = createActionToken();
  const user = await User.create({ name: name.trim(), email: email.trim(), leetcodeUsername, passwordHash: await bcrypt.hash(password, 12), emailVerified: false, emailVerifyTokenHash: tokenHash(verifyToken), emailVerifyExpiresAt: new Date(Date.now() + 24 * 60 * 60_000) });
  const verifyUrl = `${getAppUrl()}/?verify=${encodeURIComponent(verifyToken)}`;
  try { await sendAccountEmail({ to: user.email, subject: 'Verify your Prepflow email', text: `Verify your email to activate Prepflow: ${verifyUrl}`, html: `<p>Verify your email to activate Prepflow.</p><p><a href="${verifyUrl}">Verify email</a></p>` }); }
  catch (error) { console.error(JSON.stringify({ event: 'email_delivery_failed', requestId: req.requestId, error: error.message })); }
  res.status(201).json({ message: 'Account created. Verify your email to sign in.' });
} catch (error) { next(error); } });
app.post('/api/auth/verify-email', authRateLimit, async (req, res, next) => { try {
  const raw = req.body?.token;
  if (typeof raw !== 'string' || raw.length < 30 || raw.length > 200) return res.status(400).json({ message: 'That verification link is invalid or expired. Request a new one.' });
  const user = await User.findOneAndUpdate({ emailVerifyTokenHash: tokenHash(raw), emailVerifyExpiresAt: { $gt: new Date() } }, { $set: { emailVerified: true, emailVerifyTokenHash: '', emailVerifyExpiresAt: null } }, { new: true });
  if (!user) return res.status(400).json({ message: 'That verification link is invalid or expired. Request a new one.' });
  setSessionCookie(res, token(user));
  res.json({ user: profile(user) });
} catch (error) { next(error); } });
app.post('/api/auth/verify-email/resend', emailRateLimit, async (req, res, next) => { try {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const user = await User.findOne({ email, emailVerified: false });
    if (user) {
      const raw = createActionToken(); user.emailVerifyTokenHash = tokenHash(raw); user.emailVerifyExpiresAt = new Date(Date.now() + 24 * 60 * 60_000); await user.save();
      const url = `${getAppUrl()}/?verify=${encodeURIComponent(raw)}`;
      try { await sendAccountEmail({ to: user.email, subject: 'Verify your Prepflow email', text: `Verify your email to activate Prepflow: ${url}`, html: `<p><a href="${url}">Verify your email</a></p>` }); }
      catch (error) { console.error(JSON.stringify({ event: 'email_delivery_failed', requestId: req.requestId, error: error.message })); }
    }
  }
  res.json({ message: 'If the account needs verification, a new email has been sent.' });
} catch (error) { next(error); } });
app.post('/api/auth/password-reset', emailRateLimit, async (req, res, next) => { try {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const user = await User.findOne({ email, emailVerified: true });
    if (user) {
      const raw = createActionToken(); user.passwordResetTokenHash = tokenHash(raw); user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60_000); await user.save();
      const url = `${getAppUrl()}/?reset=${encodeURIComponent(raw)}`;
      try { await sendAccountEmail({ to: user.email, subject: 'Reset your Prepflow password', text: `Reset your password within one hour: ${url}`, html: `<p>Reset your password within one hour.</p><p><a href="${url}">Reset password</a></p>` }); }
      catch (error) { console.error(JSON.stringify({ event: 'email_delivery_failed', requestId: req.requestId, error: error.message })); }
    }
  }
  res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
} catch (error) { next(error); } });
app.post('/api/auth/password-reset/confirm', authRateLimit, async (req, res, next) => { try {
  const raw = req.body?.token; const password = req.body?.password;
  if (typeof raw !== 'string' || raw.length < 30 || raw.length > 200 || typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ message: 'Use a valid reset link and a password between 8 and 128 characters.' });
  const resetFilter = { passwordResetTokenHash: tokenHash(raw), passwordResetExpiresAt: { $gt: new Date() }, emailVerified: true };
  if (!(await User.exists(resetFilter))) return res.status(400).json({ message: 'That reset link is invalid or expired. Request another one.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.findOneAndUpdate(resetFilter, { $set: { passwordHash, passwordResetTokenHash: '', passwordResetExpiresAt: null }, $inc: { tokenVersion: 1 } }, { new: true });
  if (!user) return res.status(400).json({ message: 'That reset link is invalid or expired. Request another one.' });
  res.json({ message: 'Password updated. You can now sign in.' });
} catch (error) { next(error); } });
app.post('/api/auth/login', authRateLimit, async (req, res, next) => { try {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ message: 'Enter your email and password.' });
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
  if (!user.emailVerified) return res.status(403).json({ message: 'Verify your email before signing in. You can resend the verification email.' });
  setSessionCookie(res, token(user));
  res.json({ user: profile(user) });
} catch (error) { next(error); } });
app.get('/api/auth/me', requireAuth, (req, res) => { if (req.legacyBearer) setSessionCookie(res, token(req.user)); res.json({ user: profile(req.user) }); });
app.post('/api/auth/logout', requireAuth, async (req, res, next) => { try { req.user.tokenVersion++; await req.user.save(); clearSessionCookie(res); res.status(204).end(); } catch (error) { next(error); } });
app.get('/api/leetcode/streak', requireAuth, leetcodeRateLimit, async (req, res) => {
  const username = req.user.leetcodeUsername || '';
  if (!username) return res.json({ username: '', streak: null });
  const cached = req.user.leetcodeSnapshot;
  const syncedAt = req.user.leetcodeSyncedAt;
  if (req.query.refresh !== '1' && cached && syncedAt && Date.now() - syncedAt.getTime() < 5 * 60_000) return res.json({ ...cached, cached: true, syncedAt: syncedAt.toISOString() });
  try {
    const query = `query userProfileCalendar($username: String!, $year: Int, $limit: Int!) {
      matchedUser(username: $username) {
        username
        profile { realName userAvatar ranking }
        submitStats: submitStatsGlobal { acSubmissionNum { difficulty count submissions } }
        userCalendar(year: $year) { streak totalActiveDays }
      }
      recentAcSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp }
    }`;
    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
        Origin: 'https://leetcode.com',
        Referer: 'https://leetcode.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty'
      },
      body: JSON.stringify({ query, variables: { username, year: new Date().getFullYear(), limit: 20 }, operationName: 'userProfileCalendar' }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      if (cached) return res.json({ ...cached, stale: true, syncedAt: syncedAt?.toISOString() || null });
      return res.status(502).json({ message: 'LeetCode is temporarily unavailable. Try again shortly.' });
    }
    const body = await response.json();
    const matchedUser = body?.data?.matchedUser;
    if (!matchedUser) return res.status(404).json({ message: 'That LeetCode profile was not found or is private.' });
    if (body?.errors?.length && !matchedUser.submitStats) return res.status(502).json({ message: 'Could not read this LeetCode profile right now.' });
    const submissions = matchedUser.submitStats?.acSubmissionNum || [];
    const countFor = difficulty => Number(submissions.find(item => item.difficulty === difficulty)?.count) || 0;
    const easy = countFor('Easy'); const medium = countFor('Medium'); const hard = countFor('Hard');
    const calendar = matchedUser.userCalendar || {};
    const snapshot = {
      username: matchedUser.username || username,
      displayName: matchedUser.profile?.realName || matchedUser.username || username,
      avatarUrl: matchedUser.profile?.userAvatar || '',
      ranking: Number(matchedUser.profile?.ranking) || null,
      solved: { total: countFor('All') || easy + medium + hard, easy, medium, hard },
      recentAccepted: Array.isArray(body?.data?.recentAcSubmissionList) ? body.data.recentAcSubmissionList.map(item => ({ title: item.title, titleSlug: item.titleSlug, timestamp: Number(item.timestamp) || null })) : null,
      streak: Number(calendar.streak) || 0,
      totalActiveDays: Number(calendar.totalActiveDays) || 0
    };
    req.user.leetcodeSnapshot = snapshot; req.user.leetcodeSyncedAt = new Date();
    await req.user.save();
    res.json({ ...snapshot, cached: false, stale: false, syncedAt: req.user.leetcodeSyncedAt.toISOString() });
  } catch (error) {
    console.error('LeetCode streak lookup failed:', error.message);
    if (cached) return res.json({ ...cached, stale: true, syncedAt: syncedAt?.toISOString() || null });
    res.status(502).json({ message: 'Could not reach LeetCode. Check your connection and try again.' });
  }
});
app.put('/api/leetcode/streak', requireAuth, async (req, res, next) => { try {
  const username = parseLeetcodeUsername(req.body?.username);
  if (username === null) return res.status(400).json({ message: 'Enter a valid LeetCode username or leetcode.com profile link.' });
  req.user.leetcodeUsername = username;
  req.user.leetcodeSnapshot = null; req.user.leetcodeSyncedAt = null;
  await req.user.save();
  res.json({ username: req.user.leetcodeUsername });
} catch (error) { next(error); } });
app.get('/api/progress', requireAuth, async (req, res, next) => { try {
  const progress = await Progress.findOne({ user: req.user.id });
  res.json({ solved: progress?.solved || [], notes: Object.fromEntries(progress?.notes || []), reviewDue: Object.fromEntries(progress?.reviewDue || []) });
} catch (error) { next(error); } });
app.put('/api/progress', requireAuth, async (req, res, next) => { try {
  const { solved: submittedSolved, notes: submittedNotes, reviewDue: submittedReviewDue = {} } = req.body || {};
  if (!Array.isArray(submittedSolved) || !submittedNotes || typeof submittedNotes !== 'object' || Array.isArray(submittedNotes)) {
    return res.status(400).json({ message: 'Progress must include a solved list and notes object.' });
  }
  const validIndex = value => Number.isInteger(value) && value >= 0 && value < questions.length;
  if (submittedSolved.some(index => !validIndex(index))) return res.status(400).json({ message: 'Progress includes an unknown question.' });
  const noteEntries = Object.entries(submittedNotes);
  if (noteEntries.some(([key, value]) => !validIndex(Number(key)) || typeof value !== 'string' || value.length > 5000)) {
    return res.status(400).json({ message: 'Each note must belong to a known question and be 5,000 characters or fewer.' });
  }
  if (!submittedReviewDue || typeof submittedReviewDue !== 'object' || Array.isArray(submittedReviewDue)) return res.status(400).json({ message: 'Review dates must be an object.' });
  const reviewEntries = Object.entries(submittedReviewDue);
  if (reviewEntries.some(([key, value]) => !validIndex(Number(key)) || typeof value !== 'string' || Number.isNaN(Date.parse(value)))) return res.status(400).json({ message: 'Each review date must belong to a known question and contain a valid date.' });
  const solved = [...new Set(submittedSolved)];
  const notes = Object.fromEntries(noteEntries);
  const reviewDue = Object.fromEntries(reviewEntries);
  const progress = await Progress.findOneAndUpdate({ user: req.user.id }, { solved, notes, reviewDue }, { new: true, upsert: true, setDefaultsOnInsert: true });
  res.json({ solved: progress.solved, notes: Object.fromEntries(progress.notes), reviewDue: Object.fromEntries(progress.reviewDue) });
} catch (error) { next(error); } });

app.get('/api/account/export', requireAuth, async (req, res, next) => { try {
  const progress = await Progress.findOne({ user: req.user.id });
  res.setHeader('Content-Disposition', 'attachment; filename="prepflow-export.json"');
  res.json({ exportedAt: new Date().toISOString(), account: profile(req.user), leetcodeUsername: req.user.leetcodeUsername || '', leetcode: req.user.leetcodeSnapshot || null, leetcodeSyncedAt: req.user.leetcodeSyncedAt || null, progress: { solved: progress?.solved || [], notes: Object.fromEntries(progress?.notes || []), reviewDue: Object.fromEntries(progress?.reviewDue || []) } });
} catch (error) { next(error); } });
app.put('/api/account', requireAuth, async (req, res, next) => { try {
  const name = req.body?.name;
  const dailyGoal = req.body?.dailyGoal;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || !Number.isInteger(dailyGoal) || dailyGoal < 1 || dailyGoal > 20) return res.status(400).json({ message: 'Enter a name up to 60 characters and a daily goal from 1 to 20.' });
  req.user.name = name.trim(); req.user.dailyGoal = dailyGoal; await req.user.save();
  res.json({ user: profile(req.user) });
} catch (error) { next(error); } });
app.delete('/api/account', requireAuth, async (req, res, next) => { try {
  const account = await User.findById(req.user.id).select('passwordHash');
  if (typeof req.body?.password !== 'string' || !account || !(await bcrypt.compare(req.body.password, account.passwordHash))) return res.status(401).json({ message: 'Enter your password to delete this account.' });
  await Progress.deleteOne({ user: req.user.id });
  await User.deleteOne({ _id: req.user.id });
  clearSessionCookie(res); res.status(204).end();
} catch (error) { next(error); } });

app.use('/api', (_req, res) => res.status(404).json({ message: 'API route not found.' }));

const clientDist = join(root, 'client', 'dist');
if (!process.env.VERCEL && existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

app.use((error, _req, res, _next) => {
  if (error?.code === 11000) return res.status(409).json({ message: 'An account already exists for this email.' });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Request body contains invalid JSON.' });
  if (error?.type === 'entity.too.large') return res.status(413).json({ message: 'Request is too large.' });
  console.error(JSON.stringify({ event: 'request_failed', requestId: _req.requestId, method: _req.method, path: _req.path, error: error.message }));
  reportApplicationError({ event: 'request_failed', requestId: _req.requestId, method: _req.method, path: _req.path, error: error.message, occurredAt: new Date().toISOString() });
  res.status(500).json({ message: 'Something went wrong. Please try again.', requestId: _req.requestId });
});

export default app;
