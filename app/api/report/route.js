import crypto from 'node:crypto';
import * as store from '@/lib/store';
import { safeEqual } from '@/lib/auth';
import { hostOf } from '@/lib/checker';
import { sendMail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

// Sentinel Guard (WordPress) pushes security events here, signed with the shared Monitor key:
//   X-SG-Time: unix seconds,  X-SG-Signature: hex HMAC-SHA256 of "<time>.<raw body>"
export async function POST(request) {
  const key = process.env.SG_MONITOR_KEY;
  if (!key) return Response.json({ error: 'SG_MONITOR_KEY not configured' }, { status: 503 });

  const raw = await request.text();
  if (raw.length > 20000) return Response.json({ error: 'too large' }, { status: 413 });

  const t = request.headers.get('x-sg-time') || '';
  const sig = request.headers.get('x-sg-signature') || '';
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return Response.json({ error: 'stale' }, { status: 401 });
  const expected = crypto.createHmac('sha256', key).update(`${t}.${raw}`).digest('hex');
  if (!safeEqual(sig, expected)) return Response.json({ error: 'bad signature' }, { status: 401 });

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  const host = hostOf(String(data.site || ''));
  if ((await store.incr(`rate:report:${host}`, 3600)) > 60) return Response.json({ error: 'rate limited' }, { status: 429 });

  const sites = await store.getSites();
  const site = sites.find((s) => hostOf(s.url) === host);
  const severity = ['urgent', 'warning', 'info'].includes(data.severity) ? data.severity : 'info';
  const title = String(data.title || 'Sentinel Guard event').slice(0, 200);
  const detail = String(data.message || '').slice(0, 6000);

  await store.addEvent({
    siteId: site ? site.id : null,
    site: site ? site.name : host,
    severity,
    title,
    detail,
    source: 'sentinel-guard',
  });

  let emailed = false;
  if (severity !== 'info' || data.event === 'test') {
    const r = await sendMail({
      urgent: severity === 'urgent',
      subject: title,
      text: `${detail}\n\nSite: ${data.site}${site ? '' : '\n(This site is not in your dashboard list yet — add it to monitor uptime too.)'}`,
    });
    emailed = r.ok;
  }
  return Response.json({ ok: true, known: Boolean(site), emailed });
}
