---
type: Reference
title: "consolidate — conflicts"
description: "The resolve-vs-escalate rules for Step 3.6, read whenever two sources disagree on fact, staleness, vocabulary, owner intent, or interpretation. Companion to the consolidate skill."
tags: [consolidate, skills, conflicts]
timestamp: 2026-09-10T00:00:00Z
---

# consolidate — Step 3.6: conflicts (resolve what you can, escalate what you cannot)

**Resolve yourself, and say what you did:**

- **Fact vs fact** → reality arbitrates. Query the live DB, read the live code, check the deployed
  state. The doc that loses is corrected with the evidence in its changelog.
- **Stale vs current at equal provenance** → the verified-against-reality one wins.
- **Vocabulary drift** → [`/systems/platform/vocabulary/FEATURE.md`](/systems/platform/vocabulary/FEATURE.md) wins, always.
- **An owner doc's claim about BUILD STATE being out of date** → correct the build state; his
  intent is untouched. His docs go stale on facts like any other; they never go stale on intent.

🚨 **Escalate, and do NOT resolve:**

- **An owner document vs the code.** THE CODE IS THE DEFECT — never "fix" his doc to match what got
  built, and never record the code's behavior as the design. Write both readings into `DECISIONS.md`
  as an open conflict, file the attention-board row, and leave his document untouched.
- **Owner doc vs owner doc** — two of his statements that genuinely disagree. Never resolved by an
  agent, ever.
- **An agent doc that contradicts an owner doc and matches the code.** This is the disease named in SKILL.md Step 3.5,
  not evidence. The agent doc is deleted or corrected; what it justified goes on the board.
- **Interpretation vs interpretation** — nobody disputes the measurements, two docs read them
  differently. Record both readings, decide neither.

**The escalation must be one he can act on cold** — a row on
[`operations/attention.md`](/operations/attention.md), guided-session shaped: plain-language
background in two or three sentences with no jargon or doc numbering, **a clickable path to the
document**, the two readings side by side, **the concrete consequence of each**, and your
recommendation. A question he cannot answer from what you gave him is a defect in your question,
not a hard question. Batch them; never page him one at a time.
