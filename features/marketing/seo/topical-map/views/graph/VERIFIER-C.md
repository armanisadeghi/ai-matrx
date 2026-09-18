# VERIFIER-C — zero-authorship verification brief for the Graph view (Lane C)

LANE: quick/standard, model `claude-sonnet-5`, medium effort. The coordinator dispatches this
in-process. You did NOT write any of this code and you must not read the builder's report,
commit message or file list before forming your own view. You are judging a drawing against
Arman's vision, not a diff against a plan.

## What Arman asked for (his words are the bar)

Vision §2.2 (`common-docs/inbox/topical-map-app-requirements.md`): *"Representation is chosen
by how many topics are visible, not zoom factor alone. Coding agents design for fifteen nodes
and let it collapse at forty (tiny, overlapping text) and a hundred (text gone, meaningless
boxes). Bands are settings: `graph_band_card_max` 15, `graph_band_compact_max` 40,
`graph_band_line_max` 200: cards → compact rows → line drawing where shapes and colors carry
meaning → shapes only, labels on hover/selection. Clicking a branch re-frames on it and
re-selects the band for its size. What shapes and colors mean is a legend the user can change
(`graph_encoding`…; intent view overrides fill, see 2.7). Use whatever xy-flow provides for
zoom-dependent rendering; the failure mode above is the acceptance test."*
Vision §2.7: the graph shows pages *"in place / leaving / arriving / to delete / missing (should
exist, doesn't) / planned (exists on paper, not live)"* in colours.
Arman 2026-08-20 (content plan): *"every page a real rectangular card whose TITLE IS READABLE"*
— wraps, never truncated.
PLAN §6 C (`common-docs/projects/table-provisioning/TOPICAL-MAP-UI-PLAN.md`): bands by VISIBLE
TOPIC count; facet values a separate clustered axis capped with "+N more" (255 region values on
All Green); the synthetic `all` node handled; facet positions computed never persisted; topic
positions saved on drag via `useSetMapTopicLayout`; zoom also hides labels; legend from
`graph_encoding`; click re-frames + re-bands + selects + opens the panel; regroup = `setGroupBy`;
auto-layout when `graph_auto_layout`; minimap/fit/zoom; `readOnly` disables drag-save.
Champion: Miro/FigJam (zoom bands) + Semrush/Surfer topical maps (function). Parity is the floor.

## Where the code is (find it yourself; do not take the builder's word for what it does)
`features/marketing/seo/topical-map/views/GraphView.tsx`, `views/GraphViewImpl.tsx`,
`views/graph/**` on branch `claude/tender-gates-5qcxnd`. Data: `useMapGraph` in `hooks.ts`;
the function body is `seo.map_graph` in
`aidream/packages/matrx-seo/matrx_seo/migrations/20260915230000_seo_topical_map_17_null_guards_and_edge_payloads.sql`.

## Prove, do not read
1. **The bands, from the knobs, with real shapes.** Build the visible-topic set for 15 / 40 /
   200 topics. Preferred: a Supabase MCP READ of `seo.map_graph('e9df6779-8e0e-45e9-a664-375e7d1ecffd', null, null)` (All Green, 50 topics) and of Factory Playground
   `ff2010ec-f53d-4d8b-81d9-094c4ca73397` (52 proposed) — record the JSON, then drive the lane's
   pure functions (`bandFor`, `visibleTopicIds`, `buildFacetAxis`, `layoutTopics`,
   `resolveEncoding`, `dominantToneOf`) with THOSE bytes in a throwaway jest file under
   `views/graph/` that you delete before reporting. If the MCP is unavailable, say so and use the
   lane's `__fixtures__/mapGraph.ts` — but state that it is DERIVED, not recorded, and that your
   band proof is therefore against the function's text, not its output. Assert: 15 → card,
   16 → compact, 40 → compact, 41 → line, 200 → line, 201 → shape with defaults; and with knobs
   {5, 10, 20} the cut points MOVE (a test that passes with both knob sets proves the thresholds
   are constants — that is a FAIL).
2. **Focus re-bands.** Pick a root on All Green with ≤14 descendants; `visibleTopicIds` must
   return exactly root + descendants; `bandFor` on that count must be `card`.
3. **The facet axis at 255.** With `group_by='region'` (or the fixture's grouped world): values
   with edges first, `all` first when it has edges, the rest behind "+N more" with the exact
   remainder; facet positions are not written anywhere (grep the lane for `layout` writes — the
   ONLY write is `useSetMapTopicLayout` in `onNodeDragStop`, and only for `type === "topic"`).
4. **Encoding.** `resolveEncoding` with the live default; with `size: "bogus"` — an honest
   legend line and `captureError` called (mock it), never a blank.
5. **Convergence.** Using the RECORDED round-22 fixture the repo already has
   (`redux/__fixtures__/listPageIntentsRound22.ts` — recorded from the live database, not
   written), feed its items through the lane's `ConvergenceRow` builder and assert the six
   tones: a topic covered by an in-place page → `in_place`; the mover's old topic → `leaving`;
   the arriver's destination → `arriving`; a topic with 0 pages and >0 planned → `planned`;
   0 / 0 → `missing`.
6. **Light/dark and Tailwind 4.** Grep the lane for `bg-opacity`, `text-opacity`,
   `border-opacity`, `bg-white`, `text-black`, hex colours, `h-screen`. Any hit is a finding.
7. **The one dynamic edge.** `grep -rn "next/dynamic\|React.lazy\|import(" features/marketing/seo/topical-map` — exactly ONE `dynamic(` (GraphView.tsx) and exactly ONE static
   `@xyflow/react` import (GraphViewImpl.tsx, with the sanctioned eslint-disable line).
   `pnpm eslint features/marketing/seo/topical-map/views eslint.config.mjs` must be clean.
8. **Gates yourself**: `pnpm jest features/marketing/seo/topical-map/views/graph --no-coverage`,
   `pnpm type-check` (0 in the lane; report the repo total), `pnpm check:parse`.
9. **Doors.** Every named record in the drawing opens: a topic node → the topic panel
   (`useOpenTopicPanel`), a facet value with a resolved `ref` → `EntityRef` (peek + new tab),
   one without → a real action (the filtered outline). A label that does nothing is a finding.
10. **Read-only.** With `readOnly: true`, `nodesDraggable` is false and no write control
    renders (absent, not disabled).

## Return
Terminal truth first. For each of 1–10: PASS / FAIL / NOT PROVABLE HERE with the evidence line
(command + result, or the assertion). Then what is MISSING against the vision that no test
covers (the browser walk in `views/graph/VERIFY-C.md` is the coordinator's; name anything it
should add). Never soften a FAIL into a note. Delete any throwaway test file you created.
