#!/usr/bin/env node
// Is the hub's own Claude (the `claude` command) installed and signed in? Prints one line:
// CLAUDE_CODE_OK (<path>), CLAUDE_CODE_SIGNED_OUT or CLAUDE_CODE_MISSING. SETUP.md runs this every
// time setup starts or resumes, even when setup is already done.
// Usage: node hub/scripts/claude-check.mjs

import { claudeStatus } from '../server/claude-bin.mjs';

const s = claudeStatus();
console.log(!s.installed ? 'CLAUDE_CODE_MISSING' : !s.loggedIn ? 'CLAUDE_CODE_SIGNED_OUT' : `CLAUDE_CODE_OK (${s.bin})`);
