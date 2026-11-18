import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as store from '@/lib/store';
import { uptime, hostOf, TYPES } from '@/lib/checker';
import { ago, span, pct, when } from '@/lib/format';
import { Status, Spark, GuardChips, SslText } from '@/components/bits';
import { AutoRefresh, Submit } from '@/components/client';
import SiteForm from '@/components/SiteForm';
import { saveSite, deleteSite, togglePause, checkOne } from '../../../actions';

function last30(h) {
  const out = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const v = h?.d?.[d];
    if (!v || !v[1]) out.push({ d, cls: 'none', t: `${d}: no data` });
    else {
      const p = (100 * v[0]) / v[1];
      out.push({ d, cls: p >= 99.5 ? '' : p >= 95 ? 'mid' : 'bad', t: `${d}: ${p.toFixed(2)}% up` });
    }
  }
  return out;
}

export default async function SitePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const sites = await store.getSites();
  const site = sites.find((s) => s.id === id);
  if (!site) notFound();
  const [state, hist, events] = await Promise.all([store.getState(), store.getHist(), store.getEvents(300)]);
  const st = state[id];
  const h = hist[id];
  const mine = events.filter((e) => e.siteId === id).slice(0, 40);
  const g = st?.sg;

  return (
    <main>
      <AutoRefresh seconds={60} />
      {sp?.saved && <p className="note ok" style={{ marginTop: 18 }}>Saved and checked.</p>}
      <section className="headline">
        <div>
          <h1>
            {site.name} <Status st={st} paused={site.paused} />
          </h1>
          <div className="sub">
            <a href={site.url} target="_blank" rel="noopener noreferrer">
              {site.url}
            </a>{' '}
            · {TYPES[site.type]} · checked {ago(st?.lastCheck)}
          </div>
        </div>
        <div className="actions btnrow">
          <form action={checkOne}>
            <input type="hidden" name="id" value={id} />
            <Submit className="btn" busy="Checking…">↻ Check now</Submit>
          </form>
          <form action={togglePause}>
            <input type="hidden" name="id" value={id} />
            <Submit className="btn ghost">{site.paused ? 'Resume monitoring' : 'Pause'}</Submit>
          </form>
        </div>
      </section>

      {st?.up === false && !site.paused && (
        <p className="note bad">
          <strong>Offline for {span(st.since)}:</strong> {st.msg}
        </p>
      )}

      <div className="cols">
        <div>
          <div className="panel">
            <h2>Last 30 days · {pct(uptime(h, 30))} uptime</h2>
            <div className="days">
              {last30(h).map((d) => (
                <i key={d.d} className={d.cls} title={d.t} />
              ))}
            </div>
            <div className="stats" style={{ justifyContent: 'space-between' }}>
              <span>30 days ago</span>
              <span>today</span>
            </div>
          </div>
          <div className="panel">
            <h2>Last 24 hours · {pct(uptime(h, 1))}</h2>
            <Spark h={h} n={144} />
            <div className="stats" style={{ marginTop: 8 }}>
              <span>
                Response now <b>{st?.ms != null ? `${st.ms} ms` : '—'}</b>
              </span>
              <span>
                Average <b>{h?.r?.filter((x) => x > 0).length ? `${Math.round(h.r.filter((x) => x > 0).reduce((a, b) => a + b, 0) / h.r.filter((x) => x > 0).length)} ms` : '—'}</b>
              </span>
              <span>
                Last result <b>{st?.msg || '—'}</b>
              </span>
            </div>
          </div>
          <div className="panel">
            <h2>Alerts &amp; events</h2>
            {mine.length === 0 ? (
              <p style={{ color: 'var(--muted)', margin: 0 }}>Nothing yet.</p>
            ) : (
              <ul className="events">
                {mine.map((e, i) => (
                  <li key={i}>
                    <time>{when(e.t)}</time>
                    <div>
                      <div className="t">
                        <span className={`sev ${e.severity}`} />
                        {e.title}
                      </div>
                      {e.detail && <div className="d">{e.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          {site.type === 'wordpress' && (
            <div className="panel">
              <h2>Sentinel Guard</h2>
              <GuardChips site={site} st={st} />
              {g ? (
                <dl className="kv" style={{ marginTop: 12 }}>
                  <dt>Plugin version</dt>
                  <dd>{g.version}</dd>
                  {g.wp && (<><dt>WordPress / PHP</dt><dd>{g.wp} / {g.php}</dd></>)}
                  {g.last_scan !== undefined && (<><dt>Last malware scan</dt><dd>{g.last_scan ? `${ago(g.last_scan.time * 1000)} — ${g.last_scan.open ? `${g.last_scan.open} to review` : 'clean'}` : 'never'}</dd></>)}
                  {g.updates && (<><dt>Updates waiting</dt><dd>{g.updates.core ? 'WordPress core, ' : ''}{g.updates.plugins || 0} plugin(s), {g.updates.themes || 0} theme(s)</dd></>)}
                  {g.bans != null && (<><dt>Banned IPs</dt><dd>{g.bans}</dd></>)}
                  {g.spam_7d != null && (<><dt>Spam blocked (7 d)</dt><dd>{g.spam_7d}</dd></>)}
                  {g.failed_logins_7d != null && (<><dt>Failed logins (7 d)</dt><dd>{g.failed_logins_7d}</dd></>)}
                  {g.admins != null && (<><dt>Administrators</dt><dd>{g.admins}</dd></>)}
                  {g.missing_plugins?.length > 0 && (<><dt>Switched off</dt><dd style={{ color: 'var(--down)' }}>{g.missing_plugins.join(', ')}</dd></>)}
                </dl>
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                  {st?.sgStatus === 'missing'
                    ? 'No heartbeat. Check that Sentinel Guard is active and its Monitor key matches SG_MONITOR_KEY.'
                    : 'Waiting for the first heartbeat.'}
                </p>
              )}
              <p style={{ marginBottom: 0 }}>
                <a href={`${site.url.replace(/\/$/, '')}/wp-admin/admin.php?page=sentinel-guard`} target="_blank" rel="noopener noreferrer">
                  Open Sentinel Guard →
                </a>
              </p>
            </div>
          )}
          <div className="panel">
            <h2>Details</h2>
            <dl className="kv">
              <dt>Host</dt>
              <dd>{hostOf(site.url)}</dd>
              <dt>Stack</dt>
              <dd>{site.stack || '—'}</dd>
              <dt>Client</dt>
              <dd>{site.client || '—'}</dd>
              <dt>SSL certificate</dt>
              <dd><SslText st={st} /></dd>
              <dt>Checked every</dt>
              <dd>{site.interval || 5} min</dd>
              {site.notes && (<><dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{site.notes}</dd></>)}
            </dl>
          </div>
          <details className="panel">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Edit site</summary>
            <div style={{ marginTop: 14 }}>
              <SiteForm action={saveSite} site={site} />
            </div>
          </details>
          <form action={deleteSite} style={{ marginBottom: 40 }}>
            <input type="hidden" name="id" value={id} />
            <Submit className="btn danger" confirm={`Remove ${site.name} from monitoring?`}>
              Remove site
            </Submit>
          </form>
          <p className="foot">
            <Link href="/">← All sites</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
