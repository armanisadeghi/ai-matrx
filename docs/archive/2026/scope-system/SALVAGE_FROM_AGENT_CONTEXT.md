> ARCHIVED 2026-07-26 — superseded by `common-docs/systems/scope-context-system/FEATURE.md` (the canonical model) + `features/scopes/FEATURE.md` (the FE implementation). Historical record of the pre-`features/scopes` scope-system UI effort.

# Salvage notes — legacy `(core)/agent-context` UI → canonical scope-system

> Captured 2026-07-02 before deleting the legacy `app/(core)/agent-context/**` surface
> (fleet brief 1). The legacy route UI is gone; these are the **interaction patterns
> worth porting** into the canonical org/scopes flow (`features/scope-system/` +
> `app/(core)/organizations/[orgId]/scopes/**`). Each gem lists what was good and where
> it should land. The source files no longer exist — this doc is the record.

## Orientation (three dirs, do not conflate)
- `features/scope-system/` — **canonical** consumer (`ScopeDetailEditor`, `ContextItemsHub`,
  `ScopeItemDetail`, `TemplateGalleryDrawer`) backing `app/(core)/organizations/[orgId]/scopes/**`.
- `features/scopes/` — canonical scope **data**, active-context, associations, `resolve_full_context`.
- `features/agent-context/` — legacy home. Its **redux/hierarchy substrate is LIVE and stays**;
  only the item/template/dashboard UI cluster + the broken `useContextItems`/`contextService`
  were deleted.

## Gems worth porting (ranked)

1. **3-step "Apply Template" wizard with per-item dedup preview** ★★★ (top pick)
   Choose Scope → Choose Items → Confirm, with a segmented progress bar. The standout is the
   Confirm step: before writing, fetch existing context-item keys for the target scope-type and
   split the selection into **create vs skip**, rendering skips struck-through ("Already exists —
   will skip") and a CTA that counts exactly what will be written ("Create N Items").
   **Port into:** `features/scope-system/components/TemplateGalleryDrawer.tsx` (today applies a
   whole template via one `applyTemplate({template_id, org_id})` thunk with no preview). The DB
   read is a trivial `select key from context.context_items where scope_type_id = …`. UI graft, no new backend.

2. **Status lifecycle system** ★★★ — 15 statuses × 5 phases. Each status had `label`, human
   `tagline`, `phase`, colors, Lucide icon; a `STATUS_TRANSITIONS` next-state graph; and
   `ATTENTION_STATUSES` driving a triage queue. Reusable pure-props controls: a `StatusPickerPanel`
   ("Suggested next" chips + all-statuses-grouped-by-phase + note input) and a phase `Stepper`.
   The "suggested next status" one-click affordance on cards/detail is a low-friction way to advance
   content maturity. **Port into:** `features/scopes/` (or scope-system) as shared constants + the
   two controls verbatim, IF the canonical flow wants item health/triage. Verify the
   `context_items.status` enum still exists in the live DB first (mid-transition).

3. **Type-aware value rendering (`ContextValuePreview`)** ★★★ — one component rendering per
   `value_type`: string (char count), number (big mono), boolean (colored dot), date, **object**
   (zebra key/value table), **array** (numbered list), document (link + formatted bytes), reference
   (type badge + id); card mode shows top-level JSON keys as chips with "+N more". Pure props.
   **Port into:** `features/scope-system/components/ScopeItemDetail.tsx` — object/array/document renderers are the highest value.

4. **Version history with diff + restore** ★★★ — left-timeline / right-detail. Timeline shows
   per-version **char delta** (+142 / −N), author with AI-vs-human icon, source badge, change
   summary. Detail guards historical versions with an amber banner and offers **Compare with
   current** (reuses the canonical `useOpenDiffViewerWindow` overlay) and **Restore** (writes a NEW
   version "Restored from version N" — never mutates history). **Port into:** the canonical
   scope-value editor if it gains versioning. Carry the char-delta timeline + diff-overlay reuse.

5. **Health dashboard** ★★ — 4 stat cards + a `CategoryHealthRow` packing active/partial/stub/
   attention into one stacked horizontal bar per category, plus an **Attention Queue** sorted by an
   explicit priority (stale > needs_review > ai_enriched > needs_update > partial) then age, each row
   with a context-appropriate CTA ("Review"/"Verify"/"Refresh"/…). **Port into:** the canonical
   org/scope home if it wants a fill-progress/health widget.

6. **Tri-view list + bulk-status floating action bar** ★★ — search via canonical `matchesSearch`
   (weighted fields), phase-grouped status-filter popover, cards/table/kanban toggle, multi-select
   with a **floating bulk-action bar** pinned bottom-center. **Port into:**
   `features/scope-system/components/ContextItemsHub.tsx` — most likely lacks the bulk-select bar + phase-grouped filter.

7. **Scope-enriched hierarchy tree + hover row actions** ★★ — a master tree grafting
   scope-types + scope instances INTO the org node (orgs → scope-types → scopes → projects → tasks
   in one tree); hover-reveal add-child/delete, child counts, search that **prunes but keeps
   ancestors** + auto-expands matches; delete via `AlertDialog` (not browser confirm). Stands on the
   already-LIVE `useNavTree`/`hierarchySlice`. **Port into:** a "manage my whole hierarchy" view in
   scope-system if wanted (canonical has only `OrgScopeTree`/`ScopesGrid`).

8. **Responsive tabs↔stacked master-detail** ★ — same content as tabs on desktop / stacked
   sections on mobile via `useIsMobile()` (matches the repo mobile doctrine). Reusable container recipe.

9. **Small utils** ★ — `isContextReviewOverdue` (`next_review_at < now`); `hexToRgba` for scope-color
   theming. NOTE: the string→Lucide `resolveIcon` was duplicated 3× in the legacy files — the
   **canonical** one already exists at `features/scope-system/utils/resolveIcon.ts`; use that, don't recreate.

## Do NOT resurrect (broken code, salvage only the UX above)
- `contextService.resolvePrimaryValueScopeId(...)` was a **dangling call** — no implementation ever
  existed (masked by `@ts-nocheck`). The *intent* (on value save, resolve which scope row the value
  attaches to, else error clearly) is sound; there is no code to lift.
- `contextService.applyTemplate(templateId, orgId)` (returns `{createdScopeTypes, createdItems}`)
  disagreed in arity/order/return-shape with `useApplyTemplate`'s call (`{created, skipped}`) — broken,
  `@ts-nocheck`-masked. The real working path is `features/scope-system/redux/templatesSlice.ts` `applyTemplate`.
