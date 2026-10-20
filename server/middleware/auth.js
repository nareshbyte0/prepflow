import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(part => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter(([name]) => name));
  const cookieToken = cookies.prepflow_session;
  const bearerToken = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const token = cookieToken || bearerToken;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('name email tokenVersion leetcodeUsername emailVerified dailyGoal leetcodeSnapshot leetcodeSyncedAt');
    if (!user || user.tokenVersion !== payload.ver) throw new Error('Session expired');
    if (!user.emailVerified) return res.status(403).json({ message: 'Verify your email before continuing.' });
    req.user = user;
    req.legacyBearer = !cookieToken && Boolean(bearerToken);
    next();
  } catch {
    res.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}
