# Agent Tasks

Active worklist managed by agents. **See `AGENT_INSTRUCTIONS.md` for rules** — especially around task format, condensation, and when to ask the user.

> Quick scan order for arriving agents:
> 1. **Needs Clarification** below (questions waiting on the user)
> 2. **Blocked** (waiting on external)
> 3. **Active** (`ready` and `in-progress`)
> 4. **Completed** (recent context, condensed)

---

## Needs Clarification

_(none)_

## Blocked

_(none)_

## Active

_(none)_

---

## Completed

- **TASK-001** — Agent Handoff + Value Store FE integration (2026-07-12): `is_visible_to_user` filter on every user-facing message read (contract idiom `.eq(true)`; column live-verified NOT NULL, RPC filters server-side); handoff bubble rebind + failed-handoff rewind hardened by adversarial review against the LIVE server event flow (reservation scoping by `parent_refs.conversation_id`, per-call_id oldest-pending rewind anchor, INIT-operation_id handoff gating — pure core in `execution-system/utils/handoff-stream-state.ts`, 12 new tests); value-store/groom cards render stream-time only (`content:null`, persistence leak pinned by test); `promoteMessageId` duplicate-id merge guard; aidream type-generator fixed to emit kind-discriminated events (`e6b121f93`). Commits `88bd55981`, `af1fd5b3e`, `8653e04b8`, `9fc93f6db`, `e611e9e30`, `2561805d2`, `a9931f4f8`. NOT yet driven against a live handoff stream (none available) — first real handoff session should be watched. Two server defects found + filed in aidream's ledger (contained-failure emits no signal; reference mode mints values for failed children).
- **TASK-002** — Definer-grant recurrence guard shipped as Data Integrity check `definer-grant-anon-identity` (all exposed schemas, allowlist-as-data) + the whole console `check:*` family (14 gates) absorbed into `/administration/data-integrity` as on-demand script checks (2026-07-12, `3091e2611` + `9e13b6f7b`). First run found 20 live violations → batch C authored + classified, NOT applied (see D31).
- **TASK-003** — Capability silent-drop killed (2026-07-12, `48f86628f` + `bcf898316` + `674f94901` + `d6cf0e9f6` + `9e7539581`): full live vocabulary (`extraction`/`single`, `entities`, `multilingual`, 18 feature values), screaming parser (values + unknown top-level keys, captureError data-shape), extraction launch refusal on EVERY path (agentId + shortcut branches, toast surfaced), audit-tab Save now merges canonically (parse(save(parse)) lossless on all 5 live extraction rows). Residual: D48 cold-registry bypass (ledgered).
- **TASK-004** — duplicate of D45-mobile, fixed the same day by the autonomous run (see FOUND_DEFECTS Resolved D45-mobile; commits `4bf7958d5`/`e7fae6a95`/`d4011b698`).
