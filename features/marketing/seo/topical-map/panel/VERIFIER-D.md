# VERIFIER-D — standalone brief for the zero-authorship verifier (Sonnet, `quick` lane, model `claude-sonnet-5`)

You did not build the topic panel and you must not read the builder's summary first. Your job is to
return what is MISSING or WRONG against the owner's words, not to confirm what the builder believes.
Repo `/home/user/ai-matrx`, branch `claude/tender-gates-5qcxnd`. Do not run `pnpm type-check`,
`check:dead-ends` or `test:render-matrix` (coordinator-owned, once after the merge). Do not create
remote sessions. Supabase MCP reads are allowed; write NOTHING to the database and plant NO rows.

## Read first, in this order

1. The owner's vision, only these parts: `/Users/armanisadeghi/code/common-docs/inbox/topical-map-app-requirements.md`
   §2.3 (the panel), §2.4 (agents live in the map), §0.4 if present (out-links), U3 under §4.
2. The plan's brief for this lane: `/Users/armanisadeghi/code/common-docs/projects/table-provisioning/TOPICAL-MAP-UI-PLAN.md`
   §6 "D — Topic panel body" and rulings R13, R17, R18 in §3.
3. The frozen contracts: `features/marketing/seo/topical-map/CONTRACTS.md` §0, §2, §4.3, §5, §6.
4. The browser walk: `features/marketing/seo/topical-map/panel/VERIFY-D.md`.

Only THEN open the code under `features/marketing/seo/topical-map/panel/**`.

## What to prove (each with evidence: a command and its output, a file:line, or a screenshot)

A. **The generic associations section renders a kind the panel never special-cases, grouped and
   labelled, with no code change.** Do not use the builder's fixture. Compose your OWN row from the
   live function body (`aidream/packages/matrx-seo/matrx_seo/migrations/20260916100000_seo_topical_map_19_page_intents.sql`
   lines 392–447, `seo.map_topic_associations`) for a kind of your choice that is a real
   `platform.entity_types` token (e.g. `rulebook`, `crm_deal`), feed it through the panel in a jest
   test you write beside the builder's (`--maxWorkers=1`), and show the group heading and the row.
   Then read the REAL function once for a real topic as admin@admin.com
   (`set local role authenticated; select set_config('request.jwt.claims','{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}',true); select seo.map_topic_associations('e9df6779-8e0e-45e9-a664-375e7d1ecffd','cable-and-wire-recycling',NULL)::text;`)
   and confirm the builder's recorded fixture `panel/__fixtures__/mapTopicAssociationsRecorded.ts`
   is byte-identical to today's answer (report any drift as a finding, not a failure).
B. **Read-only removes every write control.** Enumerate every write control you can find in the
   code (grep for `readOnly`, `canWrite`, `onClear`, `Detach`, `Make a page`, `Change`, the agent
   buttons) and prove each is ABSENT (not disabled) when `readOnly`. Name any that is merely disabled.
C. **Absent ≠ zero.** Prove counts print nothing when the tree was loaded without `counts`, and
   that no section prints a number it did not receive (`count` props on `PanelSection`).
D. **RPC sentences verbatim.** Find every place a refusal reaches the screen; prove each prints
   `topicalMapErrorText(error)` / the function's message and never rewords. List any catch that
   swallows.
E. **Rehearsal before change.** For each of retire/reject/move/merge/split, show the exact
   `seo.map_dry_run` call (function name + positional args) matches the real wrapper's argument
   order in `data.ts`, and that the write cannot run before a preview.
F. **The topic agent.** Prove: key comes from ONE constant; both doors use `useOpenMandateWindow`
   (never a route link); nothing structured rides `user_input`/`setContextEntries`; the manifest
   `agentRoles` entry exists with `mandateKey: "seo.topic_curation"`; the allowlist rows exist with a
   reason; the controls are honest-disabled with the key named while the mandate is absent
   (`select mandate_key from mandate.definition where mandate_key='seo.topic_curation'` — empty on
   2026-09-18). Run `pnpm check:mandate-keys` and `pnpm check:agent-disclosure` and paste the tail.
G. **Doors (R17).** For every record the panel names (page, planned page, keyword, generic item,
   CMS record, site, parent crumb) say which door it has: Open / new tab / peek / window — and
   which it lacks. A bare id or a dead label is a finding.
H. **Knobs.** Every taste the panel shows comes from `useTopicalMapKnobs`; list any literal colour,
   threshold, mode or window. `performance_window_days` must be the function's own value printed,
   not the knob re-read on the client.
I. **"Make a page here".** The builder ruled that the topical_map tool has no agent-less door and
   wrote the plan node through `createPlanNode` with `topic_id` (`panel/plannedPage.ts`). Judge:
   does the ruling hold (`POST /ai/tools/execute` requires `agent_id`; the tool action itself calls
   the plan's `create_node`)? Does the write respect the plan's insert contract
   (`PlanNodeInsert`, trigger-owned columns absent)? Does the control refuse honestly without a
   site? Report agree/disagree with reasons.
J. **The window and the peek.** `windows/marketing/TopicalMapTopicPanel.tsx` and
   `peek/kinds/SeoMapTopicPeek.tsx` must wrap the SAME `TopicDetailBody` and add nothing bodily.
K. Run `pnpm check:parse` and the lane's jest (`pnpm exec jest features/marketing/seo/topical-map/panel --maxWorkers=1 --no-coverage`); paste tails.

## Report shape

Terminal truth first (one line: what the panel does today). Then, per item A–K: PASS / FAIL /
UNVERIFIED with the evidence. Then "What is missing against the vision" as a numbered list — the
part the builder does not already believe. No summary of the code.
