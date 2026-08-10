# Expertise — packs, rules, desks (the SME system's UI home)

> **The one-line law (cross-repo, canonical: common-docs `systems/expertise-packs/FEATURE.md`):**
> an expert's knowledge lives in a PACK (data, versioned, citable), never in prose inside an
> agent prompt. Desks are COMPILED from packs; auditors consume pack principles verbatim;
> every audit verdict cites a rule id. This feature is the UI where a non-technical expert
> sees, edits, and grows their pack — Arman's ruling: *nothing is real until a normal user
> can see it and do it in the UI.*

## Status

- **Live:** `/expertise` (entity-list shell), `/expertise/[id]` (rule editor), `/expertise/[id]/desks`
  (compiled desks + version-drift flags), `/expertise/admin` (feature map).
- **Next (work order: docs/handoffs/expertise-system-productization.md):** compile-a-desk button
  (aidream `services/expertise_desks`), source→pack ingestion (chunked extraction → draft rules with
  `source_ref`), interview agent, the Arman-SEO honest test.

## Data

- **Table:** `platform.expertise_pack` (Matrx Main). JSONB columns get their app shapes in ONE place:
  [`types.ts`](./types.ts) (`PackPrinciple`, `PackSections`, `PackSource`). Never re-declare beside a consumer.
- **Rules (`principles` JSONB array):** `{id, name, section, statement, rationale?, quote?, detection?,
  severity, retired?, draft?, source_ref?}`. `id` is the citable handle — audits cite it; never rewrite
  an existing rule's id. `retired` keeps history; `draft` marks agent-suggested rules awaiting the
  expert's line-by-line approval (human-first invariant — ingestion NEVER auto-activates).
- **Versioning:** every save through `savePrinciples` bumps `version` with an optimistic lock on the
  loaded version (concurrent edit → readable conflict error, no silent overwrite).
- **Desks:** `workflow.definition` rows whose `metadata` carries `compiled_from_pack` + `pack_version`
  (the compiler stamp). Drift = `pack_version < pack.version` → the desks page flags "recompile".

## Files

- `service.ts` — detail reads/writes (getPack, savePrinciples, createDraftPack, updatePackMeta,
  softDeletePack, listDesksForPack). Direct supabase-js, RLS live, THE VIEW LAW respected.
- `browse/` — entity-list shell wiring: `service.ts` (mine/orgs/public scoped reads, plain PostgREST —
  no per-feature RPC yet at this population; upgrade to `exp_list_scoped` RPCs when packs are many),
  `columns.tsx`, `listConfig.tsx`, `useExpertiseRowActions.tsx`, `components/ExpertiseBrowsePage.tsx`,
  `components/NewPackDialog.tsx`.
- `components/detail/PackDetailPage.tsx` + `RuleEditorDialog.tsx` — the expert surface. Plain language
  only: "rules", "how to spot a violation", "how bad is breaking it". Zero jargon is a requirement,
  not a style choice (THE MISMATCH RULE).
- `components/desks/PackDesksPage.tsx` — desks list, run links into workflows.aimatrx.com.

## Registration

- Entity token `expertise_pack` (platform.entity_types, pre-registered) + FE overlay in
  `features/scopes/registry/entityRegistry.ts` (`hrefFor` → `/expertise/{id}`; peek falls back to
  RegistryPeek automatically).
- `platform.shareable_resource_registry.url_path_template` = `/expertise/{id}` (updated live 2026-08-10).
- Sidebar: `features/shell/constants/nav-data.ts` ("Expertise").

## Invariants

1. **Human-first:** anything machine-generated lands as `draft: true` rules or a `status='draft'` pack;
   the expert approves in this UI. No auto-activation, ever.
2. **Version honesty:** desks display the pack version they were compiled from; a stale desk is flagged,
   never silently drifting.
3. **Copy is for a brilliant NON-technical expert** — a doctor must be able to correct their rulebook here.

## Change log

- 2026-08-10 — Feature created (Phase 1 of the expertise-system-productization work order): list, detail
  rule editor (add/edit/retire, version bump, optimistic lock), desks page with drift flags, admin map,
  sidebar + entity registry wiring.
