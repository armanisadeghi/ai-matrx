# FEATURE.md — `crm`

Cross-repo Public Relations program: /Users/armanisadeghi/code/common-docs/systems/public-relations/PLAN.md (+ RESEARCH.md) — a journalist pitch is Lane B and media lists/journalist intelligence/coverage are ALREADY this system. Read it before building anything PR-shaped in ANY repo; do not fork `crm.party`, `agent.message_template`, or the send gate for it.


**Status:** `db-core live · route + WindowPanels live · outreach lists + call queue live · smart views live · native contact import live · outreach inbox + Chasebox live` · **Tier:** `1` · **Last updated:** `2026-08-18`

Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md` — read it before touching this feature in ANY repo.

---

## Purpose

**`crm.party` is the ONE org-scoped record for a person or a company** — a user,
expert, lead, customer, vendor, author, or competitor. Before
this, every module grew its own half-copy (`plan.entity`, `web.brand`,
`rag.kg_entities`, `users.invitation_requests`, `public.contact_submissions`,
`users.user_form_profile`), and none could be reused by the next one.

It serves, in one schema: known individuals with social channels, cold **email**
lists, cold **calling** lists, real customers, and vendors — with companies
first-class. "Company" here means **our users' clients**, never `iam.organizations`.

---

## The load-bearing split — read this before touching contact data

**A medium is not a contact point.**

- **`crm.contact_medium`** — ONE row per normalized value per org. Owns everything
  intrinsic to the _value_: verification, MX, bounce type/count, complaint,
  unsubscribe, DNC state, suppression.
  🚨 **It owns whether a message CAN arrive — not yet whether it MAY be sent.** There
  are no consent columns (basis, source URL, timestamp, expiry, jurisdiction,
  subscriber kind), which blocks Canada/EU/Australia sends and all of Lane A, and
  which cannot be retrofitted without re-contacting everyone. **Before adding any
  consent, unsubscribe, or send-eligibility field here, read
  `/Users/armanisadeghi/code/common-docs/systems/outreach-compliance/` —**
  `ENGINEERING_GAPS.md` GAP-4 specifies the exact columns, and the vocabulary must be
  the one `communication.sms_consent` folds into. One authority, one vocabulary.
- **`crm.party_contact_point`** — says _who_ uses that medium, _how_ (purpose),
  and _since when_.

Why: Acme's switchboard is reachable for 40 contacts and `info@acme.com` sits on the
company plus six people. Storing deliverability per party means a DNC scrub or a hard
bounce updates **one of forty**, and the next rep dials a do-not-call number. It also
gives suppression a home: **a medium with no party attached IS the suppression list**
(`suppressed_at`), so "never email `legal@bigco.com`" needs no invented party.

Never add an email/phone/handle column to `crm.party`. That is the failure this
schema exists to prevent.

---

## Tables (schema `crm`, live 2026-07-27)

| Table                  | Variant                      | Versioned | Holds                                                   |
| ---------------------- | ---------------------------- | --------- | ------------------------------------------------------- |
| `party`                | entity                       | ✅        | person or company; identity, curation, per-org stance   |
| `contact_medium`       | entity                       | ❌        | one row per value per org; deliverability + suppression |
| `party_contact_point`  | component of `party`         | ❌        | who uses a medium, purpose, validity                    |
| `address`              | component of `party`         | ❌        | structured postal + geo                                 |
| `affiliation`          | component of `party`         | ✅        | person ↔ company employment, with dates                 |
| `interaction`          | component of `party`         | ❌        | calls/emails/meetings, planned AND completed            |
| `outreach_list`        | entity                       | ✅        | a named audience or worked cold list                    |
| `outreach_list_member` | component of `outreach_list` | ❌        | per-member state, attempts, dialer claim                |
| `party_merge`          | component of `party`         | ❌        | the exact unmerge record                                |
| `merge_candidate`      | component of `party`         | ❌        | duplicate suggestion (ordered pair, durable dismissal)  |
| `saved_view`           | entity                       | ✅        | a named, re-runnable party-list query (smart view)      |

`party_kind ('person','organization')` is the **only** closed set. Expert, lead,
vendor, journalist, competitor, customer are **roles** — `platform.categories` rows in
the `party_role` dimension attached by a `party → category` edge. **A new kind of
person never needs a migration.**

DDL: [`migrations/crm_01_schema.sql`](../../migrations/crm_01_schema.sql),
[`migrations/crm_02_core.sql`](../../migrations/crm_02_core.sql).

---

## Invariants / gotchas

- **EVERY SIGNED-UP USER HAS ONE AI Matrx-tenant party.** `crm.ensure_user_party`
  is the narrow identity-provisioning primitive behind the `auth.users` trigger
  `on_auth_user_created_crm_party`: it creates or claims exactly one active person
  in normal org `5dc930e9-bd65-44a1-8369-af773f6e1a5b`, joins it through
  `claimed_by`, and attaches Auth-backed email/phone media. It runs on permanent
  account INSERT and anonymous→permanent promotion; anonymous execution principals
  receive no party. It is service/auth-infrastructure only, fails the account
  transaction closed on ambiguous identity, and is NOT a second general resolver —
  all product/server producers still use aidream `resolve_party`. Auth verification
  is not messaging consent. Migration + rollback proof:
  [`migrations/crm_every_signed_up_user_party.sql`](../../migrations/crm_every_signed_up_user_party.sql)
  and [`docs/db_rebuild/proposals/every-signed-up-user-crm-party.md`](../../docs/db_rebuild/proposals/every-signed-up-user-crm-party.md).
- **🚨 `record_class` — the list defaults to CONTACTS, and that default is load-bearing.**
  `crm.party.record_class` is `'contact'` (the DB default: manual entry, imports, form
  fills) or `'discovered'` (the PLATFORM found it — SEO link prospects, media outlets,
  research experts, folded channels). Live on 2026-08-14 before this shipped: **1,181
  discovered rows against 6 real contacts**, all in the same list and the same search box.
  - `applyPartyListPredicates` filters `record_class='contact'` when the caller says
    nothing — an unset filter must NEVER mean "show everything". `all` is how a caller asks
    for that on purpose.
  - The **Record** column facet (My contacts / Found by the platform / Everything) is
    always rendered, because the default IS a filter and the user has to be able to see and
    change it. Hidden is never unreachable.
  - `crm_list_scope_counts` takes the SAME `p_record_class` — a tab reading 1,181 above a
    list of 6 rows is a bug, so the RPC and the predicate change together, always.
  - **Every general party selector is contact-only.** Universal reference/association
    pickers inherit `record_class='contact'` from
    `platform.entity_types.reference_candidate_predicates`; direct CRM name/employer
    pickers, import dedup lookups, and duplicate-candidate reads apply the same predicate.
    All also exclude `canonical_id IS NOT NULL`. Dedicated discovered-record surfaces are
    the only place allowed to opt into discovered rows.
  - **Not `platform.categories`** — that is the user's taxonomy (lifecycle, rating,
    segments). This is a system-owned structural axis.
  - Promotion (`discovered` → `contact`) is a human act; the server never reverses it.
  - Foundation only. Saved-view/display-setting persistence, bulk promote, and every other
    surface that lists parties are the work order in
    [`docs/handoffs/crm-record-classification.md`](../../docs/handoffs/crm-record-classification.md).

- **Employment is `crm.affiliation`, a real table — not an association edge.** The
  edge unique key is `(source_type, source_id, target_type, target_id, role)`, so an
  edge can express only ONE `works_at` between a person and a company, ever: no second
  stint, no promotion history, and `assoc_unlink` hard-deletes so "they left" would
  erase that they were ever there. `crm._affiliation_edge()` mirrors the current
  affiliation to a `party → party` `works_at` edge (payload kind `party_affiliation`)
  so the 360° association surfaces still render, and maintains
  `party.primary_employer_party_id` / `party.job_title` so grids, sorts and exports are
  one column read. **It does NOT use the forbidden `platform._mirror_fk_to_assoc`** —
  it is modelled on `plan._site_edge`.
- **`party_contact_point.channel` is denormalized from the medium by
  `crm._contact_point_shape()`** so "one primary per channel" can be a real partial
  unique index (a primary email AND a primary phone must both be legal). Never write it
  from a client.
- **Setting a primary goes through `public.crm_set_primary_contact_point(id)`.**
  Partial unique indexes cannot be `DEFERRABLE`, so a naive "set new, clear old" 23505s.
- **Components inherit org from their parent** via `crm._inherit_parent_org()`
  (trigger `_a_org_from_parent`, named to sort before `_stamp_*`). Without it
  `_stamp_org_default` derives org from the _creator's personal org_ and silently lands
  a contact point in a different org than its party.
- **Merge never destroys anything.** `public.crm_merge_parties` repoints children whose
  move would not collide, records every moved id in `crm.party_merge.moved`, and sets
  `canonical_id` on the loser — which stays live. `crm_unmerge_parties` replays that
  record exactly. Children that _would_ collide stay on the loser on purpose.
- **Dedup (crm_03_dedup.sql): only contact identity-key collisions auto-merge.**
  `public.crm_detect_merge_candidates(p_org)` merges two live canonical parties
  automatically ONLY when both hold the same live email/phone medium through
  contact points BOTH flagged `is_identity_key` and both carry
  `record_class='contact'` (earlier-created party wins,
  method `'auto'`). Everything weaker — shared medium without both flags, same
  `name_key`, company domain in another company's emails — lands in
  `crm.merge_candidate` as a suggestion (`CHECK (source_id < target_id)`, one
  row per pair ever) for the human review queue at `/crm/duplicates`.
  Dismissal (`crm_dismiss_merge_candidate`) is durable across scans. A party
  gaining `canonical_id` flips its pending candidates to `merged` via the
  `_z_candidate_on_merge` trigger, whatever path merged it.
- **`crm.party.name_key` is stamped by `_b_party_name_key`** (from
  `crm.name_key(display_name)`: lowercase, punctuation→space, trailing legal
  suffixes stripped). It had NO writer before 2026-08-13 — never write it from
  a client, and never compare raw display names for identity.
- **`last_touch_at` is deliberately NOT stored on `party`.** `party` is versioned; a
  cold-call floor would snapshot the whole row into `history.row_versions` on every
  dial. Derive it from `crm.interaction` (indexed `(party_id, occurred_at desc)`).
- **Every CROSS-PARTY read of `crm.interaction` goes through a scoped RPC**
  (`crm_inbox_list_scoped` / `crm_chasebox_items`), never a bare RLS-filtered
  `.select()` — THE VIEW LAW. `fetchPartyDetail` stays the per-record reader.
  Every client read of `attributes` goes through `features/crm/inbox/attributes.ts`;
  its SQL twins are `public.crm_inbound_label` / `crm_inbound_evidence`.
- **`crm.party_purge(id)` is the erasure path** — it also clears
  `history.row_versions`, `platform.comments`, and `platform.user_entity_state`. A
  purge that only deletes the live row is not a purge.
- **Category dimensions are seeded `visibility='public'`.** At `internal` under the
  system org they are invisible to every customer org (empty pickers) _and_ every
  `party → category` edge write fails 42501, because `assoc_add` requires
  `has_access(target,'viewer')`.
- **`text` + a CHECK, never `char(n)`** for `phone_country` / `country_code`: `char` is
  blank-padded and the matrx-orm generator has no Field mapping for `bpchar`.

---

## Entry points

**Routes:** `/crm` (list: People + Companies, `app/(core)/crm/page.tsx`) ·
`/crm/[partyId]` (record page) · `/crm/outreach-lists` (outreach-list console) ·
`/crm/outreach-lists/[listId]` (outreach-list workspace) ·
`/crm/outreach-lists/[listId]/dial` (call queue) ·
`/crm/inbox` (the unified outreach inbox) · `/crm/chasebox` (the action queue) —
both are VIEWS over `crm.interaction` + `crm.outreach_list_member`, never a new
inbox model; their own [FEATURE.md](inbox/FEATURE.md) carries the contract, the
scope decision, and 🚨 the PROVISIONAL `attributes` paths every reader must go
through ·
`/crm/sending-identities` + `/crm/sending-identities/[identityId]` (THE RIGHT TO
SEND — the mailboxes outreach is sent from; its own
[FEATURE.md](sending-identities/FEATURE.md), and the ONE part of this feature
that talks to aidream instead of Supabase, because DNS proofs, OAuth mailbox
credentials and the send gate are server-side by nature) · `/crm/admin` (the feature
admin map).
The main app menu links to the route, opens the manager window, and opens
person/company capture directly. All consume `features/crm/`:

| File                                                | Role                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                          | Row aliases derived from `types/database.types.ts` (never hand-mirrored), joined embed shapes, closed vocabularies, `CRM_LIST_SCOPES`                 |
| `service.ts`                                        | ALL crm reads/writes — direct `supabase.schema("crm")`, scope predicates (THE VIEW LAW), `normalizeMediumValue`, medium find-or-create, the RPC calls |
| `hooks/usePartyList.ts` · `hooks/usePartyDetail.ts` | Query state + generation-guarded fetch                                                                                                                |
| `components/CrmListPage.tsx`                        | List assembly on the canonical entity-list primitives (`MatrxDataTable` controlled, `BrowseScopeTabs`, `useListViewPrefs("crm-parties")`, `ItemMenu`) |
| `components/PartyCreateForm.tsx`                    | Shared person/company capture core; used by `crmCreatePartyWindow` and writes optional email/phone through the canonical medium/contact-point flow. `initialName` prefills it from whatever the calling surface already had on screen |
| `routes.ts`                                         | **THE PREFILL DOOR.** `crmCreatePartyHref({kind, name})` → `/crm?create=person&name=…`; `CrmListPage` consumes the params once on the route mount, opens `crmCreatePartyWindow` prefilled, and strips them so a reload does not re-open it. Any surface naming somebody the CRM should hold links here — never a bare `/crm` index that makes the user re-type the name (first consumer: the Press Room's `JournalistRef`) |
| `components/record/PartyRecordPage.tsx`             | The 360°: identity, contact, addresses, employment (both directions), activity, notes (`platform.comments`), Files/Tasks via `AssociationCardGrid`    |
| `reachability.ts`                                   | **THE ONE suppression rule** — `contactPointBlockReason` + its labels. Channel-agnostic; the dialer and the record agent-surface both read it         |
| `normalize.ts`                                      | The canonical `normalizeMediumValue` (re-exported by `service.ts`), split out so pure consumers can use it without the Supabase client                |
| `agent-context/`                                    | `buildCrmListContextData` · `buildCrmRecordContextData` · `parseContactSelection` (+ its Jest tests) — see § Agent surfaces                           |

**WindowPanels:** `crmManagerWindow` is the full scoped list route inside
WindowPanel chrome; `crmCreatePartyWindow` is the compact create flow. Both are
registered through the overlay controller, metadata registry, catalogue,
Tools-grid, and typed openers.

**UI surfaces:** code-first manifests declare `matrx-user/crm`,
`matrx-user/crm-manager`, `matrx-user/crm-create-party`,
`matrx-user/crm-outreach-lists` (registered by WP5 per D14; the console emits
its scope, the campaign workspace mounts its assist strip) and
`matrx-user/crm-chasebox` (WP1, 2026-08-16 — the page had been mounting an
assist strip against a surface that did not exist, so neither the strip nor a
role could ever resolve; it now emits queue + open-draft values and declares the
`draft_reviewer` role with a NULL default for WP5 to fill, per IC-7). The route
and both windows emit live scopes through `SurfaceRuntimeProvider`; DB rows and
value metadata mirror the manifests.

**Frontend gotchas (paid for once):**

- **Self-join embeds MUST target the FK column** — `employer:primary_employer_party_id(...)`. `party!<fk-name>` and `party!<column>` resolve REVERSE (an array) at runtime; postgrest-js can't infer the column-target form, so the service pins it with `.returns<PartyListRow>()`.
- List scopes are `mine` / `orgs` / `public` client-side predicates (`created_by` / `organization_id in my orgs` / `visibility='public'`). **`shared` needs a grant reader RPC** — do not fake it with a bare RLS read.
- **Classification (record page):** stage + rating are FK columns
  (`lifecycle_stage_id` / `rating_id`) set through `updateParty` with
  `CategorySelect` (`features/scopes/components/CategorySelect.tsx`); roles are
  `party → category` edges, role `member`, via `CategoryTagPicker`
  (`features/scopes/components/CategoryTagPicker.tsx`) — never a direct
  `platform.categories` read (`cat_list` only, inside those primitives).
- **Trash:** the list's Trash view flips the `deleted_at` predicate with the
  scope predicates intact; restore = `restoreParty`, erasure =
  `purgeParty` → `crm_party_purge` behind a destructive confirm.
- `party` + `crm_outreach_list` are registered in `ENTITY_OVERLAY`
  (`features/scopes/registry/entityRegistry.ts`) and `ASSOCIATION_TARGET_TYPES`
  (`features/scopes/types.ts`); notes use `commentsService` with
  `entityType: "party"` + explicit `orgId`.

**Tokens** (`platform.entity_types`): `party`, `contact_medium`, `crm_outreach_list`,
`crm_saved_view` (entities) · `party_contact_point`, `crm_address`, `crm_affiliation`,
`crm_interaction`, `crm_outreach_list_member`, `crm_party_merge` (components).

**RPCs** (`public`, `auth.uid()`-gated, `activity_log`-audited):
`crm_set_primary_contact_point` · `crm_merge_parties` · `crm_unmerge_parties` ·
`crm_party_purge` · `crm_detect_merge_candidates` · `crm_dismiss_merge_candidate`.

**Server models:** aidream `db/models/crm.py` + `db/managers/crm/` (generated;
`crm` is registered in `aidream/db/matrx_orm.yaml`).

**Inherited, never rebuilt:** notes = `platform.comments` (pass `p_org_id` — `cmt_add`'s
org resolution is task-only) · audit = `platform.activity_log` · favorites/pins/recents
= `platform.user_entity_state` · follow-ups = real `workspace.tasks` via an edge ·
attachments = `features/files` · tags/stages = `platform.categories` · the 360° view =
`AssociationCardGrid` once `ENTITY_OVERLAY` has a `party` line.

---

## Agent surfaces (2026-08-14)

Three read surfaces plus one universal capture point.

**`matrx-user/crm-record`** (`crm-record.manifest.ts` + `agent-context/buildCrmRecordContextData.ts`)
— the 360° record page was the CRM's largest agent blind spot: an agent on
`/crm/[partyId]` saw nothing at all. It now emits identity, every contact point
**with its resolved usability verdict**, addresses, employment both directions,
the interaction timeline, and a derived `last_touch_at`.

- **Read-only, deliberately.** No write targets: every party mutation is either
  governed (the server resolver) or destructive (merge / delete / purge /
  primary flips). An agent proposes; the human presses the button.
- **Reachability is resolved for the agent, never left to it.** `reachability.ts`
  is the ONE rule (record `do_not_contact` → point `opt_out_at` → medium DNC /
  invalid / suppressed). It was inlined phone-only inside `computeDialTargets`;
  a second copy for email would have quietly defeated the reason
  `crm.contact_medium` exists. The dialer consumes the same function and the
  same label map.

**`matrx-user/crm` / `crm-manager`** — unchanged contract; the payload build moved
out of `CrmListPage`'s JSX into `agent-context/buildCrmListContextData.ts` so a
menu `getApplicationScope` and the provider emit identical values.

### "Save as contact" — the universal capture point

Highlight a name, an email signature, a byline or a company footer on ANY
surface → right-click → **Convert → Save as contact**.

- Registered as a **rich-document action** (`features/rich-document/actions/
handlers/contact.ts`), not per-surface wiring: a CRM that only captures from
  `/crm` captures nothing, and the v3 menu is already everywhere. Gated by
  `looksLikeContact`, so the row never appears on prose.
- **A deterministic parser fills the dialog** (`parseContactSelection`) before
  any model runs — the user reviews a filled form, not a spinner. The parser is
  hints only; the agent corrects it against the raw selection.
- **The save is governed and has no client fallback.** `SaveContactFromSelection
Dialog` runs the `crm.save_contact` mandate → `data_action(operation=
"resolve_contact")` → the party resolver (canonicalize + dedupe on
  email/phone/domain/platform ids + merge lineage). **Never a raw insert:** the
  raw `database` tool is blocked from the `crm` schema server-side, and a direct
  `.insert()` would manufacture exactly the duplicates `/crm/duplicates` exists
  to clean up. An unresolvable mandate disables the save and says why — no
  hardcoded agent id, ever.
- The run **floats** in the live-run window (never a spinner) and the result is a
  **door**: "Open contact" → `/crm/[id]`, and it says plainly when it matched an
  existing record instead of creating one.
- **Client tools were deliberately NOT built.** The server already covers the
  capability: `data_action(resolve_contact)` is the governed create, and the
  generic `data` tool registers `party` (alias `contact`) for
  query/get/count/update. The only genuinely uncovered piece is linking a party
  to another entity — that belongs to the associations system, not a bespoke CRM
  tool, and forking one here would be the defect.
- **Server halves:** agent `CRM Contact Saver` (`d9607d65`), mandate declared in
  aidream `services/mandates/client_mandates.py`. **Live status: blocked on an
  aidream deploy — see D192 in `FOUND_DEFECTS.md`.**

## Native contact import (`/crm/import`)

Wizard: source (CSV/TSV/pasted text, Excel `.xlsx/.xls`, or vCard `.vcf/.vcard`)
→ column mapping (auto-guessed from header synonyms and named export fingerprints)
→ **dry-run preview** → commit. Engine in `features/crm/import/`
(`engine.ts` — parse/guess/plan/commit; `types.ts`); UI in
`components/import/ImportWizard.tsx`; bulk dedup lookups live in `service.ts`
(`findExistingMediumOwners`, `findPartiesByNames`, `findPartiesByDomains`,
`findOrCreateCompanyByName`). Rules paid for once:

- **Nothing writes before the preview is confirmed.** The dry run resolves, per
  row: `create` / `exists` (with a door to the owning record) /
  `duplicate_in_file` (first claim wins) / `invalid` (no name).
- **Dedup identity:** people dedupe on normalized email/phone values already
  owned by a live party in the org (names are too weak to skip a person on —
  a person row with no valid email/phone re-imports; that is the resolver's
  Wave 1 job, not the import wizard's). Companies dedupe on exact domain, then
  case-insensitive exact name.
- **Employer cells** find-or-create the company once per distinct name and add
  a current+primary `crm.affiliation` (the mirror trigger fills the list's
  Employer column).
- **Every native format becomes the SAME tabular mapping shape.** There is no
  Google/Outlook/Salesforce-specific commit path. Google Contacts, Outlook,
  Salesforce, HubSpot, and LinkedIn fingerprints improve mapping and explain what
  was detected; generic exports still work. CSV/TSV is parsed as a matrix, then
  headers are deduped exactly once—PapaParse calls `transformHeader` twice, so a
  stateful transform silently renamed every ordinary header to `Name (2)` and broke
  all auto-mapping before the 2026-08-15 regression test caught it.
- **Ragged rows never disappear.** Surplus cells get generated column names and a
  visible warning; missing trailing cells stay blank. Files are capped at 20 MB and
  10,000 rows with an actionable split-file error rather than freezing the tab.
- **Excel is user-triggered code.** SheetJS loads through `await import("xlsx")`
  only after a workbook is chosen; never pull it into the route's initial bundle.
- **Every resolved identity is a door.** The selected organization, existing party,
  existing employer, created parties/companies, and partially-created failed records
  use `EntityRef` or a count link back to the CRM.
- Cross-repo vision, exhaustive source inventory, official MCP shortlist, and
  Extend/Local briefs:
  `/Users/armanisadeghi/code/common-docs/systems/crm/IMPORT-SOURCES.md`.
- **Component inserts never use RETURNING** — see the service comment on
  `addContactPoint` and D181 in `FOUND_DEFECTS.md`: the id-list `std_select`
  policy on component tables cannot see a row being inserted, so
  `INSERT…RETURNING` 42501s. Insert bare, re-read in the next statement.
- **Known limits:** the commit is client-driven — a page close/reload mid-run
  leaves the current row partial (party without its later points/affiliation);
  re-running converges to "exists" via email/phone dedup but does NOT backfill
  the missing pieces (no enrich-existing mode yet — that is the Wave 1 party
  resolver's territory). Rows with no valid email/phone dedupe by nothing and
  re-import as new people. Excel uses the first non-empty worksheet and asks the
  user to import other sheets separately; the durable paged/resumable import-job
  spine is Wave 1 in the cross-repo program.

## Outreach lists + call queue (`/crm/outreach-lists`)

Data layer `features/crm/outreach-lists/` (`types.ts` vocabularies + dispositions,
`service.ts` all reads/writes); UI `features/crm/components/outreach-lists/`
(console, workspace, `CallQueuePage` dialer, `AddMembersDialog` filter
enrollment, `AddToOutreachListDialog` selection enrollment, `badges.tsx` — the ONE
status→color map). Enrollment on-ramps: `/crm` row selection → bulk bar →
"Add to outreach list", or list workspace → "Add members" by filter. Rules paid
for once:

- **The claim lock is a CONDITIONAL UPDATE, no RPC.** `claimNextMember` reads
  candidates then takes one with an UPDATE re-asserting claim-free
  (`claimed_until` null/expired/ours) — zero rows back means another rep won;
  try the next candidate. `UPDATE…RETURNING` is legal on component tables
  (only `INSERT…RETURNING` 42501s — D181); every member insert stays bare.
- **Suppression is resolved BEFORE a number is offered** (`computeDialTargets`
  precedence: party `do_not_contact` → point `opt_out_at` → medium
  `dnc_state='listed'` → `verification_status='invalid'` → `suppressed_at` /
  `is_contactable=false`). Blocked numbers render greyed WITH the reason; a
  claimed member with zero dialable numbers is auto-marked `suppressed`
  (tallied visibly, capped at 25/advance) — never silently dialed or skipped.
- **"Do not call" scrubs the MEDIUM** (`suppressed_at` +
  `suppression_reason='dnc_request'` — one update covers every party sharing
  the number) AND flags the party `do_not_contact`. Member status
  `suppressed`.
- **Dispositions write the interaction FIRST** (permanent record), then the
  member update guarded `.eq("claimed_by", me)` — a lost claim throws loudly
  instead of clobbering a colleague's state. Retry windows: voicemail +24h,
  no-answer +4h; skip defers +15min without logging.
- **Enrollment shares the list's predicate builder**
  (`applyPartyListPredicates` in `service.ts`) so filter preview and enrolled
  set can never diverge; dedup pre-reads member `party_id`s (the partial
  unique index would abort a whole batch on one duplicate); DNC records are
  excluded by default; filter enrollment throws above `FILTER_ENROLL_CAP`
  (5000) rather than truncating.
- **Outreach-list scope is blended mine + my orgs** (declared, THE VIEW LAW) — a
  sales-floor work console, not a browse surface.
- **The outreach-list row is an access state, never PostgREST prose.**
  `fetchOutreachList` uses `maybeSingle` and raises the canonical
  `recordUnavailable(token="crm_outreach_list")` for zero rows. The workspace
  and dialer render `<AccessGate>` so denied / deleted / missing / signed-out /
  transient each get the true explanation and a way forward. The dialer does
  not claim a member until this parent row is readable.
- **The one-email door is data-gated to Lane B.** The member action renders only
  when the persisted `outreach_list.lane` is `cold_outreach`; there is no lane
  boolean in the request. The workspace attaches a real org sending identity to
  `outreach_list.sending_identity_id`, names its readiness, and links straight to
  the mailbox checklist when it cannot send. New lists explicitly persist Lane B
  instead of depending on a database default. The server still derives both lane
  and identity from this campaign row and `crm.check_send_eligibility()` remains
  the only send authority.
- **An unresolved merge field is a governed refusal, not a system failure.**
  `POST /outreach/single/drafts` returns 409, and both draft dialogs render
  `readOutreachProblem()`'s named fields plus the server's fix. The diagnostics
  boundary keeps only this exact draft-creation refusal local; changed drafts,
  send failures, other routes, and server failures remain red.
- **Enrollment sources are the list selection, an ad-hoc filter, or a SMART
  VIEW** (`AddMembersDialog` source picker). Whichever it was, the enrolled
  list stamps its provenance into `crm.outreach_list.definition`
  (`recordEnrollmentSource` / `readEnrollmentSource` — the column that shipped
  with no writer), so the workspace header names the query that filled the
  queue and links back to it at `/crm?view=<id>`.
- 🚨 **A MEMBER WHOSE PARTY YOU CANNOT READ IS RESOLVED, NEVER LABELLED.** The
  member row is a component of the LIST, so it is readable by anyone who can
  read the list — but its `party` embed is filtered independently by
  `crm.party` RLS, and enrollment across orgs makes that routine: the list can
  live in org A while a member's party lives in org B, so a rep in only A sees
  the row with a hole where the person is. `outreach_list_member.party_id` is
  `ON DELETE CASCADE`, so "missing" is impossible and a soft-deleted party
  still embeds for anyone with access — **a null embed means the reader lacks
  access, or their session lapsed.** Never print a guess like
  "(record unavailable)". Resolve it: `useAccessStates("party", ids)` asks
  `access_denied_context` once for every hole on the page, the cell renders
  `<UnresolvedEntityRef>` (true state + owner + org + the canonical
  **Request access** panel + "Remove from outreach list"), and the row's
  ⋮ menu branches on the SAME answer — every verb needing the person (open,
  "Write one email", "Back to queue") is withheld, leaving only Remove.
  The **call queue** does the same: `buildQueueEntry` raises the canonical
  `recordUnavailable` (`fetchPartyDetail` reads the party with `maybeSingle`,
  so a denied party is never PostgREST prose on a rep's screen), and the dialer
  releases + defers that member and names it — it does **not** mark it
  `suppressed`, which would assert a contact decision nobody made, and it does
  not kill the queue as it used to. The Error Inspector capture deliberately
  stays red: a queue serving members nobody can work is a real data problem.
- **Known limits:** dialing is a `tel:` handoff (no telephony integration);
  member table search/status filter are server-side but member columns don't
  sort.

## Suppression, and its reverse

Read `reachability.ts` first — it is THE one reader: `contactPointBlockReason`
answers "may we use this point?" (record-first precedence), and
`mediumBlocks` / `blocksSurvivingUnsuppress` answer "what is on this value, and
what would survive an undo?". Never restate a block list in a component.

**THE REVERSIBILITY RULE.** "Do not call" writes exactly two things —
`contact_medium.suppressed_at` (+ reason) and `party.do_not_contact` — and both
are undoable, because a mis-click that permanently scrubs a number org-wide is
the more expensive failure. Everything else a medium carries (unsubscribe,
complaint, hard bounce, DNC-registry listing, invalid verification) is a fact
from outside or a legal opt-out: the undo never clears one, and the surviving
blockers are named in the confirm and in the resulting toast.

- **Party half:** `allowPartyContact` (single record — also logs a `note`
  interaction) and `setPartiesDoNotContact` (the list's bulk bar, both
  directions; `crm.party` is versioned, so `history.row_versions` already
  records the actor).
- **Medium half:** `unsuppressMedium` clears `suppressed_at` /
  `suppression_reason` / `suppression_expires_at` and appends to the medium's
  `details.suppression_history` (who / when / previous reason). The medium is
  NOT versioned, which is exactly why that history entry exists.
- **Offered where it bites:** the record's Contact card (per suppressed value),
  the identity card's do-not-contact toggle, the dialer's blocked dial targets
  (which re-resolve the card from the DB after the lift), and the `/crm` bulk
  bar. Auto-suppressed names in the dialer's tally are links to their records.
- This also resolves the old expiry trap: a suppression whose
  `suppression_expires_at` has passed still blocks (generated `is_contactable`
  has no clock), and `isSuppressionExpired` says so in the confirm so a rep
  knows the lift is expected rather than an override.

## Smart views (`crm.saved_view`)

**A named, re-runnable `/crm` query** — the list becomes a work queue instead of
a browser. `lib/list-views` persists STYLE and deliberately never QUERY, so a
view is a real record: owner, org, and the platform `visibility` tier as the
only sharing mechanism (`personal` = mine, `internal` = the org can open AND
edit it, which `iam.has_access` already confers — nothing invented).

- Data layer `features/crm/saved-views/` (`types.ts` — the definition shape,
  its validator, `definitionFromQuery` / `queryFromDefinition` /
  `definitionsMatch` / `describeDefinition`; `service.ts` — declared-scope read
  of mine + my orgs, create/update/touch/delete). UI:
  `components/saved-views/SavedViewBar.tsx`.
- **The definition is jsonb and is validated on read.** An unrecognised field
  falls back to its default rather than throwing away a list page the user only
  wanted to browse. `SAVED_VIEW_DEFINITION_VERSION` is the shape version —
  bump it and teach the parser when the definition changes.
- **Applying a view lands through the SAME setters the human controls call**
  (`usePartyList.setQuery` + `useListViewPrefs.setPrefs`), like the agent write
  handlers. There is no second query path, so a chip click, a filter click and
  an agent write are indistinguishable downstream.
- **`/crm?view=<id>` opens a view** — that is what makes it a destination an
  outreach list (or a teammate) can link to. Only the route mount reads it;
  the floating `CrmManagerWindow` has no URL of its own.
- A view never describes the trash: it is a queue of live records.
- **Bulk actions** on the list selection: add to outreach list, flag
  do-not-contact, allow contact, delete — each behind a confirm that states
  what it does NOT touch (a value suppressed on the medium stays suppressed).
- **Known limits:** the definition covers what the list can serve server-side
  today; a view cannot yet express "no phone number" or "not contacted in 30
  days" (both need a predicate over `crm.interaction` / contact points, not a
  party column). No per-view member counts on the bar — counting every view on
  every load is a query per chip.

## Dedup + merge review (`/crm/duplicates`)

Detection is `crm_detect_merge_candidates` per org (the review page's Scan
button, and once per session from `CrmAssistStrip` on `/crm`). UI in
`features/crm/components/dedup/`: `DuplicateReviewPage` (queue + recent merges
with exact undo), `CandidatePairCard` (side-by-side comparison stating exactly
what a merge moves and what stays; winner defaults to the earlier-created
record), `MergeStatusCard` (record-page banners: merged-into, possible
duplicate, absorbed merges), `CrmAssistStrip` (assists producer
`crm-assists-producer.ts` — auto-merge receipt chip + review chip, both
navigate actions). `/crm` header carries a Duplicates door with the true
pending count. Every party named on these surfaces opens (THE DOOR LAW).

## Experts (`expert_status`) — the loop the CRM was built for

**A research topic finds experts; they become `crm.party` rows here.** The
producer is aidream `services/crm/expert_promotion.py` (deterministic — it
reads the structure the page-analysis agent already produced, no second model
call) and it writes ONLY through the party resolver. The reader is this
feature: the `/crm` Expert column (server-side filter: any tier / a tier /
not an expert) and `ExpertStatusCard` on the record page.

- **Tiers are `registered → approved → vetted`, and only the FIRST may be
  proposed by a producer.** `expert_status` is in the resolver's
  `_FILLABLE_FIELDS`, so a promotion fills a NULL and can never demote a
  human's verdict. Raising a tier (or clearing it) happens on the record page
  through `setExpertStatus`. Vocabulary: `EXPERT_STATUSES` in `types.ts`, twin
  of `EXPERT_STATUSES` in the resolver.
- **"Expert of topic X" is an EDGE, never a column** — `party -> research_topic`
  role `expert_for` (registered in `crm_02_core.sql`; `EXPERT_EDGE_ROLE`).
  Provenance per page is a `party -> research_source` edge carrying the
  `party_observation` payload. Readers: `fetchTopicExperts` (topic → its
  experts) and `fetchPartyExpertTopics` (person → their topics, so the record
  page can open each one).
- **Promotion is suggestion-gated.** The extraction endpoint writes nothing;
  the promote endpoint accepts only keys its CURRENT extraction produces and
  refuses anything below the promotable floor unless the caller explicitly
  confirms. Strong candidates are pre-selected in the UI, weak ones are not.
- **The directory is public by design** — experts charge for what they sell,
  never for being looked at. Nothing here gates viewing on a tier.
- **`allow_name_match=True` is deliberate for this producer** (resolver default
  is false for persons): expert candidates carry no email or phone, so without
  name matching every re-scan would mint a duplicate of every expert.

## People found on an outlet — Outreach Phase 2 / G2

An organization record with a `primary_domain` now renders
`OutreachContactCandidatesCard` in its existing `/crm/[partyId]` record page.
There is no outreach-only console. The card calls the typed Python contract in
`outreach-contacts/service.ts`; the server reads the research crawl and returns
current authors/editors/contributors without writing.

- Every candidate shows confidence, the deterministic reasons, and a new-tab
  door to every source page. Once confirmed, the person's name becomes the
  canonical `EntityRef` door to their CRM record.
- Literal observed addresses show their own confidence and association reason,
  plus a door to the exact page where the address appeared. High-confidence
  personal addresses are preselected for one-click confirmation; role addresses
  are never preselected and require a second warning/confirmation.
- A weak person likewise requires the second act. The server independently
  revalidates both person and selected addresses, so UI state cannot inject a
  guess. An observed address remains visibly unverified; Phase 4's send gate is
  still responsible for refusing unverified delivery.
- Confirmation refreshes the same card. Existing party, affiliation, and email
  state render as `Confirmed` / `Attached`, making reruns understandable rather
  than silently no-oping.

## The candidate queue and journalist intelligence — WP3

Two more cards on the SAME `/crm/[partyId]` record page. There is still no
outreach-only console, and there is no second candidate list.

- **`ContactCandidatesCard`** renders the persisted `crm.contact_candidate`
  rows (IC-3) — the ONE ranked list every producer writes to: the crawl, the
  paid waterfall, the open registries, the extension. `OutreachContactCandidatesCard`
  above it stays exactly as it is: it is the zero-write authority on what a
  crawled page _says_, and it folds into this same list. **Two lists on one page
  would be the half-application the no-partial-application law names — these are
  one list and its source.**
  - **The two second-confirmations are two separate questions**, each with its
    own reason, mirroring the server's two named arguments. There is no generic
    "confirm anyway" here because there is none on the server.
  - **Unverified is stated plainly** ("Not checked yet" / "We have not confirmed
    this mailbox exists"), because no verification vendor is connected yet.
    Dressing an unchecked address up as a good one is how a customer's own
    sending domain gets burned.
  - Refusing is durable — the server keeps the verdict through every later
    re-discovery, so the user is never asked twice.
- **`JournalistIntelligenceCard`** (people only) shows the activity verdict
  already stamped on the party — rendered with **no request and no spend** —
  plus the beat profile. Three honesty rules it renders rather than describes:
  `inactive` is not a verdict (`active` / `stale` / `moved` / `unknown`, and
  `moved` reads as a suspicion); a beat below four pieces we have actually read
  is refused with the count; and a campaign fit is a VERDICT
  (`strong`/`moderate`/`weak`/`none`) whose ABSENCE renders as "no campaign has
  been described", never as `none`.

## Starting outreach where the opportunity was found — G9

`features/crm/outreach-start/` (client bridge) + `features/crm/components/outreach-start/`
(the two mounted components). **There is no outreach console** — every door
lands in `/crm/outreach-lists/[listId]`, the workspace that already exists
(outreach handoff §7).

- 🚨 **The mounted aidream paths are `/seo/sites/{site_id}/crm/{referring-domains,reputation-outlets,fold-settings}`.**
  aidream router prefixes are BARE — the `/api/seo/...` form written in the
  handoff appears in `/openapi.json` and is unreachable at runtime. They are
  called through `@/lib/api/typed-client`, so a wrong path is a compile error.
- **`crm.resolve_party` is the ONLY domain→party path and it is server-side.**
  Never match a domain to a party in the client to create anything; the fold
  endpoint is the call site, it is idempotent on the domain key, and it stamps
  the provenance edge. The client only _reads_ the result back.
- **`normalizeDomainKey` is the TS twin of aidream's `normalize_domain`** and
  must stay in step. A reputation case carries `source_domain =
