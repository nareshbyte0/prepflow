import dns from 'node:dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env') });

const dnsServers = process.env.DNS_SERVERS?.split(',').map(server => server.trim()).filter(Boolean);
if (dnsServers?.length) {
  dns.setServers(dnsServers);
  console.log(`Using configured DNS resolvers: ${dnsServers.join(', ')}`);
}

const mongoUri = process.env.MONGODB_URI || process.env.mongodb;
let connectionPromise;

export function getMongoUri() {
  if (!mongoUri) throw new Error('MONGODB_URI (or legacy mongodb) is required');
  return mongoUri;
}

export function getJwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  return process.env.JWT_SECRET;
}

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.db.admin().ping();
      return mongoose.connection;
    } catch {
    }
  }
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
    } catch {
    }
  }
  if (!connectionPromise) {
    const maxPoolSize = Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE || '5', 10);
    const poolSize = Number.isFinite(maxPoolSize) && maxPoolSize > 0 ? maxPoolSize : 5;
    connectionPromise = mongoose.connect(getMongoUri(), { maxPoolSize: poolSize, serverSelectionTimeoutMS: 5000 })
      .then(connection => { connectionPromise = null; return connection; })
      .catch(error => { connectionPromise = null; throw error; });
  }
  return connectionPromise;
}
