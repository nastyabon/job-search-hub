import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { targetsToScan, sortJobs } from './web-scan.mjs';

test('targetsToScan: board-less portals.yml companies plus outreach companies not in it', async () => {
  // No providers/ folder here, so it falls back to career-ops' scan_method flag.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-scan-'));
  fs.writeFileSync(path.join(root, 'portals.yml'), [
    'title_filter: { positive: [Product Designer] }',
    'tracked_companies:',
    '  - { name: Figma, careers_url: "https://boards.greenhouse.io/figma" }',
    '  - { name: Monzo, scan_method: websearch, careers_url: "https://monzo.com/careers" }',
    '  - { name: Off, scan_method: websearch, enabled: false }',
  ].join('\n'));
  const outreachFile = path.join(root, 'outreach.yml');
  fs.writeFileSync(outreachFile, 'companies:\n  - { name: figma }\n  - { name: Wise }\n  - { name: Gone, status: parked }\n');
  const { targets, titleFilter } = await targetsToScan({ root, outreachFile });
  assert.deepEqual(targets, [
    { name: 'Monzo', careers_url: 'https://monzo.com/careers' },
    { name: 'Wise', careers_url: '' },
  ]);
  assert.deepEqual(titleFilter.positive, ['Product Designer']);
});

test('sortJobs: new matches, filtered titles, and jobs seen in an earlier run', () => {
  const matches = (t) => /designer/i.test(t) && !/intern/i.test(t);
  const seen = {};
  const job = (title, n) => ({ company: 'Acme', title, url: `https://acme.com/jobs/${n}` });
  const first = sortJobs([job('Product Designer', 1), job('Design Intern', 2), job('Engineer', 3), job('Product Designer', 1)], { matches, seen, today: '2026-10-28' });
  assert.deepEqual(first.fresh.map((j) => j.title), ['Product Designer']);
  assert.deepEqual(first.filtered.map((j) => j.title), ['Design Intern', 'Engineer']);
  assert.equal(first.dupes, 0);
  assert.equal(seen['https://acme.com/jobs/1'].status, 'added');
  const again = sortJobs([job('Product Designer', 1), job('Senior Product Designer', 4)], { matches, seen, today: '2026-10-29' });
  assert.deepEqual(again.fresh.map((j) => j.title), ['Senior Product Designer']);
  assert.equal(again.dupes, 1);
});

test('sortJobs: matching titles outside the user\'s locations are filtered, not added', () => {
  const matches = (t) => /sales/i.test(t);
  const place = (loc) => !loc || /lisbon|remote/i.test(loc);
  const seen = {};
  const job = (title, location, n) => ({ company: 'Acme', title, location, url: `https://acme.com/jobs/${n}` });
  const run = sortJobs([job('Sales Manager', 'Lisbon', 1), job('Sales Manager', 'New York', 2), job('Sales Lead', '', 3), job('Engineer', 'Lisbon', 4)], { matches, place, seen, today: '2026-10-29' });
  assert.deepEqual(run.fresh.map((j) => j.url.at(-1)), ['1', '3']);
  assert.deepEqual(run.elsewhere.map((j) => j.location), ['New York']);
  assert.equal(seen['https://acme.com/jobs/2'].status, 'skipped_location');
  assert.equal(seen['https://acme.com/jobs/4'].status, 'skipped_title');
});
