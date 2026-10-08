-- chair-step: restores the three function bodies notionprops_a_a_link_is_a_field_on_both_tables.sql replaced (_relation_kernel_targets, reverse_columns, _back_link_relation, _inverse_key_default) as they stood before it, and drops what it added: custom.relation_reverse_set, custom.relation_reverse_field, custom._reverse_field_of and their two door rows. Reverse Fields already declared stay as plain relation Fields (archive them first if the pairing should vanish).
-- Inverse of migrations/campaign/notionprops_a_a_link_is_a_field_on_both_tables.sql
-- lane: NOTION-PROPS
-- guard: custom/system_enabled
-- based-on: custom._relation_kernel_targets() ac424d43d204b5ec7e851f0b314d62c5c654870f687c493fa82147ce07dc399a
-- based-on: custom.reverse_columns(uuid, uuid) 68ede24709264616fce378cb8ab711fd93f9adaaf1df9537d48965d0c7dee9b1
-- based-on: custom._back_link_relation(uuid, uuid, text) b0edd898345234ac46fcdf36ee8d0bd9fd984be7a7e550d383e91fe06d29edae
-- based-on: custom._inverse_key_default(uuid, uuid, jsonb) 5781841f21aa49f00eeac0cd614c2cd981d9f238578f8080063f28f25578f620

revoke execute on function custom.relation_reverse_set(uuid, uuid, uuid, uuid[], uuid[]) from authenticated;
revoke execute on function custom.relation_reverse_field(uuid, uuid, text) from authenticated;
delete from platform.client_callable_door where schema_name = 'custom' and function_name in ('relation_reverse_set', 'relation_reverse_field');
drop function if exists custom.relation_reverse_set(uuid, uuid, uuid, uuid[], uuid[]);
drop function if exists custom.relation_reverse_field(uuid, uuid, text);

CREATE OR REPLACE FUNCTION custom.reverse_columns(p_organization_id uuid, p_table_id uuid)
 RETURNS TABLE(key text, label text, source_field_id uuid, source_field_key text, source_field_label text, source_table_id uuid, source_table_name text, cardinality text, read_only boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Linked records') as tname
      from custom.record f
      join custom.record t
        on t.organization_id = p_organization_id
       and t.id = (f.data ->> 'entity_definition_id')::uuid
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class = 'field'
       and f.deleted_at is null
       and f.data ->> 'type' = 'relation'
       and (case coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one')
              when 'one' then f.data ->> 'relation_target' = p_table_id::text
              when 'several' then coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb) ? p_table_id::text
              else false end)
       and (v_on or nullif(f.data ->> 'inverse_key', '') is not null)
  ), seen as (
    select l.* from links l where custom._may_know_table(p_organization_id, l.tid)
  )
  select coalesce(s.ikey, 'linked_' || replace(s.fid::text, '-', '')),
         case when s.tid = p_table_id
                or (select count(*) from seen s2 where s2.tid = s.tid) > 1
              then s.tname || ' (' || s.flabel || ')'
              else s.tname end,
         s.fid, s.fkey, s.flabel, s.tid, s.tname,
         'many'::text,
         true
    from seen s
   order by s.tname, s.fsort, s.flabel, s.fid;
end
$function$
;

CREATE OR REPLACE FUNCTION custom._back_link_relation(p_organization_id uuid, p_table_id uuid, p_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- THE REVERSE COLUMN `p_key` OF TABLE `p_table_id`, AS THE RELATION IT IS FROM THIS END (REL-9).
  -- custom.reverse_columns keys a reverse column by its linking Field's inverse_key, else
  -- `linked_<field id without dashes>`; this answers that same key with the shape a relation Field
  -- has where a roll-up reads it: a relation of MANY records whose target is the linking table,
  -- plus the linking Field (`back_link_of`) whose edges are the links. Null when no relation of
  -- this organization links to the table under that key. No client lane: called
  -- only from the store's own definer bodies (the field guard, custom.rollup_value, custom.relation_targets).
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
     and p_table_id is not null
     and (case coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one')
            when 'one' then f.data ->> 'relation_target' = p_table_id::text
            when 'several' then coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb) ? p_table_id::text
            else false end)
     and (nullif(f.data ->> 'inverse_key', '') = p_key
          or (nullif(f.data ->> 'inverse_key', '') is null and 'linked_' || replace(f.id::text, '-', '') = p_key))
   order by f.id
   limit 1
$function$
;

CREATE OR REPLACE FUNCTION custom._inverse_key_default(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
     or nullif(p_doc ->> 'relation_target', '') is null then
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
$function$
;

drop function if exists custom._reverse_field_of(uuid, uuid);

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
  v_key  := 'rkt:' || new.organization_id::text || ':' || new.table_id::text;
  v_flds := platform.memo_s_get(v_key)::jsonb;
  if v_flds is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', x.k, 'label', x.label, 'tgt', x.tgt, 'is_kernel', x.is_kernel) order by x.k), '[]'::jsonb)
      into v_flds
      from (
    select coalesce(nullif(fd.data ->> 'key', ''), fd.data ->> 'name')        as k,
           coalesce(nullif(fd.data ->> 'label', ''), fd.data ->> 'name')      as label,
           case when (fd.data ->> 'relation_target') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (fd.data ->> 'relation_target')::uuid end                as tgt,
           coalesce(fd.data ->> 'relation_target' in (custom.person_kernel_id()::text,
                                                      custom.file_kernel_id()::text), false)
                                                                              as is_kernel
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
    select * from jsonb_to_recordset(v_flds) as j(k text, label text, tgt uuid, is_kernel boolean)
  loop
    v_val := new.data -> f.k;
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
$function$

