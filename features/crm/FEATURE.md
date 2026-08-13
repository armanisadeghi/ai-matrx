# FEATURE.md — `crm`

**Status:** `db-core live · route + WindowPanels live · campaigns + call queue live` · **Tier:** `1` · **Last updated:** `2026-08-13`

Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md` — read it before touching this feature in ANY repo.

---

## Purpose

**`crm.party` is the ONE record for a person or a company that is not one of our
tenants** — an expert, a lead, a customer, a vendor, an author, a competitor. Before
this, every module grew its own half-copy (`plan.entity`, `web.brand`,
`rag.kg_entities`, `users.invitation_requests`, `public.contact_submissions`,
`users.user_form_profile`), and none could be reused by the next one.

It serves, in one schema: known individuals with social channels, cold **email**
campaigns, cold **calling** campaigns, real customers, and vendors — with companies
first-class. "Company" here means **our users' clients**, never `iam.organizations`.

---

## The load-bearing split — read this before touching contact data

**A medium is not a contact point.**

- **`crm.contact_medium`** — ONE row per normalized value per org. Owns everything
  intrinsic to the _value_: verification, MX, bounce type/count, complaint,
  unsubscribe, DNC state, suppression.
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

| Table                 | Variant                 | Versioned | Holds                                                   |
| --------------------- | ----------------------- | --------- | ------------------------------------------------------- |
| `party`               | entity                  | ✅        | person or company; identity, curation, per-org stance   |
| `contact_medium`      | entity                  | ❌        | one row per value per org; deliverability + suppression |
| `party_contact_point` | component of `party`    | ❌        | who uses a medium, purpose, validity                    |
| `address`             | component of `party`    | ❌        | structured postal + geo                                 |
| `affiliation`         | component of `party`    | ✅        | person ↔ company employment, with dates                 |
| `interaction`         | component of `party`    | ❌        | calls/emails/meetings, planned AND completed            |
| `campaign`            | entity                  | ✅        | a named audience or cold campaign                       |
| `campaign_member`     | component of `campaign` | ❌        | per-member state, attempts, dialer claim                |
| `party_merge`         | component of `party`    | ❌        | the exact unmerge record                                |
| `merge_candidate`     | component of `party`    | ❌        | duplicate suggestion (ordered pair, durable dismissal)  |

`party_kind ('person','organization')` is the **only** closed set. Expert, lead,
vendor, journalist, competitor, customer are **roles** — `platform.categories` rows in
the `party_role` dimension attached by a `party → category` edge. **A new kind of
person never needs a migration.**

DDL: [`migrations/crm_01_schema.sql`](../../migrations/crm_01_schema.sql),
[`migrations/crm_02_core.sql`](../../migrations/crm_02_core.sql).

---

## Invariants / gotchas

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
- **Dedup (crm_03_dedup.sql): only identity-key collisions auto-merge.**
  `public.crm_detect_merge_candidates(p_org)` merges two live canonical parties
  automatically ONLY when both hold the same live email/phone medium through
  contact points BOTH flagged `is_identity_key` (earlier-created party wins,
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
`/crm/[partyId]` (record page) · `/crm/campaigns` (campaign console) ·
`/crm/campaigns/[campaignId]` (campaign workspace) ·
`/crm/campaigns/[campaignId]/dial` (call queue) · `/crm/admin` (the feature
admin map).
The main app menu links to the route, opens the manager window, and opens
person/company capture directly. All consume `features/crm/`:

| File                                                | Role                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                          | Row aliases derived from `types/database.types.ts` (never hand-mirrored), joined embed shapes, closed vocabularies, `CRM_LIST_SCOPES`                 |
| `service.ts`                                        | ALL crm reads/writes — direct `supabase.schema("crm")`, scope predicates (THE VIEW LAW), `normalizeMediumValue`, medium find-or-create, the RPC calls |
| `hooks/usePartyList.ts` · `hooks/usePartyDetail.ts` | Query state + generation-guarded fetch                                                                                                                |
| `components/CrmListPage.tsx`                        | List assembly on the canonical entity-list primitives (`MatrxDataTable` controlled, `BrowseScopeTabs`, `useListViewPrefs("crm-parties")`, `ItemMenu`) |
| `components/PartyCreateForm.tsx`                    | Shared person/company capture core; used by `crmCreatePartyWindow` and writes optional email/phone through the canonical medium/contact-point flow    |
| `components/record/PartyRecordPage.tsx`             | The 360°: identity, contact, addresses, employment (both directions), activity, notes (`platform.comments`), Files/Tasks via `AssociationCardGrid`    |

**WindowPanels:** `crmManagerWindow` is the full scoped list route inside
WindowPanel chrome; `crmCreatePartyWindow` is the compact create flow. Both are
registered through the overlay controller, metadata registry, catalogue,
Tools-grid, and typed openers.

**UI surfaces:** code-first manifests declare `matrx-user/crm`,
`matrx-user/crm-manager`, and `matrx-user/crm-create-party`. The route and
both windows emit live scopes through `SurfaceRuntimeProvider`; DB rows and
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
- `party` + `crm_campaign` are registered in `ENTITY_OVERLAY`
  (`features/scopes/registry/entityRegistry.ts`) and `ASSOCIATION_TARGET_TYPES`
  (`features/scopes/types.ts`); notes use `commentsService` with
  `entityType: "party"` + explicit `orgId`.

**Tokens** (`platform.entity_types`): `party`, `contact_medium`, `crm_campaign`
(entities) · `party_contact_point`, `crm_address`, `crm_affiliation`,
`crm_interaction`, `crm_campaign_member`, `crm_party_merge` (components).

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

## CSV import (`/crm/import`)

Wizard: source (file or pasted text) → column mapping (auto-guessed from header
synonyms) → **dry-run preview** → commit. Engine in `features/crm/import/`
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
  Wave 1 job, not the CSV wizard's). Companies dedupe on exact domain, then
  case-insensitive exact name.
- **Employer cells** find-or-create the company once per distinct name and add
  a current+primary `crm.affiliation` (the mirror trigger fills the list's
  Employer column).
- **Component inserts never use RETURNING** — see the service comment on
  `addContactPoint` and D181 in `FOUND_DEFECTS.md`: the id-list `std_select`
  policy on component tables cannot see a row being inserted, so
  `INSERT…RETURNING` 42501s. Insert bare, re-read in the next statement.
- **Known limits:** the commit is client-driven — a page close/reload mid-run
  leaves the current row partial (party without its later points/affiliation);
  re-running converges to "exists" via email/phone dedup but does NOT backfill
  the missing pieces (no enrich-existing mode yet — that is the Wave 1 party
  resolver's territory). Rows with no valid email/phone dedupe by nothing and
  re-import as new people.

## Campaigns + call queue (`/crm/campaigns`)

Data layer `features/crm/campaigns/` (`types.ts` vocabularies + dispositions,
`service.ts` all reads/writes); UI `features/crm/components/campaigns/`
(console, workspace, `CallQueuePage` dialer, `AddMembersDialog` filter
enrollment, `AddToCampaignDialog` selection enrollment, `badges.tsx` — the ONE
status→color map). Enrollment on-ramps: `/crm` row selection → bulk bar →
"Add to campaign", or campaign workspace → "Add members" by filter. Rules paid
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
- **Campaign scope is blended mine + my orgs** (declared, THE VIEW LAW) — a
  sales-floor work console, not a browse surface.
- **Known limits:** dialing is a `tel:` handoff (no telephony integration);
  an expired-but-unexpired-looking suppression (`suppression_expires_at`
  passed) still blocks because generated `is_contactable` ignores expiry — an
  unsuppress affordance is future work; member table search/status filter are
  server-side but member columns don't sort.

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

## Not built yet

- "Shared" list scope (needs a crm grant-reader RPC).
- Research expert writing, the `web.brand` fold, expert
  registration — see [`docs/handoffs/crm-system.md`](../../docs/handoffs/crm-system.md).

---

## Change log

- 2026-08-13 — Campaign builder + call queue shipped (Wave 3): `/crm/campaigns`
  console, campaign workspace (status rollup chips filter the roster,
  server-paged member table), enrollment from `/crm` selection (table
  `selection` bulk bar → `AddToCampaignDialog`) and from filters
  (`AddMembersDialog` over the shared `applyPartyListPredicates`), and the
  claim-locked power dialer at `/crm/campaigns/[id]/dial` (conditional-update
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

- 2026-08-12 — Restored strict Supabase write typing for campaign status
  transitions: the dynamic lifecycle patch now uses the generated
  `campaign.Update` shape instead of `Record<string, unknown>`, keeping status
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
  `features/crm/` (types/service/hooks); `party` + `crm_campaign` registry
  wiring. Browser-verified live: create person/company, employ, 2 emails +
  2 phones with RPC primary flips, logged call, note.
- 2026-07-27 — DB core live: 9 tables, canonical RLS (zero FAIL / zero WARN on
  `iam.verify_canonical` for all 9), 17 association pairs, 8 category dimensions seeded
  public, `party_observation` + `party_affiliation` edge payload kinds, shareable
  registry rows, per-token association GC, and the four RPCs. Constraint/trigger and
  merge/unmerge round-trip tests run live against org Titanium and cleaned up.
  Retired the stale `platform.entity_types` row `token='profile'` (pointed at a
  nonexistent schema `user`).
