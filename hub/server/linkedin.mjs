// LinkedIn pages the hub's chat may open: any linkedin.com page the user sent in that conversation
// (a job posting, a job search, a profile…), once each, and nothing else. A link's key ignores the
// country subdomain, tracking parameters and a trailing slash, so www.linkedin.com/in/x and
// de.linkedin.com/in/x/ are one link; the rest of the query (keywords, location, filters, the job
// shown) is part of the key, so a different search is a different link.

export const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;
export const LINKEDIN_OTHER = /(^|\.)(lnkd\.in|licdn\.com)$/i; // short links and LinkedIn's file host: never opened

// Query parameters that only track where a click came from; they don't change the page.
const TRACKING = /^(trk\w*|trackingId|refId|eBP|lipi|lici|origin|originToLandingJobPostings|midToken|midSig|eid|otpToken|li_fat_id|utm_\w+)$/i;

// 'jobs/view/<id>' | 'in/<name>' | '<path>?<query>' for any other LinkedIn page | '' (not LinkedIn).
export function linkedinKey(url) {
  let u;
  try { u = new URL(url); } catch { return ''; }
  if (!LINKEDIN_HOST.test(u.hostname.replace(/\.$/, ''))) return '';
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'jobs' && parts[1] === 'view' && parts.length === 3) {
    const id = parts[2].match(/(\d{6,})$/)?.[1]; // "/jobs/view/4012345678" or "/jobs/view/designer-at-acme-4012345678"
    if (id) return `jobs/view/${id}`;
  }
  if (parts[0] === 'in' && parts.length === 2) return `in/${decodeURIComponent(parts[1]).toLowerCase()}`;
  const query = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const qs = new URLSearchParams(query).toString();
  return `${parts.join('/')}${qs ? `?${qs}` : ''}` || '/';
}

// What kind of page a key is, for the chat's per-link report.
export const linkedinKind = (key) => (key.startsWith('jobs/view/') ? 'job'
  : /^jobs\/(search|search-results|collections)\b/.test(key) ? 'job search'
  : key.startsWith('in/') ? 'profile' : 'page');

// Every LinkedIn link in a piece of text (what the user typed or pasted).
export function linkedinKeysIn(text) {
  const keys = new Set();
  // With or without https:// ("linkedin.com/in/x" pasted from the address bar counts too).
  for (const m of String(text ?? '').matchAll(/(?:https?:\/\/)?(?:[\w-]+\.)*linkedin\.com(?:\/[^\s<>()"'`]*)?/gi)) {
    const raw = m[0].replace(/[.,;:!?]+$/, '');
    const k = linkedinKey(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (k) keys.add(k);
  }
  return [...keys];
}
