---
type: Reference
title: "create-agent — kind registration"
description: "How to create and register an agent's output kind and component through the kind-builder agents, their run mechanics, and the component bar; read at step 5 when the agent emits content-IR kinds. Companion to the create-agent skill."
tags: [create-agent, skills, content-ir-kinds]
timestamp: 2026-09-10T00:00:00Z
---

# create-agent — kind registration (step 5, kind-emitting agents only)

- Via MCP: run the kind-builder agents with `agent_run` — **`kind_architect`**
  (`9d484ce1-1e2b-4db7-8469-d3ba8550cdd8`, admin one-shot: `kind_create` composes the
  nested child kinds from ONE `__kind`-marked sample, then component + skill + content
  blocks + `kind_activate`). It is **variable-driven**: pass
  `variables={"user_data_sample": <the __kind JSON sample, nested>, "task_brief": <slug,
  label, what the component must do, which lists stream>}`. **`kind_creator`**
  (`4f4ffd49-db15-4a2e-b9fe-341ffafc1323`) is the conversational guided loop — drive it
  with `user_message`. Check `get_agent` before driving either; the shape can change.
- **Two mechanics observed 2026-08-23 (flashcards wave):** (a) `agent_run` on Kind Architect
  ALWAYS exceeds the MCP call timeout — the run keeps going server-side, so treat it as
  fire-and-track: check `content_ir.kind_definition` (or `conversations search <slug>`) a
  couple of minutes later instead of re-firing (a re-fire mints duplicates). (b) Kind
  Architect writes kinds under the CALLER's org as `visibility=internal`; a **platform** kind
  (anything a mandate declares as `output_kind`) must then be promoted to the system org
  `39c38960-d30c-4840-b0c1-c9960de95582` + `visibility=public` — definition, components,
  examples, edges — or learners outside your org get the generic renderer. Feedback
  `91bd0093` asks for a `scope`/`kind_promote` fix; until then, promote by hand.
- Component bar: dense (minimal padding, no wasted space), mobile-friendly, interactive
  where the data invites it (drag-and-drop, sort, edit, add/remove for lists), one-click
  copy per section plus compact whole-result copy affordances (JSON / MD / CSV / TXT /
  XML-for-AI), and **streaming-first — a requirement, not a feature**: the value arrives
  progressively during the LLM stream, so the component ships its own brief skeleton that
  mimics the finished layout (never the generic fallback, never spinner-until-complete),
  renders each list item the moment it parses, lets prose grow as it streams, and reveals
  structured details in chunks. A component that waits for the complete object is broken
  by definition. Expect to iterate with the builder agent several times — first output is
  never the final component.
