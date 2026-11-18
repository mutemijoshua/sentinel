import * as store from '@/lib/store';
import { cronAuthorized } from '@/lib/auth';
import { uptime, hostOf } from '@/lib/checker';
import { sendMail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

// Daily summary email. Vercel's built-in cron (vercel.json) calls this once a day — allowed on the free plan.
export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const [sites, state, hist, lastRun] = await Promise.all([store.getSites(), store.getState(), store.getHist(), store.get('lastRun')]);
  const down = sites.filter((s) => state[s.id]?.up === false);
  const lines = [];

  lines.push(`${sites.length} site(s) monitored · ${down.length} down right now.`);
  if (!lastRun || Date.now() - lastRun > 30 * 60e3) {
    lines.push('\n⚠️ Checks have not run in the last 30 minutes — check your cron-job.org job.');
  }
  if (down.length) {
    lines.push('\nDOWN NOW:');
    for (const s of down) lines.push(`- ${s.name} (${s.url}) — ${state[s.id].msg}`);
  }

  const ssl = sites.filter((s) => state[s.id]?.sslDays != null && state[s.id].sslDays <= 30);
  if (ssl.length) {
    lines.push('\nSSL CERTIFICATES EXPIRING (30 days):');
    for (const s of ssl) lines.push(`- ${s.name}: ${state[s.id].sslDays} day(s)`);
  }

  const wp = sites.filter((s) => s.type === 'wordpress');
  const wpIssues = [];
  for (const s of wp) {
    const st = state[s.id] || {};
    const g = st.sg;
    const notes = [];
    if (st.sgStatus === 'missing') notes.push('Sentinel Guard NOT responding');
    if (g?.last_scan?.open) notes.push(`${g.last_scan.open} scan finding(s) to review`);
    if (g?.updates) {
      const u = g.updates;
      if (u.core) notes.push('WordPress update available');
      if (u.plugins) notes.push(`${u.plugins} plugin update(s)`);
      if (u.themes) notes.push(`${u.themes} theme update(s)`);
    }
    if (notes.length) wpIssues.push(`- ${s.name}: ${notes.join(', ')}`);
  }
  if (wpIssues.length) {
    lines.push('\nWORDPRESS TO-DO:');
    lines.push(...wpIssues);
  }

  lines.push('\nUPTIME (last 24 h / 7 days):');
  for (const s of sites) {
    const h = hist[s.id];
    const d1 = uptime(h, 1);
    const d7 = uptime(h, 7);
    lines.push(`- ${s.name || hostOf(s.url)}: ${d1 == null ? '—' : d1.toFixed(2) + '%'} / ${d7 == null ? '—' : d7.toFixed(2) + '%'}`);
  }

  const subject = down.length ? `Daily report: ${down.length} site(s) DOWN` : `Daily report: all ${sites.length} sites up`;
  const r = await sendMail({ subject, text: lines.join('\n'), urgent: false });
  return Response.json({ ok: r.ok });
}
