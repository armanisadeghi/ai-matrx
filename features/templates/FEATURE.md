# FEATURE.md — `templates` (host side of the Template product)

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-10-05`

---

## Purpose

The host steps of the ONE template product, Template (Arman, 2026-10-04: "kit" is retired for this
meaning). The catalogue, install plan and doors live in the store (`custom.template*`) and in
`@ai-matrx/records/templates`; the gallery and preview page are `features/make/gallery/**` (lane 8
TEMPLATES). This folder holds what the host does that the store cannot: copy agents, create
workflows, show an installed template, and save a person's setup as a template.
Cross-repo system of record: `/Users/armanisadeghi/code/common-docs/systems/data/custom-data/STATE.md`
(Rule 12, Open 8).

## Entry points

- `/make/templates/<id>` → "Show what it made": `components/InstalledTemplate.tsx` — the installed
  tables in the records `Grid`, "What it sees" for every bound variable (the shared
  `CustomDataBindingPreview`, aidream `POST /agents/variable-bindings/preview`), and Try it per agent
  in the agent run window (the template's `tryIt`).
- "Save as template": the `saveTemplateDialog` overlay (`components/SaveTemplateDialog.tsx`), opened
  from the agent options menu and from the gallery's "Your organizations' templates" row.

## Install host steps (`features/make/gallery/installAgent.ts` + this folder)

- `agentCopy.ts` / `agentCopyHost.ts` — `templateAgentCopier(dispatch)`: platform agent →
  `agx_duplicate_agent` (follows its source) → named (`agentWrites.ts`, next free LIVE name) →
  variables connected (a Table/Tables variable takes the table reference; any other the merge-field
  binding) → `records` tool for the template's own agent. Guard: `__tests__/template-agent-copy.test.ts`.
- **Claim, then create:** every agent and workflow is claimed on the install
  (`custom.template_install_claim`, kind + title) BEFORE it is created, then recorded by
  `custom.template_install_note`. A re-open resumes from the claim: `made` reuses the id, `held`
  (another tab, inside the `templates.run_lease_seconds` lease) stops with a sentence, a stale claim
  answers the orphans that run made — the first is finished and recorded, the rest archived.
  Migration: `migrations/campaign/templates_claim_then_create.sql`. Guard:
  `features/make/__tests__/install-adds-extra-agents-and-workflows.test.ts`.

## Bindings

A variable bound to a table carries `binding: {kind:"merge_field", source:"record", semantic_type,
table_id, record_id?, field_key?, match?, limit?, sort?, transform?, missing?, override_policy?}` on
`variable_definitions[i]`. A template spec carries the same binding with template-local handles
(`table` token, `rowIndex` seed row); `installAgent.ts` resolves them to installed ids, and
`saveAsTemplate.ts` turns installed ids back into handles.

## Save as template (`saveAsTemplate.ts`)

`custom.template_from_tables(org, table_ids, include_rows, rows)` drafts the spec from the tables the
chosen agent reads; every live agent of that organization that reads them becomes the template's
agent (the first) or an extra agent, each binding carried (table id → token, record id → seed row
index `row-<8 hex>`); what cannot be carried is said in the dialog. `templateDeclaration(spec)`
compiles it and `custom.template_declare('org', …)` saves it in the organization the tables live in.
Guard: `__tests__/save-as-template.test.ts` (run with `SAVE_AS_TEMPLATE_DRAFT=<a real draft>` to
compile a live answer).

## Limits (feature knobs, feature `templates`)

`seed_row_cap` (org-overridable) and `preview_rows` (org + user) via `useScopedTemplateKnobs`;
`attached_poll_ms`, `run_lease_seconds`, `archive_max_passes` platform-locked via `templateKnob`
(`knobs.ts`). A missing knob is said, never replaced by a constant.

## Change log

- 2026-10-05 — Kits → Template merge complete: shared code moved here from `features/kits`; `/kits`,
  `features/kits` and the kit catalog rows retired; claim-then-create; installed view; Save as template.
