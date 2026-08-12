# Retiring `education.flashcard_data` + `education.flashcard_sets`

**Status:** proposal — awaiting Arman's `go`. Nothing applied, no code changed.
**Measured live:** 2026-08-12, Matrx Main (`txzxabzwovsujtloxrus`), direct Postgres read.

---

## (a) THE VERDICT — graveyard as dead. Do not migrate onto `fc_*`.

These tables are **not a legacy version of the live feature**. They are the abandoned
Nov-2024 prototype of it, and the live feature was rebuilt from scratch on `fc_*`.

| Evidence | `flashcard_data` | `flashcard_sets` | `fc_set` / `fc_card` / `fc_detail` |
|---|---|---|---|
| Rows | **5** | **2** | 65 / 802 / 71 |
| Newest row | 2024-11-24 | 2024-11-11 | **2026-08-12 00:03** (today) |
| `n_tup_ins` / `n_tup_upd` (lifetime, `pg_stat_all_tables`) | **0 / 0** | **0 / 0** | 908/840, 88/60, 132/0 |
| `idx_scan` | **0** | **0** | 38 856 / 21 802 / 1 035 |
| DB functions referencing it (`audit.table_impact`) | **0** | **0** | — |
| `iam.permissions` grants on the token | **0** | **0** | 0 |

The five rows are self-evidently throwaway: `"This is my question"`, `"My Question"`,
`"Quick question"`, `"What is the capital of the us?"`, topic `"Random topic"` / lesson
`"Some lesson"`. The two sets are `"My Favorite Set"` and `"Armani's History Flashcards"`,
with `audio_overview` = `"This is the set's audio overview text"`.

**Zero writes, zero index scans, zero function dependencies, zero grants, and a live
replacement written to today.** There is nothing here to carry forward. Migrating five
placeholder cards into a table holding 802 real ones would inject junk into a working
feature — the graveyard move preserves them byte-for-byte if we are ever wrong.

An optional 3-statement backfill is supplied in **(d)** anyway, because it costs ~20 lines
and converts "I believe it's dead" into "the rows exist in both places." Recommend running
it — as insurance, not as a migration.

### Two forbidden patterns are live on these tables (independent findings)

Both are explicitly banned by `matrx-frontend/CLAUDE.md` § *Forbidden relationship shortcuts*.
Retiring the tables removes both; flagging them because the pattern may exist elsewhere:

1. 🚨 **`education.flashcard_data` carries trigger `_mirror_proj` → `platform._mirror_fk_to_assoc`.**
   The doctrine calls any discovered dependency on this function *"a critical alarm, never a
   recoverable warning."* It is enabled (`tgenabled='O'`) on a table with zero writes, so it has
   never fired — but it is installed and would fire on the next insert.
2. **`project_id uuid REFERENCES workspace.projects(id)`** on *both* tables, plus
   `idx_flashcard_data_project_id`. A feature table may not depend on a project FK. (All 5 + 2
   rows have `project_id = NULL`, so nothing is lost.)

### This is a 5-table cluster, not 2 tables

Inbound FKs make partial retirement pointless — retire all five in one move:

| Table | Rows | Inbound FK from | Writes |
|---|---|---|---|
| `education.flashcard_data` | 5 | `flashcard_history`, `flashcard_images`, `flashcard_set_relations` | 0 |
| `education.flashcard_sets` | 2 | `flashcard_set_relations` | 0 |
| `education.flashcard_set_relations` | 3 | — | 0 |
| `education.flashcard_history` | **0** | — | 0 |
| `education.flashcard_images` | **0** | — | 0 |

`flashcard_set_relations` is the legacy membership junction. Its canonical replacement already
exists and is fully populated: **`platform.associations` holds 802 `fc_card → fc_set` edges**
(registered in `platform.association_types` with `container_side='target'`, `conveys_max='editor'`).

⚠️ **`flashcard_history` has one live consumer** (a reference-resolver token, see (b)) — it needs
Arman's call before it moves. See **(e) Open question 1**.

---

## (b) COMPLETE CONSUMER INVENTORY

### Database

**Functions: exactly one.** `audit.table_impact` returns **0 rows** for both tables. A full
`pg_proc.prosrc` regex scan across all schemas returns exactly one function:

