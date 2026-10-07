# Directive Catalog — FEATURE.md

**Status:** Live (admin). The live noun × verb Directive grid + a build/test panel.

The admin surface that shows the **Matrx Directive Catalog** — every noun (a table-backed resource) × every verb (`reference · view · create · update · delete`) — in one place, **live from the backend**, and lets an admin build + test a Directive with a few dropdowns.

## Entry point

- Route: `/administration/agents/relationships/directives` → `app/(admin)/administration/agents/relationships/directives/page.tsx` — the **Directives tab of the Relationships hub** (the old `/administration/directive-catalog` redirects via `next.config.js`). The hub layout owns viewport height: the page wrapper is `h-full`, never a `100dvh` calc.
- **Gating:** the `(admin)` route group layout (`app/(admin)/layout.tsx`) enforces **super-admin** server-side. `DirectiveCatalogClient` carries the single, documented in-page gate (`selectIsAdmin`, any admin level) — the one place to lower to org-level admins later.

## Backend contract (do NOT rebuild)

- `GET /directives/catalog` on the Python brain — the SUMMARY (every noun's cells + identity, actions, aliases; NO item schemas; ~32 KB gzip, cached server-side, `ETag` = `catalog_version`). In-app path is **bare** (`/directives/catalog`); the public URL adds `/api` (stripped server-side). Non-sensitive, unauthenticated GET.
- `GET /directives/catalog/{noun}` — ONE noun's write item schemas (`DirectiveNounSchemas.schemas[class]`), fetched only when a form/inspector for that noun opens: `catalogCache.ts::loadNounSchemas` (one request per noun per tab) via `hooks/useNounSchemas.ts`. Never read schemas off a summary row — it has none.
- Base URL is resolved from the canonical `apiConfigSlice` (`selectResolvedBaseUrl`) — the admin server toggle routes this too. NEVER hardcoded.
- Response shape aliased from OpenAPI in `types.ts` (`components["schemas"]["DirectiveCatalog"]` / `NounDirectives`; states `"yes" | "planned" | "no"`).

## Parts

| Part                                      | File                                    |
| ----------------------------------------- | --------------------------------------- |
| Types (OpenAPI aliases + guards)          | `types.ts`                              |
| Endpoint path                             | `endpoints.ts`                          |
| Fetch (one path)                          | `service.ts`                            |
| Live hook (fetch + manual refresh)        | `hooks/useDirectiveCatalog.ts`          |
| (verb, noun) → Matrx envelope             | `buildEnvelope.ts`                      |
| Identity field → searchable entity source | `identityPicker.ts`                     |
| Item schema → form fields → payload (pure) | `schemaFields.ts`                      |
| Generated write form (picker + builder)   | `components/SchemaFieldsForm.tsx`       |
| State color/icon primitive                | `components/StateCell.tsx`              |
| Grid (matrix, filters, legend)            | `components/DirectiveCatalogGrid.tsx`   |
| Builder/test panel                        | `components/DirectiveBuilderPanel.tsx`  |
| Orchestrator (load/error/refresh/gate)    | `components/DirectiveCatalogClient.tsx` |

## Reuse (no forks)

- **Fetch:** `selectResolvedBaseUrl` (`apiConfigSlice`) — same base every backend call reads.
- **Envelope render (the "test it" payoff):** `reference`/`view` with state `yes` renders LIVE through the canonical `MatrxEnvelopeBlock` + `referenceResolvers.ts` from `features/matrx-envelope/` — the same reference-chip renderer chat uses (resolves the value from Supabase, opens the entity on click). No second renderer.
- **Identity selection:** searchable fields reuse `RecordReferencePicker` + the RLS-aware `reference_search_candidates` path; files use `openFilePicker`. The ephemeral `directiveReferencePickerWindow` returns selection through `callbackManager`; Redux carries no callbacks or chosen-record state.
- **Reference examples stay derived:** `referenceFieldsForSpecs` projects only the current noun's server-declared fields and fills missing values with `<noun.field>` placeholders. Changing noun clears prior ids; selected records render through `EntityRef` with open/new-tab/peek doors.
- **Phone/tablet layout stays deliberate:** compact header metadata, 44 px filter/builder/action controls, and the shared `MOBILE_TABLE_FROZEN_THROUGH_TABLET` compatibility token keep the matrix content-sized without pinning any column. The grid wrapper is the single horizontal scroller, so the entire row moves together and every verb column remains reachable.
- Component library: `Select`, `Input`, `Button`, `Badge`; Lucide icons; semantic tokens.

## Choosing a type (the noun picker)

- `nounOptions.ts` + `OptionCombobox`: searchable by name, token and family. The **Common**
  tier leads — the org's `platform.reference_picker.common_types` knob, read through the
  reference picker's own `useCommonReferenceTypes` (one knob, two surfaces; aliases followed
  via `CATALOG_ALIASES`) — then Ready / Planned / Can't for the chosen verb. Names come from
  `FRIENDLY_REFERENCE_TYPE_LABELS` (a conversation is "Chat"), else the server `label`.
