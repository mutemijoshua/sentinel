'use client';

import { useActionState, useState } from 'react';
import { Submit } from './client';

const TYPES = {
  wordpress: ['WordPress + Sentinel Guard', 'Checks the site is up AND reads Sentinel Guard’s private heartbeat (plugin running, plugins switched off, scan results, updates).'],
  http: ['Website responds (any stack)', 'Online if the homepage answers without a server error. Works for anything: static sites, Next.js, Laravel, Django, etc.'],
  keyword: ['Page contains text', 'Also checks that a piece of text you choose is on the page — catches blank pages, broken builds and defacement.'],
  health: ['Health-check endpoint (JSON)', 'Calls an endpoint in your app (e.g. /api/health) that also tests the database. Snippets for each stack are on the Setup page.'],
};

export default function SiteForm({ action, site }) {
  const [state, formAction] = useActionState(action, null);
  const [type, setType] = useState(site?.type || 'http');
  return (
    <form action={formAction}>
      {state?.error && <p className="error">{state.error}</p>}
      {site?.id && <input type="hidden" name="id" value={site.id} />}
      <div className="two">
        <label className="f">
          <span>Website address</span>
          <input type="text" name="url" defaultValue={site?.url || ''} placeholder="https://example.co.ke" required />
        </label>
        <label className="f">
          <span>Name</span>
          <input type="text" name="name" defaultValue={site?.name || ''} placeholder="e.g. U-Tena Youth Org" />
        </label>
      </div>
      <label className="f">
        <span>How to monitor it</span>
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(TYPES).map(([k, [label]]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <small>{TYPES[type][1]}</small>
      </label>
      {type === 'keyword' && (
        <label className="f">
          <span>Text that must appear on the page</span>
          <input type="text" name="keyword" defaultValue={site?.keyword || ''} placeholder="e.g. Contact us" required />
          <small>Pick something stable, like your footer text or company name.</small>
        </label>
      )}
      {type === 'health' && (
        <label className="f">
          <span>Health-check path</span>
          <input type="text" name="healthPath" defaultValue={site?.healthPath || '/api/health'} />
          <small>Should return JSON like {'{"status":"ok"}'}. Anything else (or an error) counts as down.</small>
        </label>
      )}
      <div className="two">
        <label className="f">
          <span>Tech stack</span>
          <input type="text" name="stack" defaultValue={site?.stack || (type === 'wordpress' ? 'WordPress' : '')} placeholder="WordPress, Next.js, Laravel…" />
        </label>
        <label className="f">
          <span>Client / owner</span>
          <input type="text" name="client" defaultValue={site?.client || ''} placeholder="optional" />
        </label>
      </div>
      <label className="f">
        <span>Check every</span>
        <select name="interval" defaultValue={String(site?.interval || 5)}>
          {[5, 10, 15, 30, 60].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </label>
      <label className="f">
        <span>Notes</span>
        <textarea name="notes" rows={3} defaultValue={site?.notes || ''} placeholder="Hosting provider, cPanel URL, renewal dates… (no passwords)" />
      </label>
      <fieldset className="f" style={{ border: '1px solid var(--line, #ddd)', borderRadius: 8, padding: '10px 14px' }}>
        <legend style={{ padding: '0 6px' }}>Public portfolio</legend>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="showcase" defaultChecked={Boolean(site?.showcase)} />
          <span>Show this site on my portfolio</span>
        </label>
        <small>
          Only the name, address, tech stack, the line below and whether it is online are shared — never the client, notes or
          security details. Ask the client first.
        </small>
        <label className="f" style={{ marginTop: 10 }}>
          <span>One line for the portfolio</span>
          <input type="text" name="blurb" maxLength={240} defaultValue={site?.blurb || ''} placeholder="e.g. Custom theme and donation pages for a youth NGO in Mukuru" />
        </label>
      </fieldset>
      <Submit busy="Saving and checking…">{site?.id ? 'Save changes' : 'Add site'}</Submit>
    </form>
  );
}
