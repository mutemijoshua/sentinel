export function ago(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function span(ts) {
  if (!ts) return '—';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} days`;
}

export function pct(v) {
  if (v == null) return '—';
  if (v >= 99.995) return '100%';
  return `${v.toFixed(2)}%`;
}

export function when(ts) {
  return new Date(ts).toLocaleString('en-GB', { timeZone: process.env.TIMEZONE || 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
