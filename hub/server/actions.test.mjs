import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugVariants } from './actions.mjs';

test('slugVariants: board names career-ops\' one guess misses', () => {
  assert.deepEqual(slugVariants('The Paper Company'), ['thepapercompany', 'papercompany', 'paper-company', 'paper']);
  assert.deepEqual(slugVariants('Globex Group'), ['globexgroup', 'globex']);
  assert.deepEqual(slugVariants('Initech Studios'), ['initechstudios', 'initech']);
  assert.deepEqual(slugVariants('Hooli Ltd.'), ['hooliltd', 'hooli']);
  assert.ok(slugVariants('AT&T Inc').includes('att'));
  // One word: career-ops already tried it, nothing else to try.
  assert.deepEqual(slugVariants('Umbrella'), []);
});
