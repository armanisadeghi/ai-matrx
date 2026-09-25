# FEATURE.md — `kits`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-25`

---

## Purpose

A kit installs a working example in one click — tables with example rows, a copy of an existing platform agent whose variables read those tables, and a workflow — into the organization the person SET, then shows how it works. Contract and first kits: `common-docs/projects/data-kits/PLAN.md` (P2 = the kit, P1 = the custom-data binding).

The product word lives ONLY in `constants.ts` (`KIT_WORD`) — "Kits" is a working name; a rename is one edit.

---

## Entry points

**Routes**
- `app/(core)/kits/page.tsx` — gallery (server read of the catalog → `KitGallery`).
- `app/(core)/kits/[key]/page.tsx` — detail: how-it-works diagram, table previews, agent + bindings, workflow, walkthrough, install rail (`KitDetail`).
- `app/(core)/kits/[key]/installed/page.tsx` — the installed kit: records `Grid` per table, "What the agent sees", "Try it" (`KitInstalled`).
- Nav: `features/shell/constants/nav-data.ts` → Data → Kits (gate `unified-data-campaign`, same as Records).

**Hooks**
- `hooks/useKitInstall.ts` — org (via `useOrganizationRequired`, never a default) + record-store switch (`UNIFIED_DATA_CAMPAIGN.check`) + this kit's install record; `runInstall()` / `remove()`.

**Services**
- `service.ts` — `fetchKits` / `fetchKit` (catalog read, defensive manifest parse that SCREAMS and skips a bad row), `fetchSourceAgents`, `fetchRefNames` (AI model names for entity refs).
- `installer.ts` — the install, resume and removal.
- `preview.ts` — `previewBinding` thunk → aidream `POST /agents/variable-bindings/preview`.

---

## Data model

- **Kit** = `public.catalog_entries` row, `app='matrx'`, `kind='kit'`, `payload` = `KitManifest` (`types.ts`). No kit table.
- **Install record** = one record in the organization's own **"Kit installs"** table (record store, slug `kit_installs`, declared on first install through `declareTable`; marked `kept_by_the_app` / `kept_for: kits` and `agent_writable: false` on every install start). Fields: `kit_key`, `kit_version`, `status` (`installing|installed|failed|removed`), `steps` (JSON text: every id created, per step), `error`, `run_id` + `run_until` (the runner's lease).
- **Claim (concurrency at the data layer):** a new install record is written with a deterministic v5 id of `(organization, kit_key, number of earlier installs of this kit)`, so a racing second tab hits the store's primary key (`already_exists`) and attaches to the existing record, polling it. A resume takes the lease; every later write passes `expectedVersion`, so a runner that slipped past the lease loses its next write and stops. A promoted UNIQUE column was tried first and rejected: `custom.promote_field` is not executable by `authenticated`, so the index never builds for a person.
- **One organization per run:** captured at the click and passed explicitly — records client, `duplicateAgent({ organizationId })`, `callApi({ scopeOverrides: { organization_id } })`.
- **Verified writes:** agent rename + bindings go through `guardedUpdate` (not_found / conflict are named failures); archive writes `.select()` and treat 0 rows as a failure (`setWorkflowFlag` in `features/workflow-runtime/browse/service.ts` fixed for every caller). Removal refuses any id that no longer carries this install's label (table description names the install id; agent/workflow tag `kit-install:<id>`).
- **Binding a variable clears its `defaultValue`** — the bound value is the truth; missing is announced by the binding's `missing`.
- **Binding written on the forked agent** (`variable_definitions[i].binding`): the merge-field declaration — `{kind:"merge_field", source:"record", semantic_type, table_id, record_id?, field_key?, match?, limit?, transform?, missing?, override_policy?}`. Manifests carry `table_key`/`record_index`; `resolveBinding` swaps them for real ids. The variable definitions are read and written RAW (other keys byte-for-byte), because the typed agent model's binding union does not carry `merge_field` yet — see Known gaps.

---

## Install steps

record the install → declare each table (relations to other kit tables resolved) → `recordWriteMany` the example rows (`{table_key, record_index}` values resolved) → `duplicateAgent` thunk (`agx_duplicate_agent`, the ONE fork; its refusal sentence is shown verbatim) → rename/tag from the manifest → write bindings → `callApi POST /workflows` with `{{table:k}}` / `{{agent:k}}` substituted → mark installed. Failure: the stepper marks the failing step with the door's sentence, the record says `failed`, and the rail offers **Finish install** (resume) or **Remove what was created** (confirm dialog names exactly what is archived). Removal archives only recorded ids: `tableArchive` passes, agent `deleted_at`, `deleteWorkflow` — all soft.

---

## Known gaps

- `features/agents` parses `variable_definitions[i].binding` as a scope binding only; a `merge_field` binding fails that parse and the builder falls back to "variable definitions omitted" for the copy. The FE union for P1 must learn `merge_field` (another lane owns `agent-definition.types.ts` / `parse-messages-variables.ts`).
- `POST /agents/variable-bindings/preview` is not in the generated API types yet; `preview.ts` calls it through `callApi`'s own auth/base-URL helpers and reads the answer defensively. A 404/405 renders "not deployed yet", never a fake preview.

---

## Change Log

- `2026-09-25` — Verification fixes: deterministic-id claim + lease, guarded/verified writes, captured org, app-kept ledger, cleared bound defaults, plain errors with Details, per-table order, org change link, removal dialog with dependents + restore windows (tables: the table's `retention_days`; agents/workflows: platform floor, never purged), workflow link → `/workflows/<id>` (no step/canvas editor route exists).
- `2026-09-25` — Created: gallery, detail, installer (install record first, resumable, exact-id removal), installed view (Grid, binding preview, Try it), nav entry.
