-- additive: yes — four CREATE FUNCTIONs in `workbench`, four INSERTs into
--   `platform.client_callable_door`, and one GRANT EXECUTE to `authenticated` on the one door a
--   screen calls. Nothing is dropped, nothing is revoked, no live body is replaced, and no row
--   of anybody's data is read, written or moved. `custom._words_for`, `custom.record_words`,
--   `custom.relation_words` and `custom.relation_words_many` are BYTE-IDENTICAL after this file.
-- lock: platform
-- lane: OLD-TABLES-2
--
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- OLD-TABLES-CUTOVER rev 2, W2 — THE OLDER STORE GETS ITS OWN WORDS DOOR.
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- W1 gave the older estate a `relation` column whose cell holds a RECORD'S ID and whose screen
-- shows that record's WORDS. Something has to turn the id into the words. The unified store
-- already has that something — `custom._words_for`, reached through `custom.relation_words` and
-- `custom.relation_words_many` — and rev 1 of the plan proposed teaching it about
-- `workbench.udt_dataset_rows`.
--
-- THAT WAS THE PLAN'S WORST IDEA AND THE REVIEW KILLED IT. `custom._words_for` sits behind
-- THIRTEEN LIVE SCREENS, and its first act — the ladder decides before the name is read — is the
-- single most load-bearing safety property in the unified store. Putting a second store's ladder
-- inside it risks all thirteen to serve a feature none of them use. So:
--
--              the 13 screens, unchanged
--                         │
--                  client.relationWords(…)          ← ONE client primitive; dispatches by store
--                    ╱                  ╲
--    custom.relation_words_many      workbench.udt_row_words_many      ← TWO doors, one per store
--         (untouched)                        (this file)
--              │                                  │
--       custom._words_for               workbench._udt_row_words
--       gate (a) untouched              per record, both arms, memoised per statement
--
-- WHY THE OLDER STORE NEEDS A DOOR AT ALL, in one number: 14 of the 16 organizations holding
-- older data have ZERO tables in the unified store. A unified-only resolver would be inert for
-- 5,058 of the estate's 5,590 rows.
--
-- ── THE LADDER IS PER RECORD, AND IT ASKS BOTH ARMS ──────────────────────────────────────────
--
-- `workbench.udt_dataset_access(table_id, 'viewer')` is a real ladder — service_role ∪ platform
-- admin ∪ owner ∪ `iam.has_access('dataset', …)` — and it mirrors the row policies on
-- `udt_datasets`. But it gates the TABLE, and `udt_dataset_rows.std_select` carries a second arm
-- it never asks: an explicit `iam.permissions` grant (or membership, reachability, scope
-- assignment or entity grant) on ONE ROW, held by somebody with no access to its table.
--
-- A table-level check is therefore NARROWER than the row's own policy. Somebody holding a grant
-- on one row would be told "A record you have not been given access to" about a row they may
-- read. That is a false refusal, not a leak — but a screen that refuses a person their own record
-- still lies, and the class is DD-175's: a derived lane disagreeing with its parent's actual read.
-- So `workbench._udt_row_granted` is the second arm, copied from the policy expression itself,
-- and the red twin's second arm plants exactly this mistake and watches the suite go red.
--
-- MEMOISED PER STATEMENT, NOT PER RECORD. The expensive half is the table-level walk, and it is
-- the same answer for every cell of a page, so it is cached in `platform.memo_s_*` keyed
-- (organization, table). The per-row grant arm is still asked for every id, because that is the
-- half that can differ row by row — and it is only asked at all when the table-level arm said no,
-- which on a page of an ordinary table is never. A 40-cell page is ONE round trip and ONE ladder
-- walk, not forty of either.
--
-- ── THE THREE STATES, AND THE ONE PLACE THEY ARE DECIDED ─────────────────────────────────────
--
-- W1 ruled three renderings and no fourth, and this door is what produces them:
--
--   RESOLVED      the words — the display columns this column named, joined by its separator,
--                 else the target table's own row label, else the conventional names, else the
--                 first words the row holds, else "an untitled row".
--
--   WITHHELD      `platform.relation_withheld_label()` — the same sentence the unified store
--                 returns, byte for byte, so a person cannot tell which store refused them and no
--                 id leaks through the gap between the two.
--
--   UNRESOLVABLE  NO ROW COMES BACK, and the screen shows the amber identifier chip W1 built.
--
-- THAT LAST ONE IS A DELIBERATE DIFFERENCE FROM THE UNIFIED STORE AND IT IS WORTH SAYING OUT
-- LOUD. `custom._words_for` answers the withheld sentence for a record that is not there at all,
-- so "not yours" and "not here" read identically (REC-29). This door does not: a row that does
-- not exist — archived, purged, or living in a table this column no longer points at — comes back
-- as NOTHING, and the cell reads as an unresolvable reference carrying its identifier.
--
-- The reason is that W1's third state would otherwise be unreachable in this store, and it is the
-- state that tells a person the truth about their own data. The cost is an existence oracle on an
-- id the caller ALREADY HOLDS — it came out of a cell in a table they can read — so it discloses
-- nothing they did not bring with them. A row that EXISTS and is refused still reads the withheld
-- sentence with no id, which is the disclosure that actually matters.
--
-- ── WHAT p_display IS, AND WHY IT IS SAFE AS RAW INPUT ───────────────────────────────────────
--
-- The unified store's `p_display` is a spec already judged at declare time. This door's is handed
-- over by the screen at read time, because the older store keeps a column's format in
-- `udt_dataset_fields.metadata.format.options` and has no declare-time judge to run it through.
-- It is safe because of what it can name: the KEYS OF THE TARGET ROW'S OWN `data` DOCUMENT, and
-- nothing else. It cannot reach another row, another table or another organization, and every
-- key it could name belongs to a row this caller has already been cleared to read. A key that
-- does not exist contributes nothing and the fallback chain answers instead.
--
-- ── THE FUNCTION-CHANGE CENSUS THIS FILE OWES (the attacker's H4) ────────────────────────────
--
-- A `CREATE FUNCTION` fires four `ddl_command_end` event triggers, and the door rows below are
-- written BEFORE the grant for the reason lane RELATION-DECLARE found on 2026-09-20:
--   · `close_new_functions_to_anon`      — takes EXECUTE from `anon`; these four never had it.
--   · `enforce_definer_client_grants`    — takes client EXECUTE from a definer with no door row,
--                                          which is why the four rows are inserted first.
--   · `ddl_guard`                        — `definer_no_access_decision` is satisfied: the body
--                                          reaches `custom.assert_client_may_reach` (the
--                                          organization wall) and then `udt_dataset_access` /
--                                          `iam.has_access` (the ladder) BEFORE any read.
--   · `platform_reopen_declared_doors`   — re-opens exactly the door declared below.
-- `ddl_lock_timeout_guard` (`ddl_command_start`) bounds the wait; `door_follows_its_function`
-- (`sql_drop`) matters only to the inverse.
--
-- NO STATEMENT IN THIS FILE TAKES A LOCK THAT BLOCKS A READER. There is no DDL on a table, no
-- policy statement (the `supautils.policy_grants` freeze of 23 auth/storage/realtime relations is
-- not reachable from here) and no DROP TRIGGER (which OLD-TABLES-1 measured at ACCESS EXCLUSIVE
-- on 41 relations, ~810 ms, and which is why this file's inverse — and only its inverse — carries
-- the window-class header).
-- ══════════════════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE DISPLAY SPEC, NORMALISED TO ONE SHAPE
-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Three shapes a caller reaches for, one shape the resolver reads. Identical to
-- `custom._display_spec_for`'s normalisation so DD-031 carries a column's definition across
-- instead of translating it — minus that function's target-column existence check, which the
-- older store cannot perform at read time and does not need: an unknown key contributes nothing
-- and the fallback chain answers.
create or replace function workbench._udt_display_spec(p_raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_cols text[];
  v_sep  text;
begin
  if p_raw is null or jsonb_typeof(p_raw) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_raw) = 'string' then
    v_cols := array[p_raw #>> '{}'];
    v_sep  := ' ';
  elsif jsonb_typeof(p_raw) = 'array' then
    select array_agg(e.value #>> '{}' order by e.ordinality)
      into v_cols
      from jsonb_array_elements(p_raw) with ordinality e;
    v_sep := ' ';
  elsif jsonb_typeof(p_raw) = 'object' then
    if jsonb_typeof(p_raw -> 'columns') = 'string' then
      v_cols := array[p_raw -> 'columns' #>> '{}'];
    elsif jsonb_typeof(p_raw -> 'columns') = 'array' then
      select array_agg(e.value #>> '{}' order by e.ordinality)
        into v_cols
        from jsonb_array_elements(p_raw -> 'columns') with ordinality e;
    elsif jsonb_typeof(p_raw -> 'column') = 'string' then
      v_cols := array[p_raw -> 'column' #>> '{}'];
    end if;
    v_sep := coalesce(p_raw ->> 'separator', p_raw ->> 'join', ' ');
  else
    -- A shape nobody can mean. Say so rather than silently showing the table's default, which
    -- would look exactly like a column whose display spec was never set.
    raise exception 'Which columns to show has to be a column name, a list of them, or {"columns": [...], "separator": " "} - and this is a %.', jsonb_typeof(p_raw)
      using errcode = '23514',
            hint = 'OLD-TABLES W2: say display: "last_name", or display: ["first_name","last_name"], or the whole object. Nothing was read.';
  end if;

  -- Blanks are dropped rather than joined into a string of separators.
  select array_agg(x order by o)
    into v_cols
    from unnest(coalesce(v_cols, '{}'::text[])) with ordinality t(x, o)
   where nullif(btrim(coalesce(x, '')), '') is not null;

  if v_cols is null or array_length(v_cols, 1) is null then
    return null;   -- names nothing = the table's own answer, which is the honest default
  end if;

  return jsonb_build_object('columns', to_jsonb(v_cols), 'separator', coalesce(v_sep, ' '));
end
$fn$;

comment on function workbench._udt_display_spec(jsonb) is
  'lane OLD-TABLES-2 2026-09-22 (W2). Normalises a relation column''s display spec — a name, a '
  'list of them, or {"columns":[...],"separator":" "} — to one shape for workbench._udt_row_words. '
  'Null means the target table''s own row label. Reads nothing and decides no access.';

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE SECOND ARM OF THE ROW'S OWN POLICY
-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Copied from `workbench.udt_dataset_rows.std_select` itself, both halves: the union of the five
-- ways a single row can be granted, AND the `iam.has_access('udt_dataset_rows', id, 'viewer')`
-- conjunct that decides the level. Taking only the second half would be BROADER than the policy
-- (a leak); taking only the first would be broader still. Both, or neither.
create or replace function workbench._udt_row_granted(p_row_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
  select coalesce(
    exists (
      select 1
        from (
          select p.resource_id as id
            from iam.permissions p
           where p.resource_type = 'udt_dataset_rows'
             and (p.granted_to_user_id = (select auth.uid())
                  or p.granted_to_organization_id in (select iam.my_orgs()))
             and p.status <> 'rejected'
             and (p.expires_at is null or p.expires_at > now())
          union
          select m.container_id
            from iam.memberships m
           where m.container_type = 'udt_dataset_rows'
             and m.user_id = (select auth.uid())
             and m.deleted_at is null
          union
          select r.item_id
            from platform.reachability r
           where r.item_type = 'udt_dataset_rows'
             and r.max_level >= 'viewer'::public.permission_level
             and iam.has_access(r.container_type, r.container_id, 'viewer'::public.permission_level)
          union
          select a.source_id
            from platform.associations_live a
           where a.source_type = 'udt_dataset_rows'
             and a.target_type = 'scope'
             and a.role = 'assignment'
          union
          select g.entity_id
            from platform.entity_grants g
           where g.entity_type = 'udt_dataset_rows'
        ) granted
       where granted.id = p_row_id
    )
    and iam.has_access('udt_dataset_rows', p_row_id, 'viewer'::public.permission_level),
    false);
$fn$;

comment on function workbench._udt_row_granted(uuid) is
  'lane OLD-TABLES-2 2026-09-22 (W2). The PER-ROW arm of workbench.udt_dataset_rows.std_select, '
  'copied from the policy expression: the union of the five single-row grants AND the '
  'iam.has_access level check. It exists because a table-level check is NARROWER than the row''s '
  'own policy and would refuse a person a row they may read (DD-175).';

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE RESOLVER — ONE ROW, LADDER FIRST
-- ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function workbench._udt_row_words(
  p_organization_id uuid,
  p_row_id          uuid,
  p_display         jsonb   default null,
  p_hop             integer default 0)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_table uuid;
  v_data  jsonb;
  v_meta  jsonb;
  v_me    uuid;
  v_memo  text;
  v_ok    text;
  v_cols  text[];
  v_sep   text;
  v_parts text[] := '{}'::text[];
  v_raw   text;
  v_one   text;
  v_label text;
  c       text;
  k_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_row_id is null then
    return null;
  end if;

  select r.table_id, r.data, d.metadata
    into v_table, v_data, v_meta
    from workbench.udt_dataset_rows r
    join workbench.udt_datasets d on d.id = r.table_id
   where r.organization_id = p_organization_id
     and r.id = p_row_id
     and r.deleted_at is null
     and d.deleted_at is null;

  if not found then
    -- UNRESOLVABLE, not withheld. The header says why this store parts company with
    -- custom._words_for here, and what it costs.
    return null;
  end if;

  -- (a) THE LADDER DECIDES BEFORE THE WORDS ARE READ — both arms, per record.
  --     A null principal is the server lane and the campaign's own role: there is no seat to
  --     judge, and every caller that reaches here that way has already decided access.
  v_me := custom.query_principal();
  if v_me is not null then
    v_memo := 'udtwords:' || p_organization_id::text || ':' || v_table::text;
    v_ok := platform.memo_s_get(v_memo);
    if v_ok is null then
      v_ok := case
                when workbench.udt_dataset_access(v_table, 'viewer'::public.permission_level)
                then '1' else '0'
              end;
      perform platform.memo_s_put(v_memo, v_ok);
    end if;
    if v_ok <> '1' and not workbench._udt_row_granted(p_row_id) then
      return platform.relation_withheld_label();
    end if;
  end if;

  -- (b) THE COLUMNS THIS COLUMN NAMED, IN ORDER — why "first name" + " " + "last name" is one
  --     string and not two chips.
  if p_display is not null and jsonb_typeof(p_display -> 'columns') = 'array' then
    select array_agg(e.value #>> '{}' order by e.ordinality)
      into v_cols
      from jsonb_array_elements(p_display -> 'columns') with ordinality e;
    v_sep := coalesce(p_display ->> 'separator', ' ');

    foreach c in array coalesce(v_cols, '{}'::text[]) loop
      v_raw := nullif(btrim(coalesce(v_data ->> c, '')), '');
      v_one := null;
      if v_raw is not null then
        if v_raw ~ k_uuid then
          -- ONE HOP. A display column that is itself a relation reads as its own words, once,
          -- and the hop is gated by (a) exactly as this call was.
          if p_hop < 1 then
            v_one := workbench._udt_row_words(p_organization_id, v_raw::uuid, null, p_hop + 1);
          end if;
        else
          v_one := v_raw;   -- already the words somebody typed
        end if;
      end if;
      if nullif(btrim(coalesce(v_one, '')), '') is not null then
        v_parts := v_parts || v_one;
      end if;
    end loop;

    if array_length(v_parts, 1) is not null then
      return array_to_string(v_parts, coalesce(v_sep, ' '));
    end if;
    -- The named columns hold nothing on THIS row. Fall through rather than print an empty chip.
  end if;

  -- (c) THE TABLE'S OWN ROW LABEL, then the conventional names, then the first words the row
  --     holds — never a uuid-shaped one, because a bare id in `name` is the same lie as a bare
  --     id in the cell.
  if jsonb_typeof(v_meta -> 'row_label') = 'object'
     and (v_meta -> 'row_label' ->> 'kind') = 'field' then
    v_label := nullif(btrim(coalesce(v_meta -> 'row_label' ->> 'field', '')), '');
  end if;

  v_raw := coalesce(
    case when v_label is not null then nullif(btrim(coalesce(v_data ->> v_label, '')), '') end,
    nullif(btrim(coalesce(v_data ->> 'name', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'title', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'label', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'company', '')), ''),
    nullif(btrim(coalesce(v_data ->> 'subject', '')), ''),
    custom._first_words(v_data));

  if v_raw is not null and v_raw !~ k_uuid then
    return v_raw;
  end if;

  if v_raw is not null and p_hop < 1 then
    v_one := workbench._udt_row_words(p_organization_id, v_raw::uuid, null, p_hop + 1);
    if nullif(btrim(coalesce(v_one, '')), '') is not null then
      return v_one;
    end if;
  end if;

  -- (d) The row holds nothing sayable. Say THAT, rather than print an id or go blank.
  return 'an untitled row';
end
$fn$;

comment on function workbench._udt_row_words(uuid, uuid, jsonb, integer) is
  'lane OLD-TABLES-2 2026-09-22 (W2). THE ONE RESOLVER for what a row of the OLDER store is '
  'called. Ladder first, per record, BOTH arms of udt_dataset_rows.std_select (a row the viewer '
  'may not see reads platform.relation_withheld_label(), the same sentence the unified store '
  'returns); then the column''s own display columns joined by its separator; then the table''s '
  'row label, the conventional names and the first words the row holds. A row that is not there '
  'answers NULL - unresolvable, never the withheld sentence - which is what makes W1''s amber '
  'identifier chip reachable in this store. One hop, capped by p_hop.';

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE DOOR — A PAGE AT A TIME
-- ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function workbench.udt_row_words_many(
  p_organization_id uuid,
  p_display         jsonb,
  p_row_ids         uuid[])
returns table(row_id uuid, words text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_spec jsonb;
begin
  -- THE ORGANIZATION WALL, BEFORE ANYTHING IS READ. The same helper the unified store's doors
  -- use, memoised per seat per organization, so a non-member is refused here and never reaches a
  -- row of any table.
  perform custom.assert_client_may_reach(p_organization_id, 'workbench.udt_row_words_many');
  v_spec := workbench._udt_display_spec(p_display);

  -- A row the caller may not see comes back as the withheld sentence; a row that is not there at
  -- all comes back as NOTHING, and the caller's cell reads as an unresolvable reference carrying
  -- its own identifier. The ladder is NOT batched: it is asked inside the resolver for every id
  -- in the array, so batching buys a round trip and never a disclosure.
  return query
    select t.id, t.w
      from (
        select i.id, workbench._udt_row_words(p_organization_id, i.id, v_spec, 0) as w
          from unnest(coalesce(p_row_ids, '{}'::uuid[])) as i(id)
         where i.id is not null
      ) t
     where t.w is not null;
end
$fn$;

comment on function workbench.udt_row_words_many(uuid, jsonb, uuid[]) is
  'lane OLD-TABLES-2 2026-09-22 (W2). THE OLDER STORE''S WORDS DOOR: what a page of relation '
  'cells reads, in one round trip. The unified store''s custom.relation_words_many is its twin '
  'and is untouched by this file - one client primitive dispatches between them by store, so '
  'the thirteen screens standing on custom._words_for change nothing.';

-- ── the doors are DECLARED before anything is granted, because
--    ddl_guard[definer_client_grant_revoked] takes the client EXECUTE from any definer with no
--    door row the moment its body is replaced (RELATION-DECLARE, 2026-09-20). ────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes, argument_rules)
values
  ('workbench', '_udt_display_spec', 'p_raw jsonb',
   'migrations/campaign/oldtables_w2_the_older_store_gets_its_own_words_door.sql (lane OLD-TABLES-2)',
   'Pure normalisation of a relation column''s display spec. It reads no table, takes no id, decides nothing about anybody, and returns the same shape for the same input on every database in the world.',
   false, false,
   'server_only: it is a shape normaliser with no read in it, called by workbench.udt_row_words_many after that door has already decided the organization wall, and there is nothing for a client to reach through it.',
   '{3802}', null),
  ('workbench', '_udt_row_granted', 'p_row_id uuid',
   'migrations/campaign/oldtables_w2_the_older_store_gets_its_own_words_door.sql (lane OLD-TABLES-2)',
   'The PER-ROW arm of workbench.udt_dataset_rows.std_select, copied from the policy expression itself: the union of the five single-row grants AND the iam.has_access level check. It answers only true or false about the seat that is already signed in, and reads no row of anybody''s data.',
   false, false,
   'server_only: it is half of a policy predicate, called by workbench._udt_row_words to decide whether one row may be read. A client calling it would learn one boolean about its own seat, which is exactly what the policy already tells it.',
   '{2950}', null),
  ('workbench', '_udt_row_words', 'p_organization_id uuid, p_row_id uuid, p_display jsonb, p_hop integer',
   'migrations/campaign/oldtables_w2_the_older_store_gets_its_own_words_door.sql (lane OLD-TABLES-2)',
   'p_row_id is judged on its own ladder — both arms of udt_dataset_rows.std_select — BEFORE its data is read, and a row that fails it answers platform.relation_withheld_label(). p_organization_id scopes the read, so a row of another organization is not found and answers null. p_display names keys of that row''s own document and can reach nothing else. p_hop caps the relation hop at one.',
   false, false,
   'server_only: it takes a bare row id with no column to scope it, exactly as custom._words_for does, and the batch door above is what a client actually calls — that door decides the organization wall before this body is reached even once.',
   '{2950,2950,3802,23}', null),
  ('workbench', 'udt_row_words_many', 'p_organization_id uuid, p_display jsonb, p_row_ids uuid[]',
   'migrations/campaign/oldtables_w2_the_older_store_gets_its_own_words_door.sql (lane OLD-TABLES-2)',
   'What a whole page of the OLDER store''s relation cells reads, in one round trip. custom.assert_client_may_reach decides the organization wall before anything is read; each row at the far end is then judged on its own, per record, against BOTH arms of workbench.udt_dataset_rows.std_select — so a reader who may not open a row gets platform.relation_withheld_label() and never its words, and a row that is not there at all comes back as nothing rather than as a sentence that would imply it exists.',
   true, false, null,
   '{2950,3802,2951}',
   jsonb_build_object(
     'version', '1',
     'declared_by', 'oldtables_w2_the_older_store_gets_its_own_words_door.sql',
     'declared_at', '2026-09-22 lane OLD-TABLES-2, read from this body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid',
         'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and the read itself is filtered on it a second time (udt_dataset_rows.organization_id = p_organization_id), so a row of another organization is not found.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-22 lane OLD-TABLES-2 — read from this body'),
       'p_display', jsonb_build_object(
         'type', 'jsonb',
         'check', 'NOT AN IDENTITY AND NOT A REACH. It names KEYS OF THE TARGET ROW''S OWN data document and nothing else: it cannot name another row, another table or another organization, and every key it could name belongs to a row this caller has already been cleared to read. A key that is not there contributes nothing and the fallback chain answers instead. A shape nobody can mean is refused 23514 before a row is read.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-22 lane OLD-TABLES-2 — read from this body'),
       'p_row_ids', jsonb_build_object(
         'type', 'uuid',
         'check', 'A FILTER, AND NOT A LEAK. Each id is judged on its own inside workbench._udt_row_words against both arms of the row''s own select policy before its data is read: an id this caller may not open answers the withheld sentence, and an id that names nothing answers nothing. Naming more ids widens nothing.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-22 lane OLD-TABLES-2 — read from this body'))))
on conflict do nothing;

grant execute on function workbench.udt_row_words_many(uuid, jsonb, uuid[]) to authenticated;
