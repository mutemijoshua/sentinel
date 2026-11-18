import { headers } from 'next/headers';
import { storeMode } from '@/lib/store';
import { mailConfigured, recipients } from '@/lib/mailer';
import { Submit } from '@/components/client';
import { testEmail } from '../../actions';

const SNIPPETS = [
  [
    'Next.js (App Router) — app/api/health/route.js',
    `export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Optional: prove the database works, e.g.
    // await prisma.$queryRaw\`SELECT 1\`;
    return Response.json({ status: 'ok', time: new Date().toISOString() });
  } catch (e) {
    return Response.json({ status: 'error', message: 'database unreachable' }, { status: 503 });
  }
}`,
  ],
  [
    'Node.js / Express',
    `app.get('/api/health', async (req, res) => {
  try {
    // await db.query('SELECT 1');   // optional database check
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(503).json({ status: 'error', message: 'database unreachable' });
  }
});`,
  ],
  [
    'Laravel — routes/web.php (path: /health)',
    `use Illuminate\\Support\\Facades\\DB;

Route::get('/health', function () {
    try {
        DB::select('SELECT 1');
        return response()->json(['status' => 'ok']);
    } catch (\\Throwable $e) {
        return response()->json(['status' => 'error', 'message' => 'database unreachable'], 503);
    }
});
// Laravel 11+ also has a built-in /up route — use the "Website responds" type with URL https://site/up`,
  ],
  [
    'Django — urls.py (path: /health/)',
    `from django.db import connection
from django.http import JsonResponse
from django.urls import path

def health(request):
    try:
        connection.ensure_connection()
        return JsonResponse({"status": "ok"})
    except Exception:
        return JsonResponse({"status": "error", "message": "database unreachable"}, status=503)

urlpatterns += [path("health/", health)]`,
  ],
  [
    'Plain PHP site — health.php',
    `<?php
header('Content-Type: application/json');
try {
    // $pdo = new PDO('mysql:host=localhost;dbname=x', 'user', 'pass'); $pdo->query('SELECT 1');
    echo json_encode(['status' => 'ok']);
} catch (Throwable $e) {
    http_response_code(503);
    echo json_encode(['status' => 'error', 'message' => 'database unreachable']);
}`,
  ],
];