- **No default noun.** The builder opens on "Choose a type"; any pre-pick is a guess (it once
  opened on `access_delta_probe`).
- A planned type with no published schema shows one state line — no empty heading, no raw
  JSON box, no dead Execute. Run controls (Force, the verb-named button) exist only on `yes`.


- **Write forms are generated from the server's item schema — never hand-authored per noun.**
  `schemaFields.ts::deriveSchemaFields` maps every property of the noun's `schemas[verb]` (`useNounSchemas`) to a typed
  field (text, number, yes/no, pick-list, date/time, record search, JSON); required + the
  noun's `title_column` lead, the rest sit under "More fields" ordered by kind. Id fields
  resolve to a record search via `identityPicker.ts::payloadFieldEntityInfo` (`assignee_id` →
  a people search). A **blank field is never sent** — not `""`, not `null`: an update schema
  marks every field optional, which says nothing about whether the column may be emptied, so
  clearing is an explicit act in the JSON view. An update sends only what was set. The
  user-facing picker offers **only human controls** (`humanFormFields`: no raw-JSON or
  bare-id boxes; a required field is never dropped). The title column always reads "Title".
  Validation **offers, never blocks**: `buildSchemaPayload` returns warnings beside the
  payload and always builds it; what is missing is said beside the action button, a bad
  value beside its field (`splitWarnings`). The same `SchemaFieldsForm` serves the
  admin builder and the user-facing reference picker's Create/Update
  (`features/matrx-envelope/components/reference-picker/`). Guard: `__tests__/schemaFields.test.ts`
  runs every writable noun's real schema from the committed catalog snapshot.
- `create` / `update` on a state-`yes` noun: the generated form (a JSON view one click away;
  switching never loses input) + **Execute** runs the
  action via `POST /directives/execute` (authed; the write runs as the user under RLS on the
  server). Idempotent by content key — a repeat is `already_applied`; `force` opts out.
  Per-item receipts render below. `service.ts::executeDirective` attaches the Supabase JWT
  (`supabase.auth.getSession`); never writes Supabase directly.
- **Any write verb whose cell is `yes` executes** — the catalog state is the only gate
  (no verb allowlist in FE code). `delete` is a soft delete server-side; `planned` /
  `no` cells stay disabled + explained.
- **Write-state cells are controls.** A `planned`/`yes` create, update, or delete cell
  toggles the noun's single `platform.entity_types.agent_writable` flag through
  `admin_set_entity_type_agent_writable`; the adjacent `{}` affordance opens the
  server-derived schema panel. The catalog refresh resyncs the backend runtime registry,
  so enabling takes effect immediately rather than waiting for a deploy.
- **Shape inspection is generated, never authored.** `DirectiveShapePanel` renders Minimum,
  Defaults, Full, and raw JSON Schema views for canonical actions and Plane-2 Custom Actions.
  `schemaExamples.ts` derives copy-ready examples from the server schema; there are no
  noun-specific example maps.

