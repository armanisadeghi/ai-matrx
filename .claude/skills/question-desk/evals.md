---
type: Reference
title: "question-desk — proof record"
description: "What is proven about the desk skill so far (the sweep detector's failing-then-passing self-test and the hook's positive and negative cases) and the live run that still has to happen on Arman's machine. Rerun after any edit."
tags: [skills, evals, question-desk]
timestamp: 2026-09-12T00:00:00Z
---

# question-desk — proof record

**Proven 2026-09-12 (in a cloud sandbox, real Claude Code 2.1.269 transcript shape):**

- `sweep_sessions.py --self-test` was watched **failing** first (the numbered-question pattern
  required the line to END with `?`, so *"1. Should a guest…? Rec: yes."* scored 0) and
  **passing** after the fix. The test asserts: a chat ending on a numbered question is found; a
  chat ending on "everything is complete" is not; a subagent transcript with a question does not
  surface; the title is the first prompt.
- `question_capture_hook.py` appended one inbox line for *"Two options. Which do you prefer?"*
  and none for *"All done and pushed."* against a scratch config dir.
- 2026-09-12 (later): a review bot found that merging the hook inbox forced a session to read as
  still waiting even when the transcript showed the owner had replied. The transcript's verdict
  now wins whenever one was read; the self-test gained the answered-question-plus-stale-inbox-line
  case and was watched failing on the old merge, passing on the fix.
- A live sweep over this sandbox's own transcripts returned no candidates (the only session was
  mid-turn), which is the correct answer.

**Not yet proven — the first live run is the remaining test:**

- The whole desk loop on Arman's machine: sweep over real recent chats, ledger rows filed from
  unfiled questions, one interview round in the prescribed shape, a verbatim answer recorded in a
  `DECISIONS.md`, and one delivery through each path (`SendMessage` to a live chat; the
  non-interactive resume of a closed one; the hand-off sentence when neither works).
- The hook install from `setup.md` on a real `~/.claude/settings.json`.

The first agent to run `/question-desk` for real records the outcome here: counts, which
delivery paths worked, and any question the shape failed to make answerable.
