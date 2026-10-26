#!/usr/bin/env node
// The user's own CV design (hub-data/cv-design/): their CV rebuilt once as HTML from their PDF, so
// Tailor CV can change the words and keep the look. Folder:
//   cv.html          the CV: structure + their current wording (small; the only file Tailor CV reads)
//   assets/          style.css, fonts/, images; cv.html links them as assets/...
//   original.pdf     the PDF it was rebuilt from, for comparing
// cv.html carries <meta name="cv-format" content="a4|letter"> and <meta name="cv-pages" content="N">.
//
// Usage (from the project root):
//   node hub/scripts/cv-design.mjs init <their-cv.pdf>           start: copies it to original.pdf, renders its
//        pages into check/, lists its fonts and saves its pictures into assets/
//   node hub/scripts/cv-design.mjs font "<Family>" [400,700,400i,700i]
//        downloads an open-license font (Fontsource, via jsDelivr) into assets/fonts/ and prints its @font-face CSS
//   node hub/scripts/cv-design.mjs pages <file.pdf> <out-dir>    render each page to PNG (to look at it)
//   node hub/scripts/cv-design.mjs fonts <file.pdf>              font names embedded in a PDF
//   node hub/scripts/cv-design.mjs images <file.pdf> <out-dir>   pictures embedded in a PDF, as PNG
//   node hub/scripts/cv-design.mjs copy <career-ops/output/x.html>
//        copy cv.html there with its assets/ links made absolute (Tailor CV's starting point)
//   node hub/scripts/cv-design.mjs check [cv.html]
//        render it through career-ops' own PDF step into hub-data/cv-design/check/ and print the
//        page count; then `pages` both PDFs and compare them side by side.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// Real paths: hub-data/ and career-ops/ may be symlinks, and career-ops only writes inside its own real folder.
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
const DESIGN = path.join(real(path.join(ROOT, 'hub-data')), 'cv-design');
const CAREER_OPS = real(path.join(ROOT, 'career-ops'));
const [cmd, ...args] = process.argv.slice(2);
const fail = (msg) => { console.error(msg); process.exit(1); };

// PDF objects with their (decompressed) streams. Enough for fonts and images; not a PDF parser.
function pdfObjects(file) {
  const buf = fs.readFileSync(file);
  const text = buf.toString('latin1');
  const out = [];
  for (const m of text.matchAll(/(\d+) 0 obj\s*<<([\s\S]*?)>>\s*(stream\r?\n)?/g)) {
    const obj = { id: Number(m[1]), dict: m[2], data: null };
    if (m[3]) {
      const len = Number(m[2].match(/\/Length (\d+)(?! 0 R)/)?.[1]);
      const start = m.index + m[0].length;
      if (len) obj.raw = buf.subarray(start, start + len);
      if (obj.raw && /\/FlateDecode/.test(m[2])) { try { obj.data = zlib.inflateSync(obj.raw); } catch { /* not flate */ } }
    }
    out.push(obj);
  }
  return out;
}

function fonts(file) {
  const names = new Set();
  const scan = (s) => { for (const m of s.matchAll(/\/(?:BaseFont|FontName)\s*\/([\w+-]+)/g)) names.add(m[1].replace(/^[A-Z]{6}\+/, '')); };
  for (const o of pdfObjects(file)) { scan(o.dict); if (o.data) scan(o.data.toString('latin1')); }
  return [...names].sort();
}

// PNG-predicted Flate rows → raw pixels.
function unfilter(data, w, h, bpp) {
  const stride = w * bpp;
  const out = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0, i = 0; y < h; y += 1) {
    const f = data[i]; i += 1;
    const line = Buffer.from(data.subarray(i, i + stride)); i += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? line[x - bpp] : 0; const b = prev[x]; const c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    line.copy(out, y * stride); prev = line;
  }
  return out;
}

