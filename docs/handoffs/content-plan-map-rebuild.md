---
status: active
updated: 2026-08-20
repos: [matrx-frontend]
scope: tail
feature: Content Plan
vision: [/Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md]
---

# Content-plan site map — rebuilt, awaiting Arman's live review

**What this is:** the `?view=map` rebuild — the plan drawn as the website's own shape (home at
top, branches below, readable wrapped-title cards on visible connectors) — built 2026-08-20 to
Arman's live direction; what remains is his review and any refinements it produces.
**Scope:** Tail
**Feature:** Content Plan
**Vision:** Arman, 2026-08-20 (verbatim): *"this is a website… it should just have the home page
at the top and then show the links and how they branch and just show a representation of the
site"* · *"proper shapes… text wrap one time and be centered… these are page titles, they fit on
a Google search"* · *"without the connections, what's the point?"*

## Resources

- The build: `features/marketing/content-plan/components/SiteMap.tsx` (DOM-only, no React Flow);
  shared visibility math in `lib/tree-view.ts`; FEATURE.md flow 3 describes it.
- Review it: `https://aimatrx.com/marketing/content-plan/d0aff5b6-0710-4848-8304-164db3c80ab7?view=map`
  (341 nodes, needs Arman's account). Verified live at 295 nodes on
  `/marketing/content-plan/f8e332bb-df0e-4772-9288-48b548803afe?view=map` (test-admin visible).
- Review-queue row: "Content-plan map rebuild" (`agent.review_queue`), status pending.

## Remaining work

1. **Arman's live review** of the rebuilt map; fold in his feedback (registered in the review
   queue — whoever takes the feedback updates the row per the `agent-review-queue` skill).
2. Two deliberate build choices to confirm with him, in the map or in chat:
   - Reparent + bulk status edits stayed TREE-only; the map carries no unguarded writes.
   - His "clicking… half-ass thing on the side" comment: card click opens the canonical
     NodePanel (same panel the tree/table use). If the complaint stands, it is a NodePanel
     work item, not a map one — route it to the Content Planning handoff.

## Done

- Evidence pass at 295 real nodes root-caused the old dot graph — see this doc's git history.
- Rebuild shipped 2026-08-20: old `PillarMap.tsx` + `pillar-map/` deleted wholesale; new
  `SiteMap.tsx` verified live (search, per-branch collapse, overview collapse, click→panel,
  honest empty/filtered states); tests moved with the shared math; FEATURE.md updated.
- Silent no-access blank workspace chipped separately (AccessGate fix).
