-- VIS-2 (2 of 3) — A LINK ACROSS THE WALL TAKES BOTH ORGANIZATIONS, AND THE READ MASKS.
--
-- MEASURED LIVE, 2026-09-19. `custom.assert_organization_wall` and
-- `platform.enforce_relation_edge` both refuse a relation whose target lives in another
-- organization, with ONE opening between them: `cross_organization_relations` on the Table
-- the relation starts at. Live count of Tables carrying that flag: 0. Live count of
-- cross-organization relation edges: 0. So in practice the wall is absolute — and where it
-- is not, it is one organization's flag on one organization's Table, with the organization
-- being reached INTO never asked at all. VIS-23 says cross-organization sharing is a grant
-- whose principal is another organization; a grant has two sides.
--
-- WHAT THIS FILE LANDS
--
--   · `custom/cross_organization_links` — a boolean organization knob, DEFAULT FALSE, on the
--     same `custom-data` node of the universal settings screen as the member-visibility knob.
--     Default false is the behaviour above, exactly: with nobody's knob on, every
--     cross-organization relation is refused, as today.
--
--   · `custom.cross_organization_links_open(source_org, target_org)` — true only when BOTH
--     organizations have turned it on. It fails CLOSED if the knob registry cannot be read:
--     this one is a wall, not a read, and the safe answer for a wall is "no". (Its sibling
--     `iam.member_lane_open` fails the other way for the opposite reason, stated in its own
--     header: a kernel that refuses denies a person their own data.)
--
--   · Both wall functions now ask it. The opening becomes: the Table allows it AND both
--     organizations allow it. Neither refusal message got shorter — each one now NAMES which
--     of the three is missing, in the words a person reads on the settings screen.
--
--   · `custom.relation_target_card(organization, record, via_key)` — THE READ DOOR, and the
--     half T15 has no way to ask without. A relation that may cross the wall is worth nothing
--     if following it is all-or-nothing, and it is dangerous if following it hands over a
--     foreign organization's record. So the card is masked to what the READER'S OWN
--     membership allows, asked with the one ladder:
--       - the two organizations have not both said yes  → existence only, and the sentence
--         why. Not even the id of the table it belongs to.
--       - `custom.has_visibility` says no                → existence, which organization owns
--         it, and the sentence. In another organization that means a real grant to this
--         person or to their organization (VIS-23) is the only way through: the org-member
--         lane cannot fire for an organization they are not in.
--       - `custom.has_visibility` says yes               → the record's values, field-masked
--         by `iam.visible_field_ids` at the level THIS reader holds, which is the same
--         masking `custom.read_record` applies at home.
--
--   · `custom.record_card(viewer, organization, record)` — read_record's masking block,
--     without read_record's organization wall, because a foreign record by definition fails
--     that wall and the masking is the part that must not be re-implemented. `read_record`
--     itself is untouched.
--
-- ADDITIVE: one knob row, two new functions, two `create or replace` on existing guards,
-- three door rows. With both knobs unset — which is every organization on the database right
-- now — every one of these paths answers exactly as it does today.
--
-- THE INVERSE: migrations/inverse/vis2_a_link_across_the_wall_takes_both_organizations_down.sql

-- based-on: custom.assert_organization_wall(text, uuid, jsonb) 5c8c8e509ac6526a7636fac72cb736ac368978bcde164786535d0b2024a4cbe0
-- based-on: platform.enforce_relation_edge() 9f3e0d31eb4f841baba3e2aa58b5856012f525095a6354c728ac5645f092ec06

set lock_timeout = '3s';
set statement_timeout = '120s';


-- ─────────────────────────────────────────────────────────────── THE KNOB ITSELF
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id, ui)
values
  ('custom', 'cross_organization_links',
   'false'::jsonb, 'false'::jsonb, 'boolean',
   'Links to other organizations',
   'Whether records here may be linked to records belonging to a different organization. '
   'Off for everyone by default. It takes both sides: a link is only possible when this organization '
   'and the other one have both turned it on, and the table the link starts from allows it. '
   'Turning it on never shows anyone anything — a person following a link to another organization''s record '
   'still sees only what has actually been shared with them.',
   'agent',
   'VIS-23 / REC-29 / T15, VIS-2 lane 2026-09-19: measured live, the only opening in the organization wall was '
   'cross_organization_relations on the source Table — one organization''s flag, with the organization being '
   'reached into never consulted. 0 Tables carried the flag and 0 cross-organization edges existed, so default '
   'false is the behaviour as measured.',
   array['organization']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'),
   '{}'::jsonb)