## Server-derived, not hand-authored (2026-07-26)

The catalog is COMPUTED server-side from `platform.entity_types` + the envelope shape
registry, and the payload is enriched: per-noun `label` / `title_column` /
`identity_fields` (required fields of the registered reference item model), plus an `actions` section (registered Kind Actions) and the server's
alias map. Consequences here:

- `buildEnvelope.ts::refFieldsForNoun(noun, catalogNoun)` derives identity fields from
  the catalog row; the hand `REF_FIELDS` map is only uuid/label polish + offline
  fallback — **never add entries for new nouns**.
- `isReferenceVerb` = "not a write verb" (`types.ts::isWriteVerb`); a server-added verb
  is a write by default, no FE edit.
- The grid renders the `actions` section below the matrix (search-filtered).
- The mirrored manifest also generates `features/matrx-envelope/catalog-nouns.generated.ts`
  (`pnpm gen:directive-nouns`, auto-run by `check-protocol-sync --fix`) — the slim table the
  reference resolvers derive from.

## Change Log

- 2026-10-07 — **G15: dates use the app's date control.** `SchemaFieldsForm` date fields are the task editor's Calendar popover (`TaskDueDatePicker` variant `field`, new `id`/`emptyLabel`/`clearLabel` props); date-and-time adds a time box beside it; time stays a time box. Untouched Update fields still read "Unchanged". No date control exists in `@ai-matrx/design-system/controls` yet. Guard `__tests__/an-update-form-says-unchanged.test.tsx` (G15 case red on the native boxes, green now).
- 2026-10-07 — **G12 catalog speed.** The summary carries no schemas (live before: 2.41 MB, 5.4–7.6 s; now ~292 KB raw / ~32 KB gzip, served from a server-side cache with ETag/304). Each form loads ONE noun's schemas: `service.ts::fetchDirectiveNounSchemas` → `catalogCache.ts::loadNounSchemas`/`peekNounSchemas` → `hooks/useNounSchemas.ts`, read by the picker's `WriteStep`, the builder (skeleton while loading) and the grid's Inspect (offered on every non-`no` write cell; `DirectiveCatalogClient` loads the schema, then opens the canvas tab). The mirrored manifest carries `noun_schemas` ({noun: {class: schema}}); `gen-directive-nouns.mjs` and the snapshot tests read it there (generated output unchanged). Live (local aidream): "Change…" for Task showed Create/Update/Delete 28 ms after the press on a cold tab; the Create form and the admin builder rendered every field.

- 2026-10-07 — G10B review closed (resumed lane). Phone-first page: below lg the body is the one scroll area (type table at 70dvh, then Other actions, then the builder) and takes the shell's floating-clearance runway (`data-matrx-page-scroll`), so the builder's last line ends clear of the floating chips (dev `[floating-clearance]` guard fired on this scroller before). The family filter is full width on a phone (it had collapsed to a dot). The type table is PAGED (`DIRECTIVE_CATALOG_PAGE_SIZE` = 50): "show all" put ~69,000 nodes on the page, so every dialog's scroll lock cost an ~800 ms style pass — the builder's confirm opened ~950 ms after the click; now ~75 ms. The jargon header is "Other actions". Confirms come from the directive host's `ask` (Create a Task with no title? / Create Task X?).

