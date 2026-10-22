#!/usr/bin/env node
// Mechanical "sounds generated" tells for a message draft (see SKILL.md).
// Usage: node lint.mjs "draft text"   or   node lint.mjs path/to/draft.md
// Prints HARD (fix) and flag (look again) lines, then counts. Exit 1 if any HARD.

import fs from 'node:fs';

const arg = process.argv.slice(2).join(' ');
const text = (arg && fs.existsSync(arg) && fs.statSync(arg).isFile() ? fs.readFileSync(arg, 'utf8') : arg).trim();
if (!text) {
  console.error('Usage: node lint.mjs "draft text" | <file>');
  process.exit(2);
}

// From career-ops/voice-dna.md §3A, plus words that show up in nearly every generated outreach message.
const BANNED = [
  'delve', 'realm', 'harness', 'unlock', 'tapestry', 'paradigm', 'cutting-edge', 'revolutioni[sz]e', 'landscape',
  'intricate', 'intricacies', 'showcas(e|es|ed|ing)', 'crucial', 'pivotal', 'meticulous(ly)?', 'vibrant', 'unparalleled',
  'underscore[sd]?', 'leverag(e|es|ed|ing)', 'synerg(y|ies|ize)', 'innovative', 'game-changer', 'testament', 'commendable',
  'groundbreaking', 'align(s|ed|ing)?', 'foster(s|ed|ing)?', 'enhanc(e|es|ed|ing)', 'holistic', 'garner', 'pioneering',
  'trailblazing', 'unleash', 'transformative', 'redefin(e|es|ing)', 'seamless(ly)?', 'robust', 'empower(s|ed|ing)?',
  'streamlin(e|es|ed|ing)', 'frictionless', 'elevat(e|es|ed|ing)', 'effortless(ly)?', 'insightful', 'visionary',
  'reimagin(e|es|ed|ing)', 'unprecedented', 'state-of-the-art', 'supercharg(e|es|ed|ing)', 'delightful', 'user-centric',
  'passionate', 'magic(al)?', 'revolutionary', 'resonat(e|es|ed|ing)', 'thrilled', 'excited', 'eager', 'keen',
  'AI-powered',
];

const PHRASES = [
  [/hope (this|my) (message|note|email) finds you/i, 'template opener'],
  [/\bI hope (you'?re|you are) (well|doing well)/i, 'template opener'],
  [/came across your (profile|work|post)/i, 'template opener'],
  [/\b(I'?m|I am|I wanted to be) reaching out\b/i, '"reaching out"'],
  [/\bI wanted to (connect|reach out)/i, 'template opener'],
  [/\bbest regards\b|\bkind regards\b|\bwarm regards\b/i, 'formal sign-off'],
  [/looking forward to (hearing|connecting)/i, 'template close'],
  [/\b(it'?s|it is) (important|worth) not(ing|e)\b/i, 'dead phrase'],
  [/\bin order to\b/i, '"in order to" → "to"'],
  [/\b(furthermore|moreover|additionally|that said|that being said)\b/i, 'essay transition'],
  [/\b(would|I'?d) (love|welcome) the (opportunity|chance)\b/i, 'template ask'],
  [/\bopportunit(y|ies) (on|at|with) your team\b/i, 'template ask'],
  [/\bat the end of the day\b|\bmoving forward\b/i, 'dead phrase'],
];

// voice-dna §3F: negate one framing, then assert another.
const PARALLEL = [
  /\b(it'?s|this|that|is|isn'?t|wasn'?t) not (just |only |about )?[^.?!]{1,60}[,;.] ?(it'?s|this is|that'?s|but)\b/i,
  /\bnot only\b[^.?!]{1,80}\bbut( also)?\b/i,
  /\b(isn'?t|wasn'?t|aren'?t) (just |about )?[^.?!]{1,50}[.;,] ?(it'?s|it was|they'?re)\b/i,
  /\bless [a-z]+, more [a-z]+/i,
  /\bthe question isn'?t\b/i,
];

const hard = [];
const flags = [];
const clip = (s, i, n = 40) => `"${s.slice(Math.max(0, i - 15), i + n).replace(/\s+/g, ' ').trim()}"`;

for (const m of text.matchAll(/[—–]/g)) hard.push(`dash ${clip(text, m.index)}`);
for (const m of text.matchAll(/ - /g)) flags.push(`spaced hyphen used as a dash ${clip(text, m.index)}`);
for (const w of BANNED) {
  const m = text.match(new RegExp(`\\b${w}\\b`, 'i'));
  if (m) hard.push(`AI word "${m[0]}" ${clip(text, m.index)}`);
}
for (const [re, why] of PHRASES) {
  const m = text.match(re);
  if (m) hard.push(`${why} ${clip(text, m.index)}`);
}
for (const re of PARALLEL) {
  const m = text.match(re);
  if (m) hard.push(`"not X, it's Y" reframe ${clip(text, m.index, 70)}`);
}
for (const m of text.matchAll(/\p{Extended_Pictographic}/gu)) hard.push(`emoji ${clip(text, m.index, 5)}`);

const bangs = (text.match(/!/g) ?? []).length;
if (bangs > 1) flags.push(`${bangs} exclamation marks (one at most)`);
if (/;/.test(text)) flags.push('semicolon (split into two sentences)');
for (const m of text.matchAll(/\b\w+, \w+(?: \w+)?,? and \w+/g)) flags.push(`list of three ${clip(text, m.index, 50)}`);
for (const m of text.matchAll(/\b(genuinely|truly|really|incredibly|deeply|absolutely)\b/gi)) flags.push(`intensifier "${m[0]}"`);
for (const m of text.matchAll(/\b(I'?d love to|would love to)\b/gi)) flags.push(`"${m[0]}" (fine once, not as the ask)`);
for (const m of text.matchAll(/\b(impressed|inspiring|amazing|fascinating|exciting)\b/gi)) flags.push(`flattery word "${m[0]}"`);
for (const m of text.matchAll(/[a-z]: [A-Za-z]/g)) flags.push(`colon reveal ${clip(text, m.index)}`);
if (/\*\*|^\s*[-*•] /m.test(text)) flags.push('bold or bullets in a message');
for (const line of text.split('\n')) {
  const words = line.trim().split(/\s+/).filter((w) => w.length > 3);
  if (words.length >= 4 && words.every((w) => /^[A-Z]/.test(w))) flags.push(`Title Case line "${line.trim()}"`);
}

const sentences = text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
const lens = sentences.map((s) => s.split(/\s+/).length);
if (lens.length >= 3) {
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  if (sd / mean < 0.25) flags.push(`sentences all about the same length (${lens.join(', ')} words): vary them`);
}
const words = text.split(/\s+/).filter(Boolean).length;
if (words > 120) flags.push(`${words} words: long for a cold message (aim for 40 to 90)`);

for (const h of hard) console.log(`HARD  ${h}`);
for (const f of flags) console.log(`flag  ${f}`);
if (!hard.length && !flags.length) console.log('clean');
const chars = text.length;
// Connection notes: 300 characters with LinkedIn Premium, 200 without.
const note = chars <= 200 ? 'fits a LinkedIn connection note' : chars <= 300 ? 'fits a connection note with Premium (300), not without (200)' : `${chars - 300} over the 300-character LinkedIn note limit`;
console.log(`\n${chars} characters · ${words} words · ${sentences.length} sentences · ${note}`);
process.exit(hard.length ? 1 : 0);
