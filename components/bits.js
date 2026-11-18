// Small server-rendered building blocks shared by pages.

export function Status({ st, paused }) {
  if (paused) return <span className="pill muted">Paused</span>;
  if (!st || st.up == null) return <span className="pill warn">Checking…</span>;
  return st.up ? <span className="pill up">Online</span> : <span className="pill down">Offline</span>;
}

/** Last N checks as bars: height = response time, red = down, grey = no data. */
export function Spark({ h, n = 48 }) {
  const r = (h?.r || []).slice(-n);
  const pad = Array(Math.max(0, n - r.length)).fill(null);
  const all = [...pad, ...r];
  const max = Math.max(300, ...r.filter((x) => x > 0));
  return (
    <div className="spark" aria-label="Recent checks">
      {all.map((v, i) =>
        v === null ? <i key={i} className="e" /> : v < 0 ? <i key={i} className="x" title="down" /> : <i key={i} style={{ height: `${Math.max(12, (v / max) * 100)}%` }} title={`${v} ms`} />
      )}
    </div>
  );
}

/** Sentinel Guard summary chips for a WordPress site. */
export function GuardChips({ site, st }) {
  if (site.type !== 'wordpress') return null;
  if (!st || st.sgStatus === 'unknown' || st.sgStatus == null) return null;
  if (st.sgStatus === 'n/a') return <div className="chips"><span className="chip">Set SG_MONITOR_KEY to read Sentinel Guard</span></div>;
  if (st.sgStatus === 'missing') return <div className="chips"><span className="chip bad">Sentinel Guard not responding</span></div>;
  const g = st.sg || {};
  const chips = [<span key="v" className="chip good">Sentinel {g.version}</span>];
  if (g.missing_plugins?.length) chips.push(<span key="m" className="chip bad">{g.missing_plugins.length} plugin(s) off</span>);
  if (g.last_scan) {
    chips.push(
      g.last_scan.open ? <span key="s" className="chip bad">{g.last_scan.open} scan issue(s)</span> : <span key="s" className="chip good">Scan clean</span>
    );
  } else {
    chips.push(<span key="s" className="chip warn">Never scanned</span>);
  }
  const u = g.updates || {};
  const n = (u.core ? 1 : 0) + (u.plugins || 0) + (u.themes || 0);
  if (n) chips.push(<span key="u" className="chip warn">{n} update(s)</span>);
  if (g.wp) chips.push(<span key="w" className="chip">WP {g.wp}</span>);
  return <div className="chips">{chips}</div>;
}

export function SslText({ st }) {
  if (!st || st.sslDays == null) return '—';
  if (st.sslDays < 0) return 'EXPIRED';
  return `${st.sslDays} days`;
}
