// Base de datos MongoDB (igual que en el resto de webs: MongoDB Atlas + Vercel).
// En producción se usa MONGODB_URI. En local, si no hay MONGODB_URI, se arranca
// un MongoDB de desarrollo que guarda los datos en la carpeta data/.
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_NAME = process.env.MONGODB_DB || 'elcatavinos';

const g = globalThis;
g.__catavinos = g.__catavinos || {};
const cache = g.__catavinos;

async function devUri() {
  if (process.env.VERCEL) throw new Error('Falta la variable MONGODB_URI (conexión a MongoDB Atlas).');
  const devPackage = 'mongodb-memory-server'; // solo para desarrollo local
  const { MongoMemoryServer } = require(devPackage);
  const dbPath = path.join(DATA_DIR, 'mongo');
  fs.mkdirSync(dbPath, { recursive: true });
  cache.devServer = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger' } });
  return cache.devServer.getUri();
}

async function connect() {
  const uri = process.env.MONGODB_URI || (await devUri());
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();
  const db = client.db(DB_NAME);
  await ensureIndexes(db);
  return db;
}

function getDb() {
  if (!cache.dbPromise) {
    cache.dbPromise = connect().catch((err) => { cache.dbPromise = null; throw err; });
  }
  return cache.dbPromise;
}

const col = async (name) => (await getDb()).collection(name);

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('products').createIndexes([{ key: { id: 1 }, unique: true }, { key: { slug: 1 }, unique: true }, { key: { category_id: 1 } }]),
    db.collection('categories').createIndexes([{ key: { id: 1 }, unique: true }, { key: { slug: 1 }, unique: true }]),
    db.collection('tastings').createIndexes([{ key: { id: 1 }, unique: true }]),
    db.collection('posts').createIndexes([{ key: { id: 1 }, unique: true }, { key: { slug: 1 }, unique: true }]),
    db.collection('orders').createIndexes([{ key: { id: 1 }, unique: true }, { key: { number: 1 }, unique: true }, { key: { status: 1 } }]),
    db.collection('bookings').createIndexes([{ key: { id: 1 }, unique: true }]),
    db.collection('messages').createIndexes([{ key: { id: 1 }, unique: true }]),
    db.collection('admins').createIndexes([{ key: { id: 1 }, unique: true }, { key: { email: 1 }, unique: true }]),
    db.collection('sessions').createIndexes([{ key: { token: 1 }, unique: true }, { key: { expires: 1 }, expireAfterSeconds: 0 }]),
  ]);
}

// Identificadores numéricos (mantienen URLs cortas como /admin/productos/12).
async function nextId(name) {
  const r = await (await col('counters')).findOneAndUpdate(
    { _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' },
  );
  return r.seq;
}

// Fecha en formato "YYYY-MM-DD HH:MM:SS" (UTC), ordenable como texto.
const now = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ');

// Quita el _id interno de Mongo de los resultados.
const clean = (doc) => { if (doc) delete doc._id; return doc; };
const find = async (name, q = {}, opts = {}) => (await (await col(name)).find(q, { ...opts, projection: { _id: 0, ...(opts.projection || {}) } }).toArray());
const findOne = async (name, q, opts = {}) => clean(await (await col(name)).findOne(q, opts));

// ---- Ajustes ----------------------------------------------------------------

const DEFAULT_SETTINGS = require('./default-settings');

async function getSettings() {
  if (cache.settings && Date.now() - cache.settingsAt < 5000) return cache.settings;
  const rows = await find('settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  cache.settings = out;
  cache.settingsAt = Date.now();
  return out;
}

async function setSetting(key, value) {
  await (await col('settings')).updateOne({ key }, { $set: { key, value } }, { upsert: true });
  cache.settings = null;
}

module.exports = { getDb, col, nextId, now, find, findOne, getSettings, setSetting, DATA_DIR };