- 2026-10-02 — G10A review: every untouched Update control says "Unchanged" — Assignee said "Unassigned" (reads as "this will unassign") and dates showed "mm/dd/yyyy". ONE source for every field kind: `emptyFieldLabel(field, mode, isPerson)` in `schemaFields.ts` (Update → "Unchanged" except `id`; Create → default / "Not set" / "Unassigned" / "Does not repeat" / the control's own prompt). Dates and times draw the word over the native mask until focused (`DateTimeControl`). No working control looks disabled: `TaskRecurrencePicker`'s empty state is full muted text (was 50%), and `TaskAssigneePicker` takes `emptyLabel` + `labelClassName` so the form's Assignee matches its siblings' height and text size. Guard: `__tests__/an-update-form-says-unchanged.test.tsx` (one field of every kind, both modes; red on Assignee and Repeat before).

- 2026-10-02 — G8A review: `valueWord` is also the action card's and confirm's word — `matrxDirectiveValueLabel` (matrx-envelope) answers the package's `valueLabel` seam with it for every pick-list field the catalog declares (`catalog-enum-fields.generated.ts`). One value, one word in the form, the card and the confirm. Guard: `features/matrx-envelope/__tests__/a-value-has-one-word.test.ts` (every enum field in the snapshot).

- 2026-10-02 — G6B review: the human form speaks the record's own words. Pick-list values read the feature's vocabulary (`valueVocabulary.ts` → `TASK_STATUS_META`, `PROJECT_STATUS_LABEL` in the new `features/projects/constants/status.ts`), a legacy value folded onto another is not offered twice (`incomplete` → Inbox) and a legacy default reads in words ("Default (Inbox)"); `SchemaField.enumLabels`, `resolveValueVocabulary` option. `recurrence_rule` is kind `recurrence`, labelled "Repeat", drawn with the task editor's `TaskRecurrencePicker` (new `emptyLabel` prop). `humanFormFields` drops derived fields by schema signal (`isDerived`): `X_name` beside `X_id`, `slug`, ordering integers (`position`, `sort_order`, …); the admin builder still shows them. Guard: `__tests__/a-person-form-asks-only-what-a-person-sets.test.tsx`.

- 2026-10-02 — G5 review: `humanFormFields` drops fields the record sets itself (a `*_at`
  date-time such as `completed_at`, and `timezone`) — the admin builder still shows them; a
  person field (`user_profile`, e.g. `assignee_id`) renders the people search
  (`TaskAssigneePicker`) instead of a generic record list; `formTitleColumn` (identityPicker)
  falls back to the registry title column so a note's `label` always reads "Title" (picker and
  builder). Guard: `__tests__/a-person-form-asks-only-what-a-person-sets.test.tsx`.
- 2026-10-02 — G3 review: the header badge says where calls LAND (`lib/api/server-identity.ts`
  `describeServerTarget` — "Clone" on the clone preview, never the slot name "production");
  Create/Update/Delete ask the SAME confirm the action cards use (`matrxDirectiveHost.ask`) before
  anything runs, and Delete is a destructive button; the result line reads the receipts
  (`executeResult.ts` — a deduped repeat says "Already applied — nothing new was written.", no
  duplicate toast); the JSON view says "The JSON breaks at line 3, column 3." (kit
  `describeJsonParseError`). Guards: `__tests__/executeResult.test.ts`,
  `lib/api/__tests__/server-identity.test.ts`.

- 2026-10-02 — Builder usability pass (lane E): common-types-first noun picker on the shared
  knob, no default noun, form before envelope for writes, update/delete target leads the form
  and is named by type (`schemaFields.ts` ranks `id` first), receipts offer "Update it" /
  "Delete it" with the record carried over, a reference renders as soon as its record is
  picked, run button named by verb, one-line state for planned/no-schema types. Errors:
  execute uses `parseHttpError`; every rendered error string (panel, receipt summary,
  catalog load/refresh, toggle toast) passes `stripTerminalCodes`; the headline prefers the
  humanized server sentence over a generic status line.

- 2026-10-02 — A directive write lands in the PERSON's organization, on an admin page too.
  `authedDirectiveHeaders` asks the gate with `personWrite: true`
  (`lib/organization/organization-gate.ts`): the server runs Execute/Apply as the person
  under their own row security, so the admin section's platform tenant ("Matrx System") is
  never bound to it; nothing selected → the picker asks. Guard:
  `__tests__/a-person-write-lands-in-their-organization.test.ts` (red 4/4 on the pre-fix
  service, green after).
