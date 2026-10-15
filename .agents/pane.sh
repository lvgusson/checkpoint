#!/usr/bin/env bash
# The orchestrator's only way to touch the agent panes. No quoting: prompts travel through a file.
#   pane.sh send <pane> <promptfile>   paste the file into the pane and press Enter
#   pane.sh read <pane> [lines]        print the pane's last lines (default 300)
#   pane.sh wait <pane> <agent> [sec]  poll until the pane prints "ORCH-DONE <agent>" (default 900s)
# <pane> is 1 (codex), 2 (claude) or 3 (agy). Session: $SESSION (default orch).
set -euo pipefail

SESSION="${SESSION:-orch}"
cmd="${1:?usage: pane.sh send|read|wait ...}"
pane="${2:?pane number required}"
target="$SESSION:0.$pane"

case "$cmd" in
  send)
    file="${3:?prompt file required}"
    [ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }
    tmux load-buffer -b "orch$pane" "$file"
    tmux paste-buffer -p -b "orch$pane" -d -t "$target"
    sleep 0.5
    tmux send-keys -t "$target" Enter
    ;;
  read)
    tmux capture-pane -p -J -S "-${3:-300}" -t "$target"
    ;;
  wait)
    agent="${3:?agent name required}"
    deadline=$((SECONDS + ${4:-900}))
    # The agent's own echo of the prompt also contains the sentinel text, so require it at line start.
    while [ "$SECONDS" -lt "$deadline" ]; do
      if tmux capture-pane -p -J -S -300 -t "$target" | grep -qE "^[[:space:]•⏺●>-]*ORCH-DONE $agent[[:space:]]*\$"; then
        echo "done: $agent"; exit 0
      fi
      sleep 5
    done
    echo "timeout waiting for $agent" >&2; exit 2
    ;;
  *) echo "unknown command: $cmd" >&2; exit 1 ;;
esac
