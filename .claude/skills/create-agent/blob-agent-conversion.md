---
type: Reference
title: "create-agent — blob agent conversion"
description: "The proven seven-step recipe for converting an existing blob-variable agent and its call site to granular variables; read when rescuing a lazily built agent rather than creating a new one. Companion to the create-agent skill."
tags: [create-agent, skills, blob-agent-conversion]
timestamp: 2026-09-10T00:00:00Z
---

# create-agent — rescuing a blob agent (conversion recipe)

1. **Read the call site FIRST.** The Provision declared beside the mandate already names
   the granular offer — that IS your variable list. The census of blob sites lives at
   `aidream/docs/mandates/INPUT_CHANNEL_VIOLATIONS.md`; update the row when you convert.
   (The factory-generated NamedAgent family and its `internal_agents/` spec system were
   DELETED 2026-08-25 — Ruling A executed: mandates + provisions specify agents, the live
   DB row is the sole authority, and it is improved by test-and-tune — exactly this
   skill's step 8 — never regenerated from stored instructions.)
   Stop if the mandate is client-invoked from matrx-frontend and the census for
   it hasn't run — renaming variables would break callers you cannot see from aidream.
2. **Hunt for prompt lies while you're in there.** Blob agents routinely claim inputs
   they never receive (the Selector's prompt promised "Audition results" no call site
   sends) and carry enums out of sync with the code's contract. The prompt must describe
   exactly what arrives; code contracts win on enums and keys.
3. **Update the agent first, then the call site, in the same session.** New agent + old
   code fails LOUD (missing required variables, retried next run); new code + old agent
   fails QUIET (an empty `{{blob}}` and granular values reaching nothing). Loud beats
   quiet — agent first.
4. **Pass raw dicts and lists as separate variables at the call site** — the prompt door
   (`prompt_safe_value`) canonicalizes them, so delete every `json.dumps`. An offered
   value the agent doesn't consume simply stays offered; unused offers are normal.
5. **Don't rewrite what's working.** Delivery is often the whole crime while the system
   prompt is genuinely good (the Coherence Partner's was). Judge each part separately:
   name, description, variables + help text, system prompt, user message, delivery.
6. **Test with trapped scenarios, never happy paths**: a recency/ledger block it must
   honor, a maturity gate, false candidates it must drop, settled memory it must not
   re-raise, and a case where the honest answer is zero/empty. Tune the prompt from what
   real runs show (a leaked id, a jargon slip), then re-run to confirm the fix.
7. **Close the loop**: run the guards (`check_user_input_law.py`) and the owning
   service's tests, update the register row, and commit agent + code changes together.