export default async function Help({ searchParams }) {
  const sp = await searchParams;
  const h = await headers();
  const base = process.env.APP_URL || `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`;
  const checks = [
    ['Database (Upstash Redis)', storeMode === 'redis' ? 'Connected' : storeMode === 'file' ? 'Local file (development only)' : 'NOT connected', storeMode !== 'missing'],
    ['Login password', process.env.DASHBOARD_PASSWORD ? 'Set' : 'Missing', Boolean(process.env.DASHBOARD_PASSWORD)],
    ['Session secret', process.env.SESSION_SECRET ? 'Set' : 'Missing (falls back to password)', Boolean(process.env.SESSION_SECRET)],
    ['Gmail sending', mailConfigured() ? `Set — alerts go to ${recipients().join(', ')}` : 'Missing', mailConfigured()],
    ['Cron secret', process.env.CRON_SECRET ? 'Set' : 'Missing', Boolean(process.env.CRON_SECRET)],
    ['Sentinel Guard key', process.env.SG_MONITOR_KEY ? 'Set' : 'Missing (WordPress security data disabled)', Boolean(process.env.SG_MONITOR_KEY)],
  ];

  return (
    <main className="prose" style={{ paddingBottom: 60 }}>
      <section className="headline">
        <div>
          <h1>Setup</h1>
          <div className="sub">Everything Sentinel Hub needs, and how to monitor each kind of site.</div>
        </div>
      </section>

      {sp?.mail === 'sent' && <p className="note ok">Test alert sent. Check your inbox — and the Spam folder the first time.</p>}
      {sp?.mail === 'failed' && <p className="note bad">Gmail refused the email. Check GMAIL_USER and the 16-letter app password (Events page shows the error).</p>}
      {sp?.mail === 'nomail' && <p className="note bad">Email is not configured yet — see step 3.</p>}

      <div className="panel">
        <h2>Status</h2>
        <dl className="kv">
          {checks.map(([k, v, ok]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd style={{ color: ok ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>{v}</dd>
            </div>
          ))}
        </dl>
        <form action={testEmail} style={{ marginTop: 16 }}>
          <Submit className="btn ghost" busy="Sending…">Send a test urgent alert</Submit>
        </form>
      </div>

      <h2>1. Environment variables (Vercel → Project → Settings → Environment Variables)</h2>
      <pre>{`DASHBOARD_PASSWORD   = a long password for this dashboard
SESSION_SECRET       = any random 40+ characters
CRON_SECRET          = any random 30+ characters (letters and numbers only)
GMAIL_USER           = you@gmail.com
GMAIL_APP_PASSWORD   = the 16-letter Google app password
ALERT_TO             = you@gmail.com, colleague@example.com   (optional)
SG_MONITOR_KEY       = the same Monitor key you paste into every Sentinel Guard
APP_URL              = ${base}
TIMEZONE             = Africa/Nairobi`}</pre>
      <p>After changing variables, redeploy (Deployments → ⋯ → Redeploy).</p>

      <h2>2. Database</h2>
      <p>Vercel → your project → <strong>Storage</strong> → Create / Connect → <strong>Upstash for Redis</strong> (free plan) → connect to this project. Vercel adds the connection variables automatically; redeploy.</p>

      <h2>3. Gmail app password</h2>
      <ol>
        <li>Turn on 2-Step Verification on the Google account (myaccount.google.com → Security).</li>
        <li>Open myaccount.google.com/apppasswords, name it “Sentinel Hub”, copy the 16-letter password.</li>
        <li>Put it in <code>GMAIL_APP_PASSWORD</code> and your address in <code>GMAIL_USER</code>, redeploy, then press “Send a test urgent alert” above.</li>
      </ol>
      <h3>Never miss an alert</h3>
      <p>
        Gmail ignores “high priority” flags, so in Gmail search <code>subject:URGENT from:{process.env.GMAIL_USER || 'you@gmail.com'}</code> → Create filter → tick <em>Never send it to Spam</em>,{' '}
        <em>Always mark it as important</em> and <em>Star it</em>. In the Gmail phone app set notifications to “High priority only” or give alerts their own sound.
      </p>

      <h2>4. Automatic checks every 5 minutes (cron-job.org, free)</h2>
      <p>Vercel’s free plan only runs scheduled jobs once a day (used here for the daily report email), so a free outside service triggers the checks:</p>
      <ol>
        <li>Sign up at cron-job.org → Create cronjob.</li>
        <li>URL: <code>{base}/api/check?key=YOUR_CRON_SECRET</code></li>
        <li>Schedule: every 5 minutes. Save. The “last run” time on the Sites page should update within 5 minutes.</li>
      </ol>
      <p>The daily summary email is sent automatically by Vercel at about 07:00 Nairobi time.</p>

      <h2>5. WordPress sites (Sentinel Guard 1.2+)</h2>
      <ol>
        <li>On each WordPress site: Sentinel Guard → Uptime Monitor → paste the same <strong>Monitor key</strong> as <code>SG_MONITOR_KEY</code>.</li>
        <li>Set <strong>Central dashboard URL</strong> to <code>{base}</code> and click “Test dashboard connection”.</li>
        <li>Optional: tick “Send alerts only to the dashboard” so all emails come from here.</li>
        <li>Add the site here with type <strong>WordPress + Sentinel Guard</strong>. You can empty the old “Websites to watch” lists on your WordPress sites — this dashboard replaces them.</li>
      </ol>

      <h2>6. Other stacks</h2>
      <ul>
        <li><strong>Static sites</strong> (HTML, Vercel/Netlify sites): type “Page contains text” with a word from the page.</li>
        <li><strong>Apps with a database</strong>: add a health endpoint (below) and use type “Health-check endpoint”. It reports down when the database is down even if the homepage still loads from cache.</li>
        <li><strong>APIs / mobile app back ends</strong>: point a health endpoint check at the API’s base URL.</li>
        <li>Sites behind Cloudflare “Bot Fight Mode” may block the checker — add a WAF skip rule for the user-agent <code>SentinelHub-Monitor</code>.</li>
      </ul>
      {SNIPPETS.map(([title, code]) => (
        <details key={title} className="snip">
          <summary>{title}</summary>
          <pre>{code}</pre>
        </details>
      ))}
    </main>
  );
}
