# Sentinel Hub

One private dashboard for every website you run — online/offline status, uptime history, SSL expiry,
and the security status of your WordPress sites (via the Sentinel Guard plugin). It sends **urgent** emails
the moment a site goes down, recovers, or Sentinel Guard reports a problem, plus a daily summary.

Built with Next.js (Node), hosted free on Vercel, data in a free Upstash Redis database.

## What it watches

| Site type | How it is checked |
|---|---|
| **WordPress + Sentinel Guard** | Site responds **and** Sentinel Guard answers its private heartbeat (plugin running, plugins switched off, last malware scan, pending updates, bans, spam). Security events are pushed here instantly. |
| **Website responds** | Any stack — online if the page answers without a server error. |
| **Page contains text** | Also requires a word/phrase on the page (catches blank pages, broken builds, defacement). |
| **Health-check endpoint** | Calls e.g. `/api/health` in your app, which also tests its database. Snippets for Next.js, Express, Laravel, Django and plain PHP are on the Setup page. |

Down alerts are confirmed with a second check 6 seconds later, repeated every 2 hours while a site stays down,
and followed by a "recovered" email with the downtime duration.

## Deploy (about 20 minutes, all free)

1. **GitHub** – create a private repository and upload this folder (without `node_modules`).
2. **Vercel** – Add New → Project → import the repository → Deploy.
3. **Database** – in the Vercel project: Storage → Create / Connect → *Upstash for Redis* (free) → connect.
4. **Gmail app password** – turn on 2-Step Verification, then create one at
   <https://myaccount.google.com/apppasswords>.
5. **Environment variables** – Project → Settings → Environment Variables (see `.env.example`):

   | Name | Value |
   |---|---|
   | `DASHBOARD_PASSWORD` | long password for logging in |
   | `SESSION_SECRET` | any random 40+ characters |
   | `CRON_SECRET` | random letters/numbers (30+) |
   | `GMAIL_USER` | your Gmail address |
   | `GMAIL_APP_PASSWORD` | the 16-letter app password |
   | `ALERT_TO` | optional, comma-separated recipients (default: GMAIL_USER) |
   | `SG_MONITOR_KEY` | the same Monitor key you put in every Sentinel Guard (12+ chars) |
   | `APP_URL` | `https://your-project.vercel.app` |
   | `TIMEZONE` | `Africa/Nairobi` |

   Then **Deployments → ⋯ → Redeploy**.
6. **Checks every 5 minutes** – Vercel's free plan only runs its own scheduled jobs once a day (that slot is used
   for the daily report). Create a free job at <https://cron-job.org>:
   URL `https://your-project.vercel.app/api/check?key=YOUR_CRON_SECRET`, every 5 minutes.
   Turn on cron-job.org's own "notify me when the job fails" — that tells you if the dashboard itself goes down.
7. Log in, open **Setup**, confirm everything is green and press **Send a test urgent alert**.
8. **Gmail filter** so alerts can't be missed: search `subject:URGENT`, create a filter →
   *Never send to Spam* + *Always mark as important* + *Star*. Gmail ignores high-priority flags; Outlook/Apple Mail show them.

## Connect your WordPress sites (Sentinel Guard 1.2+)

On each site: **Sentinel Guard → Uptime Monitor**
- *Monitor key*: same value as `SG_MONITOR_KEY`
- *Central dashboard URL*: `https://your-project.vercel.app`
- optionally tick *Send alerts only to the dashboard*
- click **Test dashboard connection**

Then add the site here with type *WordPress + Sentinel Guard*. The old "Websites to watch" lists inside
WordPress are no longer needed.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in at least DASHBOARD_PASSWORD and CRON_SECRET
npm run dev
```
Without Upstash variables, data is stored in `.data/store.json`; without Gmail variables, emails are only logged.

## Notes
- Free-tier friendly: each check run uses ~5 Redis commands regardless of how many sites you have.
- Sites behind Cloudflare Bot Fight Mode may block the checker — allow the user-agent `SentinelHub-Monitor`.
- Never put hosting passwords in the site notes.
