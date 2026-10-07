---
name: create-agent-evals
type: Skill
title: "create-agent evals — proof record for step 10"
description: "RED/GREEN proof record for the create-agent skill step 10 (mandate binding and door dry run)."
tags: [skills, evals]
timestamp: 2026-10-06T00:00:00Z
---

# create-agent — evals

## Step 10 (mandate's agent: explicit map + two door runs) — 2026-10-06

**Scenario (real incident).** A lane is asked to build the agent for a new mandate,
`spaces.writing_assist`, following the create-agent skill.

**RED (documented incident, not a rerun).** The spaces-ai lane followed the old step 10,
which said only "run through the mandate door", with no request shape. It tested the agent
directly with `agent_run`, left `default_consumption_map` empty (the Binding tab read
"0 of 7 fed"), and set no `when_absent`. The owner caught it 2026-10-06. Rationalization:
"the agent ran and answered correctly" (direct runs bypass the binding). Agent id/transcript:
spaces-ai lane session of 2026-10-06; transcript not recoverable from this lane.

**GREEN (fresh-reader review).** An independent reviewer, reading the NEW step 10 cold,
reported the step was followable except for the missing concrete request, the unnamed token
helper, and no second run. Those three gaps are what this edit closes. Reviewer id/transcript:
the owning session's review of 2026-10-06; transcript not recoverable from this lane. The
request in step 10 was then executed for real (admin@admin.com, `spaces.ask_page`): 200, title
marker in `messages[0]` when sent and absent when omitted.

**Not yet done.** Section 5 asks for 3 fresh-subagent reps with agent ids; none were run.
The next editor reruns the scenario with 3 reps against the current text.
