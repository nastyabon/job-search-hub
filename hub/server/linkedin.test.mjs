import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkedinKey, linkedinKeysIn, linkedinKind } from './linkedin.mjs';

const SEARCH = 'https://www.linkedin.com/jobs/search-results/?currentJobId=4012345678&eBP=X&refId=a%3D&trackingId=b%3D&keywords=Senior%20Product%20Designer&origin=JOBS_HOME&geoId=90009706';

test('job and profile links keep their short keys', () => {
  assert.equal(linkedinKey('https://nl.linkedin.com/jobs/view/designer-at-acme-4012345678/?trk=x'), 'jobs/view/4012345678');
  assert.equal(linkedinKey('https://www.linkedin.com/in/Sam-Rivera/'), 'in/sam-rivera');
});

test('a job search keys on its query, without tracking parameters', () => {
  const key = linkedinKey(SEARCH);
  assert.equal(key, 'jobs/search-results?currentJobId=4012345678&geoId=90009706&keywords=Senior+Product+Designer');
  assert.equal(linkedinKind(key), 'job search');
  assert.equal(linkedinKey(SEARCH.replace('www.', 'de.').replace('trackingId=b', 'trackingId=c')), key);
  assert.notEqual(linkedinKey(SEARCH.replace('geoId=90009706', 'geoId=1')), key);
});

test('links in a message are found with or without https://', () => {
  assert.deepEqual(linkedinKeysIn(`what about ${SEARCH} and linkedin.com/in/sam-rivera.`), [linkedinKey(SEARCH), 'in/sam-rivera']);
});

// The hook itself: only links the user sent, once each; lnkd.in never.
function hook(state, url) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'li-')), 'state.json');
  fs.writeFileSync(file, JSON.stringify(state));
  const out = execFileSync(process.execPath, [path.join(import.meta.dirname, 'linkedin-guard-hook.mjs'), file], { input: JSON.stringify({ tool_input: { url } }) }).toString();
  return { denied: out.includes('"deny"'), state: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

test('the guard opens a sent search page once and refuses jobs listed on it', () => {
  const sent = { allowed: [linkedinKey(SEARCH)], fetched: {}, last: 0 };
  const first = hook(sent, SEARCH);
  assert.equal(first.denied, false);
  assert.equal(hook(first.state, SEARCH).denied, true);
  assert.equal(hook(sent, 'https://www.linkedin.com/jobs/view/4099990001/').denied, true);
  assert.equal(hook(sent, 'https://www.linkedin.com/jobs/search-results/?keywords=Designer').denied, true);
  assert.equal(hook(sent, 'https://lnkd.in/abc').denied, true);
  assert.equal(hook(sent, 'https://example.com/jobs').denied, false);
});
