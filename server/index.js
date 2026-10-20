import app from './app.js';
import { connectDatabase } from './db.js';

const port = process.env.PORT || 5000;
connectDatabase()
  .then(() => {
    const server = app.listen(port, () => console.log(JSON.stringify({ event: 'server_started', port })));
    const shutdown = signal => {
      console.info(JSON.stringify({ event: 'server_stopping', signal }));
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch(error => { console.error(error); process.exit(1); });
