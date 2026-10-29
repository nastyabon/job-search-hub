import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, parseTracker, parsePipeline, sortFiltered, dedupeOpenings } from './data.mjs';

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

test('sortFiltered keeps only filtered roles close to the job titles', () => {
  const fold = (s) => String(s).toLowerCase();
  const compile = (k) => (t) => t.includes(k);
  const titleFilter = { positive: ['Product Designer', 'UX/UI', 'Senior Designer'], negative: ['Manager', 'Brand Designer', 'Junior'] };
  const job = (title, reason = 'title') => ({ title, reason, url: title, company: 'Acme' });
  const out = sortFiltered([
    job('Product Designer Manager'), // a positive, removed by a non-design negative
    job('Junior Product Designer'), // removed by a level: deliberate
    job('Brand Designer'), // a design exclusion the user set
    job('Service Designer'), // same role word, no positive
    job('UX Researcher'), // ux is a role word (from UX/UI)
    job('Account Executive'), // unrelated
    job('Product Designer', 'location'),
  ], titleFilter, { fold, compile });
  assert.deepEqual(out.blocked.map((j) => [j.title, j.blocker]), [['Product Designer Manager', 'manager']]);
  assert.deepEqual(out.close.map((j) => j.title), ['Service Designer', 'UX Researcher']);
  assert.deepEqual(out.location.map((j) => j.title), ['Product Designer']);
  assert.equal(out.hidden, 3);
});

test('a new week file has the §13 header and sections', async () => {
  const { weekFileText } = await import('./actions.mjs');
  const text = weekFileText(isoWeek(new Date(2026, 11, 30)));
  assert.match(text, /^# 2026-W53 · Mon 28 Dec – Sun 3 Jan 2027\n/);
  assert.match(text, /\n## LinkedIn posts\n- \[ \] Post 1\n/);
  assert.match(text, /\n## Interview prep \(1 box = 1 hour\)\n(- \[ \] 1h\n)+\n## Notes\n$/);
});

test('dedupeOpenings: the same role under two links shows once, the better-scored one', () => {
  const o = (url, score) => ({ url, company: 'Kwalee', title: 'Lead Ad Monetisation Manager', location: '', score });
  assert.deepEqual(dedupeOpenings([o('a', 3.5), o('b', null), o('c', 4)]).map((x) => x.url), ['c']);
});
