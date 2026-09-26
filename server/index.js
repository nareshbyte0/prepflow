import app from './app.js';
import { connectDatabase } from './db.js';

const port = process.env.PORT || 5000;
connectDatabase()
  .then(() => app.listen(port, () => console.log(`Prepflow running on http://localhost:${port}`)))
  .catch(error => { console.error(error); process.exit(1); });
