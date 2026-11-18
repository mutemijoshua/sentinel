import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE = 'hub_session';
const DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD;
  if (!s) throw new Error('Set DASHBOARD_PASSWORD (and SESSION_SECRET) in your environment variables.');
  return s;
}

export function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function makeSession() {
  const exp = Date.now() + DAYS * 864e5;
  return `${exp}.${sign(String(exp))}`;
}

export function validSession(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const [exp, sig] = raw.split('.');
  return Number(exp) > Date.now() && safeEqual(sig || '', sign(exp));
}

export async function isLoggedIn() {
  const jar = await cookies();
  return validSession(jar.get(COOKIE)?.value);
}

/** Use at the top of every protected page / server action. */
export async function requireAuth() {
  if (!(await isLoggedIn())) redirect('/login');
}

export async function setSession() {
  const jar = await cookies();
  const h = await headers();
  const https = (h.get('x-forwarded-proto') || '').startsWith('https') || Boolean(process.env.VERCEL);
  jar.set(COOKIE, makeSession(), {
    httpOnly: true,
    secure: https,
    sameSite: 'lax',
    path: '/',
    maxAge: DAYS * 86400,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function clientIp() {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

/** Cron requests: Vercel cron sends "Authorization: Bearer CRON_SECRET"; cron-job.org can use ?key= */
export function cronAuthorized(request) {
  const s = process.env.CRON_SECRET;
  if (!s) return false;
  const auth = request.headers.get('authorization') || '';
  const key = new URL(request.url).searchParams.get('key') || '';
  return safeEqual(auth, `Bearer ${s}`) || safeEqual(key, s);
}