- `public.container_resource_counts(p_column text, p_container_id uuid)` — plpgsql, lines
  containing `('flashcard', 'education', 'flashcard_data', null)` in its VALUES list. Counts a
  container's resources by `organization_id` / `project_id` / `task_id`.
  **Repoint to `('flashcard', 'education', 'fc_set', null)`.** Note `fc_set` has no `project_id`
  column, so the function's own `v_has_col` guard makes it `continue` for the project/task
  containers — graceful, no error, the key is simply omitted. Org counts start returning the
  real 65 sets instead of 5 dead cards.
  *(Per `features/organizations/FEATURE.md` 2026-06-29 the org home already moved off this
  function to association cards; `/resources/[kind]` still uses it.)*

**Views:** none. **Triggers on the two tables:**

| Table | Trigger | Function |
|---|---|---|
| `flashcard_data` | `_mirror_proj` | `platform._mirror_fk_to_assoc` 🚨 forbidden |
| `flashcard_data` | `_stamp_actor`, `_touch_row` | canonical |
| `flashcard_sets` | `_stamp_actor`, `_touch_row` | canonical |

**RLS policies — 19 across the cluster**, all bespoke pre-canonical (`user_id = auth.uid()` +
`public = true` + `has_permission('flashcard_data'|'flashcard_sets', …)`). None canonical; the
gate FAILs `policies_canonical` on both. They travel with the tables on `SET SCHEMA` and need no
separate action.

**FKs (verified, `pg_constraint`):**
- *Into* `flashcard_data`: `flashcard_history.flashcard_id`, `flashcard_images.flashcard_id`,
  `flashcard_set_relations.flashcard_id` (all `ON DELETE CASCADE`).
- *Into* `flashcard_sets`: `flashcard_set_relations.set_id` (`ON DELETE CASCADE`).
- *Out of* both: `organization_id → iam.organizations`, `user_id`/`created_by`/`updated_by →
  auth.users`, `project_id → workspace.projects`.
- **No table outside this cluster points into either.** `SET SCHEMA` moves FKs with the tables;
  no id remapping is required anywhere.

**Registries:**
- `platform.entity_types` — token `flashcard_data` (active), token `flashcard_sets` (active),
  token `flashcard_history` (active).
- `platform.shareable_resource_registry` — `flashcard_data` (active,
  `owner_column='user_id'`, `is_public_column='public'`). `flashcard_sets` is **not** registered.
- `platform.association_types` — nothing references either legacy token. Two rows use the
  *other* legacy token `flashcard_set` (= `users.user_flashcard_sets`, see (e) Q2):
  `flashcard_set→agent` and `flashcard_set→web_page`. **Leave those alone.**
- `platform.entity_relationships` — only `fc_detail → fc_card` (composition). Nothing legacy.

### matrx-frontend — 9 files

