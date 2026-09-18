# VERIFIER-G — zero-authorship verification brief for Lane G

Lane: `quick` (model `claude-sonnet-5`). You did not write any of this. Your job is to return
what is MISSING or WRONG against the vision and the plan — never to confirm the builder's
summary. Do not read the builder's report; read the sources below and the code.

## Read first (in this order)

1. `common-docs/inbox/topical-map-app-requirements.md` §2.5 (proposals: "Proposed topics look
   different from real ones. Rejecting removes from the map but never loses: a history control
   lists every proposal — pending, accepted, rejected — with who, when, why. Accept all / reject
   all / one by one, switchable (`proposal_review_mode`; default one by one)") and §0.4
   (every out-link opens a window where one exists).
2. `common-docs/projects/table-provisioning/TOPICAL-MAP-UI-PLAN.md` §6 "G — Proposals, history,
   chat and canvas, the map window" and rulings R11, R12, R13 in §3.
3. `features/marketing/seo/topical-map/CONTRACTS.md` §1 (body contract), §4 (TopicTree, ReviewDeck),
   §5 (the RESERVED window id `topicalMapWindow`), §6 (mandate keys amendment).
4. Arman's words in the register: "your feature must fully integrate with chat as well and will
   require a canvas surface that renders in chat" and "the window panel is the most important one
   as it allows the feature to be added ANYWHERE in the system".
5. `CLAUDE.md` — the three streaming laws (ONE component per shape), the window-panel-wraps-the-
   canonical-component law, the destructive-click law, the door law.

## What Lane G claims to have delivered (verify each; find what it does not say)

- `views/HistoryView.tsx` — proposals deck on top when any topic is proposed; the
  `list_map_history` list with status / who / since filters; Restore (rejected → proposed,
  retired → active) via `patch_map_topics`; attachments shown; `changed_by_tier` printed as
  recorded; "Open as window" on the page host.
- `proposals/ProposalReview.tsx` — `ReviewDeck` in `proposal_review_mode`, reject policy picker
  (`error | reject | parent | merge_into:<slug>`, merge target from `search_map_topics`, live topics
  only), accept via `patch_map_topics` status → active, refusal shows the RPC sentence.
- `proposals/useOpenProposalReview.ts` — the route-less door = the map window on `history`.
- `proposals/MapTopicProposalView.tsx` — THE ONE component for `map_topic_proposal_v1`, an adapter
  over `TopicTree`; accept/reject only with a map id; doors to canvas / window / page / agent.
- `features/content-ir/kinds/map-topic-proposal.ts` + `SYSTEM_KIND_DEFINITIONS` +
  `SHAPE_BLOCK_DISPATCH.map_topic_proposal` + `BlockComponentRegistry.MapTopicProposalBlock`.
- `features/tool-call-visualization/renderers/topical-map/*` + registry entry `topical_map`
  (chrome card; tree/get/outline through TopicTree; every other action's payload shown).
- Canvas pointer `topical_map` (`canvasSlice`, NON_PERSISTABLE, `CanvasBody` case,
  `canvas/TopicalMapCanvasBody.tsx`, `canvas/topicalMapCanvasContent.ts`, tool-result canvas reader).
- The window: `features/window-panels/windows/marketing/TopicalMapWindow.tsx`, catalogue
  `topicalMapWindow`, metadata slug `topical-map-window` (`urlSync: topical_map`, preservation),
  controller block, opener `features/overlays/openers/topicalMapWindow.tsx`, Tools-grid tile
  (Content → Topical map), hydrator `topical_map`.
- Manifest `agentRoles` `map_curation` → `seo.map_curation` (`mandateKeys.ts` + allowlist row).

## Recorded data you can trust

`features/marketing/seo/topical-map/proposals/__fixtures__/factoryPlaygroundRecorded.ts` — the
live `seo.map_tree` (52 proposed topics) and the first `list_map_history` page of Factory
Playground, read 2026-09-18 as admin@admin.com. The proposal-kind fixture
(`mapTopicProposalDocumented.ts`) is NOT recorded (no author run was available); it was checked
against the live `content_ir.kind_definition` rows. Say so in your report if you rely on it.

## What to do

1. Static: read every file above. For each of the laws in item 5, name a concrete violation or
   state you looked and found none. Specifically attack: (a) a second renderer for the proposal
   shape anywhere (grep `proposalAsTopicTree`, `map_topic_proposal`); (b) a hand-rolled tree
   outside `TopicTree`; (c) `__kind` stripped anywhere on the path (bridge → block → view);
   (d) a destructive click without a consequence sentence; (e) a named record with no door;
   (f) a control that renders disabled-looking instead of absent; (g) a knob replaced by a
   constant; (h) an RPC sentence reworded.
2. Run the gates on a machine with memory: `pnpm type-check` (expect no errors in the files
   above), `pnpm check:parse`, `pnpm check:kind-marker-law`, `pnpm test:render-matrix`,
   `pnpm check:dead-ends`, `pnpm check:agent-disclosure`, `pnpm check:mandate-keys`, and
   `npx jest features/marketing/seo/topical-map/proposals features/marketing/seo/topical-map/views/HistoryView.test.ts features/marketing/seo/topical-map/canvas features/tool-call-visualization/renderers/topical-map features/content-ir/__tests__/kind-map-topic-proposal.test.ts`.
   Paste each result verbatim.
3. Browser: execute `proposals/VERIFY-G.md` end to end on a machine that hosts the app. Every
   step is a pass/fail with a screenshot; one screenshot must show a deliberately failed RPC's own
   sentence. Name the build SHA.
4. Report: terminal current truth first; the list of what is missing against §2.5 / PLAN §6 G
   (not what is present); each gate's verbatim result; what you could not verify and why.
