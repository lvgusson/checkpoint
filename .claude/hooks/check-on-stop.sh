#!/usr/bin/env bash
# Stop hook: runs `pnpm check` when Claude ends a turn with unverified changes
# under apps/ or packages/. Exit 2 sends the failure back to Claude to fix.
# Requires: git, node, pnpm (no jq needed).
set -uo pipefail

# Parse hook input with node (always present in a pnpm repo).
read -r ACTIVE SESSION < <(node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    try { const j = JSON.parse(s); console.log(`${j.stop_hook_active === true} ${j.session_id || "default"}`); }
    catch { console.log("false default"); }
  });')

# Already blocked once this turn: let Claude stop instead of looping.
[ "$ACTIVE" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Fingerprint of current source changes: tracked diffs + untracked files' contents.
FINGERPRINT=$(
  { git diff HEAD -- apps packages 2>/dev/null
    git ls-files --others --exclude-standard -- apps packages 2>/dev/null |
      while IFS= read -r f; do printf '%s ' "$f"; git hash-object "$f"; done
  } | git hash-object --stdin
)
EMPTY=$(printf '' | git hash-object --stdin)
[ "$FINGERPRINT" = "$EMPTY" ] && exit 0   # no source changes: nothing to check

STAMP="${TMPDIR:-/tmp}/checkpoint-pnpm-check-$SESSION"
# Same changes already passed: skip the slow re-run.
[ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$FINGERPRINT" ] && exit 0

if OUTPUT=$(pnpm check 2>&1); then
  printf '%s' "$FINGERPRINT" > "$STAMP"
  exit 0
fi

echo "pnpm check failed. Fix the cause before finishing (last 40 lines):" >&2
printf '%s\n' "$OUTPUT" | tail -n 40 >&2
exit 2
