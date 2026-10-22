#!/usr/bin/env node
// PreToolUse hook for the hub's background Claude runs (Find, Evaluate, scan scoring): refuses any
// WebFetch of a LinkedIn page. A permission rule like WebFetch(domain:linkedin.com) matches the exact
// host only, so de.linkedin.com and other country subdomains slipped through; this checks the host
// itself. Web *search* results (which may mention LinkedIn links) are unaffected.
// Claude Code passes the tool call as JSON on stdin; printing a "deny" decision blocks it.

const BLOCKED = /(^|\.)(linkedin\.com|lnkd\.in|licdn\.com)$/i;

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let host = '';
  try { host = new URL(JSON.parse(input).tool_input?.url ?? '').hostname.replace(/\.$/, ''); } catch { /* not a URL: let the tool report it */ }
  if (BLOCKED.test(host)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `The hub never opens LinkedIn pages in background runs (${host}). Use what web search results show, or ask the user to paste the page.`,
      },
    }));
  }
  process.exit(0);
});
