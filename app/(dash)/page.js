import Link from 'next/link';
import * as store from '@/lib/store';
import { uptime, hostOf } from '@/lib/checker';
import { ago, span, pct } from '@/lib/format';
import { Status, Spark, GuardChips, SslText } from '@/components/bits';
import { AutoRefresh, Submit } from '@/components/client';
import { checkAll } from '../actions';

function hasIssue(site, st) {
  if (site.type !== 'wordpress' || !st) return false;
  if (st.sgStatus === 'missing') return true;
  const g = st.sg;
  return Boolean(g && ((g.missing_plugins && g.missing_plugins.length) || (g.last_scan && g.last_scan.open)));
}

export default async function Overview({ searchParams }) {
  const sp = await searchParams;
  const filter = sp?.filter || 'all';
  const [sites, state, hist, lastRun] = await Promise.all([store.getSites(), store.getState(), store.getHist(), store.get('lastRun')]);

  const active = sites.filter((s) => !s.paused);
  const down = active.filter((s) => state[s.id]?.up === false);
  const issues = sites.filter((s) => hasIssue(s, state[s.id]));
  const ssl = sites.filter((s) => state[s.id]?.sslDays != null && state[s.id].sslDays <= 14);
  const wp = sites.filter((s) => s.type === 'wordpress');

  const filters = {
    all: sites,
    down,
    issues,
    ssl,
    wordpress: wp,
    other: sites.filter((s) => s.type !== 'wordpress'),
  };
  const shown = [...(filters[filter] || sites)].sort((a, b) => {
    const rank = (s) => (s.paused ? 4 : state[s.id]?.up === false ? 0 : hasIssue(s, state[s.id]) ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  const stale = lastRun && Date.now() - lastRun > 20 * 60e3;

  return (
    <main>
      <AutoRefresh seconds={60} />
      {sp?.deleted && <p className="note ok" style={{ marginTop: 18 }}>Site removed.</p>}

      <section className="headline">
        <div>
          <h1>
            {sites.length === 0 ? (
              'No sites yet'
            ) : down.length ? (
              <span className="bad">
                {down.length} of {active.length} site{active.length === 1 ? '' : 's'} offline
              </span>
            ) : (
              `All ${active.length} site${active.length === 1 ? '' : 's'} online`
            )}
          </h1>
          <div className="sub">
            Last automatic check: {ago(lastRun)}
            {stale && <strong style={{ color: 'var(--warn)' }}> — checks seem to have stopped; see Setup → cron-job.org</strong>}
          </div>
        </div>
        {sites.length > 0 && (
          <form action={checkAll} className="actions">
            <Submit className="btn ghost" busy="Checking all sites…">
              ↻ Check all now
            </Submit>
          </form>
        )}
      </section>

      {sites.length === 0 ? (
        <div className="empty">
          <h2>Add your first website</h2>
          <p>WordPress sites with Sentinel Guard also report their security status here.</p>
          <Link className="btn" href="/sites/new">
            + Add site
          </Link>
        </div>
      ) : (
        <>
          <nav className="tally">
            {[
              ['all', sites.length, 'All sites', ''],
              ['down', down.length, 'Offline', down.length ? 'is-down' : ''],
              ['issues', issues.length, 'Security issues', issues.length ? 'is-down' : ''],
              ['ssl', ssl.length, 'SSL expiring', ssl.length ? 'is-warn' : ''],
              ['wordpress', wp.length, 'WordPress', ''],
              ['other', sites.length - wp.length, 'Other stacks', ''],
            ].map(([k, n, label, cls]) => (
              <Link key={k} href={k === 'all' ? '/' : `/?filter=${k}`} className={`${cls} ${filter === k ? 'on' : ''}`}>
                <b>{n}</b>
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {shown.length === 0 ? (
            <div className="empty">
              <h2>Nothing here</h2>
              <p>No sites match this filter — good news.</p>
            </div>
          ) : (
            <div className="grid">
              {shown.map((s) => {
                const st = state[s.id];
                const h = hist[s.id];
                const isDown = st?.up === false && !s.paused;
                return (
                  <Link key={s.id} href={`/sites/${s.id}`} className={`site ${isDown ? 'down' : ''} ${s.paused ? 'paused' : ''} ${!st || st.up == null ? 'pending' : ''}`}>
                    <div className="row">
                      <h3>{s.name}</h3>
                      <Status st={st} paused={s.paused} />
                    </div>
                    <div className="host">
                      {hostOf(s.url)}
                      {s.stack ? ` · ${s.stack}` : ''}
                      {s.client ? ` · ${s.client}` : ''}
                    </div>
                    {isDown && (
                      <div className="msg">
                        {st.msg} · for {span(st.since)}
                      </div>
                    )}
                    <Spark h={h} />
                    <div className="stats">
                      <span>
                        24h <b>{pct(uptime(h, 1))}</b>
                      </span>
                      <span>
                        30d <b>{pct(uptime(h, 30))}</b>
                      </span>
                      <span>
                        <b>{st?.ms != null && st.up ? `${st.ms} ms` : '—'}</b>
                      </span>
                      <span>
                        SSL <b><SslText st={st} /></b>
                      </span>
                    </div>
                    <GuardChips site={s} st={st} />
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
