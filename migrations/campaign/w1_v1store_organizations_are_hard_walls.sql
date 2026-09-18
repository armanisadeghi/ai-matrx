-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- V1-STORE-FIXES, FINDING 1 — ORGANIZATIONS ARE HARD WALLS, AND THE STORE NOW HAS ONE
-- PLACE THAT SAYS SO.
--
-- WHAT `V1-STORE` MEASURED (00:20 UTC, 2026-09-18)
-- -----------------------------------------------
-- `insert into custom.record` for organization `8cb71c8b…` carrying `table_id` = a Table
-- record owned by organization `39c38960…` was ACCEPTED with no refusal. Nothing in the
-- store tied a record's Table to the record's own organization. REC-29: "Organizations are
-- hard walls: a relation never targets another organization's Record unless the Table allows
-- it" (VISION V-50, test T15).
--
-- THE CENSUS, RUN RATHER THAN GUESSED (branch, 2026-09-18)
-- --------------------------------------------------------
-- Every id-shaped value the store accepts was enumerated two ways: from the live documents
-- (a recursive walk of `custom.record.data` collecting every jsonb path whose value matches
-- a uuid, 16 distinct paths) and from the guard bodies in `pg_proc`. Site by site:
--
--   OPEN, and closed by this file:
--     · `custom.record.table_id`                  — the Table a record belongs to  (RED 1a)
--     · `data.from` / `data.to` on a `relation`   — the two ends of a relation     (RED 1b)
--     · `data.relation_target` on a Field         — the Table a relation points at (RED 1c)
--     · `custom.external_link.record_id` / `.source_id` — reachable by a direct INSERT; the
--       door `custom.external_stub_upsert` scopes the source, nothing scoped the table.
--
--   ALREADY CLOSED, asserted in `v1store_fixes_red.sql` block 1d and in the GREEN so they
--   cannot regress, and left with their own (better) refusal messages:
--     · `data.parent_id`              — `custom._containment_guard`   ("that container is not in this organization")
--     · `data.entity_definition_id`   — `custom._field_shape_guard`
--     · `data.config.options_table_id`— `custom._field_shape_guard`
--     · `data.scope_table_id`, `data.target_field_id`, the `expr` field leaves
--                                     — `custom._rule_shape_guard`
--     · a relation field's VALUE      — `custom.validate_values` (REC-51, W1-VAL's)
--
-- THE FIX IS ONE PREDICATE AND ONE CENSUS, NEVER A PER-COLUMN PATCH
-- ------------------------------------------------------------------
--   · `custom.organization_references(kind, organization, row)` is the census AS A FUNCTION:
--     it yields one row per reference the store accepts, with the site, what a person would
--     call it, and whether a Table may open that site. A site added by a later lane is a
--     branch added HERE, and it is guarded from that moment.
--   · `custom.assert_organization_wall(kind, organization, row)` walks that census and
--     refuses any reference that RESOLVES IN ANOTHER ORGANIZATION. It refuses a WALL breach
--     and nothing else: an id that resolves nowhere is a different law (referential
--     integrity) with its own owners, and answering it here would change refusals other
--     lanes' suites assert on.
--   · `custom._organization_wall_guard()` is the one trigger, attached to every base table in
--     `custom`, and it reads the switch through the ONE door predicate
--     (`custom.assert_store_door`) exactly as every other `RETURNS trigger` in this schema.
--
-- THE KERNEL IS NOT A BREACH, AND THE EXEMPTION IS NAMED. REC-27's kernel Tables are
-- "defined in code, not data" but they are STORED, and they are stored in one organization
-- (`Matrx System`, measured on the branch: all nine `data_class = 'kernel'` rows). Every
-- organization's records point at them, so a wall that judged by organization alone would
-- refuse the whole store on its first write. The exemption is therefore `data_class =
-- 'kernel'` - the platform's shared vocabulary - and never an organization id literal.
--
-- REC-29'S OWN ESCAPE HATCH IS BUILT, NOT DEFERRED. The law says "unless the Table allows
-- it", so the wall has exactly one opening and the Table declares it: a Table record whose
-- data carries `"cross_organization_relations": true` lets the relations that START at its
-- records point into another organization. Nothing else opens - a record's Table, a Field's
-- relation target and an external link's ends are never cross-organization, because those
-- are what the record IS rather than what it points at. Default: closed. Building the wall
-- without the opening would have forced `W1-ORG` (REC-29's builder) to re-open the class to
-- ship T15, which is how a closed class comes back.
--
-- IDEMPOTENCE, STATED HONESTLY RATHER THAN CLAIMED (rule 27), and it is this campaign's
-- established shape: §6b.2's additive allow-list admits `CREATE TRIGGER` and refuses
-- `CREATE OR REPLACE TRIGGER`, `DROP TRIGGER` and every `DO` block by name, and a
-- `RETURNS trigger` function may not be replaced without a `-- based-on:` line it cannot
-- have while it is new. Every function here is NEW, so all three are plain `CREATE` - the
-- allow-list refuses `CREATE OR REPLACE` without a `-- based-on:` line whatever the live
-- state is - and so are the three triggers, whose second consecutive apply is
-- refused BY THE DATABASE (42723 / 42710) having changed nothing - exactly as `W1-STORE`'s,
-- `W1-TABLE`'s and `W1-PROV`'s files are. Rule 27's loop is therefore up -> inverse ->
-- `--reapply`, with the catalogue read back identical at both ends. THE INVERSE:
-- `migrations/inverse/w1_v1store_organizations_are_hard_walls_down.sql`.

create function custom.organization_references(
  p_kind            text,
  p_organization_id uuid,
  p_row             jsonb)
returns table (site text, what text, ref_id uuid, openable boolean)
language sql
stable
set search_path to 'pg_catalog'
as $$
  -- THE CENSUS. One row per id the store accepts that must resolve inside the organization.
  -- `openable` marks the one site REC-29's "unless the Table allows it" can open.
  --
  -- custom.record — the Table a record belongs to.
  select 'table_id', 'the table this record belongs to',
         nullif(p_row ->> 'table_id', '')::uuid, false
   where p_kind = 'custom.record'

  union all
  -- custom.record — the two ends of a relation row (REC-26). THE OPENABLE SITE.
  select 'data.' || e.k, case e.k when 'from' then 'the record this relation starts at'
                                  else 'the record this relation points at' end,
         nullif(p_row -> 'data' ->> e.k, '')::uuid, true
    from (values ('from'), ('to')) e(k)
   where p_kind = 'custom.record' and p_row ->> 'data_class' = 'relation'

  union all
  -- custom.record — a Field's declared relation target (FLD-13), and a list Field's options
  -- Table (FLD-5), and the Table a Field defines (FLD-8).
  select 'data.' || e.k, e.w, nullif(p_row -> 'data' ->> e.k, '')::uuid, false
    from (values ('relation_target',      'the table this relation field points at'),
                 ('entity_definition_id', 'the table this field belongs to'),
                 ('scope_table_id',       'the table this rule is about'),
                 ('target_field_id',      'the field this rule works out'),
                 ('rule_id',              'the rule this merge field uses')) e(k, w)
   where p_kind = 'custom.record'

  union all
  select 'data.config.options_table_id', 'the table this list field takes its choices from',
         nullif(p_row -> 'data' -> 'config' ->> 'options_table_id', '')::uuid, false
   where p_kind = 'custom.record'

  union all
  -- custom.record — every Field a Rule's expression reaches for, by id (REC-17).
  select 'data.expr.field', 'a field this rule reads', (l ->> 'field')::uuid, false
    from jsonb_path_query(coalesce(p_row -> 'data' -> 'expr', '{}'::jsonb),
                          '$.**{0 to 12} ? (exists(@.field))') l
   where p_kind = 'custom.record'
     and jsonb_typeof(l -> 'field') = 'string'
     and (l ->> 'field') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

  union all
  -- custom.external_link — the stub Record it stands for and the source it came from.
  select 'record_id', 'the record this external link stands for',
         nullif(p_row ->> 'record_id', '')::uuid, false
   where p_kind = 'custom.external_link'
  union all
  select 'source_id', 'the external source this link came from',
         nullif(p_row ->> 'source_id', '')::uuid, false
   where p_kind = 'custom.external_link';
  -- custom.external_source carries no reference into the store: its columns are the
  -- connection token, the foreign schema and table, and the link template. It is listed here
  -- in words rather than omitted, so the next reader knows it was looked at.
$$;

comment on function custom.organization_references(text, uuid, jsonb) is
  'REC-29: the census of every reference the custom store accepts that must resolve inside the organization. One row per site. A new site is a branch added here, and it is walled from that moment.';

create function custom.assert_organization_wall(
  p_kind            text,
  p_organization_id uuid,
  p_row             jsonb)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  r        record;
  v_other  uuid;
  v_opened boolean;
begin
  for r in select * from custom.organization_references(p_kind, p_organization_id, p_row)
            where ref_id is not null loop

    -- The kernel is the platform's shared vocabulary (REC-27) and is stored in one
    -- organization, so every organization points at it. Read from the row, never a literal.
    select case when x.data_class = 'kernel' then null else x.organization_id end
      into v_other
      from custom.record x
     where x.id = r.ref_id
     limit 1;

    if v_other is null or v_other = p_organization_id then
      continue;                       -- same organization, the kernel, or resolves nowhere
    end if;

    -- REC-29's one opening: the Table whose records this relation starts at may allow it.
    v_opened := false;
    if r.openable then
      select coalesce((t.data ->> 'cross_organization_relations')::boolean, false)
        into v_opened
        from custom.record f
        join custom.record t
          on t.organization_id = f.organization_id and t.id = f.table_id
       where f.organization_id = p_organization_id
         and f.id = nullif(p_row -> 'data' ->> 'from', '')::uuid
       limit 1;
    end if;
    if coalesce(v_opened, false) then
      continue;
    end if;

    raise exception '% belongs to a different organization', r.what
      using errcode = '23503',
            hint = case when r.openable
                     then 'REC-29 / T15: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it, which this one does not - set cross_organization_relations on that table first.'
                     else 'REC-29 / T15: organizations are hard walls. What a record IS - its table, the table a field points at, the record an external link stands for - never crosses an organization. The route across organizations is a relation the table allows, never this.'
                   end;
  end loop;
end;
$$;

comment on function custom.assert_organization_wall(text, uuid, jsonb) is
  'REC-29: refuses any reference in the census that resolves in ANOTHER organization. An id that resolves nowhere is referential integrity, not a wall breach, and is left to its own guards.';

create function custom._organization_wall_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_kind text;
begin
  -- 🚨 THE NAME HAS TO BE THE PARTITION ROOT'S, NOT THE PARTITION'S, AND THIS LANE LEARNED
  -- IT THE ONLY WAY THAT COUNTS. The first rehearsal of this file built its census key as
  -- `format('%I.%I', tg_table_schema, tg_table_name)`. Every catalogue check a verifier
  -- would run read green - seventeen triggers in `pg_trigger`, the parent's and one per
  -- partition, BEFORE INSERT OR UPDATE, calling this function - and a record of one
  -- organization carrying another organization's `table_id` STILL LANDED, while
  -- `custom.assert_organization_wall(...)` called directly with the same row refused it by
  -- name. `custom.record` is HASH PARTITIONED into sixteen children, an INSERT on the parent
  -- is ROUTED to a partition, and it is that PARTITION's copy of the trigger that fires - so
  -- `tg_table_name` was `record_p07`, the census keyed on `custom.record` returned ZERO
  -- rows, and the wall passed everything. A guard that cannot be wrong about anything is the
  -- exact failure this campaign exists to catch; it was caught by re-running the RED rather
  -- than by reading the catalogue. `pg_partition_root` answers NULL for a table that is
  -- neither a partition nor partitioned, so the coalesce covers `external_link` and
  -- `external_source` - and every partitioned table a later lane adds to `custom` (REC-N-8's
  -- tiering will add them) inherits the right behaviour, because nothing here keys on
  -- `tg_table_name` any more.
  select format('%I.%I', n.nspname, c.relname) into v_kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.oid = coalesce(pg_partition_root(tg_relid), tg_relid);
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which judges
  -- `custom.caller_role()` - the identity the caller actually held - and not `current_user`,
  -- which a SECURITY DEFINER door has already rewritten to itself. The switch never removes
  -- a check: the wall below runs exactly as it would with the store open.
  perform custom.assert_store_door(new.organization_id, v_kind);
  perform custom.assert_organization_wall(v_kind, new.organization_id, to_jsonb(new));
  return new;
end;
$$;

create trigger custom_record_organization_wall
  before insert or update on custom.record
  for each row execute function custom._organization_wall_guard();

create trigger custom_external_link_organization_wall
  before insert or update on custom.external_link
  for each row execute function custom._organization_wall_guard();

create trigger custom_external_source_organization_wall
  before insert or update on custom.external_source
  for each row execute function custom._organization_wall_guard();
