---
type: Reference
title: "agent-efficiency-loop — launch prompt"
description: "The prompt the owner pastes to start an efficiency loop on any agent or automated process. Fill the four blanks; everything else is the method."
tags: [agents, efficiency, launch-prompt]
timestamp: 2026-09-12T00:00:00Z
---

# agent-efficiency-loop — launch prompt

Paste the block below. Fill the four `[...]` blanks; leave the rest exactly as written.

```
Read the `agent-efficiency-loop` skill and its companions first, then the shared lessons register
it points at. You own this loop end to end — plan, run, fix, verify, record — and you use
subagents for discovery and bounded work (Sonnet for reading and censuses, Opus for code); you
never hand work back to me.

SUBJECT: [the agent, sandbox flow, job, or process — name it the way the platform names it]
UNIT OF WORK: [what one run is — one provider, one sandbox task, one document, one customer]
WHAT GOOD LOOKS LIKE: [the outcome a clean run produces, in one or two sentences]
WHAT I HAVE SEEN: [what is inefficient or wrong today, in my words — even if vague]

Do this:
1. Baseline the last runs from the ledger (cost, calls, errors, stuck rows, outcome) and show me
   the table before you change anything.
2. Check the agent is on the best current model for its job and that its instructions end every
   run with a report of what was efficient, what was not, which tools worked, which did not. Fix
   both if not.
3. Run ONE unit yourself. Read the agent's report AND its tool calls. Find every wasted or wrong
   call and fix the class in the layer that owns it (tool, prompt, model, or a missing platform
   primitive) with a guard. Commit and push each fix.
4. Rerun on a DIFFERENT unit. Repeat until a run is boringly clean by the skill's definition.
5. After every round append what you learned to the shared lessons register, and put
   subject-specific lore on the subject's own data row, never in the prompt.
6. When you can guarantee it, give me the guarantee report from the skill and recommend (or
   refuse) automation. Until then, automation stays off.

Rules that stay in force: never ask me to run, rerun, release, or fetch anything; a missing
permission is stated once and you keep going; one question per message and only when my answer
changes what you build; talk to me in plain sentences with a small table of numbers and end every
message with a pending list.
```

## Why the blanks are the only inputs

The method is the same for a model-catalog sync, a sandbox coding session, a document distiller, or
a scraper. What changes is the subject, the unit, the bar, and the owner's observation — the four
blanks. Everything the last loop learned is in the register the skill points at, so a fresh agent
starts where the previous one stopped.

## Example (the loop that produced this skill)

```
SUBJECT: the AI Model Config Sync agent
UNIT OF WORK: one provider (OpenAI, Anthropic, Together, …)
WHAT GOOD LOOKS LIKE: every model the provider's API lists is in the catalog with verified
pricing; models the provider dropped are hidden; nothing duplicated; the run costs under a dollar
WHAT I HAVE SEEN: it re-fetches things it already read, breaks on tool errors, and the summarize
option returns nothing
```
