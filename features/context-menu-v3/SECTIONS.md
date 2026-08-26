# Shared menu sections — THE REGISTRY

**The rule (Arman, 2026-08-25):** when a surface shows a thing (a keyword, a page, a topic, a contact, …), the right-click actions for that thing come from ONE shared section builder, used everywhere the thing appears. A per-surface copy of another surface's actions is a defect.

## THE ADOPTION PROTOCOL — every agent wiring a menu runs this

1. **Look here first.** If the right-clicked identity already has a row below, use that builder. Never re-implement its items inline.
2. **No row, but the identity appears on 2+ surfaces?** Extract a shared builder (pattern: `useKeywordMenuSection`), register it here, and use it.
3. **No row, identity is truly page-local?** Inline `extraSections` on that pane is correct. Do not register one-offs.
4. **THE GROWTH STEP (the most important one).** When you adopt an existing section on a new surface, list every action a user would reasonably want for this identity _on this surface_. Almost always the section is missing some. Add them TO THE SHARED BUILDER — every prior consumer gains them. Never bolt a private sibling section next to the shared one for the same identity.
5. **THE CONSISTENCY STEP** — the mechanism is [`utils/availability.ts`](./utils/availability.ts), do not hand-roll it. An action the shared section offers that cannot work on this surface stays VISIBLE but `disabled`, with a `description` that names the surface where it works (the disabled-reason tooltip is the ONE sanctioned use of `description` — see THE DENSITY LAW in the skill). The menu stays the same everywhere; only availability changes. An action gated on data the row may lack (no library keyword, no page id) follows the same rule — disabled with the reason, never absent, never a silent no-op.

## The registry

| Identity                               | Builder                                                                   | File                                                                         | Consumers (keep current)                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keyword / query                        | `useKeywordMenuSection` + `useKeywordAssignSurfaces` + `keywordEntityRef` | `features/marketing/seo/keyword/keyword-actions.tsx`                         | KeywordWorkbench · ValueWorkbench · RanksWorkspace · GscDimensionTable · DigResultsTable · WatchlistTab · NewPagesTab · Insights (movers/shifts/ctr-gap/cannibalization/trends via `insight-row-menu`) |
| Traffic class (a filter, not a record) | `classMenuSection`                                                        | `features/marketing/search-console/components/insights/insight-row-menu.tsx` | Insights Quality view                                                                                                                                                                                  |
| Value level (a filter, not a record)   | `levelMenuSection`                                                        | same file                                                                    | Insights Quality view                                                                                                                                                                                  |
| Site page (by `web.page` id / URL)     | `pageMenuSection`                                                         | same file                                                                    | Insights page-dimension tables                                                                                                                                                                         |
| CRM row (party/list)                   | `useCrmRowMenu`                                                           | `features/crm/components/crm-row-actions.tsx`                                | CrmListPage · OutreachListsPage                                                                                                                                                                        |

Registered-but-inline candidates (identity appears on 2+ surfaces, builder not yet extracted — extract on next touch): **SEO topic** (`TopicTreeWorkbench` inline; topics also appear on the value workbench and receipts), **value rule / service area** (`MeaningRulesWorkbench` inline; rules also surface on meaning-health and pack screens).

## The consistency step, in code

A shared builder takes an `unavailable` map; the host declares only what it CANNOT do:

```ts
const section = useKeywordMenuSection({
  …,
  unavailable: {
    "kw-pages": unavailableHere("the Keyword Workbench"),
    "kw-intel": needs("a library keyword"),
  },
});
```

`withAvailability` keeps the row, its label, its icon and its POSITION, sets `disabled`, puts the reason in the tooltip, and neuters `onSelect`/`href` so it cannot fire even if a renderer ignores the flag. A submenu whose every child is dead is disabled too, so the user learns without opening it.

**Per-surface gating works today. Per-ROW gating works only when the host keeps the clicked row in STATE** (as `MeaningRulesWorkbench` does) — a `useRef` host cannot re-render, so a row-dependent `unavailable` map is computed from a stale row. Ref-based hosts must move the clicked row to state before gating per row.

## Registration contract

A registered builder:

- returns `ContextMenuExtraSection` (or `{section, node, entityRef}` when it owns assignment surfaces), takes a `getRow: () => Row | null` reading the pane's clicked-row state — never a captured row;
- ships the identity's `entityRef` helper so Attach To targets the row (`CONTEXT_MENU_ENTITY_KEY`);
- adds NO new write path — every item delegates to an existing RPC/opener/route;
- obeys THE DENSITY LAW: labels are a short verb phrase, no `description` except a disabled-reason.

**After any change here: update the Consumers column and the matching FEATURE.md in the same commit.**
