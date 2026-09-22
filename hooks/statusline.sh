#!/bin/bash
# Claude Code statusline: model | current task | directory | context usage.
# Also relays .context_window.used_percentage (verbatim, no math) to a
# per-session state file that hooks/context-handoff-stop.js reads.

input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
dir=$(echo "$input" | jq -r '.workspace.current_dir')
session=$(echo "$input" | jq -r '.session_id // empty')
used_raw=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# Sanity guard: null, missing, non-numeric, or >100 -> 0 (the Stop hook treats
# 0 as "no data" and never triggers). Never compute from token totals here.
used_pct=0
have_ctx=0
if [[ "$used_raw" =~ ^[0-9]+(\.[0-9]+)?$ ]] && awk "BEGIN{exit !($used_raw <= 100)}"; then
    used_pct="$used_raw"
    have_ctx=1
fi

# Relay: write the value verbatim for the context-handoff Stop hook.
if [ -n "$session" ]; then
    mkdir -p "$HOME/.claude/state" 2>/dev/null
    printf '%s' "$used_pct" > "$HOME/.claude/state/context-pct-${session}.txt" 2>/dev/null
fi

# Context window display (shows USED percentage)
ctx=""
if [ "$have_ctx" -eq 1 ]; then
    used=$(printf "%.0f" "$used_pct")

    # Build progress bar (10 segments) - fills as context is consumed
    filled=$((used / 10))
    bar=""
    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=filled; i<10; i++)); do bar+="░"; done

    # Color based on usage with blinking skull at 80%+
    if [ "$used" -lt 50 ]; then
        ctx=$' \033[32m'"$bar $used%"$'\033[0m'
    elif [ "$used" -lt 65 ]; then
        ctx=$' \033[33m'"$bar $used%"$'\033[0m'
    elif [ "$used" -lt 80 ]; then
        ctx=$' \033[38;5;208m'"$bar $used%"$'\033[0m'
    else
        # Blinking red with skull
        ctx=$' \033[5;31m💀 '"$bar $used%"$'\033[0m'
    fi
fi

# Current task from todos
task=""
todo=$(ls -t "$HOME/.claude/todos/${session}"-agent-*.json 2>/dev/null | head -1)
if [[ -f "$todo" ]]; then
    task=$(jq -r '.[] | select(.status=="in_progress") | .activeForm' "$todo" 2>/dev/null | head -1)
fi

# Output
dirname=$(basename "$dir")
if [[ -n "$task" ]]; then
    printf '\033[2m%s\033[0m │ \033[1m%s\033[0m │ \033[2m%s\033[0m%s' "$model" "$task" "$dirname" "$ctx"
else
    printf '\033[2m%s\033[0m │ \033[2m%s\033[0m%s' "$model" "$dirname" "$ctx"
fi
