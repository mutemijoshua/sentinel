import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { storeMode } from '@/lib/store';
import { mailConfigured } from '@/lib/mailer';
import { logout } from '../actions';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }) {
  await requireAuth();
  const problems = [];
  if (storeMode === 'missing') problems.push('No database connected — in Vercel open Storage → Upstash for Redis → Connect, then redeploy.');
  if (!mailConfigured()) problems.push('Email is not set up (GMAIL_USER / GMAIL_APP_PASSWORD) — alerts are only logged, not sent.');
  if (!process.env.CRON_SECRET) problems.push('CRON_SECRET is not set — automatic checks cannot run.');

  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link href="/" className="brand">
            <span className="brand-mark" /> Sentinel Hub
          </Link>
          <nav className="nav">
            <Link href="/">Sites</Link>
            <Link href="/events">Alerts &amp; events</Link>
            <Link href="/help">Setup</Link>
          </nav>
          <Link href="/sites/new" className="btn">
            + Add site
          </Link>
          <form action={logout}>
            <button className="btn ghost" type="submit">
              Log out
            </button>
          </form>
        </div>
      </header>
      <div className="wrap">
        {problems.length > 0 && (
          <div className="note" style={{ marginTop: 18 }}>
            {problems.map((p) => (
              <div key={p}>⚠️ {p} <Link href="/help">Setup guide →</Link></div>
            ))}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
