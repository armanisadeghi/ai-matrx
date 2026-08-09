#!/usr/bin/env bash
# install.sh — install the Matrx agent harness on this machine.
#
# Makes any Claude Code / Codex agent on any machine obey the ONE DEV SERVER LAW:
# this repo's Next dev tree is huge, and two concurrent dev servers is a reliable
# hard crash on a 16GB box. The guard is a PreToolUse hook, so it applies to every
# agent in every session without anyone having to remember a rule.
#
#   bash scripts/agent-harness/install.sh          # install / update
#   bash scripts/agent-harness/install.sh --check  # report only, change nothing
#
# Idempotent: safe to re-run after every pull. The repo copy is the source of
# truth — edit scripts/agent-harness/matrx-preview-ports.sh, re-run this, never
# hand-edit the installed copies.

set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SRC_DIR/matrx-preview-ports.sh"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

[ -f "$SRC" ] || { echo "FAIL: missing $SRC" >&2; exit 1; }
bash -n "$SRC" || { echo "FAIL: $SRC has a syntax error" >&2; exit 1; }

status=0

# Merge our two hooks into an agent's settings.json without disturbing anything
# else in it. Matching is by the hook COMMAND containing matrx-preview-ports.sh,
# so re-running updates our entries in place instead of appending duplicates.
merge_settings() {
  local settings="$1" hook_path="$2" label="$3"
  /usr/bin/python3 - "$settings" "$hook_path" "$label" "$CHECK_ONLY" <<'PY'
import json, os, sys
settings, hook, label, check_only = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "1"

data = {}
if os.path.exists(settings):
    try:
        with open(settings) as f:
            data = json.load(f)
    except json.JSONDecodeError:
        print(f"  {label}: SKIPPED — {settings} is not valid JSON; fix it and re-run")
        sys.exit(0)

want = [
    ("PreToolUse", "mcp__Claude_Browser__preview_start", f"{hook} guard",
     "Enforcing single preview server"),
    ("PreToolUse", "Bash", f"{hook} guard-bash", "Enforcing single dev server"),
    ("SessionEnd", None, f"{hook} reap", None),
]

hooks = data.setdefault("hooks", {})
changed = False
for event, matcher, command, msg in want:
    entries = hooks.setdefault(event, [])
    # Our entry = same event + same matcher + a command mentioning our script.
    mine = next(
        (e for e in entries
         if e.get("matcher") == matcher
         and any("matrx-preview-ports.sh" in h.get("command", "") for h in e.get("hooks", []))),
        None,
    )
    inner = {"type": "command", "command": command,
             "timeout": 20 if event == "SessionEnd" else 15}
    if msg:
        inner["statusMessage"] = msg
    entry = {"hooks": [inner]}
    if matcher is not None:
        entry["matcher"] = matcher
    if mine is None:
        entries.append(entry)
        changed = True
    elif mine.get("hooks") != [inner]:
        mine.clear()
        mine.update(entry)
        changed = True

if not changed:
    print(f"  {label}: already current")
elif check_only:
    print(f"  {label}: WOULD UPDATE {settings}")
else:
    os.makedirs(os.path.dirname(settings), exist_ok=True)
    if os.path.exists(settings):
        with open(settings + ".bak", "w") as b:
            json.dump(json.load(open(settings)), b, indent=2)
    with open(settings, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"  {label}: updated {settings}")
PY
}

install_for() {
  local home_dir="$1" label="$2" settings="$3"
  [ -d "$home_dir" ] || { echo "  $label: not installed on this machine, skipping"; return; }
  local dest="$home_dir/hooks/matrx-preview-ports.sh"
  if [ "$CHECK_ONLY" = "1" ]; then
    if [ -f "$dest" ] && cmp -s "$SRC" "$dest"; then
      echo "  $label: script current"
    else
      echo "  $label: script WOULD BE UPDATED ($dest)"
      status=1
    fi
  else
    mkdir -p "$home_dir/hooks"
    cp "$SRC" "$dest"
    chmod +x "$dest"
    echo "  $label: script installed -> $dest"
  fi
  merge_settings "$settings" "$dest" "$label"
}

[ "$CHECK_ONLY" = "1" ] && echo "Matrx agent harness (check only)" || echo "Matrx agent harness"
echo "source: $SRC"
install_for "$HOME/.claude" "claude" "$HOME/.claude/settings.json"
# Codex uses a separate hooks.json rather than settings.json.
install_for "$HOME/.codex" "codex" "$HOME/.codex/hooks.json"

echo
echo "dev servers running right now:"
"$SRC" list-any | sed 's/^/  /' || true
"$SRC" list-any | grep -q . || echo "  (none)"

exit $status