on conflict (feature, key) do nothing;


-- ──────────────────────────────────────────────── BOTH SIDES, OR THERE IS NO LINK
create or replace function custom.cross_organization_links_open(
  p_source_organization_id uuid, p_target_organization_id uuid)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
-- MAY A LINK RUN FROM ONE ORGANIZATION TO THE OTHER (VIS-23 / REC-29)?
--
-- True only when BOTH have turned `custom/cross_organization_links` on. Asked with the same
-- id twice, it answers for that one organization — which is how the refusal messages name
-- which side is missing without a second function or a second knob.
--
-- IT FAILS CLOSED. This is a wall: if the knob registry cannot be read at all, the answer is
-- no and the relation is refused, which is the state of the database today.
declare
  v_source boolean;
  v_target boolean;
begin
  if p_source_organization_id is null or p_target_organization_id is null then
    return false;
  end if;
  begin
    v_source := (platform.knob_resolve('custom', 'cross_organization_links', p_source_organization_id) #>> '{}')::boolean;
    v_target := (platform.knob_resolve('custom', 'cross_organization_links', p_target_organization_id) #>> '{}')::boolean;
  exception when others then
    return false;
  end;
  return coalesce(v_source, false) and coalesce(v_target, false);
end;
$$;

comment on function custom.cross_organization_links_open(uuid, uuid) is
  'VIS-23 / REC-29 / T15: true only when BOTH organizations have turned custom/cross_organization_links on. Fails closed.';


-- ──────────────────────────── THE WALL, ASKING BOTH ORGANIZATIONS (custom side)
CREATE OR REPLACE FUNCTION custom.assert_organization_wall(p_kind text, p_organization_id uuid, p_row jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
    -- 🚨 VIS-2 (2026-09-19) — AND THE OTHER ORGANIZATION HAS TO AGREE.
    -- The Table flag above is ONE organization's sentence about its own records, and until
    -- now it was the whole of the opening: organization 1 could set a flag on its own Table
    -- and reach into organization 2's records with organization 2 never asked. VIS-23 says
    -- cross-organization sharing is a GRANT whose principal is another organization, and a
    -- grant has two sides. `custom/cross_organization_links` is that second side: an
    -- organization knob, default OFF for everybody, and the wall opens only where the Table
    -- allows it AND both organizations have said yes.
    if coalesce(v_opened, false)
       and custom.cross_organization_links_open(p_organization_id, v_other) then
      continue;
    end if;

    raise exception '% belongs to a different organization', r.what
      using errcode = '23503',
            hint = case when r.openable
                     then format('REC-29 / T15 / VIS-23: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it AND both organizations have turned on cross-organization links in their settings. Right now: this table %s, this organization %s, the other organization %s.',
                                 case when coalesce(v_opened, false) then 'allows it' else 'does not allow it - set cross_organization_relations on that table' end,
                                 case when custom.cross_organization_links_open(p_organization_id, p_organization_id) then 'allows them' else 'does not - turn on "Links to other organizations" in its settings' end,
                                 case when custom.cross_organization_links_open(v_other, v_other) then 'allows them' else 'does not - it has to turn on "Links to other organizations" too' end)
                     else 'REC-29 / T15: organizations are hard walls. What a record IS - its table, the table a field points at, the record an external link stands for - never crosses an organization. The route across organizations is a relation the table allows, never this.'
                   end;
  end loop;
end;
$function$;

-- ─────────────────────── THE WALL, ASKING BOTH ORGANIZATIONS (relation-edge side)
CREATE OR REPLACE FUNCTION platform.enforce_relation_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d          jsonb;
  v_tables   uuid[];
  v_mode     text;
  v_live     integer;
  v_max      integer;
  v_other    uuid;
  v_ttable   uuid;
  v_src_org  uuid;
  v_tgt_org  uuid;
  v_opened   boolean;
  v_names    text;
  v_loop     boolean;
begin
  -- GATE ONE, and it is structural: an edge nobody declared as a relation is not this
  -- trigger's business, whatever the switch says.
  if new.relation_field_id is null then
    return new;
  end if;

  -- GATE TWO, the switch. `custom/associations_guard` holds the MEANING of these columns off.
  -- A relation edge written while it is off is returned untouched rather than half-enforced:
  -- half a contract is the silent failure this system is built to refuse.
  if not platform.relations_are_on(new.organization_id) then
    return new;
  end if;

  d := platform.relation_declaration(new.organization_id, new.relation_field_id);

  -- ------------------------------------------------------------------ REL-10, the role itself
  if coalesce(new.role, '') <> coalesce(d ->> 'key', '') then
    raise exception 'this relation is stored under the role "%" but its field is called "%"',
      coalesce(new.role, '<none>'), coalesce(d ->> 'key', '<none>')
      using errcode = '23514',
            hint = 'REL-10: a relation is an association whose `role` IS the field key. They are the same string or the edge belongs to no field.';
  end if;

  -- ------------------------------------------------------------------------- REL-12, the wall
  select r.organization_id into v_src_org from custom.record r where r.id = new.source_id limit 1;
  select r.organization_id, r.table_id into v_tgt_org, v_ttable
    from custom.record r where r.id = new.target_id limit 1;

  v_opened := false;
  if v_tgt_org is not null and v_tgt_org is distinct from new.organization_id then
    -- REC-29's ONE opening, read off the Table the relation STARTS at - the same column
    -- `custom.assert_organization_wall` reads, never a second flag.
    select coalesce((t.data ->> 'cross_organization_relations')::boolean, false) into v_opened
      from custom.record s join custom.record t on t.id = s.table_id
     where s.id = new.source_id limit 1;
    -- 🚨 VIS-2 (2026-09-19) — BOTH ORGANIZATIONS, NOT ONE. Same rule, same two
    -- knobs and the same sentence as `custom.assert_organization_wall`: the Table the
    -- relation STARTS at has to allow it, and both organizations have to have turned
    -- cross-organization links on. One organization's flag is not consent from the other.
    if not (coalesce(v_opened, false)
            and custom.cross_organization_links_open(new.organization_id, v_tgt_org)) then
      raise exception 'the record this relation points at belongs to a different organization'
        using errcode = '23503',
              hint = format('REC-29 / REL-12 / T15 / VIS-23: organizations are hard walls. A relation reaches into another organization only when the table it starts from allows it AND both organizations have turned on cross-organization links in their settings. Right now: this table %s, this organization %s, the other organization %s.',
                            case when coalesce(v_opened, false) then 'allows it' else 'does not allow it - set cross_organization_relations on that table' end,
                            case when custom.cross_organization_links_open(new.organization_id, new.organization_id) then 'allows them' else 'does not - turn on "Links to other organizations" in its settings' end,
                            case when custom.cross_organization_links_open(v_tgt_org, v_tgt_org) then 'allows them' else 'does not - it has to turn on "Links to other organizations" too' end);
    end if;
  end if;
  if v_src_org is not null and v_src_org is distinct from new.organization_id then
    raise exception 'the record this relation starts at belongs to a different organization'
      using errcode = '23503',
            hint = 'REC-29 / REL-12 / T15: organizations are hard walls. An edge is stamped with the organization of the record it starts at; a relation cannot be filed under an organization that does not own its own source.';
  end if;

  -- --------------------------------------------------------------- REL-8, the target's token
  v_mode := d ->> 'target_mode';
  if v_mode <> 'any' then
    select array_agg((t #>> '{}')::uuid) into v_tables
      from jsonb_array_elements(coalesce(d -> 'target_tables', '[]'::jsonb)) t;
    if new.target_type <> 'record' then
      raise exception 'this relation points at tables of ours, and "%" is not one of them', new.target_type
        using errcode = '23514',
              hint = 'REL-8: a relation whose target mode is one or several names tables in this organization. To point at anything registered, declare target_mode `any`.';
    end if;
    if v_ttable is null or not (v_ttable = any (v_tables)) then
      select string_agg(coalesce(t.data ->> 'name', t.id::text), ', ' order by t.data ->> 'name')
        into v_names from custom.record t where t.id = any (v_tables);
      raise exception 'this relation points at %, and that record is not one of them',
        coalesce(v_names, 'a table it does not name')
        using errcode = '23514',
              hint = 'REL-8: target_mode `one` allows exactly the declared table, `several` allows exactly the declared list, and `any` allows anything. Widen the declaration or point at a record of a table it allows.';
    end if;
  end if;

  -- ------------------------------------------------------------------- REL-7, the cardinality
  v_max := case when d ->> 'cardinality' = 'at_most_one' then 1
                else greatest(coalesce((d ->> 'max')::integer, 1), 1) end;
  select count(*) into v_live
    from platform.associations a
   where a.source_type = new.source_type and a.source_id = new.source_id
     and a.role = new.role and a.deleted_at is null
     and a.relation_field_id is not null
     and not (a.target_type = new.target_type and a.target_id = new.target_id);
  if v_live >= v_max then
    select a.target_id into v_other
      from platform.associations a
     where a.source_type = new.source_type and a.source_id = new.source_id
       and a.role = new.role and a.deleted_at is null and a.relation_field_id is not null
     limit 1;
    if v_max = 1 then
      raise exception 'this points at one thing at a time, and it already points at %',
        coalesce(platform.relation_label(new.organization_id, new.target_type, v_other), v_other::text)
        using errcode = '23514',
              hint = 'REL-7: cardinality is `at most one` or `many`. Remove the one that is there, or let the field point at many.';
    end if;
    raise exception 'this points at at most % things and already points at that many', v_max
      using errcode = '23514',
            hint = 'REL-7: the field''s own relation_max is the cap. Remove one, or raise the cap on the field.';
  end if;

  -- ------------------------------------------------------------------------ REL-5, the loops
  if not coalesce((d ->> 'loops')::boolean, false) then
    with recursive walk(id, depth) as (
      select new.target_id, 1
      union all
      select a.target_id, w.depth + 1
        from walk w
        join platform.associations a
          on a.source_id = w.id
         and a.relation_field_id = new.relation_field_id
         and a.deleted_at is null
       where w.depth < 32
    )
    select exists (select 1 from walk where id = new.source_id) into v_loop;
    if coalesce(v_loop, false) then
      raise exception 'that would make this point back at itself through the same relation'
        using errcode = '23514',
              hint = 'REL-5 / T11: a relation says whether loops are allowed. This one does not allow them - set loops on the field to let two records point at each other along it. The walk follows this relation only, so two DIFFERENT relations between the same two records were never a loop.';
    end if;
  end if;

  return new;
end;
$function$;

-- ───────────────────────── READ_RECORD'S MASKING, WITHOUT READ_RECORD'S ORG WALL
create or replace function custom.record_card(p_viewer uuid, p_organization_id uuid, p_record_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
-- THE MASKED DOCUMENT FOR ONE READER, FOR ONE RECORD, WHEREVER THAT RECORD LIVES.
--
-- `custom.read_record` is the door a person opens a record of THEIR OWN organization
-- through, and it starts by asserting that organization. A record on the other side of the
-- wall fails that assertion by definition — the reader is not a member there — so following
-- a cross-organization link cannot go through it. What must NOT be re-implemented is the
-- part after the wall: the one ladder, then the level, then `iam.visible_field_ids` at that
-- level, then `custom.mask_document` with a notice per hidden key. That is this function,
-- byte for byte, and `custom.read_record` is untouched.
--
-- It decides. `custom.has_visibility` is asked about p_viewer and this record, and a reader
-- it says no to gets null rather than a document — including, and especially, a reader whose
-- only relationship to the owning organization is that somebody there linked to this record.
declare
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  if p_viewer is null or p_record_id is null then
    return null;
  end if;

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if not found then
    return null;
  end if;

  if not custom.has_visibility(p_viewer, 'record', p_record_id, 'viewer') then
    return null;
  end if;

  v_level := custom.effective_level(p_viewer, p_organization_id, p_record_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(p_viewer, p_organization_id, v_table, v_level, 'read') f;

  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  return custom.mask_document(v_doc, v_visible, v_notices, false, v_key_ids, v_declared);
end;
$$;


-- ─────────────────────────────────── THE READ DOOR THAT FOLLOWS A LINK AND MASKS
create or replace function custom.relation_target_card(
  p_organization_id uuid, p_record_id uuid, p_via_key text default null)
returns table(target_id uuid, target_organization_id uuid, is_foreign boolean,
              masked boolean, reader_level public.permission_level, card jsonb, why text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
-- FOLLOW THIS RECORD'S RELATIONS AND SHOW WHAT THIS READER MAY ACTUALLY SEE (T15 / VIS-23).
--
-- Every target of `p_record_id` — the declared relation edges in `platform.associations` and
-- the ids written into the document itself — with the foreign ones included and MASKED. Three
-- answers and never a fourth, each carrying the sentence that says which one it is:
--
--   · the wall is shut  — the two organizations have not both turned links on, so the target
--     is reported as existing and nothing else. Not its organization, not its table.
--   · no visibility     — the reader may know it exists and which organization owns it, and
--     that is all. Across the wall this is the normal answer: the org-member lane cannot fire
--     for an organization the reader is not in, so a grant to them or to their organization
--     (VIS-23) is the only way through.
--   · visibility        — `custom.record_card` at the level this reader holds, field-masked
--     exactly as `custom.read_record` masks it at home.
--
-- The door decides the SOURCE first: `custom.assert_client_may_open` is the organization wall
-- and then the one ladder on the record whose relations these are. A person who cannot open
-- the record cannot enumerate what it points at.
declare
  v_me uuid := custom.query_principal();
  r    record;
begin
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
            'custom.relation_target_card', 'viewer'::public.permission_level, 'record');

  for r in
    select x.id as tid, t.organization_id as torg
      from (
        select a.target_id as id
          from platform.associations a
         where a.source_type = 'record'
           and a.source_id = p_record_id
           and a.target_type = 'record'
           and a.deleted_at is null
           and a.relation_field_id is not null
           and (p_via_key is null or a.role = p_via_key)
        union
        select (e #>> '{}')::uuid
          from custom.record s
          cross join lateral jsonb_each(s.data) kv
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(kv.value) = 'array' then kv.value
                 when jsonb_typeof(kv.value) = 'string' then jsonb_build_array(kv.value)
                 else '[]'::jsonb end) e
         where s.organization_id = p_organization_id
           and s.id = p_record_id
           and s.deleted_at is null
           and (p_via_key is null or kv.key = p_via_key)
           and (e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) x
      join custom.record t on t.id = x.id and t.deleted_at is null
     order by 1
  loop
    target_id := r.tid;
    is_foreign := r.torg is distinct from p_organization_id;

    if is_foreign and not custom.cross_organization_links_open(p_organization_id, r.torg) then
      target_organization_id := null;
      masked := true;
      reader_level := null;
      card := null;
      why := 'This points at a record in another organization, and the two organizations have not both turned on links to other organizations. Nothing about it is shown here.';
    elsif v_me is null and custom.query_is_store_owner() then
      target_organization_id := r.torg;
      masked := false;
      reader_level := 'admin'::public.permission_level;
      card := custom.record_values(r.torg, r.tid);
      why := null;
    elsif custom.has_visibility(v_me, 'record', r.tid, 'viewer'::public.permission_level) then
      target_organization_id := r.torg;
      masked := false;
      reader_level := custom.effective_level(v_me, r.torg, r.tid);
      card := custom.record_card(v_me, r.torg, r.tid);
      why := null;
    else
      target_organization_id := r.torg;
      masked := true;
      reader_level := null;
      card := null;
      why := case when is_foreign
                  then 'This points at a record in another organization. Links between the two are allowed, but nobody there has shared this record with you or with your organization, so only the fact that it exists is shown.'
                  else 'This points at a record you do not have access to, so only the fact that it exists is shown. Ask whoever holds it to share it with you.' end;
    end if;
    return next;
  end loop;
end;
$$;


-- ─────────────────────────────────────────── THE DOORS, DECLARED IN THIS SAME TRANSACTION
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'custom', p.proname,
       pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes),
       v.signed_in, false, v.lane,
       'migrations/campaign/vis2_a_link_across_the_wall_takes_both_organizations.sql (lane VIS-2)',
       v.reason
  from (values
    ('relation_target_card', true, null::text,
     'Following one record''s relations and getting back only what this reader may see. p_organization_id is the organization of the record whose relations these are, and custom.assert_client_may_open decides both the wall and the record itself before a single target is fetched; a null p_record_id raises 02000 from that same door. Every target is then judged on its own with custom.has_visibility, and a foreign target is additionally gated on both organizations having turned cross-organization links on - so the worst this door can say about a record it may not show is that it exists.'),
    ('record_card', false,
     'server_only: it takes an arbitrary p_viewer, so a client calling it would be asking what SOMEBODY ELSE may see. The client doors are custom.read_record at home and custom.relation_target_card across a link; both pass the signed-in principal themselves.',
     'read_record''s masking block without read_record''s organization wall, for a record on the other side of the wall. p_viewer is the principal the answer is about and is never taken from a client; p_record_id is looked up inside p_organization_id and a miss returns null; custom.has_visibility decides the row and a refusal returns null rather than a document.'),
    ('cross_organization_links_open', false,
     'server_only: it is a predicate over two knob values and takes no record, no principal and no client input. It is read by custom.assert_organization_wall, platform.enforce_relation_edge and custom.relation_target_card, all of which are already reached through their own doors.',
     'Whether both named organizations have turned custom/cross_organization_links on. Both arguments are organization ids and a null on either side answers false; it reads nothing but the knob registry and decides no row.')
  ) as v(fn, signed_in, lane, reason)
  join pg_proc p on p.pronamespace = 'custom'::regnamespace and p.proname = v.fn
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select * from custom.reopen_declared_doors();
