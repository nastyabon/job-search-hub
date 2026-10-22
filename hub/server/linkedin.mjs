// LinkedIn links the hub's chat may open: only a job posting (/jobs/view/<id>) or a profile
// (/in/<name>) that the user sent in that conversation. A link's key ignores the country subdomain,
// query string and trailing slash, so www.linkedin.com/in/x and de.linkedin.com/in/x/ are one link.

export const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;
export const LINKEDIN_OTHER = /(^|\.)(lnkd\.in|licdn\.com)$/i; // short links and LinkedIn's file host: never opened

// 'jobs/view/<id>' | 'in/<name>' | '' (any other LinkedIn page, or not LinkedIn).
export function linkedinKey(url) {
  let u;
  try { u = new URL(url); } catch { return ''; }
  if (!LINKEDIN_HOST.test(u.hostname.replace(/\.$/, ''))) return '';
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'jobs' && parts[1] === 'view' && parts.length === 3) {
    const id = parts[2].match(/(\d{6,})$/)?.[1]; // "/jobs/view/4012345678" or "/jobs/view/designer-at-acme-4012345678"
    return id ? `jobs/view/${id}` : '';
  }
  if (parts[0] === 'in' && parts.length === 2) return `in/${decodeURIComponent(parts[1]).toLowerCase()}`;
  return ''; // /in/x/details/…, search, feed, company pages, posts…: never
}

// Every job / profile link in a piece of text (what the user typed or pasted).
export function linkedinKeysIn(text) {
  const keys = new Set();
  // With or without https:// ("linkedin.com/in/x" pasted from the address bar counts too).
  for (const m of String(text ?? '').matchAll(/(?:https?:\/\/)?(?:[\w-]+\.)*linkedin\.com\/[^\s<>()"'`]+/gi)) {
    const raw = m[0].replace(/[.,;:!?]+$/, '');
    const k = linkedinKey(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (k) keys.add(k);
  }
  return [...keys];
}