| File:line | What it does | Action |
|---|---|---|
| [`features/organizations/peek/kinds/FlashcardPeek.tsx:29-31`](features/organizations/peek/kinds/FlashcardPeek.tsx#L29) | `.schema("education").from("flashcard_data").select("topic, created_at")` — **the only live query against either table in any repo** | Repoint to `fc_set` (`name, created_at`) |
| [`features/organizations/peek/registry.ts:49`](features/organizations/peek/registry.ts#L49) | `flashcard_data: FlashcardPeek` | Rekey → `fc_set` |
| [`features/organizations/peek/kinds-list.ts:36`](features/organizations/peek/kinds-list.ts#L36) | `"flashcard_data"` in the kinds list | → `"fc_set"` |
| [`features/organizations/resource-catalogue.ts:472-480`](features/organizations/resource-catalogue.ts#L472) | `ORG_ln` entry: `token/table/shareKey: "flashcard_data"`, `titleColumn: "topic"` | → `fc_set` / `name` |
| [`utils/permissions/registry.ts:341-351`](utils/permissions/registry.ts#L341) | TS mirror of the shareable registry row (`ownerColumn: "user_id"`, `isPublicColumn: "public"`, `urlPathTemplate: "/flashcards/{id}"`) | Delete the block |
| [`utils/permissions/__tests__/registry.db-snapshot.json:278-284`](utils/permissions/__tests__/registry.db-snapshot.json#L278) | Live-registry parity snapshot | Regenerate: `pnpm tsx scripts/regen-shareable-registry-snapshot.ts` |
| [`features/sharing/resourceIcons.ts:52`](features/sharing/resourceIcons.ts#L52) | `flashcard_data: GraduationCap` | Rekey → `fc_set` |
| [`features/scopes/registry/entityRegistry.ts:345`](features/scopes/registry/entityRegistry.ts#L345) | `flashcard_data: { Icon, labelPlural }` (no `hrefFor`) | Delete |
| [`features/matrx-envelope/referenceResolvers.ts:746-753`](features/matrx-envelope/referenceResolvers.ts#L746) | `flashcard_history` record resolver (`schema: "education"`) | **Blocked on Open Q1** |

`ORG_ln` (= `resource-catalogue.ts`) is consumed by `useContainerInventory`, `useOrgResourceInventory`,
`useOrgSharedItems`, `useOrgContributableItems`, `OrgResourceDetail`, `ContainerResourceSheet`,
`OrgWorkspace`, `OrgModuleSettings`, `OrgShareReviewCard`, `OrgResourceRoleSection` — all pick up the
repoint automatically from the one edit.

**Live-surface defect this fixes (the surface/action/wrong-outcome the doctrine requires):**
on an org's Resources surface, opening the **Flashcards** kind lists and peeks rows from
`education.flashcard_data` — so it can only ever show the 5 dead 2024 test cards and **never**
shows any of the 65 real `fc_set` decks the user owns.

Also **parked, no action needed** (Next.js ignores `_`-prefixed dirs; none is reachable):
`app/(transitional)/_flash-cards/**`, `app/(transitional)/_flashcard/**`, `components/flashcard-app/**`,
`hooks/flashcard-app/**`, `constants/flashcard-constants.ts`, `types/flashcards.types.ts`.
These reference the legacy shapes as TypeScript types only — no query. Recommend deleting them in
the same pass (separate commit) but it is not required for the cutover.

Docs to update: `features/sharing/README.md:275`, `features/scopes/docs/scopeable_entities.md:25`,
`docs/knowledge/scopeable_entities.md`.

### aidream — generated ORM only, zero service consumers

Confirmed by reading every hit: **no router, service, or manager call site reads or writes
either table.** What exists is generated scaffolding plus two audit lists:

- `db/models/education.py` — `FlashcardData`, `FlashcardSets`, `FlashcardSetRelations`,
  `FlashcardImages`, `FlashcardHistory` models (regenerated).
- `db/managers/education/flashcard_{data,sets,set_relations,images,history}.py` — 1 158 lines,
  **delete the files**; regeneration will not recreate them once the tables leave `education`.
- `db/managers/education/__init__.py:8,9,26,27,28` — the five imports. Delete.
- `db/helpers/auto_config_education.py:20,23,74,77,80` — the five auto-config dicts. Regenerated.
- `db/matrx_orm.yaml` — education generate block (no per-table edit expected; verify).
- `scripts/validate_org_scoping.py:81-83` — audit list of `(table, org_column)` pairs. Delete the
  three legacy rows.
- `aidream/services/references/resources.py:283,285` — `"flashcard_history"` /
  `"education.flashcard_history"` in the reference-resolver allow-list. **Blocked on Open Q1.**

Not consumers despite matching the grep: `media_editing/utils_pdf/process_dynamic_save_flashcards.py`
and `process_chunk_with_ai.py` (`make_json_flashcard_data` is a **prompt template name**; that path
writes JSON files via `FileManager` and never touches Postgres) and
`aidream/services/conversation_context/conversation_fork.py` (uses `users.user_flashcard_sets`,
a different table — see Open Q2).

### matrx-extend / matrx-local — nothing

Only generated OpenAPI/type dumps (`types/python-generated/*`, `types/tool-db-dump.md`). No query,
no import, no model. Both regenerate from aidream's OpenAPI; no coordination required.

---

## (c) THE ONE-SHOT CUTOVER SEQUENCE

Single pass, all layers, in this order. Steps 1–3 are the reversible prep; step 6 is the cut.

**0. Prep the guard as the checklist (before touching anything).**
Add to `matrx-frontend/scripts/dead-relations.json` **and** `aidream/db/dead_relations.json`:
`education.flashcard_data`, `education.flashcard_sets`, `education.flashcard_set_relations`,
`education.flashcard_images` (+ `flashcard_history` if Q1 is answered "retire"), each with
`new: "education.fc_set / education.fc_card / platform.associations"`.
`pnpm check:dead-relations` now lights up RED and is your worklist.

**1. DB — the optional insurance backfill.** Run the SQL in (d). Verify counts.

**2. DB — repoint the one function.**
```sql
CREATE OR REPLACE FUNCTION public.container_resource_counts(...)  -- body unchanged except:
--   ('flashcard', 'education', 'flashcard_data', null)
-- becomes
--   ('flashcard', 'education', 'fc_set',         null)
```

**3. DB — de-register.**
```sql
DELETE FROM platform.shareable_resource_registry WHERE resource_type = 'flashcard_data';
UPDATE platform.entity_types SET is_active = false
 WHERE token IN ('flashcard_data','flashcard_sets');
```
(`is_active=false` rather than DELETE — an active `entity_types` row pointing into `graveyard` is
the defect named in the doctrine §7; deactivating clears it while keeping the historical token
resolvable. Delete the rows outright only if Arman prefers.)

**4. DB — drop the forbidden trigger and the project FK** (they must not travel to graveyard as
precedent):
```sql
DROP TRIGGER IF EXISTS _mirror_proj ON education.flashcard_data;
ALTER TABLE education.flashcard_data DROP CONSTRAINT IF EXISTS flashcard_data_project_id_fkey;
ALTER TABLE education.flashcard_sets DROP CONSTRAINT IF EXISTS flashcard_sets_project_id_fkey;
```

**5. Frontend — repoint all 8 files** in the table above (9th is Q1-gated), then:
```bash
pnpm db-types                                        # types/database.types.ts
pnpm tsx scripts/regen-shareable-registry-snapshot.ts # utils/permissions/__tests__/registry.db-snapshot.json
pnpm type-check
pnpm check:dead-relations
pnpm check:schema
```

**6. DB — THE CUT** (after 5 is green, so nothing queries the old names):
```sql
ALTER TABLE education.flashcard_set_relations SET SCHEMA graveyard;
ALTER TABLE education.flashcard_images       SET SCHEMA graveyard;
ALTER TABLE education.flashcard_data         SET SCHEMA graveyard;
ALTER TABLE education.flashcard_sets         SET SCHEMA graveyard;
-- flashcard_history: Q1
INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason) VALUES
 ('education.flashcard_data',            'education.fc_card',       'dead 2024 prototype; 5 test rows, 0 writes ever'),
 ('education.flashcard_sets',            'education.fc_set',        'dead 2024 prototype; 2 test rows, 0 writes ever'),
 ('education.flashcard_set_relations',   'platform.associations',   'legacy membership junction; canonical is fc_card->fc_set edges'),
 ('education.flashcard_images',          'education.fc_detail',     'never used; 0 rows')
ON CONFLICT (old_ref) DO NOTHING;
NOTIFY pgrst, 'reload schema';
```

**7. Frontend — regenerate against the post-cut DB and commit.**
```bash
pnpm db-types && pnpm sync-types && pnpm type-check
```

**8. aidream — regenerate and clean.**
```bash
rm db/managers/education/flashcard_{data,sets,set_relations,images,history}.py   # per Q1
# edit db/managers/education/__init__.py (5 imports), scripts/validate_org_scoping.py (3 lines)
python db/generate.py          # rewrites db/models/education.py + db/helpers/auto_config_education.py
python db/detect_applied.py
python db/check_dead_relations.py
python run.py                  # must boot clean: no ERROR/CRITICAL
```

**9. Verify live, then ship both repos.**
```sql
SELECT audit.refresh();
SELECT count(*) FROM graveyard.flashcard_data;   -- 5
SELECT count(*) FROM graveyard.flashcard_sets;   -- 2
SELECT to_regclass('education.flashcard_data');  -- NULL
```
Then `./scripts/release.sh` in matrx-frontend and `./scripts/release.sh` in aidream.
matrx-extend / matrx-local need nothing (generated dumps only) — refresh them opportunistically.

**Ordering rationale:** de-register (3) before the cut (6) so no resolver can hand out a token
pointing into `graveyard`; repoint the FE (5) before the cut so `check:dead-relations` is green
*before* the old names vanish; `pnpm db-types` runs twice because step 5 needs the registry-snapshot
regenerated against a DB that still has the tables, and step 7 needs the types without them.

---

## (d) THE DATA MIGRATION (optional insurance) — zero-data-loss argument

**The argument, stated plainly:** `ALTER TABLE … SET SCHEMA graveyard` moves the heap, indexes,
constraints, and every row untouched. Zero rows are read, written, or transformed, so zero can be
lost, and `ALTER TABLE graveyard.x SET SCHEMA education` reverses it exactly. **The graveyard move
alone already satisfies the zero-data-loss law.** The SQL below is a *second* copy into the live
canonical tables, so the rows survive even a later hard DROP of the graveyard schema.

Legacy `example` / `detailed_explanation` / `audio_explanation` have **no canonical home**:
`education.fc_detail.kind` currently holds exactly one value platform-wide (`spoken_front`, 71 rows).
Rather than invent vocabulary, they are preserved verbatim inside `metadata.legacy_fields` —
lossless, greppable, and it commits us to nothing. (Only 1 of the 5 rows has any of them.)

```sql
BEGIN;

-- 1. flashcard_sets (2 rows) -> fc_set. Legacy set_id becomes fc_set.id: no other table
--    references it after flashcard_set_relations is retired, so the id is free to reuse.
INSERT INTO education.fc_set
  (id, organization_id, created_by, updated_by, created_at, updated_at,
   visibility, name, description, topic, lesson, difficulty, metadata)
SELECT s.set_id,
       s.organization_id,
       coalesce(s.created_by, s.user_id),
       s.updated_by,
       s.created_at,
       coalesce(s.updated_at, s.created_at),
       (CASE WHEN s.public THEN 'public' ELSE 'personal' END)::platform.visibility,
       s.name,
       NULL,
       s.topic, s.lesson,
       (CASE WHEN s.difficulty IN ('easy','medium','hard') THEN s.difficulty END),
       jsonb_build_object(
         'legacy_table','education.flashcard_sets',
         'legacy_id',    s.set_id,
         'legacy_user_id', s.user_id,
         'legacy_fields', jsonb_strip_nulls(jsonb_build_object(
             'audio_overview', s.audio_overview,
             'shared_with',    to_jsonb(s.shared_with),
             'project_id',     s.project_id,
             'difficulty_raw', s.difficulty)))
FROM education.flashcard_sets s
WHERE s.organization_id IS NOT NULL          -- fc_set.organization_id is NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 2. flashcard_data (5 rows) -> fc_card.
INSERT INTO education.fc_card
  (id, organization_id, created_by, updated_by, created_at, updated_at, deleted_at,
   visibility, front, back, card_kind, difficulty, topic, lesson, personal_notes, metadata)
SELECT d.id,
       d.organization_id,
       coalesce(d.created_by, d.user_id),
       d.updated_by,
       coalesce(d.created_at, now()),
       coalesce(d.updated_at, d.created_at, now()),
       (CASE WHEN d.is_deleted THEN coalesce(d.updated_at, now()) END),
       (CASE WHEN d.public THEN 'public' ELSE 'personal' END)::platform.visibility,
       d.front, d.back, 'basic',
       (CASE WHEN d.difficulty IN ('easy','medium','hard') THEN d.difficulty END),
       d.topic, d.lesson, d.personal_notes,
       jsonb_build_object(
         'legacy_table','education.flashcard_data',
         'legacy_id',    d.id,
         'legacy_user_id', d.user_id,
         'legacy_fields', jsonb_strip_nulls(jsonb_build_object(
             'example',              d.example,
             'detailed_explanation', d.detailed_explanation,
             'audio_explanation',    d.audio_explanation,
             'shared_with',          to_jsonb(d.shared_with),
             'project_id',           d.project_id,
             'difficulty_raw',       d.difficulty)))
FROM education.flashcard_data d
WHERE d.organization_id IS NOT NULL          -- fc_card.organization_id is NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 3. flashcard_set_relations (3 rows) -> platform.associations, the canonical membership edge.
--    Direction fc_card -> fc_set is the REGISTERED direction in platform.association_types
--    (container_side='target'); writing it the other way is rejected by trg_associations_auto_orient.
INSERT INTO platform.associations
  (source_type, source_id, target_type, target_id, organization_id, created_by, metadata)
SELECT 'fc_card', r.flashcard_id, 'fc_set', r.set_id,
       c.organization_id, c.created_by,
       jsonb_build_object('legacy_table','education.flashcard_set_relations',
                          'legacy_order', r."order")
FROM education.flashcard_set_relations r
JOIN education.fc_card c ON c.id = r.flashcard_id
JOIN education.fc_set  s ON s.id = r.set_id
WHERE NOT EXISTS (
  SELECT 1 FROM platform.associations a
   WHERE a.source_type='fc_card' AND a.source_id=r.flashcard_id
     AND a.target_type='fc_set'  AND a.target_id=r.set_id);

-- 4. Prove it before committing. Expect 2 / 5 / 3.
SELECT (SELECT count(*) FROM education.fc_set  WHERE metadata->>'legacy_table'='education.flashcard_sets') AS sets_migrated,
       (SELECT count(*) FROM education.fc_card WHERE metadata->>'legacy_table'='education.flashcard_data') AS cards_migrated,
       (SELECT count(*) FROM platform.associations
         WHERE metadata->>'legacy_table'='education.flashcard_set_relations')                              AS edges_migrated;
COMMIT;
```

**Zero-data-loss guarantees in this SQL:** every statement is `ON CONFLICT DO NOTHING` /
`NOT EXISTS`-guarded (re-runnable, never duplicates); ids are preserved so provenance is the row
identity itself; `metadata.legacy_table` + `metadata.legacy_id` are set on every migrated row per
the required provenance convention; every legacy-only column with no canonical home is captured
under `metadata.legacy_fields` rather than dropped; the whole thing is one transaction with a
verifying SELECT before `COMMIT`; and the source tables are never modified — they proceed to
graveyard intact regardless of whether this ran.

**Two judgment calls baked in, both flagged:** `public=false` → `visibility='personal'` (all 7 rows
are `public=false` and personally owned; `fc_set`'s column default is `internal`), and legacy
`difficulty` is null-guarded against `fc_card_difficulty_check` (`easy|medium|hard`) with the raw
value kept in `metadata`. Say the word and either flips.

---

## (e) OPEN QUESTIONS — not guessed

1. **`education.flashcard_history` — retire with the cluster, or keep?**
   0 rows, 0 writes, and its parent `flashcard_data` is going away. **But it has two live
   consumers** that the other four tables do not: `features/matrx-envelope/referenceResolvers.ts:746`
   registers a `flashcard_history` record resolver, and `aidream/services/references/resources.py:283`
   lists it in the reference-resolver allow-list. It is also the only cluster table carrying the
   full canonical trigger set (`_version_capture`, `_gc_assoc_*`, `_stamp_org_default`). Retiring it
   means deleting both resolver entries in the same pass. **Recommendation: retire it** — a resolver
   for a table that has never held a row resolves nothing, and per-card review state now lives in
   `users.user_flashcard_reviews`. I have not touched it pending your call.

2. **`users.user_flashcard_sets` (24 rows) + `users.user_flashcard_reviews` (37 rows) — a THIRD
   flashcard store, and it is alive.** Outside the two tables you named, but it is the real
   remaining consolidation question and I would be hiding the finding by not stating it. It is
   actively consumed by `features/flashcards/services/flashcardPersistenceService.ts` (8 call
   sites), `features/canvas/artifact-types/persistence/flashcards-canonical-adapter.ts`,
   `CanvasFlashcardsView.tsx`, and aidream's `conversation_fork.py:361-397`; it holds the tokens
   `flashcard_set` / `flashcard_review` in `platform.entity_types` and two live
   `platform.association_types` rows (`flashcard_set→agent`, `flashcard_set→web_page`).
   The canonical adapter's own header says it *"replaces the legacy flashcards-adapter.ts (which
   wrote users.user_flashcard_sets)"* — so a cutover is partly done. **Should this be the next
   pass?** It is a genuinely different job from this one: real rows, real consumers, real
   product-semantics decisions. Not in scope here.

3. **`fc_card` is registered `is_component = false`** with membership carried by
   `platform.associations` (802 edges), while `fc_detail` is a true composition child of `fc_card`.
   That is a coherent design — a card can live in several sets — but it means `fc_card` owns its own
   access rather than inheriting from `fc_set`. Noting it because your brief described `fc_card` as
   a component; the live registry says otherwise. No action proposed, no change made.

4. **Delete the parked `_flash-cards` / `_flashcard` / `flashcard-app` trees?** ~15 files of
   unreachable 2024 UI that reference the legacy shapes as types only. Cheap to delete in the same
   pass, zero risk, but it is deletion of your code and I am not doing it unasked.

---

## What I did NOT do

No migration applied, no DDL run, no file edited, no commit. Every number above was read live via a
read-only connection; every file reference was opened, not inferred.
