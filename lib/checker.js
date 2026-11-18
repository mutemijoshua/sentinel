import tls from 'node:tls';
import * as store from './store';
import { sendMail } from './mailer';

const UA = 'SentinelHub-Monitor/1.0 (+uptime check)';
const HIST_MAX = 288; // 24 h of 5-minute checks
const DAYS_KEPT = 30;

export const TYPES = {
  wordpress: 'WordPress + Sentinel Guard',
  http: 'Website responds (any stack)',
  keyword: 'Page contains text',
  health: 'Health-check endpoint (JSON)',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} days`;
}

function errText(e) {
  const code = e?.cause?.code || e?.code || '';
  const map = {
    ENOTFOUND: 'domain does not resolve (DNS problem or domain expired)',
    ECONNREFUSED: 'server refused the connection',
    ECONNRESET: 'connection reset by the server',
    CERT_HAS_EXPIRED: 'SSL certificate has EXPIRED',
    ERR_TLS_CERT_ALTNAME_INVALID: 'SSL certificate does not match the domain',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'self-signed SSL certificate',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'incomplete SSL certificate chain',
    UND_ERR_CONNECT_TIMEOUT: 'connection timed out',
  };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'no response within 20 seconds';
  return map[code] || (code ? `${code}: ${e?.cause?.message || e.message}` : e?.cause?.message || e?.message || 'unknown error');
}

/** One request. Returns { up, msg, code, ms, sg } */
export async function probe(site) {
  const key = process.env.SG_MONITOR_KEY || '';
  let target = site.url;
  if (site.type === 'health') {
    target = new URL(site.healthPath || '/api/health', site.url).toString();
  } else if (site.type === 'wordpress' && key) {
    const u = new URL(site.url);
    u.searchParams.set('sg_ping', key);
    u.searchParams.set('sgt', String(Date.now()));
    target = u.toString();
  }

  const t0 = Date.now();
  let res;
  let body = '';
  try {
    res = await fetch(target, {
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'user-agent': UA, 'cache-control': 'no-cache', accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(20000),
    });
    body = (await res.text()).slice(0, 400000);
  } catch (e) {
    return { up: false, msg: `No response: ${errText(e)}`, code: 0, ms: Date.now() - t0, sg: null };
  }
  const ms = Date.now() - t0;
  const code = res.status;

  const hints = [
    ['Error establishing a database connection', 'database connection error'],
    ['There has been a critical error on this website', 'PHP fatal error (a plugin/theme crashed the site)'],
    ['Briefly unavailable for scheduled maintenance', 'stuck in maintenance mode (delete the .maintenance file)'],
    ['Application error: a client-side exception', 'Next.js application error'],
    ['Whoops, looks like something went wrong', 'Laravel application error'],
    ['Account Suspended', 'hosting account suspended'],
    ['This domain has expired', 'domain expired'],
  ];
  const hint = hints.find(([needle]) => body.includes(needle));

  if (code >= 500 || code === 404 || code === 410) {
    return { up: false, msg: `HTTP ${code}${hint ? ` — ${hint[1]}` : ''}`, code, ms, sg: null };
  }
  if (hint) return { up: false, msg: `HTTP ${code} — ${hint[1]}`, code, ms, sg: null };
  if (code >= 400 && code !== 401 && code !== 403 && code !== 429) {
    return { up: false, msg: `HTTP ${code}`, code, ms, sg: null };
  }

  if (site.type === 'keyword' && site.keyword) {
    if (!body.toLowerCase().includes(String(site.keyword).toLowerCase())) {
      return { up: false, msg: `HTTP ${code} but the text "${site.keyword}" is missing (blank, broken or defaced page?)`, code, ms, sg: null };
    }
  }

  if (site.type === 'health') {
    try {
      const j = JSON.parse(body);
      const s = String(j.status ?? j.state ?? 'ok').toLowerCase();
      if (!['ok', 'up', 'healthy', 'pass', 'true'].includes(s)) {
        return { up: false, msg: `Health check reports "${s}"${j.message ? `: ${j.message}` : ''}`, code, ms, sg: null };
      }
    } catch {
      if (code !== 200) return { up: false, msg: `HTTP ${code} — health endpoint did not return JSON`, code, ms, sg: null };
    }
  }

  let sg = null;
  if (site.type === 'wordpress' && key) {
    try {
      const j = JSON.parse(body);
      sg = j && j.sentinel_guard ? j : { sentinel_guard: false };
    } catch {
      sg = { sentinel_guard: false };
    }
  }
  return { up: true, msg: `HTTP ${code}`, code, ms, sg };
}

/** Days until the SSL certificate expires (null if not HTTPS / unreachable). */
export function sslDays(url) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return resolve(null);
    }
    if (u.protocol !== 'https:') return resolve(null);
    const socket = tls.connect(
      { host: u.hostname, port: Number(u.port) || 443, servername: u.hostname, rejectUnauthorized: false, timeout: 10000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) return resolve(null);
        resolve(Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 864e5));
      }
    );
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Check sites, update state + history, send alerts.
 * force: ignore each site's interval.  onlyId: check one site.
 */
export async function runChecks({ force = false, onlyId = null } = {}) {
  const got = await store.setNX('lock:check', Date.now(), 240);
  if (!got && !onlyId) return { skipped: 'another check is running' };

  try {
    const sites = await store.getSites();
    const state = await store.getState();
    const hist = await store.getHist();
    const now = Date.now();
    const reminderMs = Number(process.env.REMINDER_HOURS || 2) * 3600e3;
    const sslWarnDays = Number(process.env.SSL_WARN_DAYS || 14);
    const alerts = [];
    const events = [];

    const due = sites.filter((s) => {
      if (onlyId) return s.id === onlyId;
      if (s.paused) return false;
      const st = state[s.id];
      const every = Math.max(5, Number(s.interval) || 5) * 60e3;
      return force || !st || !st.lastCheck || now - st.lastCheck >= every - 45e3;
    });

    await pool(due, 8, async (site) => {
      const prev = state[site.id] || { up: null, since: now, lastAlert: 0, sgStatus: 'unknown', missing: [] };
      const s = { ...prev };
      const name = site.name || hostOf(site.url);

      let r = await probe(site);
      if (!r.up) {
        await sleep(6000); // confirm before raising the alarm
        r = await probe(site);
      }
      s.lastCheck = Date.now();
      s.ms = r.ms;
      s.code = r.code;
      s.msg = r.msg;

      // History
      const h = hist[site.id] || { r: [], d: {} };
      h.r.push(r.up ? r.ms : -1);
      if (h.r.length > HIST_MAX) h.r = h.r.slice(-HIST_MAX);
      const d = today();
      const day = h.d[d] || [0, 0];
      h.d[d] = [day[0] + (r.up ? 1 : 0), day[1] + 1];
      const keep = Object.keys(h.d).sort().slice(-DAYS_KEPT);
      h.d = Object.fromEntries(keep.map((k) => [k, h.d[k]]));
      hist[site.id] = h;

      // Up/down transitions
      if (!r.up) {
        if (prev.up !== false) {
          s.up = false;
          s.since = now;
          s.lastAlert = now;
          alerts.push({
            urgent: true,
            subject: `🔴 URGENT: ${name} is DOWN`,
            text: `${site.url} is not responding properly.\n\nProblem: ${r.msg}\nDetected: ${new Date().toUTCString()}\n\nYou will be reminded every ${reminderMs / 3600e3} hour(s) until it recovers.`,
          });
          events.push({ siteId: site.id, site: name, severity: 'urgent', title: 'Site down', detail: r.msg });
        } else if (now - (prev.lastAlert || 0) >= reminderMs) {
          s.lastAlert = now;
          alerts.push({ urgent: true, subject: `🔴 URGENT: ${name} is STILL DOWN (${dur(now - prev.since)})`, text: `${site.url} has been down since ${new Date(prev.since).toUTCString()}.\n\nLatest problem: ${r.msg}` });
        }
      } else {
        if (prev.up === false) {
          alerts.push({ urgent: false, subject: `✅ RECOVERED: ${name} is back up`, text: `${site.url} is responding again (${r.msg}, ${r.ms} ms).\nIt was down for about ${dur(now - prev.since)}.` });
          events.push({ siteId: site.id, site: name, severity: 'info', title: 'Site recovered', detail: `Down for ${dur(now - prev.since)}` });
          s.since = now;
        }
        if (prev.up === null) s.since = now;
        s.up = true;

        // Sentinel Guard heartbeat (WordPress)
        if (site.type === 'wordpress' && r.sg) {
          const ok = Boolean(r.sg.sentinel_guard);
          if (!ok && prev.sgStatus !== 'missing') {
            alerts.push({ urgent: true, subject: `🔴 URGENT: Sentinel Guard not responding on ${name}`, text: `${site.url} is up, but Sentinel Guard did not answer its private heartbeat.\n\nLikely causes: the plugin was deactivated or deleted (attackers often do this first), the site has a different Monitor key, or a cache plugin is caching the homepage with query strings.` });
            events.push({ siteId: site.id, site: name, severity: 'urgent', title: 'Sentinel Guard not responding', detail: 'Heartbeat failed' });
          } else if (ok && prev.sgStatus === 'missing') {
            events.push({ siteId: site.id, site: name, severity: 'info', title: 'Sentinel Guard responding again', detail: '' });
          }
          s.sgStatus = ok ? 'ok' : 'missing';
          s.sg = ok ? r.sg : null;
          const missing = ok && Array.isArray(r.sg.missing_plugins) ? r.sg.missing_plugins : [];
          if (missing.length && JSON.stringify(missing) !== JSON.stringify(prev.missing || [])) {
            alerts.push({ urgent: true, subject: `🔴 URGENT: plugin(s) switched off on ${name}`, text: `These plugins were active but are no longer running on ${site.url}:\n\n- ${missing.join('\n- ')}\n\nIf you did not do this, log in and check the site.` });
            events.push({ siteId: site.id, site: name, severity: 'urgent', title: 'Plugins switched off', detail: missing.join(', ') });
          }
          s.missing = missing;
        } else if (site.type === 'wordpress') {
          s.sgStatus = process.env.SG_MONITOR_KEY ? s.sgStatus : 'n/a';
        }
      }

      // SSL expiry, twice a day
      if (sslWarnDays > 0 && (!prev.sslChecked || now - prev.sslChecked > 12 * 3600e3)) {
        const days = await sslDays(site.url);
        s.sslChecked = now;
        s.sslDays = days;
        if (days !== null && days <= sslWarnDays && (!prev.sslWarned || now - prev.sslWarned > 864e5)) {
          s.sslWarned = now;
          alerts.push({ urgent: days <= 3, subject: `${days <= 3 ? '🔴 URGENT: ' : '⚠️ '}SSL certificate for ${name} ${days < 0 ? 'has EXPIRED' : `expires in ${days} day(s)`}`, text: `Visitors will see a "Not secure" warning when the certificate for ${hostOf(site.url)} expires.\nRenew it in the hosting panel (AutoSSL / Let's Encrypt) or ask the host.` });
          events.push({ siteId: site.id, site: name, severity: days <= 3 ? 'urgent' : 'warning', title: 'SSL expiring', detail: `${days} day(s) left` });
        }
      }

      state[site.id] = s;
    });

    // Drop state for deleted sites
    const ids = new Set(sites.map((s) => s.id));
    for (const id of Object.keys(state)) if (!ids.has(id)) delete state[id];
    for (const id of Object.keys(hist)) if (!ids.has(id)) delete hist[id];

    await store.saveState(state);
    await store.saveHist(hist);
    if (!onlyId) await store.set('lastRun', Date.now());
    for (const ev of events) await store.addEvent(ev);
    for (const a of alerts) await sendMail(a);

    return { checked: due.length, alerts: alerts.length };
  } finally {
    if (got) await store.del('lock:check');
  }
}

/** Uptime % from history. */
export function uptime(h, days = 1) {
  if (!h) return null;
  if (days === 1) {
    const r = h.r || [];
    if (!r.length) return null;
    return (100 * r.filter((x) => x >= 0).length) / r.length;
  }
  const keys = Object.keys(h.d || {}).sort().slice(-days);
  let up = 0;
  let tot = 0;
  for (const k of keys) {
    up += h.d[k][0];
    tot += h.d[k][1];
  }
  return tot ? (100 * up) / tot : null;
}
