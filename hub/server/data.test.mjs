import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, parseTracker, parsePipeline } from './data.mjs';

test('isoWeek matches ISO 8601, including year boundaries', () => {
  assert.deepEqual(isoWeek(new Date(2026, 9, 20)), { id: '2026-W43', start: '2026-10-19', end: '2026-10-25' });
  assert.equal(isoWeek(new Date(2026, 9, 19)).id, '2026-W43'); // Monday
  assert.equal(isoWeek(new Date(2026, 9, 25)).id, '2026-W43'); // Sunday
  assert.equal(isoWeek(new Date(2025, 11, 29)).id, '2026-W01'); // Mon before 1 Jan 2026 (a Thursday)
  assert.equal(isoWeek(new Date(2027, 0, 3)).id, '2026-W53');   // 2026 has 53 ISO weeks
  assert.equal(isoWeek(new Date(2027, 0, 4)).id, '2027-W01');
  assert.equal(isoWeek(new Date(2026, 2, 30)).id, '2026-W14');  // Monday right after the DST switch
});

test('parseTracker maps columns by header name, not position', () => {
  const md = [
    '# Applications', '',
    '| Status | # | Company | Via | Role | Date |',
    '|---|---|---|---|---|---|',
    '| Applied | 2 | Acme | referral | Senior Product Designer | 2026-10-21 |',
    '', 'trailing text',
  ].join('\n');
  const t = parseTracker(md);
  assert.equal(t.ok, true);
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].company, 'Acme');
  assert.equal(t.rows[0].status, 'Applied');
  assert.equal(t.rows[0].via, 'referral');
});

test('parseTracker reports failure instead of throwing on an unknown format', () => {
  const t = parseTracker('| a | b |\n|---|---|\n| 1 | 2 |');
  assert.equal(t.ok, false);
  assert.match(t.raw, /\| a \| b \|/);
});

test('parsePipeline reads only Pending scan rows', () => {
  const md = [
    '# Pipeline', '', '## Pending', '',
    '- [ ] https://www.welcometothejungle.com/en/jobs/1 | Piano | Head of Product Design | Amsterdam, Netherlands | posted: 2026-10-07',
    '- [ ] https://jobs.ashbyhq.com/acme/1 | Acme | Senior Product Designer | rank: 4.5/5 — AI creation tools, close to my last role',
    '- [ ] https://example.com/job/2',
    '- [x] https://example.com/done | Done Co | Old',
    '', '## Processed', '- [ ] https://example.com/3 | Later | Not pending',
  ].join('\n');
  assert.deepEqual(parsePipeline(md), [
    { url: 'https://www.welcometothejungle.com/en/jobs/1', company: 'Piano', title: 'Head of Product Design', location: 'Amsterdam, Netherlands', posted: '2026-10-07', host: 'welcometothejungle.com', score: null, reason: '' },
    { url: 'https://jobs.ashbyhq.com/acme/1', company: 'Acme', title: 'Senior Product Designer', location: '', posted: '', host: 'jobs.ashbyhq.com', score: 4.5, reason: 'AI creation tools, close to my last role' },
    { url: 'https://example.com/job/2', company: '', title: '', location: '', posted: '', host: 'example.com', score: null, reason: '' },
  ]);
});
