import nodemailer from 'nodemailer';

let transport = null;

export function mailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransport() {
  if (transport) return transport;
  if (mailConfigured()) {
    transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
    });
  } else {
    // No email configured: messages are only written to the server log.
    transport = nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

export function recipients() {
  const list = (process.env.ALERT_TO || process.env.GMAIL_USER || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list;
}

/**
 * Send an alert. urgent=true marks it High priority (X-Priority 1 / Importance: High)
 * and the subject already starts with "🔴 URGENT" so a Gmail filter can catch it.
 */
export async function sendMail({ subject, text, urgent = false }) {
  const to = recipients();
  const appUrl = process.env.APP_URL ? `\n\nDashboard: ${process.env.APP_URL}` : '';
  const msg = {
    from: `"Sentinel Hub" <${process.env.GMAIL_USER || 'sentinel-hub@localhost'}>`,
    to: to.length ? to : ['nobody@localhost'],
    subject,
    text: `${text}${appUrl}\n\n— Sentinel Hub`,
    priority: urgent ? 'high' : 'normal',
  };
  try {
    const info = await getTransport().sendMail(msg);
    if (!mailConfigured()) console.log('[mail not configured] would send:', subject);
    return { ok: true, id: info.messageId };
  } catch (e) {
    console.error('Email failed:', e.message);
    return { ok: false, error: e.message };
  }
}
