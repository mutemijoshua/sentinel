// Storage: Upstash Redis on Vercel, a local JSON file during development.
// Everything is kept in a handful of keys so a check run costs ~5 Redis commands
// no matter how many sites you have (keeps you inside Upstash's free tier).
import fs from 'node:fs';
import path from 'node:path';
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeMode = url && token ? 'redis' : process.env.VERCEL ? 'missing' : 'file';

let redis = null;
if (storeMode === 'redis') redis = new Redis({ url, token });

/* ---------- local file backend (development only) ---------- */
const FILE = path.join(process.cwd(), '.data', 'store.json');
function readFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}
function writeFile(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db));
}
function fileGet(key) {
  const db = readFile();
  const e = db[key];
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) return null;
  return e.v;
}
function fileSet(key, v, ex) {
  const db = readFile();
  db[key] = { v, exp: ex ? Date.now() + ex * 1000 : 0 };
  writeFile(db);
}

function assertReady() {
  if (storeMode === 'missing') {
    throw new Error('No database connected. In Vercel: Storage → Create/Connect → Upstash for Redis, then redeploy.');
  }
}

export async function get(key) {
  assertReady();
  if (redis) return (await redis.get(key)) ?? null;
  return fileGet(key);
}

export async function set(key, value, ex) {
  assertReady();
  if (redis) return ex ? redis.set(key, value, { ex }) : redis.set(key, value);
  fileSet(key, value, ex);
}

export async function del(key) {
  assertReady();
  if (redis) return redis.del(key);
  const db = readFile();
  delete db[key];
  writeFile(db);
}

/** Set only if the key does not exist (used as a lock). Returns true if acquired. */
export async function setNX(key, value, ex) {
  assertReady();
  if (redis) return (await redis.set(key, value, { nx: true, ex })) === 'OK';
  if (fileGet(key) !== null) return false;
  fileSet(key, value, ex);
  return true;
}

/** Increment a counter that expires after `ex` seconds (rate limits). */
export async function incr(key, ex) {
  assertReady();
  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, ex);
    return n;
  }
  const n = (fileGet(key) || 0) + 1;
  const db = readFile();
  const exp = db[key] && db[key].exp && db[key].exp > Date.now() ? db[key].exp : Date.now() + ex * 1000;
  db[key] = { v: n, exp };
  writeFile(db);
  return n;
}

/** Push to the front of a capped list. */
export async function push(key, value, max = 500) {
  assertReady();
  if (redis) {
    await redis.lpush(key, value);
    await redis.ltrim(key, 0, max - 1);
    return;
  }
  const list = fileGet(key) || [];
  list.unshift(value);
  fileSet(key, list.slice(0, max));
}

export async function list(key, count = 100) {
  assertReady();
  if (redis) return (await redis.lrange(key, 0, count - 1)) || [];
  return (fileGet(key) || []).slice(0, count);
}

/* ---------- typed helpers ---------- */
export async function getSites() {
  return (await get('sites')) || [];
}
export async function saveSites(sites) {
  await set('sites', sites);
}
export async function getState() {
  return (await get('state')) || {};
}
export async function saveState(state) {
  await set('state', state);
}
export async function getHist() {
  return (await get('hist')) || {};
}
export async function saveHist(hist) {
  await set('hist', hist);
}
export async function addEvent(ev) {
  await push('events', { t: Date.now(), ...ev }, 1000);
}
export async function getEvents(count = 200) {
  return list('events', count);
}
