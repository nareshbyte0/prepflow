import app from '../server/app.js';
import { connectDatabase } from '../server/db.js';

export default async function handler(req, res) {
  try {
    await connectDatabase();
    app(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ message: 'Something went wrong.' });
    else res.end();
  }
}
