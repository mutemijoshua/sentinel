import * as store from '@/lib/store';
import { hostOf } from '@/lib/checker';

export const dynamic = 'force-dynamic';

// Public, read-only list of the sites you ticked "Show this site on my portfolio".
// Used by the portfolio website. It deliberately returns only safe fields:
// no client names, notes, check settings, security status or site IDs.
export async function GET() {
  try {
    const [sites, state] = await Promise.all([store.getSites(), store.getState()]);
    const list = sites
      .filter((s) => s.showcase && !s.paused)
      .map((s) => ({
        name: s.name,
        url: s.url,
        host: hostOf(s.url),
        stack: s.stack || (s.type === 'wordpress' ? 'WordPress' : ''),
        blurb: s.blurb || '',
        online: state[s.id]?.up === true,
        since: s.created || null,
      }))
      .sort((a, b) => (b.since || 0) - (a.since || 0));

    return Response.json(
      { sites: list, updated: new Date().toISOString() },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          // Vercel's edge keeps a copy for 10 minutes, so visitors never hit the database directly.
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
        },
      },
    );
  } catch {
    return Response.json({ sites: [], error: 'unavailable' }, { status: 503 });
  }
}
