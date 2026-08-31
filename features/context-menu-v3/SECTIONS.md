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
| Keyword / query                        | `useKeywordMenuSection` + `useKeywordAssignSurfaces` + `keywordEntityRef` | `features/marketing/seo/keyword/keyword-actions.tsx`                         | KeywordWorkbench · ValueWorkbench · RanksWorkspace · GscDimensionTable · DigResultsTable · WatchlistTab · Insights (movers/shifts/ctr-gap/cannibalization/trends via `insight-row-menu`) · RunConsole (`RunDecisions`) · KeywordResearchWorkbench (library) · PageSearchConsoleCard |
| Marketing site / brand (`web.site`)    | `siteMenuSection` + `siteEntityRef`                                       | `features/marketing/seo/run-console/site-menu.tsx`                           | RunConsole (brand table) · SituationalRefreshConsole (brand table)                                                                                                                                    |
| Traffic class (a filter, not a record) | `classMenuSection`                                                        | `features/marketing/search-console/components/insights/insight-row-menu.tsx` | Insights Quality view                                                                                                                                                                                  |
| Value level (a filter, not a record)   | `levelMenuSection`                                                        | same file                                                                    | Insights Quality view                                                                                                                                                                                  |
| Site page (by `web.page` id / URL)     | `pageMenuSection`                                                         | same file                                                                    | Insights page-dimension tables · NewPagesTab (launch tracker) · PagesTable · DismissedPagesTable                                                                                                                                                                         |
| Page snapshot (`web.snapshot`)         | `snapshotMenuSection` + `snapshotEntityRef`                               | `features/marketing/components/pages/snapshot-actions.tsx`                  | SnapshotsTable · SnapshotCompare (before/after) — future adopter: SnapshotArtifacts                                                                                                                                                                |
| CRM row (party/list)                   | `useCrmRowMenu`                                                           | `features/crm/components/crm-row-actions.tsx`                                | CrmListPage · OutreachListsPage                                                                                                                                                                        |
| Workflow run                           | `useWorkflowRunMenuSection`                                               | `features/workflow-runtime/run-actions.tsx`                                  | RunsList · ReadoutView (stands in for the readout's owning run) — future adopters: WorkflowRunWindow, WorkflowBattlePage, EncoreRunPage, UsageHistoricalContext |
| Captured product item (`workbench.product_capture_item`) | `useCaptureItemMenuSection` | `features/product-capture/item-actions.tsx` | AllItemsTable — future adopters: ItemDetailView, ItemsSheet, pipeline/ItemWorkspace |
| CX dashboard record (request/conversation/iteration/tool call) | `useCxRowMenu` + `cxEntityRef`                            | `features/cx-dashboard/components/cx-row-actions.tsx`                        | CX overview (tool usage, page-local) · RequestsContent · RequestDetailContent (request/iterations/tool-calls) · ErrorsContent (problem requests/tool-call errors) · ConversationsContent               |
| Scheduled task (`scheduler.sch_task`)  | `useScheduledTaskMenuSection`                                             | `features/scheduling/components/shared/scheduling-menu-sections.tsx`        | Admin › Automation › Scheduling: Tasks. `scanner-health/page.tsx` names the same identity via `EntityRef token="scheduled_task"` and should adopt this on next touch. |
| Scheduled run (`scheduler.sch_run`)    | `useScheduledRunMenuSection`                                              | same file                                                                    | Admin › Automation › Scheduling: Runs · Orphan leases                                                                                                                                                  |
| Referring domain (`seo.referring_domain_profile` / provider snapshot) | `useReferringDomainMenuSection` + `referringDomainEntityRef` | `features/marketing/components/backlinks/referring-domain-actions.tsx` | ReferringDomainIntelligenceTable (our view) · BacklinkDimensionTable kind="domain" (provider view) — same `/backlinks?view=domains` tab |
| Backlink prospect domain (link-gap or SERP, pre-CRM) | `useProspectDomainMenuSection` + `prospectDomainEntityRef` | `features/marketing/components/backlinks/prospect-actions.tsx` | BacklinkProspectsTab (competitor-link method) · SerpProspectsTab (SERP method) — same `/backlinks?view=prospects` tab |
| Admin user account (Supabase auth user — no entity token yet) | `adminUserMenuSection`                            | `features/admin/users/components/admin-user-menu-section.tsx`               | AccountsTableClient (roster) · UsageTableClient · UserAcquisitionTableClient · PreferencesTabClient (drift table) — mirrors the doors `AdminUserRef` already gives the row's name; future adopters: AnnouncementsTableClient/InvitationsTableClient (reviewer column, page-local today), OrganizationsAdminClient (member row) |
| System announcement (`SystemAnnouncement`, no entity token yet) | `announcementMenuSection`                        | `features/admin/users/components/announcement-menu-section.tsx`             | AnnouncementsTableClient — future adopter: `app/(admin)/administration/users/feedback/components/AnnouncementTable.tsx` (same type, not yet adopted) |
| Relationship rule (`platform.relationship_rules` — composite key, no entity token) | `useRelationshipRuleMenu` | `features/admin/relationships/components/relationship-rule-actions.tsx` | RelationshipRulesClient (registry table) — future adopter: `EntityRelationshipOrbit` (orbit diagram card renders the same identity, read-only today) |

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
