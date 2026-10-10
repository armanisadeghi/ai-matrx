---
type: Reference
title: "create-agent — the factory route for our own coding agents"
description: "How a coding agent gets a platform agent built through the Agent Factory: write the mandate, gather 3 real inputs, start the build with an idempotency key, poll build_status, handle each outcome. Companion to the create-agent skill; read before any agent_author create."
tags: [create-agent, skills, agent-factory, coding-agents]
timestamp: 2026-10-09T00:00:00Z
---

# create-agent — the factory route (our coding agents; read before step 6)

Our own agents are held tougher than people, because an agent
that lacks the data now will not have it later. The server enforces it: with knob
`agent_factory.proof_policy_agents` = `require_samples` (the default), a build started from the
`agent_author` / Agent Service / people-MCP `agents` / custom-action doors with fewer than 3 usable
real examples is **refused before anything is spent**, and the refusal names what to send. There is
no "build unproven" for an agent caller. (If an `agent_author create` instead returns an `agent_id`
at once, that organization's door knob is still `legacy`: today's builder ran, nothing was proven,
say so in your report.)

## 1. Write the mandate (the contract; no prompt-writing)

Per [agents-never-author-agents](/policies/agents-never-author-agents.md) you state WHAT, never HOW:
- **Provision** — each input the agent may receive, required or optional, and what it does when an
  optional one is missing (run [agent-provision](/skills/agent-provision/SKILL.md) first).
- **Output** — the exact deliverable (a kind/shape, or the person's words in `output_format`).
- **Goal** — what the work is for and what DONE looks like.

These map onto `agent_author create` as `goals`, `variables` (with teaching help text) and
`output_format` / `output_schema`. The factory's own writers produce the prompt; you do not.

## 2. Gather at least 3 REAL inputs BEFORE you call create

Real = taken from real runs, chats, records, files or pages of the job. Never invented, never
paraphrased into tidier ones, never placeholders (the no-fake-data rule). Where to look: the
mandate's recent runs, the conversations that prompted the need, the table or page the agent will
read. If you cannot find 3, stop and report which input is missing and where it would come from
(`NEEDS_CONTEXT`); do not build.

Each example carries at least one of the agent's variables and shares no distinctive 6-word run with
your goal text (a proof case's own text in the description is caught as a leak and refused).
Send them in `sample_inputs` as a JSON string:
`[{"listing_text": "<real value>"}, {"listing_text": "<real value>"}, {"listing_text": "<real value>"}]`
(a conversational agent: a JSON array of 3 real typed requests as strings).

## 3. Start the build with an idempotency key

`agent_author action=create` (or `create_structured`) with `idempotency_key` set to a stable string
for THIS job (`<repo-or-task>-<agent-name>-<date>`). Retrying with the same key rejoins the build; a
different key starts a second, paid one. Save the returned `build_id`, `idempotency_key` and
`build_url`. Never call `update` on the agent to "improve" it while its build runs.

## 4. Poll, then handle the outcome

`agent_author action=build_status build_id=…` about every 30 s. Only `agent_kept: true` means an
agent exists. Then:

| Outcome | What it means | You do |
|---|---|---|
| `passed` (`agent_kept`) | Proven on your examples | Record `agent_id` + pinned `version_id`; run it once yourself on a real input; report. |
| `saved_unproven` | Cannot occur for you | Treat as a defect; report. |
| `no_proof_inputs`, `unproven` (floor/leak) | Examples too few, too alike, or leaking into the instructions | Fix the named cause (more varied real inputs, remove example text from `goals`), retry with a NEW key. |
| `send_backs_exhausted`, `judge_not_blind` | Draft never beat the bar | Today's agent (if any) is untouched. Read `reason`; tighten the mandate (goal/output), never hand-edit the prompt. One retry with a new key; a second failure goes to the owner. |
| `needs_new_kind` | No registered shape fits the output | Start a [data-to-kinds](/skills/data-to-kinds/SKILL.md) proposal for the shape (kind-registration.md), then retry the build. |
| `workflow_sized` | The job is a workflow, not an agent | Report to the owner; do not shrink the job to fit. |
| `worker_lost` | Build stopped mid-way | Call create again with the SAME key to resume. |

A refused build on an existing agent (rebuild) leaves today's version live: say so; never
describe it as replaced.

## 5. Report

Cite: the mandate (provision/output/goal), where each of the 3 inputs came from, the idempotency
key, `build_id` and `build_url`, the outcome, and `agent_id` + `version_id` when kept.