function png(w, h, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, body]))); return Buffer.concat([len, t, body, c]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 6;
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

function images(file, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const objs = pdfObjects(file);
  const byId = new Map(objs.map((o) => [o.id, o]));
  const masks = new Set(objs.flatMap((o) => [...o.dict.matchAll(/\/SMask (\d+) 0 R/g)].map((m) => Number(m[1]))));
  const pixels = (o) => {
    const w = Number(o.dict.match(/\/Width (\d+)/)[1]); const h = Number(o.dict.match(/\/Height (\d+)/)[1]);
    const ch = /\/DeviceRGB/.test(o.dict) ? 3 : /\/DeviceGray/.test(o.dict) ? 1 : 0;
    if (!ch || !o.data || !/\/BitsPerComponent 8/.test(o.dict)) return null;
    const raw = /\/Predictor 1[0-5]/.test(o.dict) ? unfilter(o.data, w, h, ch) : o.data;
    return { w, h, ch, raw };
  };
  const written = [];
  for (const o of objs) {
    if (!/\/Subtype\s*\/Image/.test(o.dict) || masks.has(o.id)) continue;
    if (/\/DCTDecode/.test(o.dict) && o.raw) { const f = path.join(outDir, `image-${o.id}.jpg`); fs.writeFileSync(f, o.raw); written.push(f); continue; }
    const img = pixels(o);
    if (!img) { console.error(`image ${o.id}: format not supported, skipped`); continue; }
    const maskObj = byId.get(Number(o.dict.match(/\/SMask (\d+) 0 R/)?.[1]));
    const mask = maskObj ? pixels(maskObj) : null;
    const rgba = Buffer.alloc(img.w * img.h * 4);
    for (let i = 0; i < img.w * img.h; i += 1) {
      for (let c = 0; c < 3; c += 1) rgba[i * 4 + c] = img.raw[i * img.ch + (img.ch === 3 ? c : 0)];
      rgba[i * 4 + 3] = mask && mask.w === img.w && mask.h === img.h ? mask.raw[i] : 255;
    }
    const f = path.join(outDir, `image-${o.id}.png`);
    fs.writeFileSync(f, png(img.w, img.h, rgba)); written.push(f);
  }
  return written;
}

// Page images: PDFKit on a Mac (no installs needed), else poppler's pdftoppm if it's there.
function pages(file, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, path.basename(file, '.pdf'));
  if (process.platform === 'darwin') {
    const swift = path.join(os.tmpdir(), `cv-design-pages-${process.pid}.swift`);
    fs.writeFileSync(swift, `import PDFKit
import AppKit
let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
for i in 0..<doc.pageCount {
  let page = doc.page(at: i)!
  let b = page.bounds(for: .mediaBox)
  let img = NSImage(size: NSSize(width: b.width * 2, height: b.height * 2))
  img.lockFocus()
  NSColor.white.set(); NSRect(x: 0, y: 0, width: b.width * 2, height: b.height * 2).fill()
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.scaleBy(x: 2, y: 2)
  page.draw(with: .mediaBox, to: ctx)
  img.unlockFocus()
  let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\\(CommandLine.arguments[2])-\\(i + 1).png"))
}
`);
    try { execFileSync('swift', [swift, file, base], { stdio: ['ignore', 'ignore', 'pipe'] }); } finally { fs.rmSync(swift, { force: true }); }
  } else {
    try { execFileSync('pdftoppm', ['-png', '-r', '110', file, base]); } catch { fail('Rendering PDF pages needs a Mac, or poppler (pdftoppm) installed.'); }
  }
  return fs.readdirSync(outDir).filter((f) => f.startsWith(path.basename(base)) && f.endsWith('.png')).sort().map((f) => path.join(outDir, f));
}

