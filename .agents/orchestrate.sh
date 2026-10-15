#!/usr/bin/env bash
# Layout + launch only. The orchestrator (the owner's Claude Code session) drives panes 1-3 with
# .agents/pane.sh. Watch everything with: tmux attach -t "$SESSION"
#
# Panes: 0 shell | 1 codex | 2 claude | 3 agy   (all interactive, nothing runs headless)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="${SESSION:-orch}"

command -v tmux >/dev/null || { echo "tmux not found" >&2; exit 1; }
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists; not touching it. Attach: tmux attach -t $SESSION" >&2
  echo "Use another name with: SESSION=other $0" >&2
  exit 1
fi

tmux new-session -d -s "$SESSION" -c "$ROOT" -x 240 -y 60
tmux split-window -t "$SESSION:0" -h -c "$ROOT"
tmux split-window -t "$SESSION:0.0" -v -c "$ROOT"
tmux split-window -t "$SESSION:0.2" -v -c "$ROOT"
tmux select-layout -t "$SESSION:0" tiled
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format ' #{pane_index}: #{pane_title} '

# Ponytail rules load only when a skill is invoked: no automatic injection in these panes.
launch() { # <pane> <title> <command>
  tmux select-pane -t "$SESSION:0.$1" -T "$2"
  tmux send-keys -t "$SESSION:0.$1" "export PONYTAIL_DEFAULT_MODE=off PONYTAIL_MAP=0; $3" Enter
}

# Typed into each pane's interactive shell, so shell aliases and PATH apply.
# Approval modes are the least permissive that do not stall on every edit; if a pane shows an
# approval prompt, the orchestrator reports it instead of approving (see AGENTS.md, "Orchestration").
launch 0 shell 'clear'
launch 1 codex 'codex -a never -s workspace-write'
# Drop this Claude Code session's variables so a nested claude starts as an independent session.
launch 2 claude 'unset $(env | grep -oE "^CLAUDE[A-Z_]*" | tr "\n" " "); claude --permission-mode acceptEdits'
launch 3 agy 'agy --mode accept-edits'

echo "Started '$SESSION' in $ROOT. Watch it with: tmux attach -t $SESSION" >&2
