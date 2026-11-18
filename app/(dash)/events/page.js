import Link from 'next/link';
import * as store from '@/lib/store';
import { when } from '@/lib/format';
import { Submit } from '@/components/client';
import { clearEvents } from '../../actions';

export default async function Events({ searchParams }) {
  const sp = await searchParams;
  const sev = sp?.sev || 'all';
  const events = await store.getEvents(500);
  const shown = sev === 'all' ? events : events.filter((e) => e.severity === sev);

  return (
    <main style={{ paddingBottom: 60 }}>
      <section className="headline">
        <div>
          <h1>Alerts &amp; events</h1>
          <div className="sub">Downtime, recoveries and everything Sentinel Guard reports from your WordPress sites.</div>
        </div>
        {events.length > 0 && (
          <form action={clearEvents} className="actions">
            <Submit className="btn ghost" confirm="Clear the whole event log?">
              Clear log
            </Submit>
          </form>
        )}
      </section>
      <div className="btnrow" style={{ marginBottom: 14 }}>
        {['all', 'urgent', 'warning', 'info'].map((k) => (
          <Link key={k} href={k === 'all' ? '/events' : `/events?sev=${k}`} className={`btn ${sev === k ? '' : 'ghost'}`}>
            {k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)}
          </Link>
        ))}
      </div>
      <div className="panel">
        {shown.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>No events.</p>
        ) : (
          <ul className="events">
            {shown.map((e, i) => (
              <li key={i}>
                <time>{when(e.t)}</time>
                <div>
                  <div className="t">
                    <span className={`sev ${e.severity}`} />
                    {e.siteId ? <Link href={`/sites/${e.siteId}`}>{e.site}</Link> : e.site} — {e.title}
                    {e.source === 'sentinel-guard' && <span className="chip" style={{ marginLeft: 8 }}>from Sentinel Guard</span>}
                  </div>
                  {e.detail && <div className="d">{e.detail}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
