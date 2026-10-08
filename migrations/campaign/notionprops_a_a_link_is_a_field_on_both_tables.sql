-- ADDITIVE: a two-way link (Notion's "Show on <other table>", Airtable's linked-record pair) — the reverse end
--   of a relation becomes a REAL Field on the target table, editable from both sides, and both sides write the
--   SAME relation rows: the forward Field's document value and its platform.associations edge. The reverse
--   Field holds no value of its own (config.reverse_of names the forward Field); it is read by the edges that
--   point at the record, exactly as the virtual reverse column already is (REL-9), and written by turning each
--   add or remove into a write of the forward Field on the other record, through the store's own doors.
--   Adds: custom._reverse_field_of, custom.relation_reverse_field (door), custom.relation_reverse_set (door),
--   two platform.client_callable_door rows.
--   Replaces (same signatures, additive behaviour): custom._relation_kernel_targets (the existing relation
--   write trigger body now refuses a value sent into a reverse Field), custom.reverse_columns (a paired column takes the reverse
--   Field's key and label and is writable), custom._back_link_relation and custom._inverse_key_default
--   (a reverse Field is never itself a linking Field). Migrates nothing: an existing relation keeps its
--   read-only reverse column until someone turns it into a two-way link.
--   Locks: pg_proc rows and two platform.client_callable_door rows; no trigger or table DDL.
--   Inverse: migrations/inverse/notionprops_a_a_link_is_a_field_on_both_tables_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: NOTION-PROPS
-- based-on: custom._inverse_key_default(uuid, uuid, jsonb) 40d07d0accd24a6aef000c5f0065f0c7ab9c4c6b25c06a718c924b6cdea4cb89
-- based-on: custom._back_link_relation(uuid, uuid, text) 2e9c5e95f3bac1d424d282c73d9eef6bf9c59d8903b281773da54b7bbe882ce2
-- based-on: custom._relation_kernel_targets() 40b36608ae2c51a33db2e6c9df6808153b2e1c847c87e39fa02aa311ad5c9515
-- based-on: custom.reverse_columns(uuid, uuid) 20b468e75513fe8d2cc3232493f032bd6a9457479d2f16ccba29d38f7e811f4d

-- ── THE PAIRED REVERSE FIELD OF A FORWARD RELATION ─────────────────────────────────────────────────────────
-- Live, in the same organization, on the forward Field's target table, pointing back at the forward Field's
-- table, and naming the forward Field in config.reverse_of. Anything else carrying reverse_of is inert.
create or replace function custom._reverse_field_of(p_organization_id uuid, p_forward_field_id uuid)
 returns table(id uuid, key text, label text)
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select r.id, r.data ->> 'key', coalesce(nullif(btrim(r.data ->> 'label'), ''), r.data ->> 'key')
    from custom.record f
    join custom.record r
      on r.organization_id = f.organization_id
     and r.table_id = custom.field_kernel_id()
     and r.data_class = 'field'
     and r.deleted_at is null
     and r.data ->> 'type' = 'relation'
     and r.data -> 'config' ->> 'reverse_of' = f.id::text
     and r.data ->> 'entity_definition_id' = f.data ->> 'relation_target'
     and r.data ->> 'relation_target' = f.data ->> 'entity_definition_id'
   where f.organization_id = p_organization_id
     and f.id = p_forward_field_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class = 'field'
     and f.deleted_at is null
     and f.data ->> 'type' = 'relation'
     and coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one') = 'one'
   order by r.created_at, r.id
   limit 1
$function$;

comment on function custom._reverse_field_of(uuid, uuid) is
  'NOTION-PROPS: the live reverse Field paired with a forward relation Field (config.reverse_of), or nothing. No client lane.';

-- ── A REVERSE FIELD IS NEVER GIVEN AN INVERSE KEY OF ITS OWN ───────────────────────────────────────────────
create or replace function custom._inverse_key_default(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_target uuid;
  v_name   text;
  v_base   text;
  v_key    text;
  v_n      integer := 1;
begin
  if coalesce(p_doc ->> 'type', '') <> 'relation'
     or nullif(p_doc ->> 'inverse_key', '') is not null
     or coalesce(nullif(p_doc -> 'config' ->> 'target_mode', ''), 'one') <> 'one'
     or nullif(p_doc ->> 'relation_target', '') is null
     -- NOTION-PROPS: the reverse end of a two-way link IS the other side's column; it makes no third.
     or nullif(p_doc -> 'config' ->> 'reverse_of', '') is not null then
    return p_doc;
  end if;
  if coalesce(nullif(platform.knob_resolve('custom', 'back_links', p_organization_id) #>> '{}', ''), 'true') <> 'true' then
    return p_doc;
  end if;
  v_target := (p_doc ->> 'relation_target')::uuid;
  if not exists (select 1 from custom.record t
                  where t.id = v_target and t.organization_id = p_organization_id
                    and t.table_id = custom.table_kernel_id() and t.data_class = 'table'
                    and t.deleted_at is null) then
    return p_doc;   -- a kernel (Person, File) or anything that is not one of this organization's tables
  end if;
  select coalesce(nullif(btrim(t.data ->> 'name'), ''), 'linked') into v_name
    from custom.record t
   where t.id = p_table_id and t.organization_id = p_organization_id;
  v_base := regexp_replace(regexp_replace(lower(coalesce(v_name, 'linked')), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g');
  if v_base !~ '^[a-z]' then v_base := 'f_' || v_base; end if;
  v_base := left(v_base, 44);
  v_key := v_base;
  while exists (select 1 from custom.record f
                 where f.organization_id = p_organization_id
                   and f.table_id = custom.field_kernel_id()
                   and f.data_class = 'field'
                   and f.deleted_at is null
                   and f.data ->> 'relation_target' = v_target::text
                   and f.data ->> 'inverse_key' = v_key)
     or exists (select 1 from custom.record f
                 where f.organization_id = p_organization_id
                   and f.table_id = custom.field_kernel_id()
                   and f.data_class = 'field'
                   and f.data ->> 'entity_definition_id' = v_target::text
                   and f.data ->> 'key' = v_key)
  loop
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  end loop;
  return p_doc || jsonb_build_object('inverse_key', v_key);
end
$function$;

-- ── A REVERSE FIELD IS NOT A LINKING FIELD (roll-ups and lookups through it read the forward edges) ────────
create or replace function custom._back_link_relation(p_organization_id uuid, p_table_id uuid, p_key text)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- THE REVERSE COLUMN `p_key` OF TABLE `p_table_id`, AS THE RELATION IT IS FROM THIS END (REL-9).
  -- custom.reverse_columns keys a reverse column by its linking Field's inverse_key, else
  -- `linked_<field id without dashes>`; this answers that same key with the shape a relation Field
  -- has where a roll-up reads it: a relation of MANY records whose target is the linking table,
  -- plus the linking Field (`back_link_of`) whose edges are the links. Null when no relation of
  -- this organization links to the table under that key. No client lane: called
  -- only from the store's own definer bodies (the field guard, custom.rollup_value, custom.relation_targets).
  -- NOTION-PROPS: a two-way link's reverse Field (config.reverse_of) shares its key with the forward
  -- Field's inverse_key and holds no value, so a read through that key lands here and reads the
  -- forward Field's edges; the reverse Field itself is never a linking Field.
  select jsonb_build_object(
           'type', 'relation',
           'multi', true,
           'key', p_key,
           'relation_target', f.data ->> 'entity_definition_id',
           'back_link_of', f.id::text,
           'back_link_field_key', coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name'),
           'label', coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key'))
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class = 'field'
     and f.deleted_at is null
     and f.data ->> 'type' = 'relation'
     and nullif(f.data -> 'config' ->> 'reverse_of', '') is null
     and p_table_id is not null
     and (case coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one')
            when 'one' then f.data ->> 'relation_target' = p_table_id::text
            when 'several' then coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb) ? p_table_id::text
            else false end)
     and (nullif(f.data ->> 'inverse_key', '') = p_key
          or (nullif(f.data ->> 'inverse_key', '') is null and 'linked_' || replace(f.id::text, '-', '') = p_key))
   order by f.id
   limit 1
$function$;

-- ── THE REVERSE COLUMNS: a paired one carries the reverse Field's key and label, and is writable ─────────
create or replace function custom.reverse_columns(p_organization_id uuid, p_table_id uuid)
 returns table(key text, label text, source_field_id uuid, source_field_key text, source_field_label text, source_table_id uuid, source_table_name text, cardinality text, read_only boolean)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_on boolean;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.reverse_columns');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.reverse_columns');
  v_on := coalesce(nullif(platform.knob_resolve('custom', 'back_links', p_organization_id) #>> '{}', ''), 'true') = 'true';

  return query
  with links as (
    select f.id as fid,
           coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') as fkey,
           coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as flabel,
           nullif(f.data ->> 'inverse_key', '') as ikey,
           coalesce((f.data ->> 'sort')::numeric, 100) as fsort,
           t.id as tid,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Linked records') as tname,
           rv.key as rkey,
           rv.label as rlabel
      from custom.record f
      join custom.record t
        on t.organization_id = p_organization_id
       and t.id = (f.data ->> 'entity_definition_id')::uuid
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
      -- NOTION-PROPS: the two-way link's own Field on THIS table, when there is one.
      left join lateral (select x.key, x.label from custom._reverse_field_of(p_organization_id, f.id) x) rv
        on f.data ->> 'relation_target' = p_table_id::text
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class = 'field'
       and f.deleted_at is null
       and f.data ->> 'type' = 'relation'
       and nullif(f.data -> 'config' ->> 'reverse_of', '') is null
       and (case coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one')
              when 'one' then f.data ->> 'relation_target' = p_table_id::text
              when 'several' then coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb) ? p_table_id::text
              else false end)
       and (v_on or nullif(f.data ->> 'inverse_key', '') is not null)
  ), seen as (
    select l.* from links l where custom._may_know_table(p_organization_id, l.tid)
  )
  select coalesce(s.rkey, s.ikey, 'linked_' || replace(s.fid::text, '-', '')),
         case when s.rlabel is not null then s.rlabel
              when s.tid = p_table_id
                or (select count(*) from seen s2 where s2.tid = s.tid) > 1
              then s.tname || ' (' || s.flabel || ')'
              else s.tname end,
         s.fid, s.fkey, s.flabel, s.tid, s.tname,
         'many'::text,
         s.rkey is null
    from seen s
   order by s.tname, s.fsort, s.flabel, s.fid;
end
$function$;

-- ── TURN A RELATION INTO A TWO-WAY LINK: make (or find) its Field on the other table ───────────────────────
create or replace function custom.relation_reverse_field(p_organization_id uuid, p_field_id uuid, p_label text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_fwd   jsonb;
  v_have  uuid;
  v_label text;
  v_key   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_reverse_field');
  select f.data into v_fwd
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class = 'field'
     and f.deleted_at is null;
  if v_fwd is null or v_fwd ->> 'type' <> 'relation' then
    raise exception 'This column is not a link, so it has no other side.' using errcode = '22023';
  end if;
  if nullif(v_fwd -> 'config' ->> 'reverse_of', '') is not null then
    raise exception 'This column is already the other side of a link.' using errcode = '22023';
  end if;
  if coalesce(nullif(v_fwd -> 'config' ->> 'target_mode', ''), 'one') <> 'one'
     or not exists (select 1 from custom.record t
                     where t.organization_id = p_organization_id
                       and t.id::text = v_fwd ->> 'relation_target'
                       and t.table_id = custom.table_kernel_id() and t.data_class = 'table'
                       and t.deleted_at is null) then
    raise exception 'Only a link to one of your tables can show on the other table.' using errcode = '22023';
  end if;
  perform custom.assert_may_know_table(p_organization_id, (v_fwd ->> 'entity_definition_id')::uuid, 'custom.relation_reverse_field');
  perform custom.assert_may_know_table(p_organization_id, (v_fwd ->> 'relation_target')::uuid, 'custom.relation_reverse_field');

  select x.id into v_have from custom._reverse_field_of(p_organization_id, p_field_id) x;
  if v_have is not null then
    return v_have;
  end if;

  select coalesce(nullif(btrim(p_label), ''), nullif(btrim(t.data ->> 'name'), ''), 'Linked records') into v_label
    from custom.record t
   where t.organization_id = p_organization_id and t.id::text = v_fwd ->> 'entity_definition_id';
  -- The key the reverse column already answers to, so every view, filter and roll-up that named it keeps it.
  v_key := coalesce(nullif(v_fwd ->> 'inverse_key', ''), 'linked_' || replace(p_field_id::text, '-', ''));

  -- THE STORE'S OWN DECLARATION DOOR, as the caller: the right to change the other table is decided there.
  return custom.field_declare(p_organization_id, (v_fwd ->> 'relation_target')::uuid,
           jsonb_build_object('type', 'relation', 'label', v_label, 'key', v_key,
                              'relation_target', v_fwd ->> 'entity_definition_id', 'multi', true,
                              'config', jsonb_build_object('reverse_of', p_field_id::text)));
end
$function$;

comment on function custom.relation_reverse_field(uuid, uuid, text) is
  'NOTION-PROPS: turns a relation into a two-way link — makes (or returns) the Field on the target table that shows and edits the same links from the other side. Declared through custom.field_declare as the caller.';

-- ── WRITE THE LINKS FROM THE OTHER SIDE ────────────────────────────────────────────────────────────────────
-- Each id added becomes platform.relation_set on THAT record's forward Field; each id removed becomes
-- custom.record_update of that record's forward Field without this record. Both doors decide every right.
create or replace function custom.relation_reverse_set(p_organization_id uuid, p_record_id uuid, p_field_id uuid,
                                                     p_add uuid[] default '{}'::uuid[], p_remove uuid[] default '{}'::uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_rev    jsonb;
  v_fwd    jsonb;
  v_fwd_id uuid;
  v_fkey   text;
  v_multi  boolean;
  v_table  uuid;
  v_other  uuid;
  v_have   jsonb;
  v_left   jsonb;
  v_n      integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_reverse_set');
  if coalesce(cardinality(p_add), 0) + coalesce(cardinality(p_remove), 0) > 200 then
    raise exception 'At most 200 links can be changed at once.' using errcode = '22023';
  end if;
  select r.data into v_rev
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_field_id
     and r.table_id = custom.field_kernel_id() and r.data_class = 'field' and r.deleted_at is null;
  v_fwd_id := nullif(v_rev -> 'config' ->> 'reverse_of', '')::uuid;
  if v_fwd_id is null
     or not exists (select 1 from custom._reverse_field_of(p_organization_id, v_fwd_id) x where x.id = p_field_id) then
    raise exception 'This column is not the other side of a link.' using errcode = '22023';
  end if;
  select f.data into v_fwd from custom.record f where f.organization_id = p_organization_id and f.id = v_fwd_id;
  v_fkey := coalesce(nullif(v_fwd ->> 'key', ''), v_fwd ->> 'name');
  v_multi := coalesce((v_fwd ->> 'multi')::boolean, false) or coalesce((v_fwd ->> 'relation_max')::integer, 1) > 1;

  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null and r.data_class = 'record';
  if v_table is null or v_table::text <> v_rev ->> 'entity_definition_id' then
    raise exception 'This record is not in the table this column belongs to.' using errcode = '22023';
  end if;
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.relation_reverse_set',
                                        'viewer'::public.permission_level, 'record');

  foreach v_other in array coalesce(p_add, '{}'::uuid[]) loop
    if v_multi then
      -- MANY: additive, the forward door's own way of adding one link.
      perform platform.relation_set(p_organization_id, v_other, v_fkey, jsonb_build_array(p_record_id::text));
    else
      -- AT MOST ONE (REL-7): the other record now points here instead — Notion's move. The document is
      -- replaced through the store's own door and its statement trigger withdraws the old edge.
      perform custom.assert_client_may_change(p_organization_id, v_other, 'custom.relation_reverse_set',
                                              'editor'::public.permission_level, 'record');
      perform custom.record_update(p_organization_id, v_other, jsonb_build_object(v_fkey, p_record_id::text));
    end if;
    v_n := v_n + 1;
  end loop;

  foreach v_other in array coalesce(p_remove, '{}'::uuid[]) loop
    perform custom.assert_client_may_change(p_organization_id, v_other, 'custom.relation_reverse_set',
                                            'editor'::public.permission_level, 'record');
    select case when jsonb_typeof(r.data -> v_fkey) = 'array' then r.data -> v_fkey
                when jsonb_typeof(r.data -> v_fkey) = 'string' then jsonb_build_array(r.data -> v_fkey)
                else '[]'::jsonb end
      into v_have
      from custom.record r
     where r.organization_id = p_organization_id and r.id = v_other and r.deleted_at is null
       and r.table_id::text = v_fwd ->> 'entity_definition_id';
    if v_have is null or not (v_have ? p_record_id::text) then
      continue;
    end if;
    select coalesce(jsonb_agg(x.v order by x.o), '[]'::jsonb) into v_left
      from jsonb_array_elements(v_have) with ordinality x(v, o)
     where x.v #>> '{}' <> p_record_id::text;
    perform custom.record_update(p_organization_id, v_other,
              jsonb_build_object(v_fkey, case when v_multi then v_left
                                              when jsonb_array_length(v_left) = 0 then 'null'::jsonb
                                              else v_left -> 0 end));
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$function$;

comment on function custom.relation_reverse_set(uuid, uuid, uuid, uuid[], uuid[]) is
  'NOTION-PROPS: adds and removes links from the reverse side of a two-way link by writing the forward Field of each other record (platform.relation_set / custom.record_update), so both sides are one set of relation rows. Answers how many records changed.';

-- ── THE REVERSE FIELD HOLDS NO VALUE: the relation write trigger refuses one, nothing is stored ────────────
CREATE OR REPLACE FUNCTION custom._relation_kernel_targets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  f       record;
  v_val   jsonb;
  v_items jsonb;
  v_out   jsonb;
  v_one   jsonb;
  v_to    uuid;
  v_new   jsonb;
  v_org   text;
  v_key   text;
  v_flds  jsonb;
  v_hits  jsonb;
  v_m     jsonb;
  v_name  text;
  v_tname text;
begin
  -- Only an ordinary, live record of an ordinary Table holds cells to resolve.
  if new.data_class is distinct from 'record' or new.table_id is null
     or new.deleted_at is not null
     or new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.data is not distinct from new.data
     and old.table_id is not distinct from new.table_id then
    return new;
  end if;

  -- THIS TABLE'S RELATION FIELDS, READ ONCE PER STATEMENT. The same statement memo
  -- `custom.record_relation_edges` keeps (WRITE-PERF-3b), under its own key, cleared by the same
  -- structure triggers — so a 250-row import asks the catalogue once, and a Table with no
  -- relation column stops here without reading the switch at all.
  -- NOTION-PROPS: the memo now carries each field's `rev` (a two-way link's reverse Field), so its key moved.
  v_key  := 'rkt2:' || new.organization_id::text || ':' || new.table_id::text;
  v_flds := platform.memo_s_get(v_key)::jsonb;
  if v_flds is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', x.k, 'label', x.label, 'tgt', x.tgt, 'is_kernel', x.is_kernel, 'rev', x.rev) order by x.k), '[]'::jsonb)
      into v_flds
      from (
    select coalesce(nullif(fd.data ->> 'key', ''), fd.data ->> 'name')        as k,
           coalesce(nullif(fd.data ->> 'label', ''), fd.data ->> 'name')      as label,
           case when (fd.data ->> 'relation_target') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (fd.data ->> 'relation_target')::uuid end                as tgt,
           coalesce(fd.data ->> 'relation_target' in (custom.person_kernel_id()::text,
                                                      custom.file_kernel_id()::text), false)
                                                                              as is_kernel,
           nullif(fd.data -> 'config' ->> 'reverse_of', '') is not null       as rev
      from custom.record fd
     where fd.table_id = custom.field_kernel_id()
       and fd.data_class <> 'kernel'
       and fd.deleted_at is null
       and fd.organization_id = new.organization_id
       and nullif(fd.data ->> 'entity_definition_id', '')::uuid = new.table_id
       and fd.data ->> 'type' = 'relation'
      ) x;
    perform platform.memo_s_put(v_key, v_flds::text);
  end if;
  if v_flds = '[]'::jsonb then
    return new;
  end if;

  -- THE SWITCH, as custom._resolve_choice_words reads it: while the store is off for this
  -- organization the document is left exactly as the writer sent it.
  begin
    v_on := custom.store_is_open(new.organization_id);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  for f in
    select * from jsonb_to_recordset(v_flds) as j(k text, label text, tgt uuid, is_kernel boolean, rev boolean)
  loop
    v_val := new.data -> f.k;
    -- NOTION-PROPS: A TWO-WAY LINK'S REVERSE FIELD HOLDS NO VALUE OF ITS OWN. Its links are the forward
    -- Field's rows on the other table, written through custom.relation_reverse_set; a value sent here
    -- would become a second, disagreeing set of links, so it is refused and nothing is written.
    if coalesce(f.rev, false) and v_val is not null and jsonb_typeof(v_val) <> 'null'
       and (tg_op = 'INSERT' or old.data -> f.k is distinct from v_val) then
      raise exception '% shows the links made from the other table; change them there or through custom.relation_reverse_set.', f.label
        using errcode = '23514',
              hint = 'A two-way link is one set of links. Nothing was written.';
    end if;
    if v_val is null or jsonb_typeof(v_val) not in ('string', 'array') then
      continue;
    end if;
    -- An ordinary relation has only one thing to normalize — a repeated id — so it is looked
    -- at only when the cell is a list and the writer actually sent it. A cell nobody touched
    -- is left byte-for-byte as it stands.
    -- VISION-REACH G1 (2026-10-02): an ordinary relation cell is also looked at when the writer
    -- sent a record's NAME rather than its id — a paste, an agent, the table API and the MCP all
    -- hand over what a person reads. A single id, or a cell nobody touched, is left as it stands.
    if not f.is_kernel
       and ((tg_op = 'UPDATE' and old.data -> f.k is not distinct from v_val)
            or (jsonb_typeof(v_val) = 'string'
                and ((v_val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     or btrim(v_val #>> '{}') = ''))) then
      continue;
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      -- A RECORD'S NAME, ON AN ORDINARY RELATION (VISION-REACH G1). Matched by the ONE name matcher
      -- (custom._relation_names_resolve: the target's name column, case and spacing ignored, only
      -- records this writer may see). Exactly one match is that record; none, or two with the same
      -- name, is refused BY NAME — a link is never guessed. A target with no name column leaves
      -- the word for custom.validate_values to refuse in its own words, as before.
      if not f.is_kernel and f.tgt is not null and jsonb_typeof(v_one) = 'string'
         and btrim(v_one #>> '{}') <> ''
         and (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_name := btrim(v_one #>> '{}');
        v_hits := custom._relation_names_resolve(new.organization_id, f.tgt, array[v_name]);
        if v_hits is not null then
          v_m := coalesce(v_hits -> custom.relation_name_key(v_name), '[]'::jsonb);
          if jsonb_array_length(v_m) <> 1 then
            select coalesce(nullif(t.data ->> 'name', ''), 'that table') into v_tname
              from custom.record t
             where t.organization_id = new.organization_id and t.id = f.tgt;
            if jsonb_array_length(v_m) = 0 then
              raise exception '% has no record called "%" in %.', f.label, v_name, v_tname
                using errcode = '23514',
                      hint = format('Pick the record for %s, or add "%s" to %s first.', f.label, v_name, v_tname);
            end if;
            raise exception '% has % records called "%" in %, so it cannot tell which one you mean.',
                  f.label, jsonb_array_length(v_m), v_name, v_tname
              using errcode = '23514',
                    hint = format('Pick the one you mean for %s.', f.label);
          end if;
          v_one := v_m -> 0 -> 'id';
        end if;
      end if;

      -- Not an id at all: custom.validate_values refuses it in its own words.
      if jsonb_typeof(v_one) <> 'string'
         or (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      if not f.is_kernel then
        v_to := (v_one #>> '{}')::uuid;
      else
        v_to := custom.relation_kernel_record(new.organization_id, f.tgt, (v_one #>> '{}')::uuid);
      end if;

      if v_to is null then
        select coalesce(nullif(o.name, ''), 'this organization') into v_org
          from iam.organizations o where o.id = new.organization_id;
        -- A kernel record of this organization that has been REMOVED is a different sentence
        -- from a stranger: the person (or file) was here, and somebody took their record away.
        if exists (select 1 from custom.record t
                    where t.organization_id = new.organization_id
                      and t.id = (v_one #>> '{}')::uuid
                      and t.table_id = f.tgt) then
          raise exception '% names % that was removed from %.', f.label,
                case when f.tgt = custom.person_kernel_id() then 'a person' else 'a file' end,
                coalesce(v_org, 'this organization')
            using errcode = '23514',
                  hint = format('Pick %s again for %s, or restore the removed record first — the store never points a column at something that is gone.',
                                case when f.tgt = custom.person_kernel_id() then 'who it is now' else 'the file' end,
                                f.label);
        end if;
        if f.tgt = custom.person_kernel_id() then
          raise exception '% names someone who is not a member of %.', f.label, coalesce(v_org, 'this organization')
            using errcode = '23514',
                  hint = format('%s holds a member of this organization — pick them from the list, or give their user id and the store finds their Person record. Somebody who is not a member has to be invited first.', f.label);
        end if;
        raise exception '% names a file % does not have.', f.label, coalesce(v_org, 'this organization')
          using errcode = '23514',
                hint = format('%s holds a file of this organization — upload it here first, then give its id and the store makes its File record. A file that belongs to another organization cannot be attached here.', f.label);
      end if;

      -- ONE RECORD, ONCE, IN THE ORDER IT WAS FIRST NAMED. A relation that names the same record
      -- twice states one fact twice; the association beside it is one row per (target, role),
      -- so the value keeps the first mention and drops the repeat — and a member named by user
      -- id AND by Person record id is the same person, caught here after resolution.
      if v_out @> jsonb_build_array(to_jsonb(v_to::text)) then
        continue;
      end if;
      v_out := v_out || jsonb_build_array(to_jsonb(v_to::text));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(f.k, v_new);
    end if;
  end loop;

  return new;
end;
$function$;

-- ── THE TWO DOORS ──────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes, argument_rules)
select 'custom', 'relation_reverse_field',
   'p_organization_id uuid, p_field_id uuid, p_label text',
   'migrations/campaign/notionprops_a_a_link_is_a_field_on_both_tables.sql (lane NOTION-PROPS)',
   'Makes the other side of a relation a Field on the target table through custom.field_declare, as the caller: the organization wall, the right to know both tables and the right to change the target table are decided by the reach check, assert_may_know_table and field_declare itself.',
   true, false, null, '{2950,2950,25}',
   jsonb_build_object('version', 1, 'declared_by', 'notionprops_a_a_link_is_a_field_on_both_tables.sql',
     'declared_at', '2026-10-08 lane NOTION-PROPS, read from this body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_field_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'read only as a live Field of p_organization_id; refused 22023 when it is not a relation to one of the organization''s tables, then assert_may_know_table on both of its tables.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '22023', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_label', jsonb_build_object('type', 'text', 'position', 3,
         'check', 'the new column''s name; field_declare validates it.',
         'foreign', jsonb_build_object('not_a_leak', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body')))
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes, argument_rules)
select 'custom', 'relation_reverse_set',
   'p_organization_id uuid, p_record_id uuid, p_field_id uuid, p_add uuid[], p_remove uuid[]',
   'migrations/campaign/notionprops_a_a_link_is_a_field_on_both_tables.sql (lane NOTION-PROPS)',
   'Writes links from the reverse side of a two-way link by calling platform.relation_set (editor on the other record, viewer on this one) and custom.record_update (editor on the other record, after assert_client_may_change) for each id: every right is the forward doors'' own. At most 200 ids a call.',
   true, false, null, '{2950,2950,2950,2951,2951}',
   jsonb_build_object('version', 1, 'declared_by', 'notionprops_a_a_link_is_a_field_on_both_tables.sql',
     'declared_at', '2026-10-08 lane NOTION-PROPS, read from this body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_record_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'must be a live record of the reverse Field''s table (22023), then custom.assert_client_may_open(viewer).',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_field_id', jsonb_build_object('type', 'uuid', 'position', 3, 'entity', 'custom_record',
         'check', 'must be the live reverse Field custom._reverse_field_of pairs with its forward Field in p_organization_id, else 22023.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '22023', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_add', jsonb_build_object('type', 'uuid[]', 'position', 4, 'entity', 'custom_record',
         'check', 'each id is written through platform.relation_set, which asks editor on it.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_remove', jsonb_build_object('type', 'uuid[]', 'position', 5, 'entity', 'custom_record',
         'check', 'each id is asked custom.assert_client_may_change(editor) before it is read, then written through custom.record_update.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body')))
on conflict do nothing;

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
