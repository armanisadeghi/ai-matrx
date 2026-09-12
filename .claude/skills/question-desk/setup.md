---
type: Guide
title: "question-desk — one-time setup on Arman's machine (the capture hook)"
description: "How to install the Stop hook that records every local Claude Code turn ending on a question for Arman, so the desk's sweep is exact instead of a transcript scan. Read only when `sweep_sessions.py` reports no hook inbox."
tags: [skills, question-desk, hooks, setup]
timestamp: 2026-09-12T00:00:00Z
---

# question-desk — the capture hook (one-time install)

The sweep works without this (it scans transcripts and asks the CLI for its session list), but
the hook makes capture exact and cheap: Claude Code hands a `Stop` hook the session id, the
working directory, the transcript path and the last assistant message, and the hook appends one
line to `~/.claude/question-desk/inbox.jsonl` when that message reads as a question for the
owner. It never blocks a stop and never re-prompts.

**Where the scripts are.** This skill's directory is synced into every repo's `.claude/skills/`
and into the workspace root's `.claude/skills/question-desk/`. Use the workspace-root copy so
the path is stable no matter which repo a session started in:
`/Users/armanisadeghi/code/.claude/skills/question-desk/question_capture_hook.py`.

**Install** — add to `~/.claude/settings.json` (user scope, so every project gets it):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 /Users/armanisadeghi/code/.claude/skills/question-desk/question_capture_hook.py"
          }
        ]
      }
    ]
  }
}
```

If a `Stop` array already exists, append the entry to it — never replace another hook.

**Verify** (the guard proves itself):

```bash
echo '{"hook_event_name":"Stop","session_id":"test","cwd":"/tmp","transcript_path":"/tmp/t.jsonl","last_assistant_message":"Which of the two do you want?"}' \
  | python3 /Users/armanisadeghi/code/.claude/skills/question-desk/question_capture_hook.py
tail -1 ~/.claude/question-desk/inbox.jsonl      # one line, session_id "test"
python3 /Users/armanisadeghi/code/.claude/skills/question-desk/sweep_sessions.py --self-test
```

Then delete the `"session_id": "test"` line from the inbox. Hook settings are read at session
start: sessions already open before the install will not capture until restarted.

**Who installs it.** An agent on Arman's machine with write access to `~/.claude/settings.json`
does this itself — it is a reversible file edit, not a human step. Report it done with the
verify output; never ask him to paste JSON.
