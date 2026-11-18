import { after } from 'next/server';
import { cronAuthorized } from '@/lib/auth';
import { runChecks } from '@/lib/checker';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Called every 5 minutes by cron-job.org:  https://YOUR-APP.vercel.app/api/check?key=CRON_SECRET
// Answers immediately and keeps checking in the background, so the caller never times out.
async function handle(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const wait = new URL(request.url).searchParams.get('wait') === '1';
  if (wait) return Response.json(await runChecks());
  after(async () => {
    try {
      await runChecks();
    } catch (e) {
      console.error('Check run failed:', e);
    }
  });
  return Response.json({ ok: true, started: new Date().toISOString() }, { status: 202 });
}

export const GET = handle;
export const POST = handle;
