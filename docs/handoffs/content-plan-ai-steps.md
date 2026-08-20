---
status: active
updated: 2026-08-20
repos: [matrx-frontend, aidream]
scope: feature
feature: Content Planning
vision:
  - /Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md
  - /Users/armanisadeghi/code/common-docs/systems/content-planning/FEATURE.md
---

# Content Planning — an AI at every step, grounded in the resources we already have

**What this is:** the `plan` schema and the surfaces over it — the plan tree, briefs, the Setup AI
steps, and the per-page pipeline artifacts that turn a site idea into an ordered work order.
**Scope:** Feature
**Feature:** Content Planning
**Vision:** [Content Engine STATE §2.8](/Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md) — Arman's words on AI at every step, verbatim.

("Content Plan AI Steps" was a slice name and is retired. This doc is the whole feature.)

🚨 **READ THE CLUSTER DOC FIRST:
[`common-docs/projects/content-engine/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md)** — merged
vision, verified state, question ledger, and this feature's pending list in pipeline context.

Sibling: the per-page build pipeline is [website-factory-vision.md](./website-factory-vision.md);
the CMS half is [cms-page-hub.md](./cms-page-hub.md). **This doc owns one thing they don't: the
Setup AI steps and their grounding in resources we already have.**

## Remaining work

Full detail, with file paths and evidence, in **STATE.md §4.2**. In priority order:

1. **Generalize the grounding strip beyond research** — competitor URLs, pasted content, free-text
   guidance. None persist in `setup/draft.ts`; `reference_material` has zero hits in either repo.
2. **Names + information, not names alone.** *Narrower than long assumed:* the Family Namer agent
   already emits `{label, reason}` and the coercer already parses it. The gap is **persistence** —
   `namesByArchetype` is `string[]` and `readNameMap` rejects non-strings — plus
   `required_output_keys` in `aidream/services/mandates/client_mandates.py`.
3. **Web-search fallback grounding** for the "no research, no website" case. Both agents currently
   have empty `tools`. See STATE.md ledger Q9 first.
4. **Harden the quick-research chain** — `useCompanyQuickResearch` drains the stream in-tab; leaving
   mid-run strands Document assembly. Copy `useSiteCommandRun`.
5. **Reviewer output contract** — `REVIEWER_OUTPUT_CONTRACT` still rides every call. Fix the stored
   prompt at source, then delete the constant; never keep both.
6. **Deepen has no per-run research picker** — the deepen route takes no request body at all.
7. **Re-review after research changes** — "what changed in the research since we planned?"
8. **Platform gap:** `ManagedAgentOptions` cannot carry launch-time resources. Belongs to the
   execution-system owners.
9. **The AI coercers are untested** — 14 test files now exist, but `setup/ai.ts` coercers,
   `keyword-strategy.ts`, `entity-attach.ts` and `proposals.ts` are uncovered. The coercers are the
   one thing between a drifting agent schema and the database.
10. **Page workspace Studio parity** ([marketing-page-workspace-evolution.md](./marketing-page-workspace-evolution.md)) —
    nine Plan lanes still save through notes; plus deriving plan-node status from live CMS reality
    (today a push-time stamp, which violates Arman's TRUE CURRENT status law) and attachment-sharing
    batch modes.
11. **Two dormant purpose-built agents** — Keyword Binder `8ffb091c`, Brief Writer `f9789816`: live,
    0 mandates, 0 runtime references. **Never delete on your own authority** (unfinished-work
    alarm). STATE.md ledger Q7.

## Resources

- **Feature truth:** `features/marketing/content-plan/FEATURE.md` (client) ·
  `aidream/services/content_plan/FEATURE.md` (server). Read both before touching this.
- **The AI runner:** `features/marketing/content-plan/setup/ai.ts` — mandate constants, coercion,
  variable builders, `useSetupAgents`; runs through `useLiveAgentRun` into `<LiveRunDisplay>`.
- **Mandates:** all 12 `content_plan.*` rows are enabled with a bound `default_agent_id` (verified
  live 2026-08-20). Resolution is `resolveMandate`; an unseeded/disabled mandate THROWS and never
  falls back. Server declarations: `aidream/services/mandates/client_mandates.py` (**not**
  `client_slots.py` — that file no longer exists). **Never a raw UUID in a component.**
- **Where each agent RUNS is split.** Server-run: keyword strategist, entity attacher, plan
  reviewer (`setup_agents.py`), brief writer (`brief_writer.py`). Client-run: shape planner, family
  namer, entity curator.
- **Proposals are persisted, not held in memory** — `web.site.settings.content_plan.<kind>_proposal`.
- **Grounding exemplar:** `features/research/resources/` + `ContextBuilder.tsx`. Do NOT copy the
  image-studio create→addResource→execute workaround (tagged KNOWN ANTI-PATTERN).
- **Skills:** `matrx-agents`, `agent-execution-redux`, `surface-authoring`, `core-route-headers`,
  `ios-mobile-first`, `agent-review-queue`, `handoffs`.
- **Test route:** `/marketing/content-plan` → site → `?view=setup`. Topics with live reports:
  `62465c78` (All Green), `36806c3f` (PBW Law), `b4c47842` (Nazarian), `08ec80da` (PRP).

## Done

- Seven mandate-bound step agents; server-run agents with durable proposals; live streaming
  everywhere; site↔research link; bulk deepen; topic promotion; page-template library seeded as an
  option; the mobile + headings class fix; downstream readers for `planned_topics` /
  `keyword_strategy`. One line each with code pointers in **STATE.md §3**; detail in the two
  `FEATURE.md` files.
