#!/usr/bin/env node
// Prints one week's progress against routine.yml, using the dashboard's own counting.
//   node scripts/week-progress.mjs              current week
//   node scripts/week-progress.mjs 2026-10-14   the ISO week containing that date
import { buildPayload } from '../server/data.mjs';

const arg = process.argv[2];
if (arg && !/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
  console.error('Usage: node scripts/week-progress.mjs [YYYY-MM-DD]');
  process.exit(1);
}
const [y, m, d] = (arg ?? '').split('-').map(Number);
const when = arg ? new Date(y, m - 1, d, 12) : new Date();

const p = await buildPayload(when, { followups: false });
console.log(`${p.week.id} (${p.week.start} – ${p.week.end})${p.week.fileExists ? '' : '  [no week file]'}`);
for (const row of p.progress) {
  const target = row.min === row.max ? `${row.max}` : `${row.min}–${row.max}`;
  const verdict = row.count >= row.min ? 'HIT ' : 'MISS';
  console.log(`${verdict}  ${row.label}: ${row.count}${row.unit ?? ''} / ${target}${row.unit ?? ''}`);
}
for (const e of p.errors) console.log(`note: ${e}`);
