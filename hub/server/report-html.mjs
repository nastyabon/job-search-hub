// A career-ops evaluation report (Markdown) as a plain, readable page for /api/report.
// Small on purpose: headings, paragraphs, lists, tables, quotes, code, links, bold/italic.
// All text is escaped; only http(s) links become links.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
}

export function reportHtml(md, title = 'Report') {
  const lines = String(md).replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const isTable = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isList = (l) => /^\s*([-*+]|\d+\.)\s+/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const code = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i]); i += 1) code.push(lines[i]);
      out.push(`<pre>${esc(code.join('\n'))}</pre>`);
      i += 1;
    } else if (/^#{1,6}\s/.test(l)) {
      const n = l.match(/^#+/)[0].length;
      out.push(`<h${n}>${inline(l.replace(/^#+\s*/, ''))}</h${n}>`);
      i += 1;
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) {
      out.push('<hr>');
      i += 1;
    } else if (isTable(l)) {
      const rows = [];
      for (; i < lines.length && isTable(lines[i]); i += 1) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => inline(c.trim())));
      }
      out.push(`<table><thead><tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else if (isList(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      for (; i < lines.length && isList(lines[i]); i += 1) items.push(`<li>${inline(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''))}</li>`);
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
    } else if (/^>\s?/.test(l)) {
      const q = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i += 1) q.push(inline(lines[i].replace(/^>\s?/, '')));
      out.push(`<blockquote>${q.join('<br>')}</blockquote>`);
    } else if (!l.trim()) {
      i += 1;
    } else {
      const p = [];
      for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>)/.test(lines[i]) && !isTable(lines[i]) && !isList(lines[i]); i += 1) p.push(inline(lines[i]));
      out.push(`<p>${p.join('<br>')}</p>`);
    }
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#fbfaf8;--fg:#1d1c1a;--muted:#6b675f;--line:#e4e0d8;--code:#f1eee8;--link:#2457c5}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe7;--muted:#a19d94;--line:#34322e;--code:#22211f;--link:#8fb0ff}}
body{background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:32px 16px}
main{max-width:760px;margin:0 auto}
h1{font-size:24px;line-height:1.25}h2{font-size:19px;margin-top:2em;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:16px}
a{color:var(--link)}code,pre{background:var(--code);border-radius:4px;font:13px ui-monospace,Menlo,monospace}code{padding:1px 4px}pre{padding:12px;overflow-x:auto;white-space:pre-wrap}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;font-size:14px}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--code)}
blockquote{margin:0;padding-left:12px;border-left:3px solid var(--line);color:var(--muted)}hr{border:0;border-top:1px solid var(--line)}
</style></head><body><main>${out.join('\n')}</main></body></html>`;
}
