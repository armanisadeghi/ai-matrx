-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W1-TABLE — the Table, the Home and the containment tree.
--
-- THE RULING THIS FILE EXECUTES (build log 12:06 UTC 2026-09-17, rules 23/25/28)
-- ----------------------------------------------------------------------------
-- REC-1: `custom."table"` and `custom.home` are PROJECTIONS over `custom.record`, not
-- provisioned relations. REC-25 is law and is already BUILT — `W1-STORE` landed the eight
-- kernel Tables as ROWS in `custom.record` (`data_class = 'kernel'`, `table_id` =
-- `11111111-0000-4000-8000-000000000001`, the `Table` kernel record, which is its own
-- type) — so a Table already IS a Record here. A second physical `custom.table` would make
-- every Table exist twice with nothing keeping the two equal. REC-66's "beside the base
-- contract" is therefore satisfied literally: the base-contract columns these views return
-- are `custom.record`'s own, certified true by
-- `iam.canonical_certify_ok('custom','record','record')` under REC-56, and the attributes
-- are lifted out of `data`. CUT-15 and CUT-20 need exactly this — "its id unchanged" — a
-- Table's id IS its record id, so the cutover is an INSERT into the store.
--
-- THIS LANE CREATES NO TABLE, adds NO column to `custom.record` and touches NO index
-- (`W1-STORE`'s column list and `W1-INDEX`'s layer are not this lane's). Everything below
-- is a view, a trigger, a function or one knob row.
--
-- THE NAME IS QUOTED, AND IT HAS TO BE. `table` is a fully reserved word in PostgreSQL:
-- `create or replace view custom.table` is a syntax error even though the name is schema-qualified.
-- Every reference in this file and in its inverse is `custom."table"`.
--
-- WHAT EACH LAW BECOMES, IN THE ORDER THE CONTRACT STATES THEM
-- -----------------------------------------------------------
--   REC-1    a Table declares its fields, exactly ONE Home, and `display`, `ordered`,
--            `heavy|light`, `retention`, `detail` — enforced by
--            `custom._table_shape_guard` on every declared Table row.
--   REC-2    every Table has a title field; without one a record cannot be a chip —
--            `title_field` is required and must name one of the Table's own fields.
--   REC-3    a Table declared at the organization may have additional Homes inside many
--            Records — `custom.home_add`, read back through `custom.home`.
--   REC-7    a Record has zero or one parent, never two — the parent is ONE jsonb key,
--            `data->'parent_id'`, so two is unrepresentable; an array is refused by name.
--   REC-8    containment is a tree; reparenting under one's own descendant is refused —
--            `custom._containment_guard`, message "this would put it inside itself".
--   REC-10   an owned relation makes its target contained — `custom.relation_own` writes
--            the containment edge AND the relation in one transaction, so the target
--            enters the closure (the Visibility DERIVATION over that closure is W2-VIS's),
--            may be shared directly and may be a Home.
--   REC-11   a `detail` Table inherits only: its records take no direct shares and cannot
--            be Homes — every Home write refuses a record of a `detail` Table by name.
--            (The "no direct shares" half is the grant surface's, W2-ACCESS / W4-DOOR;
--            this file enforces the Home half and says so rather than implying both.)
--   REC-14   Home is a tree and applicability is flat — a Table's declared Home IS its
--            `parent_id`, so "exactly one Home" and "zero or one parent" are ONE stored
--            fact and the Home tree is REC-7's tree. Additional Homes are relations, which
--            are flat, and neither absorbs the other.
--   REC-26   additional Homes are referenced carrying relations FROM the Home record TO
--            the Table record — `data_class = 'relation'`, `kind = 'referenced'`,
--            `carrying = true`, `role = 'home'`.
--   REC-66   `custom."table"`'s own columns: `type ∈ {entity, detail}`, `parent_token` when
--            detail, `agent_writable` default true, `slug`, `label_singular`,
--            `label_plural`, `icon`, `color`.
--   REC-N-4  the containment depth ceiling: 16, organization-settable to a platform
--            maximum of 32. THE CEILING IS READ OUT OF THE FUNCTION — the literal lives in
--            `custom.containment_depth_ceiling`'s body and is read by
--            `select pg_get_functiondef(oid) from pg_proc …`, never out of a document.
--   REC-N-17 a Table also carries a default sort and a manual row order.
--
-- TWO NAMES, ONE STORED PROPERTY. REC-1's `detail` and REC-66's `type ∈ {entity, detail}`
-- are the same fact said twice: `type` is stored, `detail` is `(type = 'detail')` in the
-- view, so no row can say both.
--
-- THE SEAM, NAMED RATHER THAN SMUGGLED. REC-26's relations are written into the store
-- because `platform.associations` is `LOCK:platform` and the general relation layer is
-- `W1-REL`'s (REL-*). `custom.home` reads them through ONE body, `custom.home_relations()`,
-- so `W1-REL` repoints that body and no consumer moves. The same is true of the closure:
-- `custom.containment_edges()` is the ONE place an edge kind is enumerated.
--
-- WHY NOTHING HERE IS A GRANT, AND WHY NONE OF IT IS A SECOND WRITE DOOR. Schema `custom`
-- is revoked from PUBLIC, anon, authenticated and service_role (default privileges
-- included), is absent from `pgrst.db_schemas`, and `custom/system_enabled` resolves false.
-- Every function below is SECURITY INVOKER and carries no GRANT, so no client role can
-- call any of them: `custom.record_write` (DOOR-N-1) stays the one door, and these are
-- owner-side constructors, not a second one.
--
-- WHY THE VIEWS ARE `security_invoker = true`: a caller reads them under their own
-- row-level security, so a view can never hand out a row `custom.record`'s own policies
-- would refuse.
--
-- IDEMPOTENCE, STATED HONESTLY RATHER THAN CLAIMED. §6b.2's additive allow-list admits
-- `create or replace view` and `CREATE TRIGGER` and REFUSES `CREATE OR REPLACE VIEW`, `CREATE OR
-- REPLACE TRIGGER` and every `DO` block by name, and PostgreSQL has no `IF NOT EXISTS` for
-- a view, a trigger or a function. So a second consecutive apply of these bytes is refused
-- BY THE DATABASE (42P07 / 42710 / 42723) and changes nothing, exactly as `W1-STORE`'s and
-- `W1-PROV`'s files do. Rule 27's loop is therefore up → inverse → `--reapply`, and the
-- catalogue is read back identical at both ends. The knob row IS idempotent
-- (`on conflict do nothing`).
--
-- THE INVERSE: `migrations/inverse/w1_table_table_home_containment_down.sql` (§4.13).

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ── REC-N-4's organization knob ────────────────────────────────────────────────
-- The PLATFORM value is the function's own literal, not this row: this row exists so an
-- organization can raise its own ceiling through the knob door without a migration, and so
-- `platform.knob_resolve` does not raise P0001 the first time the guard reads it. Seeded at
-- the same 16 the function's literal carries, which is what makes the default a default
-- rather than a second opinion. `overridable_by` names the `organization` rung because
-- REC-N-4 says organization-settable; `max_value` is the platform maximum the function
-- clamps to, so the ladder refuses a raise past 32 before the function has to.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'containment_depth_ceiling', '16'::jsonb, '16'::jsonb, 'integer', 1, 32,
   'How many things can be inside things',
   'REC-N-4. The longest containment chain this organization allows, counted as a chain '
   'length and never as a level or a layer. The platform default is the literal in '
   'custom.containment_depth_ceiling''s own body; an organization may raise it up to the '
   'platform maximum of 32, which the same function clamps. A write past the ceiling is '
   'refused by custom._containment_guard in the user''s own words.',
   'agent',
   'Unified data campaign, W1-TABLE, 2026-09-17: REC-N-4, stated in his words as a '
   'containment-chain limit — "how many things can be inside things".',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict do nothing;

-- ── the kernel `Table` record's id, in code ────────────────────────────────────
create or replace function custom.table_kernel_id() returns uuid
  language sql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_table_kernel_id$
  select '11111111-0000-4000-8000-000000000001'::uuid;
$fn_table_kernel_id$;

comment on function custom.table_kernel_id() is
  'REC-25 / REC-27: the id of the kernel `Table` record in custom.record, written by W1-STORE''s w1_store_kernel_tables.sql and read back live before this file was written. A record whose table_id is this id IS a Table.';

-- ── REC-N-4: the ceiling, READ OUT OF THIS FUNCTION ────────────────────────────
create or replace function custom.containment_depth_ceiling(p_organization_id uuid default null)
  returns integer
  language plpgsql stable
  set search_path to 'pg_catalog'
as $fn_ceiling$
declare
  v_platform_default constant integer := 16;   -- REC-N-4: THE CEILING. Read by pg_get_functiondef.
  v_platform_maximum constant integer := 32;   -- REC-N-4: organization-settable up to here, never past it.
  v_knob             integer;
begin
  if p_organization_id is null then
    return v_platform_default;
  end if;
  select nullif(platform.knob_resolve('custom', 'containment_depth_ceiling', p_organization_id)
                  #>> '{}', '')::integer
    into v_knob;
  if v_knob is null then
    return v_platform_default;
  end if;
  return least(greatest(v_knob, 1), v_platform_maximum);
end;
$fn_ceiling$;

comment on function custom.containment_depth_ceiling(uuid) is
  'REC-N-4. The ceiling is the literal v_platform_default in THIS body and is read out of the function, never out of a document; an organization may raise it through custom/containment_depth_ceiling up to the literal v_platform_maximum, which this body clamps.';

-- ── REC-7: the parent, and there is only ever one of it ────────────────────────
create or replace function custom.containment_parent(p_data jsonb) returns uuid
  language plpgsql immutable parallel safe
  set search_path to 'pg_catalog'
as $fn_parent$
declare
  v_raw jsonb := p_data -> 'parent_id';
begin
  if v_raw is null or jsonb_typeof(v_raw) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v_raw) = 'array' then
    raise exception 'a record has zero or one parent, never two'
      using errcode = '22023',
            hint = 'REC-7. To put one record inside two places, give it a referenced carrying relation to the second one instead of a second parent.';
  end if;
  if jsonb_typeof(v_raw) <> 'string' then
    raise exception 'a record has zero or one parent, never two'
      using errcode = '22023',
            hint = format('REC-7. parent_id was a %s; it is one id or it is absent.', jsonb_typeof(v_raw));
  end if;
  return (v_raw #>> '{}')::uuid;
end;
$fn_parent$;

comment on function custom.containment_parent(jsonb) is
  'REC-7: a Record has zero or one parent, never two. The parent is ONE jsonb key, so two is unrepresentable; an array or any non-string is refused by name here rather than read past.';

-- ── the chain UP, bounded so the guard can SEE the chain that is one too long ───
create or replace function custom.containment_chain(p_organization_id uuid, p_record_id uuid)
  returns table (ancestor_id uuid, depth integer)
  language sql stable
  set search_path to 'pg_catalog'
as $fn_chain$
  with recursive up (ancestor_id, depth) as (
    select custom.containment_parent(r.data), 1
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = p_record_id
       and custom.containment_parent(r.data) is not null
    union all
    select custom.containment_parent(r.data), up.depth + 1
      from up
      join custom.record r
        on r.organization_id = p_organization_id
       and r.id = up.ancestor_id
     where custom.containment_parent(r.data) is not null
       and up.depth < 33            -- the platform maximum plus one: the guard must be able
  )                                 -- to SEE the chain that is one too long in order to refuse it.
  select ancestor_id, depth from up;
$fn_chain$;

comment on function custom.containment_chain(uuid, uuid) is
  'REC-7/REC-8/REC-N-4: the containment chain above a record, nearest ancestor first, bounded at the platform maximum plus one so the guard can see the chain that is one too long. It is also the cycle detector: meeting the record itself on the way up IS a cycle.';

-- ── the ONE place an edge kind is enumerated ────────────────────────────────────
create or replace function custom.containment_edges(p_organization_id uuid)
  returns table (parent_id uuid, child_id uuid, via text)
  language sql stable
  set search_path to 'pg_catalog'
as $fn_edges$
  -- contained records: the containment tree (REC-7, REC-8, REC-10)
  select custom.containment_parent(r.data), r.id, 'contained'::text
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and custom.containment_parent(r.data) is not null
  union all
  -- referenced CARRYING relations, from this record to its target (REC-10, REC-26): a
  -- carrying relation reaches what it points at, which is what makes an additional Home
  -- reachable from the Home record without the Table being contained by it.
  select (r.data ->> 'from')::uuid, (r.data ->> 'to')::uuid, 'carrying'::text
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data_class = 'relation'
     and coalesce((r.data ->> 'carrying')::boolean, false)
     and r.data ->> 'from' is not null
     and r.data ->> 'to' is not null;
$fn_edges$;

comment on function custom.containment_edges(uuid) is
  'The ONE body that enumerates what an edge is in this store: a containment edge (parent_id) or a carrying relation (from → to). W1-REL repoints this and custom.home_relations() and no consumer moves.';

-- ── the closure DOWN ───────────────────────────────────────────────────────────
create or replace function custom.reachable_from(p_organization_id uuid, p_roots uuid[])
  returns table (record_id uuid, depth integer, via text)
  language sql stable
  set search_path to 'pg_catalog'
as $fn_reach$
  with recursive down (record_id, depth, via) as (
    select x, 0, 'root'::text from unnest(p_roots) as x
    union all
    select e.child_id, down.depth + 1, e.via
      from down
      join custom.containment_edges(p_organization_id) e on e.parent_id = down.record_id
     where down.depth < 33
  )
  select record_id, min(depth)::integer, min(via) from down group by record_id;
$fn_reach$;

comment on function custom.reachable_from(uuid, uuid[]) is
  'The containment-and-carrying closure this lane owns: what is reachable from the roots. T10 is answered over it. The Visibility DERIVATION is W2-VIS''s and reads this closure; this function decides no grant and reads no grant. The depth bound is the platform maximum plus one, so a relation loop (T11) terminates rather than recursing forever.';

-- ── REC-26: the one body W1-REL repoints ───────────────────────────────────────
create or replace function custom.home_relations()
  returns table (table_id uuid, home_record_id uuid, organization_id uuid, relation_id uuid)
  language sql stable
  set search_path to 'pg_catalog'
as $fn_home_rel$
  select (r.data ->> 'to')::uuid,
         (r.data ->> 'from')::uuid,
         r.organization_id,
         r.id
    from custom.record r
   where r.deleted_at is null
     and r.data_class = 'relation'
     and r.data ->> 'kind' = 'referenced'
     and coalesce((r.data ->> 'carrying')::boolean, false)
     and r.data ->> 'role' = 'home'
     and r.data ->> 'from' is not null
     and r.data ->> 'to' is not null;
$fn_home_rel$;

comment on function custom.home_relations() is
  'REC-26: additional Homes are referenced carrying relations FROM the Home record TO the Table record. They are written into the store because platform.associations is LOCK:platform and the general relation layer is W1-REL''s; this is the ONE body W1-REL repoints, so no consumer moves.';

-- ── REC-7, REC-8, REC-N-4: the containment trigger ─────────────────────────────
create or replace function custom._containment_guard() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_cguard$
declare
  v_parent   uuid;
  v_ceiling  integer;
  v_depth    integer;
  v_org_set  boolean;
  v_exists   boolean;
begin
  v_parent := custom.containment_parent(new.data);   -- REC-7 refuses two parents in here
  if v_parent is null then
    return new;
  end if;

  -- REC-8, the shortest cycle there is.
  if v_parent = new.id then
    raise exception 'this would put it inside itself'
      using errcode = '23514',
            hint = 'REC-8: containment is a tree, and a record cannot be its own container.';
  end if;

  select true into v_exists
    from custom.record r
   where r.organization_id = new.organization_id and r.id = v_parent;
  if v_exists is not true then
    raise exception 'that container is not in this organization'
      using errcode = '23503',
            hint = 'REC-8 / T15: containment never crosses an organization. The route across organizations is a relation the Table allows, never a parent.';
  end if;

  -- REC-8 / T3: reparenting under one's own descendant. Walking UP from the new parent and
  -- meeting this record is exactly that, and it is the same walk the cycle check needs.
  if exists (select 1 from custom.containment_chain(new.organization_id, v_parent) c
              where c.ancestor_id = new.id) then
    raise exception 'this would put it inside itself'
      using errcode = '23514',
            hint = 'REC-8: that container is already inside this one, so containment would stop being a tree.';
  end if;

  -- REC-N-4: the ceiling, read out of the function.
  v_ceiling := custom.containment_depth_ceiling(new.organization_id);
  select coalesce(max(c.depth), 0) into v_depth
    from custom.containment_chain(new.organization_id, v_parent) c;
  v_depth := v_depth + 2;   -- + the parent itself, + this record
  if v_depth > v_ceiling then
    select platform.knob_resolve('custom', 'containment_depth_ceiling', new.organization_id) is distinct from
           platform.knob_resolve('custom', 'containment_depth_ceiling', null)
      into v_org_set;
    if v_org_set then
      raise exception 'that is more things inside things than this organization allows, which is %', v_ceiling
        using errcode = '23514',
              hint = 'REC-N-4: the organization set this limit and can raise it, up to the platform maximum.';
    else
      raise exception 'that is more things inside things than this organization allows'
        using errcode = '23514',
              hint = 'REC-N-4: no number is quoted because the organization did not set one. Move it somewhere less deeply nested, or raise the limit for this organization.';
    end if;
  end if;

  return new;
end;
$fn_cguard$;

comment on function custom._containment_guard() is
  'REC-7, REC-8 and REC-N-4, raised by this trigger and by nothing else: zero or one parent; no container inside itself ("this would put it inside itself"); and a chain no longer than custom.containment_depth_ceiling, refused in the user''s own words and never quoting a number the organization did not set.';

create trigger custom_record_containment_guard
  before insert or update on custom.record
  for each row execute function custom._containment_guard();

-- ── REC-1, REC-2, REC-11, REC-66, REC-N-17: what a Table must declare ──────────
create or replace function custom._table_shape_guard() returns trigger
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_tguard$
declare
  d            jsonb := new.data;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
begin
  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    raise exception 'a table is an entity or a detail, and this one says %', coalesce(v_type, 'nothing')
      using errcode = '23514', hint = 'REC-66: type ∈ {entity, detail}.';
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    raise exception 'a detail table has to say what it is a detail of'
      using errcode = '23514', hint = 'REC-66: parent_token is required when type is detail.';
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    raise exception 'only a detail table has a parent table'
      using errcode = '23514', hint = 'REC-66: parent_token belongs to type detail and to nothing else.';
  end if;

  if coalesce(d ->> 'name', '') = '' then
    raise exception 'a table needs a name' using errcode = '23514', hint = 'REC-1.';
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a table needs a slug made of lower-case letters, digits and underscores'
      using errcode = '23514', hint = 'REC-66: slug.';
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    raise exception 'a table needs both of its labels - one thing and many things'
      using errcode = '23514', hint = 'REC-66: label_singular and label_plural.';
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    raise exception 'a table shows its records as a list or as a page, and this one says %',
                    coalesce(d ->> 'display', 'nothing')
      using errcode = '23514', hint = 'REC-1: display. T4 turns a list into a page and migrates nothing.';
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    raise exception 'a table has to say whether its records are ordered'
      using errcode = '23514', hint = 'REC-1: ordered.';
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    raise exception 'a table is heavy or light, and this one says %', coalesce(d ->> 'weight', 'nothing')
      using errcode = '23514', hint = 'REC-1: heavy|light.';
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    raise exception 'a table has to say how long it keeps its history'
      using errcode = '23514', hint = 'REC-1: retention.';
  end if;
  if (d ->> 'retention_days')::numeric < 30 then
    raise exception 'thirty days is the least history a table can keep'
      using errcode = '23514',
            hint = 'REC-1 / T14: the retention floor is thirty days and an organization cannot go below it.';
  end if;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    raise exception 'a table has to say how its records are sorted by default'
      using errcode = '23514', hint = 'REC-N-17: default_sort is an array of {field, direction}.';
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    raise exception 'a table orders its rows by hand or by its sort, and this one says %',
                    coalesce(d ->> 'row_order', 'nothing')
      using errcode = '23514', hint = 'REC-N-17: manual row order.';
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    raise exception 'a table has to say whether an agent may write to it'
      using errcode = '23514', hint = 'REC-66: agent_writable, default true, is declared rather than guessed.';
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    raise exception 'a table has to declare its fields'
      using errcode = '23514', hint = 'REC-1: fields.';
  end if;
  select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  if array_position(v_names, null) is not null then
    raise exception 'every field of a table needs a name'
      using errcode = '23514', hint = 'REC-1: fields.';
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    raise exception 'a table needs a title field, or its records cannot be shown as chips'
      using errcode = '23514', hint = 'REC-2.';
  end if;
  if not (v_title = any (v_names)) then
    raise exception 'the title field % is not one of this table''s fields', v_title
      using errcode = '23514', hint = 'REC-2: the title field names one of the table''s own fields.';
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    raise exception 'a table has to live somewhere - give it a home'
      using errcode = '23514',
            hint = 'REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).';
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    raise exception 'a detail record cannot be a home'
      using errcode = '23514',
            hint = 'REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.';
  end if;

  return new;
end;
$fn_tguard$;

comment on function custom._table_shape_guard() is
  'REC-1, REC-2, REC-11, REC-66 and REC-N-17: everything a Table must declare, refused in the user''s own words. The kernel''s nine are exempt (REC-27: defined in code, not data) and the view supplies their defaults.';

create trigger custom_record_table_shape_guard
  before insert or update on custom.record
  for each row execute function custom._table_shape_guard();

-- ── REC-1 / REC-66 / REC-N-17: the projection ──────────────────────────────────
create or replace view custom."table" with (security_invoker = true) as
  select r.id,
         r.organization_id,
         coalesce(r.data ->> 'slug', lower(r.data ->> 'name'))              as slug,
         r.data ->> 'name'                                                  as name,
         coalesce(r.data ->> 'label_singular', r.data ->> 'name')           as label_singular,
         coalesce(r.data ->> 'label_plural', r.data ->> 'name' || 's')      as label_plural,
         r.data ->> 'icon'                                                  as icon,
         r.data ->> 'color'                                                 as color,
         coalesce(r.data ->> 'type', 'entity')                              as type,
         (coalesce(r.data ->> 'type', 'entity') = 'detail')                 as detail,
         r.data ->> 'parent_token'                                          as parent_token,
         coalesce((r.data ->> 'agent_writable')::boolean, true)             as agent_writable,
         coalesce(r.data ->> 'display', 'list')                             as display,
         coalesce((r.data ->> 'ordered')::boolean, false)                   as ordered,
         coalesce(r.data ->> 'weight', 'light')                             as weight,
         coalesce((r.data ->> 'retention_days')::integer, 30)               as retention_days,
         r.data ->> 'title_field'                                           as title_field,
         coalesce(r.data -> 'fields', '[]'::jsonb)                          as fields,
         coalesce(r.data -> 'default_sort', '[]'::jsonb)                    as default_sort,
         coalesce(r.data ->> 'row_order', 'sorted')                         as row_order,
         custom.containment_parent(r.data)                                  as home_id,
         (r.data_class = 'kernel')                                          as is_kernel,
         r.created_by, r.updated_by, r.created_at, r.updated_at,
         r.version, r.metadata, r.visibility, r.data
    from custom.record r
   where r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;

comment on view custom."table" is
  'REC-1, REC-25, REC-66, REC-N-17. A PROJECTION over custom.record, never a second relation: a Table IS a Record, so its id is its record id and its base contract is custom.record''s own certified columns. REC-1''s `detail` and REC-66''s `type` are ONE stored property - `type` is stored, `detail` is derived - so no row can say both. security_invoker: every caller reads it under their own row-level security.';

-- ── REC-3 / REC-14 / REC-26: where a Table appears ─────────────────────────────
create or replace view custom.home with (security_invoker = true) as
  select r.id                               as table_id,
         custom.containment_parent(r.data)  as home_record_id,
         r.organization_id,
         'declared'::text                   as kind,
         null::uuid                         as relation_id
    from custom.record r
   where r.table_id = custom.table_kernel_id()
     and r.deleted_at is null
     and custom.containment_parent(r.data) is not null
  union all
  select hr.table_id, hr.home_record_id, hr.organization_id, 'additional'::text, hr.relation_id
    from custom.home_relations() hr;

comment on view custom.home is
  'REC-3, REC-14 and REC-26: where a Table appears. The DECLARED Home is the Table record''s own parent, so REC-1''s "exactly one Home" and REC-7''s "zero or one parent" are one stored fact and the Home tree is the containment tree. ADDITIONAL Homes are referenced carrying relations from the Home record to the Table record, read through custom.home_relations() - the one body W1-REL repoints.';

-- ── T10's question, as a query ─────────────────────────────────────────────────
create or replace function custom.tables_at_home(p_organization_id uuid, p_home_ids uuid[])
  returns table (table_id uuid, home_record_id uuid, kind text)
  language sql stable
  set search_path to 'pg_catalog'
as $fn_tah$
  select h.table_id, h.home_record_id, h.kind
    from custom.home h
   where h.organization_id = p_organization_id
     and h.home_record_id = any (p_home_ids);
$fn_tah$;

comment on function custom.tables_at_home(uuid, uuid[]) is
  'T10 / REC-3 / REC-14: which Tables appear inside these Records, declared Homes and additional Homes alike. A Table whose only Home is elsewhere does not appear here at all — which is what "cannot tell a Table called Incident exists" is made of, structurally. The ACCESS half of T10 is W2-ACCESS''s and is not claimed here.';

-- ── the constructors ───────────────────────────────────────────────────────────
-- None of these is a write DOOR: schema `custom` is revoked from every client role and
-- none of them carries a GRANT or SECURITY DEFINER, so `custom.record_write` (DOOR-N-1)
-- remains the single door and these are owner-side constructors above it.
create or replace function custom.table_declare(p_organization_id uuid, p_spec jsonb) returns uuid
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_declare$
declare
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'custom.table_declare: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', coalesce(p_spec, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$fn_declare$;

comment on function custom.table_declare(uuid, jsonb) is
  'REC-1: declare a Table. Every property is checked by custom._table_shape_guard on the way in, so a half-declared Table cannot be stored.';

create or replace function custom.home_add(p_organization_id uuid, p_table_id uuid, p_home_record_id uuid)
  returns uuid
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_home_add$
declare
  v_id        uuid;
  v_is_table  boolean;
  v_home_type text;
  v_already   uuid;
begin
  if p_organization_id is null or p_table_id is null or p_home_record_id is null then
    raise exception 'custom.home_add: the organization, the table and the home record are all required'
      using errcode = '22004';
  end if;

  select (r.table_id = custom.table_kernel_id()) into v_is_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  if v_is_table is not true then
    raise exception 'that is not a table, so it cannot be given another home'
      using errcode = '23503', hint = 'REC-3: additional Homes are placements of a Table.';
  end if;

  -- REC-11: a detail Table's records cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = p_organization_id and h.id = p_home_record_id;
  if v_home_type is null then
    raise exception 'that home record is not in this organization'
      using errcode = '23503', hint = 'REC-3: a Home is a Record of this organization.';
  end if;
  if v_home_type = 'detail' then
    raise exception 'a detail record cannot be a home'
      using errcode = '23514',
            hint = 'REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.';
  end if;

  -- REC-3: the same Table in the same Record twice is one placement, not two. Announced by
  -- name rather than quietly de-duplicated.
  select hr.relation_id into v_already
    from custom.home_relations() hr
   where hr.organization_id = p_organization_id
     and hr.table_id = p_table_id
     and hr.home_record_id = p_home_record_id
   limit 1;
  if v_already is not null then
    raise exception 'that table already has a home there'
      using errcode = '23505',
            hint = 'REC-3: a Table appears in a Record once. Nothing was written and the existing placement is unchanged.';
  end if;

  -- REC-26: a referenced CARRYING relation, from the Home record to the Table record.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'referenced', 'carrying', true, 'role', 'home',
                             'from', p_home_record_id, 'to', p_table_id))
  returning id into v_id;
  return v_id;
end;
$fn_home_add$;

comment on function custom.home_add(uuid, uuid, uuid) is
  'REC-3 and REC-26: an additional Home for a Table declared at the organization, written as a referenced carrying relation FROM the Home record TO the Table record. REC-11 refuses a detail record as a Home by name, and a second identical placement is refused by name rather than silently de-duplicated.';

create or replace function custom.relation_own(p_organization_id uuid, p_owner_id uuid, p_target_id uuid)
  returns uuid
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_own$
declare
  v_id uuid;
begin
  if p_organization_id is null or p_owner_id is null or p_target_id is null then
    raise exception 'custom.relation_own: the organization, the owner and the target are all required'
      using errcode = '22004';
  end if;

  -- REC-10: an owned relation MAKES ITS TARGET CONTAINED. The containment edge and the
  -- relation are written in one transaction, so the target cannot be owned without being
  -- contained. Every REC-7 / REC-8 / REC-N-4 refusal applies, because the edge goes in
  -- through custom._containment_guard like any other write.
  update custom.record r
     set data = r.data || jsonb_build_object('parent_id', p_owner_id::text)
   where r.organization_id = p_organization_id and r.id = p_target_id;
  if not found then
    raise exception 'that record is not in this organization'
      using errcode = '23503';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'relation',
          jsonb_build_object('kind', 'owned', 'carrying', true,
                             'from', p_owner_id, 'to', p_target_id))
  returning id into v_id;
  return v_id;
end;
$fn_own$;

comment on function custom.relation_own(uuid, uuid, uuid) is
  'REC-10: an owned relation makes its target contained. The target enters the containment closure (so W2-VIS''s derivation gives it the parent''s Visibility), may be shared directly, and may be a Home - none of which a detail Table''s record may do (REC-11).';

create or replace function custom.record_reparent(p_organization_id uuid, p_record_id uuid, p_parent_id uuid)
  returns void
  language plpgsql
  set search_path to 'pg_catalog'
as $fn_reparent$
begin
  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_reparent: the organization and the record are required'
      using errcode = '22004';
  end if;
  update custom.record r
     set data = case when p_parent_id is null
                     then r.data - 'parent_id'
                     else r.data || jsonb_build_object('parent_id', p_parent_id::text) end
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then
    raise exception 'that record is not in this organization' using errcode = '23503';
  end if;
end;
$fn_reparent$;

comment on function custom.record_reparent(uuid, uuid, uuid) is
  'T3 / REC-8: move a record into another container, or out of every container. Every refusal is custom._containment_guard''s and is raised there, never here.';
