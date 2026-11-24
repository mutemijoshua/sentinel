'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import * as store from '@/lib/store';
import { requireAuth, setSession, clearSession, safeEqual, clientIp } from '@/lib/auth';
import { runChecks, TYPES } from '@/lib/checker';
import { sendMail, mailConfigured, recipients } from '@/lib/mailer';

/* ------------------------------------------------------------------ auth */

export async function login(prev, formData) {
  const ip = await clientIp();
  const tries = await store.incr(`rate:login:${ip}`, 900);
  if (tries > 8) return { error: 'Too many attempts. Wait 15 minutes and try again.' };
  const pass = String(formData.get('password') || '');
  const real = process.env.DASHBOARD_PASSWORD || '';
  if (!real) return { error: 'DASHBOARD_PASSWORD is not set in the environment variables.' };
  if (!safeEqual(pass, real)) {
    await new Promise((r) => setTimeout(r, 800));
    return { error: 'Wrong password.' };
  }
  await store.del(`rate:login:${ip}`);
  await setSession();
  redirect('/');
}

export async function logout() {
  await clearSession();
  redirect('/login');
}

/* ----------------------------------------------------------------- sites */

function cleanUrl(raw) {
  let u = String(raw || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function saveSite(prev, formData) {
  await requireAuth();
  const id = String(formData.get('id') || '');
  const url = cleanUrl(formData.get('url'));
  if (!url) return { error: 'Enter a valid website address, e.g. https://example.co.ke' };
  const type = Object.keys(TYPES).includes(String(formData.get('type'))) ? String(formData.get('type')) : 'http';
  const site = {
    name: String(formData.get('name') || '').trim().slice(0, 80) || new URL(url).hostname.replace(/^www\./, ''),
    url,
    type,
    stack: String(formData.get('stack') || '').trim().slice(0, 40),
    client: String(formData.get('client') || '').trim().slice(0, 80),
    keyword: String(formData.get('keyword') || '').trim().slice(0, 120),
    healthPath: String(formData.get('healthPath') || '').trim().slice(0, 200) || '/api/health',
    interval: [5, 10, 15, 30, 60].includes(Number(formData.get('interval'))) ? Number(formData.get('interval')) : 5,
    notes: String(formData.get('notes') || '').trim().slice(0, 1000),
    // Public portfolio: off unless ticked. Only name, address, stack and this blurb are ever shown.
    showcase: formData.get('showcase') === 'on',
    blurb: String(formData.get('blurb') || '').trim().slice(0, 240),
  };
  if (type === 'keyword' && !site.keyword) return { error: 'Enter the text that must appear on the page.' };

  const sites = await store.getSites();
  let savedId = id;
  if (id) {
    const i = sites.findIndex((s) => s.id === id);
    if (i < 0) return { error: 'Site not found.' };
    sites[i] = { ...sites[i], ...site };
  } else {
    if (sites.some((s) => s.url === url)) return { error: 'That website is already in the list.' };
    savedId = crypto.randomUUID().slice(0, 8);
    sites.push({ id: savedId, ...site, paused: false, created: Date.now() });
  }
  await store.saveSites(sites);
  await runChecks({ onlyId: savedId }); // show its status straight away
  revalidatePath('/');
  redirect(`/sites/${savedId}?saved=1`);
}

export async function deleteSite(formData) {
  await requireAuth();
  const id = String(formData.get('id'));
  const sites = (await store.getSites()).filter((s) => s.id !== id);
  await store.saveSites(sites);
  revalidatePath('/');
  redirect('/?deleted=1');
}

export async function togglePause(formData) {
  await requireAuth();
  const id = String(formData.get('id'));
  const sites = await store.getSites();
  const s = sites.find((x) => x.id === id);
  if (s) s.paused = !s.paused;
  await store.saveSites(sites);
  revalidatePath(`/sites/${id}`);
  revalidatePath('/');
}

export async function checkOne(formData) {
  await requireAuth();
  const id = String(formData.get('id'));
  await runChecks({ onlyId: id });
  revalidatePath(`/sites/${id}`);
  revalidatePath('/');
}

export async function checkAll() {
  await requireAuth();
  await runChecks({ force: true });
  revalidatePath('/');
}

/* ---------------------------------------------------------------- other */

export async function testEmail() {
  await requireAuth();
  const r = await sendMail({
    urgent: true,
    subject: '🔴 URGENT (TEST): Sentinel Hub alert test',
    text: 'This is a test of your downtime alerts.\n\nIf it reached your inbox (not Spam), alerts are working. Set up the Gmail filter from the Help page so these always notify your phone.',
  });
  await store.addEvent({ severity: 'info', title: 'Test alert sent', detail: r.ok ? `To ${recipients().join(', ')}` : `FAILED: ${r.error}`, site: 'Sentinel Hub' });
  revalidatePath('/events');
  const msg = !mailConfigured() ? 'nomail' : r.ok ? 'sent' : 'failed';
  redirect(`/help?mail=${msg}`);
}

export async function clearEvents() {
  await requireAuth();
  await store.del('events');
  revalidatePath('/events');
}
