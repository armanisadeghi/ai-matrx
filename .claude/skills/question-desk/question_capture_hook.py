#!/usr/bin/env python3
"""Claude Code `Stop` hook: record a turn that ended on a question for the owner.

Reads the hook payload on stdin (session_id, cwd, transcript_path,
last_assistant_message), scores the last message with the same detector the
sweep uses, and appends one JSON line to ~/.claude/question-desk/inbox.jsonl
when it reads as a question for the owner. Exit 0 always, no stdout: this hook
NEVER blocks a stop and never re-prompts — capture is its only job.

Install: see setup.md beside this file. Part of the `question-desk` skill.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

CONFIG_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR", str(Path.home() / ".claude")))
INBOX = CONFIG_DIR / "question-desk" / "inbox.jsonl"


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if not isinstance(payload, dict) or payload.get("hook_event_name") not in (None, "Stop"):
        return 0
    text = payload.get("last_assistant_message") or ""
    try:
        from sweep_sessions import question_score
        score, reasons = question_score(text)
    except Exception:
        score, reasons = (3, ["fallback: ends with ?"]) if text.rstrip().endswith("?") else (0, [])
    if score <= 0:
        return 0
    row = {
        "ts": time.time(),
        "session_id": payload.get("session_id", ""),
        "cwd": payload.get("cwd", ""),
        "transcript_path": payload.get("transcript_path", ""),
        "score": score,
        "reasons": reasons,
        "last_msg": text[-4000:],
    }
    try:
        INBOX.parent.mkdir(parents=True, exist_ok=True)
        with INBOX.open("a") as fh:
            fh.write(json.dumps(row) + "\n")
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
