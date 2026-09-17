import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dns from 'node:dns';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import User from './models/User.js';
import Progress from './models/Progress.js';
import { requireAuth } from './middleware/auth.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });
const dnsServers = process.env.DNS_SERVERS?.split(',').map(server => server.trim()).filter(Boolean);
if (dnsServers?.length) {
  dns.setServers(dnsServers);
  console.log(`Using configured DNS resolvers: ${dnsServers.join(', ')}`);
}
const mongoUri = process.env.MONGODB_URI || process.env.mongodb;
if (!mongoUri || !process.env.JWT_SECRET) throw new Error('MONGODB_URI (or legacy mongodb) and JWT_SECRET are required in .env');
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
const questions = JSON.parse(await readFile(join(root, 'questions.json'), 'utf8'));
const token = user => jwt.sign({ sub: user.id, ver: user.tokenVersion }, process.env.JWT_SECRET, { expiresIn: '7d' });
const profile = user => ({ id: user.id, name: user.name, email: user.email });

app.get('/api/questions', (_req, res) => res.json(questions));
app.post('/api/auth/signup', async (req, res, next) => { try {
  const { name = '', email = '', password = '' } = req.body;
  if (!name.trim() || !email.trim() || password.length < 8) return res.status(400).json({ message: 'Name, email, and an 8-character password are required.' });
  if (await User.exists({ email: email.trim().toLowerCase() })) return res.status(409).json({ message: 'An account already exists for this email.' });
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json({ token: token(user), user: profile(user) });
} catch (error) { next(error); } });
app.post('/api/auth/login', async (req, res, next) => { try {
  const user = await User.findOne({ email: String(req.body.email || '').trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
  res.json({ token: token(user), user: profile(user) });
} catch (error) { next(error); } });
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: profile(req.user) }));
app.post('/api/auth/logout', requireAuth, async (req, res, next) => { try { req.user.tokenVersion++; await req.user.save(); res.status(204).end(); } catch (error) { next(error); } });
app.get('/api/progress', requireAuth, async (req, res, next) => { try {
  const progress = await Progress.findOne({ user: req.user.id });
  res.json({ solved: progress?.solved || [], notes: Object.fromEntries(progress?.notes || []) });
} catch (error) { next(error); } });
app.put('/api/progress', requireAuth, async (req, res, next) => { try {
  const solved = [...new Set((req.body.solved || []).filter(Number.isInteger))];
  const notes = Object.fromEntries(Object.entries(req.body.notes || {}).filter(([key, value]) => Number.isInteger(Number(key)) && typeof value === 'string' && value.length <= 5000));
  const progress = await Progress.findOneAndUpdate({ user: req.user.id }, { solved, notes }, { new: true, upsert: true, setDefaultsOnInsert: true });
  res.json({ solved: progress.solved, notes: Object.fromEntries(progress.notes) });
} catch (error) { next(error); } });
const clientDist = join(root, 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ message: 'Something went wrong.' }); });
mongoose.connect(mongoUri).then(() => app.listen(process.env.PORT || 5000, () => console.log(`Prepflow running on http://localhost:${process.env.PORT || 5000}`)));