- 2026-09-30 — The builder's hand-typed JSON payload became the generated `SchemaFieldsForm`
  (JSON view kept). New pure core `schemaFields.ts`; `payloadFieldEntityInfo` turns payload id
  fields into record searches (`parent_<token>_id` included). Found live: `GET
  /directives/catalog` 500ed on prod — pgvector `kg_clusters.centroid` unmapped server-side;
  fixed in aidream (`directive_apply/shapes.py` + a guarded preview path in
  `directive_catalog/catalog.py`).

- 2026-08-30 — Adopted the platform-wide whole-row mobile table contract. The noun column now scrolls with the verb columns instead of consuming the viewport as a sticky layer; the historical shared token name remains only as a compatibility name while consumers are inventoried for a later rename.

- 2026-08-26 — Kept the noun column frozen during real phone/tablet horizontal scrolling by making the grid wrapper the sole scroll container. Superseded by the 2026-08-30 whole-row mobile contract.

- 2026-08-25 — Made the phone catalog intentional: compacted server metadata, raised interactive targets to 44 px, named icon-only actions, and preserved the frozen-noun horizontal matrix. The frozen behavior was superseded on 2026-08-30.

- 2026-08-23 — Synchronized the unified directive grammar: `directive_version`
  replaces the retired envelope version, verbs derive from noun capabilities, Kind
  Actions come from `actions`, and execute/confirm send the canonical directive slug.

- 2026-08-23 — Reference/view examples now update immediately from verb + noun with
  exact identity placeholders; identity fields search real RLS-visible records in a
  non-blocking picker window and selected records retain canonical doors.

- 2026-07-27 — Made easy write capabilities directly toggleable from the matrix; added
  clickable Directive/Custom Action shape inspection with generated minimum/default/full copy
  payloads and raw JSON Schema.

- 2026-07-26 — Catalog is server-computed; FE derives identity fields, write gating,
  and the Custom Actions section from the payload. Verb allowlist + delete explainer copy
  removed; `CustomActionEntry` type added.

- 2026-07-13 — Route moved into the Relationships hub as the Directives tab
  (`/administration/agents/relationships/directives`); old route deleted + redirected.
  `DirectiveCatalogClient` unchanged (zero route coupling).
- 2026-07-04 — Added to admin dashboard catalog (Tool Registry). Release gate `pnpm check:admin-catalog` prevents future omissions.
- 2026-07-01 — Type-safety: replaced 7 hand-written API interfaces with OpenAPI aliases
  (`components["schemas"]` in `types.ts`); derived `DirectiveState` / `DirectiveVerb` from
  `NounDirectives`; removed `?? ""` form-default hatches in `DirectiveBuilderPanel`; confirm
  consumer now passes required `force: false` on `DirectiveConfirmRequest`.
- 2026-07-26 — `confirmDirective` uses `parseHttpError` → `BackendApiError` so callers
  show the gentle `user_message` from `/directives/confirm` (plus structured
  `details.issues` on the wire), not a Pydantic dump.
- 2026-06-24 — Added the `ask`-policy **confirm round-trip**: `confirmDirective` +
  `POST /directives/confirm` (`service.ts` / `endpoints.ts` / `types.ts`). When a directive's
  resolved apply policy is `ask`, the brain streams `directive_apply.proposed`;
  `process-stream.ts` enqueues it into the `proposedDirectives` slice
  (`features/matrx-envelope/state/`), and `<ProposedDirectivesZone>` (mounted beside the
  chat input) renders an Approve/Decline card whose Approve POSTs the envelope back to
  confirm (runs as the user, RLS; idempotent by `proposal_id`). Backend cascade:
  aidream `services/output_directives/` (agent → surface → user, default `ask`).
- 2026-06-24 — Wired the Execute button to `POST /directives/execute` (Plane-1 writer):
  create/update run live with a JSON payload editor, `force` toggle, and per-item receipts;
  delete/planned/no stay disabled.
- 2026-06-24 — Created: live directive-catalog grid + builder/test panel; reuses matrx-envelope renderer for live reference tests; write-execute stubbed pending Plane 1 writer.