"www.andysowards.com"` while the party is stored as `andysowards.com`; before
  the twin existed the door reported "could not be turned into an
  organization" about a record the server had just created. Parity test:
  `outreach-start/__tests__/normalize-domain-key.test.ts`.
- **Fast path first.** A fold resolves up to 250 domains, so `StartOutreachDialog`
  looks the outlet up BEFORE folding and only folds when it is genuinely
  missing. After a site's first fold every door is instant.
- **`REPUTATION_OUTREACH_VERDICTS` is narrower than the server's.** aidream also
  folds `strengthen`; the client does not offer outreach on it, because
  `strengthen` is a verdict about our OWN page. A button that pretends is worse
  than none.
- **The motivating record rides along.** `addMembersByPartyIds` takes optional
  member `metadata` (`reputation_case_id` / `backlink_id` /
  `referring_domain_profile_id`) — the exact keys `SingleSendDialog` reads, so
  the send opens already bound to the case (attribution, G8). That dialog now
  re-adds a bound case that the org inventory filters out (`pitch_angle IS NULL`);
  otherwise the selector rendered EMPTY over a real binding.
- **`CrmFoldControl` is ONE record with TWO renders** — the site-settings
  surface and beside the prospect/case list. Mode `off` refuses WITH the reason
  and the fix; every run reports what it SKIPPED and why. The folded-doors list
  is capped at 12 `EntityRef`s on purpose: 206 of them exhausted the browser's
  connection pool with route prefetches (`ERR_INSUFFICIENT_RESOURCES`).
- **`PartyProvenanceCard`** answers "why is this org in my CRM" on the record
  page. It reads the provenance EDGE ids via `assoc_for_entity` and then the
  **live** `seo` row — `platform.associations` has zero browser grants and the
  `assoc_*` RPCs return `metadata`, not `payload`, and the live row is the
  better answer anyway (current verdict, not a snapshot). It also carries the
  `discovered → contact` promotion, which stays a human act.
- **Enrollment asks the same question everywhere** — `OutreachListPicker`
  (hook + fields), extracted from `AddToOutreachListDialog`.

## Not built yet

- "Shared" list scope (needs a crm grant-reader RPC).
- The `web.brand` fold and public expert registration — see
  [`docs/handoffs/crm-system.md`](../../docs/handoffs/crm-system.md).

---

## Change log

- 2026-08-18 — **Expected unresolved-variable draft refusals stay out of the
  repair queue.** The exact single-draft 409 is isolated at the diagnostics
  boundary for both the legacy `conflict` and canonical `unresolved_variables`
  codes; the dialogs still render every missing field and the server's fix.
- 2026-08-17 — **Missing or unreadable outreach lists stopped entering the
  repair queue as PGRST116.** The shared reader now uses `maybeSingle` plus the
  canonical `recordUnavailable` contract; the workspace and dialer render the
  existing `AccessGate`, and the dialer waits for the parent list before
  claiming work. A stale, deleted, denied, or signed-out list route therefore
  resolves to its true state instead of printing "Cannot coerce the result to a
  single JSON object" or touching child rows.
- 2026-08-16 — **The candidate queue and journalist intelligence landed on the
  party record (WP3, round 2).** `ContactCandidatesCard` is the human half of
  enrichment — the ONE persisted candidate list with one-click confirm through
  `confirm_candidate`, its two named second-confirmations, durable refusal, and
  a door to the page every address was read on. `JournalistIntelligenceCard`
  renders the stored activity verdict with no request, and the beat profile with
  its campaign-fit VERDICT (never a number — the server's first live run scored
  a perfect-fit journalist 8/100). Typed client: `features/crm/enrichment/service.ts`.
- 2026-08-16 — **A confirmed win now shows on the roster, and drafts are
  reviewed at volume (WP1, round 3).** Two halves of the same day's work:
  (1) **the outcome lands on the member.** The server sync
  (`aidream/services/outreach_outcomes/`) completes the member behind every
  confirmed `platform.outcome_event`; the roster gained an **Outcome** column
  reading `metadata.outcome` through `readMemberOutcome`, and the chip is a door
  — it opens the Outcomes view with that exact row selected. `outcome_id` is a
  `platform.categories` FK (the label), never a pointer at the event table; the
  evidence is copied onto the member so the roster needs no join.
  (2) **the Chasebox is a triage surface.** `ChaseboxDraftDialog` now walks the
  queue on `J`/`K`, approves/sends/edits/rejects on `A`/`S`/`E`/`R`, and renders
  each AI-written line beside the FACT and SOURCE PAGE it came from — see
  [`inbox/FEATURE.md`](inbox/FEATURE.md) § Draft triage. Edit and reject are two
  new canonical single-send calls (`reviseOutreachPersonalization`,
  `rejectOutreachDraft`); there is still exactly one send path. The Chasebox is
  also a REGISTERED surface now (`crm_ui_surface_chasebox.sql`, applied live)
  with the `draft_reviewer` role declared NULL for WP5 (IC-7), and the campaign
  workspace mounts the outreach-lists assist strip.
- 2026-08-16 — **The loop is closed on the campaign workspace: attribution
  outcomes (WP4, IC-5).** `features/crm/outcomes/` reads `platform.outcome_event`
  directly (schema-scoped supabase-js, server-paged) and surfaces it as the
  "Outcomes" view on `/crm/outreach-lists/[listId]` (`?view=outcomes&outcome=<id>`
  is the deep link the attribution assists emit). The evidence drawer shows EVERY
  signal the matcher checked — fired and not fired — because credit is taken on
  Arman's low bar and the drawer is the defence. The ONE write path is
  `platform.decide_outcome_event` (SECURITY DEFINER; stamps decided_by, completes
  a reputation-case subject on confirm) via `decideOutcomeEvent()` — never a raw
  row update; only the aidream attribution pass inserts rows. `match_detail` is
  read only through `lib.ts` narrowers (jsonb-narrower convention), pinned by
  `lib.test.ts`. Proven in-browser: seeded proposed row rendered, "Confirm the
  win" wrote a real confirmed decision through the RPC with the session user
  stamped; seed removed. Server contract:
  `aidream/services/outcome_attribution/FEATURE.md`.

- 2026-08-15 — **"(record unavailable)" is gone from the outreach roster; the
  platform now has an inline door for a reference it cannot resolve.** A member
  of "Phase 4 — first governed send" rendered a bare italic string for a party
  in another org, asserted no cause, offered no door, and still let the rep act
  on the person through the ⋮ menu. Root cause was ordinary and will recur:
  cross-org enrollment plus `crm.party` RLS. Two new primitives beside
  `features/access-gate` — `useAccessStates(token, ids)` (the LIST counterpart
  of `useAccessGate`; module-cached, one RPC per distinct id) and
  `<UnresolvedEntityRef>` (the inline sibling of `EntityRef`: resolved state in
  the cell, then owner, organization, the canonical `RequestAccessPanel`, and
  the surface's own repair one click away). The roster consumes both and gates
  its row actions on the same answer. `fetchPartyDetail` reads the party with
  `maybeSingle` + `recordUnavailable` instead of `.single()`, which is what let
  a single unreadable member kill the whole call queue with
  "Cannot coerce the result to a single JSON object · PGRST116"; the dialer now
  defers and names it. Verified in the browser as `admin@admin.com` (denied
  chip, popover, request panel, suppressed menu, readable rows unchanged) and
  on a scratch list for the drained-queue path.
- 2026-08-15 — **`EVERY USER HAS A PARTY` became a live invariant, not a promise.**
  `crm.ensure_user_party` plus the `auth.users` signup/promotion trigger provisions
  one normal AI Matrx-tenant party per permanent account, claims exact unambiguous
  pre-existing identities, attaches Auth-backed media, and aborts ambiguous account
  mutations. Backfilled 199/199 permanent users; 31 anonymous principals remain
  excluded; duplicate claims and missing parties are both zero. The owner Voice
  program's verified phone now resolves through the same party/contact-medium model,
  without hardcoding or logging the number. Transactional rollback tests, least-
  privilege grants, live advisors, generated types, and the migration ledger all pass.
- 2026-08-15 — **G9: outreach starts where the opportunity is found; G1 finally
  has a frontend.** A reputation verdict was a dead end — a `pitch` case with a
  live `pitch_angle` terminated in "Start action", which only wrote
  `status='in_progress'`. Every verdict now resolves to the action it actually
  implies (outreach for `pitch`/`request_update`/`correct`/`respond`; the page
  workspace for `strengthen`; a recheck for `investigate`; honest inertness for
  `monitor`/`leave_alone`), and the same "Start outreach" door sits on
  referring-domain prospects (a `toxic` domain refuses with the reason). The
  live G1 fold + `auto|manual|off` mode control got their caller, rendered in
  both places the contract names. See § Starting outreach where the opportunity
  was found. Browser-verified end to end against the live DB and production
  aidream: prospect → resolve → enrol → the existing campaign workspace, and a
  reputation case whose binding then named itself inside `SingleSendDialog`.
- 2026-08-15 — **The unified outreach inbox + the Chasebox (WP1).** `/crm/inbox`
  and `/crm/chasebox`, both VIEWS over `crm.interaction` +
  `crm.outreach_list_member` — no new table, no second inbox model, no separate
  outreach console. `migrations/crm_08_inbox_chasebox.sql` applied live +
  ledgered (scoped list / counts / facets / handled-write RPCs, plus the five
  Chasebox queues in one row type). The inbox is the THIRD consumer of
  `lib/entity-list`; replying reuses the canonical `SingleSendDialog`, and the
  `outreach.send` capability gate moved INSIDE that dialog — which also closed
  the outreach-list workspace's silently missing gate. `InteractionTimeline`
  now marks an inbound reply visually, shows the classifier's verdict and
  evidence, and links to the campaign it answers. Contract + the PROVISIONAL
  server `attributes` paths: [`inbox/FEATURE.md`](inbox/FEATURE.md).
- 2026-08-15 — **Outreach Phase 4 / real-case door:** the one-email dialog now
  inventories the organization's real reputation cases through the existing
  Marketing query/type layer and lets the human bind one explicitly before
  preview. Member metadata remains the preselected value when an upstream
  workflow already supplied it. The rendered draft fingerprints that case, so
  changing the selection requires a fresh preview and approval; a hidden
  `reputation_case_id` is no longer the only way to reach the promised case →
  message path.
- 2026-08-15 — **Outreach Phase 4 / mailbox door:** every newly created
  outreach list now persists Lane B explicitly, and its workspace can attach an
  organization sending identity to the campaign row. The selected mailbox is
  linked to its real checklist and cannot masquerade as ready; the member-level
  one-email action remains available only when the persisted lane is
  `cold_outreach`.
- 2026-08-15 — **Outreach Phase 2 / G2:** organization record pages now expose
  crawl-backed people with visible why/source evidence and governed one-click
  confirmation. Reused `SectionCard`, `EntityRef`, typed Python client, canonical
  CRM record page, and the existing confirmation dialog; no new route or console.
- 2026-08-15 — **Discovered records and merge losers are gone from every party
  picker/import/dedup surface.** The universal candidate RPC now reads structured
  equality predicates from `platform.entity_types.reference_candidate_predicates`;
  `party` declares `record_class='contact'`, while `canonical_id IS NULL` applies
  generically to every registered table that has the column. CRM direct reads and
  `crm_detect_merge_candidates` enforce the same contact-only boundary, including the
  `/crm` duplicate badge. The unsafe direct-table picker/title fallbacks were removed.
  Live verification: 6 contact rows returned, 0 of 1,181 discovered rows, 0 merge losers;
  mixed by-id resolution returned only the contact.
- 2026-08-15 — **Native contact exports now enter the existing accountable preview.**
  `/crm/import` accepts CSV/TSV/paste, Excel `.xlsx/.xls`, and multi-contact vCard
  `.vcf/.vcard`; recognizes common Google Contacts, Outlook, Salesforce, HubSpot,
  and LinkedIn headers; handles Google `:::` multi-value cells; and keeps SheetJS
  off the initial route bundle. Eight parser/mapping regressions cover Google,
  Outlook TSV, ragged rows, vCard channels, quoted-printable UTF-8, escaped vCard
  delimiters, misleading email/phone metadata, and a real multi-sheet Excel file.
  The tests exposed and fixed the
  pre-existing PapaParse double-`transformHeader` bug that renamed every header and
  defeated auto-mapping. Canonical multi-project program:
  `common-docs/systems/crm/IMPORT-SOURCES.md`.
- 2026-08-15 — **`PartyNotes` stopped reporting a failed load as an empty record.**
  A `cmt_list` failure left `comments` at `[]`, so the panel rendered a calm
  `0` count and "No notes yet" over a record that may have many notes — the
  failure existed only in the console. It now tracks the error, renders
  "Couldn't load notes — \<real message\>" with a Retry that re-runs `load()`,
  and suppresses the count entirely while failing (an authoritative `0` is the
  same lie as the empty state). The message is finally specific because the
  shared mapper stopped discarding it — see `features/scopes/FEATURE.md`
  (2026-08-15). **A failed read is not an empty list**; any other CRM section
  that swallows its error the same way owes the user the same treatment.
- 2026-08-14 — **`record_class`: platform-discovered parties stop drowning the CRM.**
  New `crm.party.record_class` column + backfill of 1,181 rows, default list predicate,
  the Record facet, and `crm_list_scope_counts(p_record_class)`. Server half (every
  automated producer stamps `discovered`): `aidream/aidream/services/crm/FEATURE.md`.
- 2026-08-15 — **Scope counts are ONE round trip** (D139). `fetchPartyScopeCounts`
  fired `3 + N_orgs` `head:true` count queries — one per scope tab plus one per
  organization — and `usePartyList` re-ran the whole fan-out on every 200ms
  search-debounce tick, so a user in 8 orgs paid 11 requests per keystroke.
  Replaced by `public.crm_list_scope_counts(p_view, p_kind, p_search)`
  (`migrations/crm_list_scope_counts.sql`, applied + ledgered), built to the same
  shape and conventions as its `agx_list_scope_counts` / `trx_list_scope_counts`
  twins: SECURITY DEFINER, `auth.uid()`-gated, returning
  `(scope, narrow_id, label, total)` so the My Orgs dropdown gets its labels from
  the same query. The function **restates crm.party's `std_select` RLS predicate
  internally** (a definer function bypasses RLS, and these numbers had to match
  what the RLS-filtered client used to see); counts were verified identical
  across every view × kind × search × per-org combination before the fan-out was
  deleted. `fetchPartyScopeCounts` no longer takes a `CrmQueryContext`.

- 2026-08-14 — **Smart views + the unsuppress affordance** (Wave 3 remainder).
  `crm.saved_view` applied live + ledgered (`migrations/crm_04_saved_views.sql`)
  — a named, re-runnable party-list query, shared through the platform
  `visibility` tier and opened by `/crm?view=<id>`. `SavedViewBar` on the list
  with dirty detection and update/rename/share/delete; bulk work-queue actions
  on the selection (outreach list, do-not-contact, allow contact, delete);
  `AddMembersDialog` enrolls straight from a view over the shared
  `applyPartyListPredicates`, stamping provenance into
  `crm.outreach_list.definition` so the queue links back to the query that
  filled it. **Closed the permanent-mis-click hole:** "Do not call" now has a
  reverse on both halves — `unsuppressMedium` (with a
  `details.suppression_history` audit entry) and `allowPartyContact` (with a
  timeline note) — lifting only OUR stance and naming every blocker that
  survives. The medium-block reader folded into `reachability.ts` rather than
  forking a second suppression module. Browser-verified end to end against the
  live DB: a saved view drove a real 3-member enrollment, and a real leftover
  `dnc_request` suppression from the dialer verification was lifted.
- 2026-08-14 — **Research experts → `crm.party`; `expert_status` finally has
  both a producer and a reader** (see the Experts section above). Server:
  aidream `services/crm/expert_promotion.py` + two research endpoints;
  `expert_status` added to the resolver's fill-when-NULL fields. Client:
  Expert column + server-side filter on `/crm`, `ExpertStatusCard` on the
  record page, `/research/topics/[id]/experts`, and the `topic.experts`
  research resource. **Fixed a live duplicate factory found while verifying:**
  `crm.name_key()` treated every accented character as punctuation
  ("José Fábio Lana" → "jos f bio lana") while its Python twin NFKD-folded, so
  the resolver missed real rows and created a second party on every run —
  `migrations/crm_name_key_unicode_fold.sql`, applied + ledgered + backfilled,
  re-verified converging on the same party.

- 2026-08-13 — **`plan.entity` fold executed (Wave 2, partial by design).**
  Per the ratified SoR ruling, person/org rows folded into `crm.party`
  (source-stamped `import` / `plan_entity_person_org_fold`, legacy ids in
  `metadata.folded_from_plan_entity`); `plan.entity` survives as the
  citation store (source/media only, DB-guarded). Content-plan surfaces now
  consume the CRM: site rosters are `party → web_site` `writes_for` edges,
  node author/reviewer edges are `plan_node → party` (the `plan_review`
  payload binding moved to that pair). Service gained `fetchPartiesByIds`,
  `searchPartiesByName`, and `attributes` on `createParty`;
  `PartyCreateForm` is reused inside the content-plan entity manager.

- 2026-08-12 — Record-page access hardening (Error Inspector evidence: a
  non-UUID `/crm/<id>` fired six parallel 22P02s and rendered the raw DB
  message). `fetchPartyDetail` now guards `isUuid` at the choke point and
  throws the canonical `recordUnavailable` (zero queries issued);
  `PartyRecordPage` swapped the hand-written destructive banner + dead
  null-detail state for `<AccessGate token="party">`, so
  denied/deleted/missing/anonymous/transient each render their true state
  (refresh-after-load failures get a non-raw retry notice instead). Also
  hardened the gate itself for every consumer:
  `fetchAccessDeniedContext` resolves a syntactically invalid uuid to
  `missing` without calling the RPC (whose `p_id` is `uuid` — it could only
  22P02 into a retry-able lie). Browser-verified: `/crm/not-a-uuid` → clean
  missing state, zero PostgREST requests, one deliberate record-unavailable
  inspector row; nonexistent uuid → RPC-resolved missing; real record loads.
- 2026-08-13 — **`campaign` → `outreach_list`, the honest name** (db-rules §1a;
  closed the one open deviation in §12). `crm.campaign` was never a marketing
  campaign — `campaign_kind IN ('list','email','call','mixed')` with members
  carrying `status` + `next_attempt_at` is a send/dial queue. Marketing's
  channel container had already taken `initiative` so the two would not
  collide. Live rename (`migrations/crm_outreach_list_rename.sql`, applied +
  ledgered): tables, tokens (`crm_outreach_list`, `crm_outreach_list_member`),
  `campaign_kind`→`list_kind`, `campaign_id`→`outreach_list_id` on the member
  AND on `interaction`, every constraint/index name, the token literals inside
  trigger args, the shareable registry, and the three `crm_*` merge/purge
  functions; RLS regenerated through `iam.apply_rls` (policy bodies carry the
  token as a literal). Both gates green, zero FAIL/zero WARN. FE moved to
  `features/crm/outreach-lists/` + `/crm/outreach-lists/[listId]`, with a 308
  from `/crm/campaigns/*`; users see "Outreach Lists". Old name is GONE — no
  compat view, so a stale reference errors loudly.
- 2026-08-13 — Outreach-list builder + call queue shipped (Wave 3): `/crm/outreach-lists`
  console, list workspace (status rollup chips filter the roster,
  server-paged member table), enrollment from `/crm` selection (table
  `selection` bulk bar → `AddToOutreachListDialog`) and from filters
  (`AddMembersDialog` over the shared `applyPartyListPredicates`), and the
  claim-locked power dialer at `/crm/outreach-lists/[id]/dial` (conditional-update
  claim, DNC/suppression-checked dial targets, interaction-first disposition
  writes, retry windows, session tally). Data layer live-verified against the
  real DB (15/15: claim race, foreign-claim skip, lost-claim guard, D181 bare
  inserts, suppression → `is_contactable`, embed counts). Registered in
  `agent.review_queue` ×2. Consolidated onto `useCrmContext` (deleted my
  duplicate extraction).
- 2026-08-13 — Dedup automation + merge review shipped (`crm_03_dedup.sql`,
  applied + ledgered): `name_key` writer/backfill, `crm.merge_candidate`
  (ordered pair, durable dismissal), `crm_detect_merge_candidates`
  (auto-merge ONLY on both-sides `is_identity_key` medium collisions; weak
  signals — shared medium / name_key / email-domain — become suggestions),
  `crm_dismiss_merge_candidate`, `_z_candidate_on_merge` trigger.
  FE: `/crm/duplicates` review queue (side-by-side pair cards, what-moves
  verdict, merge/dismiss, recent merges with exact undo), `/crm` Duplicates
  door + count badge + assist chips (`crm-assists-producer.ts`), record-page
  `MergeStatusCard`. `useCrmContext` extracted from `usePartyList`.

- 2026-08-12 — Restored strict Supabase write typing for outreach-list status
  transitions: the dynamic lifecycle patch now uses the generated
  `outreach_list.Update` shape instead of `Record<string, unknown>`, keeping status
  and timestamp writes aligned with the live generated schema.
- 2026-08-13 — CSV import shipped: `/crm/import` wizard (file or paste →
  auto-mapped columns → dry-run preview → commit), engine + bulk dedup service
  lookups, Import button on `/crm`, admin-map entry. While verifying, found and
  hedged D181 (component `INSERT…RETURNING` 42501s platform-wide — see
  FOUND_DEFECTS.md): all CRM component inserts (`addContactPoint`,
  `addAddress`, `logInteraction`) now insert bare and re-read, which also
  repairs the record page's add-email/add-phone/add-address/log-call, all
  broken by that regression. Browser + DB verified end-to-end.
- 2026-08-12 — Made the LIST surface agent-writable: 4 `mode: "ui"` /
  `applyPolicy: "ask"` write targets on `matrx-user/crm` — `search_query`,
  `party_kind_filter`, `column_filters` and `list_sort` — so an agent can put
  the records a user described in front of them. Handlers live on the
  `SurfaceRuntimeProvider` `CrmListPage` already mounts and call the SAME
  setters the human controls call (`usePartyList.setQuery` for search, the
  People/Companies facet and the column filters; `useListViewPrefs.setPrefs`
  for the sort), so an agent write and a user click are indistinguishable
  downstream. They validate the whole value and THROW before mutating —
  `column_filters` replaces the entire filter bag and rejects unrecognised
  keys rather than dropping them, `list_sort` reads the current sort through a
  ref because the writeback seam captures handler closures before the confirm
  dialog resolves. Enum checks read new shared constants in `types.ts`
  (`PARTY_KIND_FILTERS`, `PARTY_COLUMN_FILTER_KEYS`, `PARTY_SORT_DIRECTIONS`
  and the `*_ENUM_TEXT` strings), which the manifest interpolates into the
  descriptions the model reads so contract and guard cannot drift. Because
  write targets and groups do NOT cross `inheritsFrom`, the same arrays are
  re-exported onto `crm-manager.manifest.ts` — the floating `CrmManagerWindow`
  renders this same component and would otherwise be offered no write tool.
  Scope (Mine / My Orgs / Public), organization assignment, paging, the trash
  view and every create/delete/restore/merge path are deliberately NOT
  writable; delete stays human. Live-verified with a real agent run on `/crm`.
- 2026-08-09 — Made the create-record surface (`matrx-user/crm-create-party`)
  agent-writable: ONE composite `party_draft` write target (`mode: "draft"`,
  `applyPolicy: "ask"`) so an agent can stage a person or company drafted from
  context — kind, names, job title, domain, email, phone — into the capture
  form the user then reviews and saves. Handlers live on the existing
  `SurfaceRuntimeProvider` in `PartyCreateForm.tsx` and stage through the same
  `useState` setters typing uses; they THROW on a bad shape, validating kind
  against `PARTY_KINDS` and email/phone through the canonical
  `normalizeMediumValue` (so an agent-staged medium can never fail only at
  Create time), and reject fields belonging to the other kind, which would
  land in inputs the user cannot see. **Creating the record is deliberately
  NOT a target** — dedup, medium linking, and ownership all happen at save,
  and the human presses Create record. Live agent run still owed (registered
  in `agent.review_queue`).
- 2026-08-08 — Repaired `/crm` review feedback: specific route metadata and
  semantic header H1, 44px mobile scope controls, concise search placeholder,
  and an explicit mobile Open affordance in each sticky identity cell.
- 2026-08-06 — Full assessment pass: cross-repo SoR created
  (`common-docs/systems/crm/FEATURE.md` — platform-wide integration-gap map, agent-surface
  gaps, competitive benchmark); handoff rewritten with a waved work order + three Arman
  decisions. No code changes; DB re-verified healthy (all 9 tables certify).
- 2026-07-28 — Classification pickers live (stage/rating FK selects + role
  edge tag picker on the record page; `CategorySelect` promoted to
  `features/scopes/components/`, generic `CategoryTagPicker` extracted from the
  flashcards FolderTagPicker). Trash view on `/crm` with restore +
  RPC-backed permanent delete. Browser + DB verified.
- 2026-07-28 — Added CRM to the main app menu with route, manager-window,
  new-person, and new-company actions. Replaced the route-local dialog with
  the reusable `PartyCreateForm` inside `crmCreatePartyWindow`, added the
  route-equivalent `crmManagerWindow`, declared/synced all three UI surfaces,
  and added `/crm/admin` as the canonical feature map.
- 2026-07-27 — First UI: `/crm` list (scoped, table-first, server-side
  sort/filter/paging via PostgREST) + `/crm/[partyId]` record page; data layer
  `features/crm/` (types/service/hooks); `party` + `crm_outreach_list` registry
  wiring. Browser-verified live: create person/company, employ, 2 emails +
  2 phones with RPC primary flips, logged call, note.
- 2026-07-27 — DB core live: 9 tables, canonical RLS (zero FAIL / zero WARN on
  `iam.verify_canonical` for all 9), 17 association pairs, 8 category dimensions seeded
  public, `party_observation` + `party_affiliation` edge payload kinds, shareable
  registry rows, per-token association GC, and the four RPCs. Constraint/trigger and
  merge/unmerge round-trip tests run live against org Titanium and cleaned up.
  Retired the stale `platform.entity_types` row `token='profile'` (pointed at a
  nonexistent schema `user`).
