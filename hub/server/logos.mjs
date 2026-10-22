// Company logos for the hub. hub-data/logos/domains.yml maps a company to its website; the icon is
// fetched once from that site (apple-touch-icon, else the largest <link rel=icon>, else /favicon.ico)
// and cached next to it. No logo service is used, so the target list never leaves the machine
// except as one request to each company's own site. A miss is remembered for a week.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { HUB_DATA } from './data.mjs';

export const LOGOS = path.join(HUB_DATA, 'logos');
const DOMAINS = path.join(LOGOS, 'domains.yml');
const WEEK = 7 * 24 * 3600 * 1000;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', ico: 'image/x-icon', webp: 'image/webp', gif: 'image/gif' };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function domainFor(company) {
  if (!fs.existsSync(DOMAINS)) return '';
  const map = parseYaml(fs.readFileSync(DOMAINS, 'utf8')) ?? {};
  const hit = Object.entries(map).find(([name]) => norm(name) === norm(company));
  const domain = String(hit?.[1] ?? '').trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : '';
}

const get = (url) => fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(8000) });

// Icon links on the home page, best first: apple-touch-icon, then icons by declared size.
async function iconUrls(domain) {
  const urls = [];
  try {
    const r = await get(`https://${domain}/`);
    const html = (await r.text()).slice(0, 300000);
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    const attr = (tag, name) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? '';
    const scored = links.map((tag) => {
      const rel = attr(tag, 'rel').toLowerCase();
      if (!/icon/.test(rel) || /mask-icon/.test(rel)) return null;
      const size = Math.max(0, ...attr(tag, 'sizes').split(/\s+/).map((s) => Number(s.split('x')[0]) || 0));
      const score = (rel.includes('apple-touch') ? 1000 : 0) + (size || (/\.svg/i.test(attr(tag, 'href')) ? 500 : 16));
      return { href: attr(tag, 'href'), score };
    }).filter((x) => x?.href).sort((a, b) => b.score - a.score);
    for (const { href } of scored) urls.push(new URL(href.replace(/&amp;/g, '&'), r.url).href);
  } catch { /* site unreachable: try the usual paths */ }
  urls.push(`https://${domain}/apple-touch-icon.png`, `https://${domain}/favicon.ico`);
  return [...new Set(urls)];
}

async function fetchIcon(domain) {
  for (const url of await iconUrls(domain)) {
    try {
      const r = await get(url);
      if (!r.ok) continue;
      const type = (r.headers.get('content-type') ?? '').split(';')[0].trim();
      const ext = Object.entries(TYPES).find(([, t]) => t === type)?.[0]
        ?? (type === 'image/vnd.microsoft.icon' ? 'ico' : url.match(/\.(png|jpe?g|svg|ico|webp|gif)(\?|$)/i)?.[1]?.toLowerCase());
      const body = Buffer.from(await r.arrayBuffer());
      if (!ext || body.length < 100 || body.length > 1e6) continue;
      fs.writeFileSync(path.join(LOGOS, `${domain}.${ext}`), body);
      return { ext, body };
    } catch { /* next candidate */ }
  }
  fs.writeFileSync(path.join(LOGOS, `${domain}.none`), new Date().toISOString());
  return null;
}

const pending = new Map();
// {type, body} when cached or fetched; {redirect} when the site blocks the server (bot checks):
// the browser then loads the favicon itself, as any visit would.
export async function logoFor(company) {
  const domain = domainFor(company);
  if (!domain) return null;
  const fallback = { redirect: `https://${domain}/favicon.ico` };
  fs.mkdirSync(LOGOS, { recursive: true });
  const cached = fs.readdirSync(LOGOS).find((f) => f.startsWith(`${domain}.`) && f !== `${domain}.none` && TYPES[f.slice(domain.length + 1)]);
  if (cached) return { type: TYPES[cached.slice(domain.length + 1)], body: fs.readFileSync(path.join(LOGOS, cached)) };
  const miss = path.join(LOGOS, `${domain}.none`);
  if (fs.existsSync(miss) && Date.now() - fs.statSync(miss).mtimeMs < WEEK) return fallback;
  if (!pending.has(domain)) pending.set(domain, fetchIcon(domain).finally(() => pending.delete(domain)));
  const got = await pending.get(domain);
  return got ? { type: TYPES[got.ext], body: got.body } : fallback;
}