// cv.html → a copy whose assets/ links point at hub-data/cv-design/assets (absolute file URLs).
function copyTo(out, src = path.join(DESIGN, 'cv.html')) {
  if (!fs.existsSync(src)) fail(`No CV design yet (${path.relative(ROOT, src)}).`);
  const outAbs = path.resolve(out);
  if (path.relative(path.join(CAREER_OPS, 'output'), outAbs).startsWith('..')) fail('The copy goes in career-ops/output/.');
  const assets = pathToFileURL(path.join(path.dirname(src), 'assets')).href;
  const html = fs.readFileSync(src, 'utf8').replace(/((?:href|src)=["'])assets\//g, `$1${assets}/`);
  fs.writeFileSync(outAbs, html);
  return outAbs;
}

const meta = (html, name) => html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1] ?? '';

function check(src = path.join(DESIGN, 'cv.html')) {
  const html = fs.readFileSync(src, 'utf8');
  const format = meta(html, 'cv-format') || 'a4';
  const want = Number(meta(html, 'cv-pages')) || 0;
  const name = `_cv-design-check-${process.pid}`;
  const tmpHtml = copyTo(path.join(CAREER_OPS, 'output', `${name}.html`), src);
  const tmpPdf = path.join(CAREER_OPS, 'output', `${name}.pdf`);
  const outDir = path.join(path.dirname(src), 'check');
  fs.mkdirSync(outDir, { recursive: true });
  const index = path.join(CAREER_OPS, 'data', 'pdf-index.tsv');
  const indexBefore = fs.existsSync(index) ? fs.readFileSync(index, 'utf8') : null;
  let log = '';
  try {
    // --skip-fact-check: this is the user's own wording, checked against cv.md when Tailor CV uses it.
    log = execFileSync(process.execPath, ['generate-pdf.mjs', tmpHtml, tmpPdf, `--format=${format}`, '--skip-fact-check'], { cwd: CAREER_OPS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    fs.renameSync(tmpPdf, path.join(outDir, 'cv.pdf'));
  } finally {
    fs.rmSync(tmpHtml, { force: true });
    fs.rmSync(tmpPdf, { force: true });
    // A design check is not a CV: keep it out of career-ops' PDF manifest.
    if (indexBefore !== null) fs.writeFileSync(index, indexBefore); else fs.rmSync(index, { force: true });
  }
  const got = Number(log.match(/Pages: (\d+)/)?.[1]) || 0;
  console.log(`${path.relative(ROOT, path.join(outDir, 'cv.pdf'))}: ${got} page(s)${want ? `, original ${want}` : ''}${want && got !== want ? '  ← different' : ''}`);
  for (const f of pages(path.join(outDir, 'cv.pdf'), outDir)) console.log(path.relative(ROOT, f));
  const original = path.join(path.dirname(src), 'original.pdf');
  if (fs.existsSync(original)) for (const f of pages(original, outDir)) console.log(path.relative(ROOT, f));
}


function init(pdf) {
  if (!pdf || !fs.existsSync(pdf)) fail(`No PDF at ${pdf}`);
  for (const d of ['assets', 'check']) fs.mkdirSync(path.join(DESIGN, d), { recursive: true });
  const original = path.join(DESIGN, 'original.pdf');
  fs.copyFileSync(pdf, original);
  console.log(`Copied to ${path.relative(ROOT, original)}`);
  console.log('Pages:'); for (const f of pages(original, path.join(DESIGN, 'check'))) console.log(`  ${path.relative(ROOT, f)}`);
  const names = fonts(original);
  console.log(`Fonts: ${names.join(', ') || '(no names stored; match them by eye)'}`);
  const pics = images(original, path.join(DESIGN, 'assets'));
  console.log(`Pictures: ${pics.length ? pics.map((f) => path.relative(ROOT, f)).join(', ') : 'none'}`);
}

// Open-license fonts from Fontsource (the same files Google Fonts serves), pinned to the latest version.
async function font(family, weights = '400,700,400i,700i') {
  if (!family) fail('font "<Family>" [400,700,400i,700i]');
  const slug = family.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const meta = await fetch(`https://data.jsdelivr.com/v1/packages/npm/@fontsource/${slug}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const version = meta?.tags?.latest;
  if (!version) fail(`"${family}" isn't on Fontsource. Use the closest free font, or ask the user for the font file.`);
  const dir = path.join(DESIGN, 'assets', 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  const base = `https://cdn.jsdelivr.net/npm/@fontsource/${slug}@${version}`;
  const css = [];
  for (const w of weights.split(',').map((x) => x.trim()).filter(Boolean)) {
    const weight = w.replace(/i$/, '');
    const style = w.endsWith('i') ? 'italic' : 'normal';
    const name = `${slug}-latin-${weight}-${style}.woff2`;
    const r = await fetch(`${base}/files/${name}`);
    if (!r.ok) { console.error(`  ${w}: not available`); continue; }
    fs.writeFileSync(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
    css.push(`@font-face { font-family: "${family}"; font-weight: ${weight}; font-style: ${style}; src: url("fonts/${name}") format("woff2"); }`);
  }
  const license = await fetch(`${base}/LICENSE`).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  if (license) fs.writeFileSync(path.join(dir, `${slug}-LICENSE.txt`), license);
  if (!css.length) fail('No font files downloaded.');
  console.log(`${family} ${version} → ${path.relative(ROOT, dir)}/\n${css.join('\n')}`);
}

if (cmd === 'init') init(args[0]);
else if (cmd === 'font') await font(args[0], args[1]);
else if (cmd === 'pages') { if (args.length < 2) fail('pages <file.pdf> <out-dir>'); pages(args[0], args[1]).forEach((f) => console.log(f)); }
else if (cmd === 'fonts') { if (!args[0]) fail('fonts <file.pdf>'); console.log(fonts(args[0]).join('\n') || '(no font names found)'); }
else if (cmd === 'images') { if (args.length < 2) fail('images <file.pdf> <out-dir>'); images(args[0], args[1]).forEach((f) => console.log(f)); }
else if (cmd === 'copy') { if (!args[0]) fail('copy <career-ops/output/x.html>'); console.log(copyTo(args[0])); }
else if (cmd === 'check') check(args[0] ? path.resolve(args[0]) : undefined);
else fail('Usage: cv-design.mjs init|font|pages|fonts|images|copy|check …');
