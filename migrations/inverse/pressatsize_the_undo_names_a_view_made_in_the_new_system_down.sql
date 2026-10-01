-- INVERSE of migrations/campaign/pressatsize_the_undo_names_a_view_made_in_the_new_system.sql (lane PRESS-AT-SIZE): puts back platform._cutover_carry_back(...) exactly as it was (3576e0a5…).
-- lane: PRESS-AT-SIZE
-- based-on: platform._cutover_carry_back(uuid, platform.cutover_seam_press, boolean, uuid, uuid, boolean) 5154f6497554b583f95b5fef7e8e67eddaede89f1556335c3c0268a8702d345c

CREATE OR REPLACE FUNCTION platform._cutover_carry_back(p_org uuid, p_last platform.cutover_seam_press, p_apply boolean, p_press uuid DEFAULT NULL::uuid, p_actor uuid DEFAULT NULL::uuid, p_accepted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_share_res jsonb;
  v_at        timestamptz := p_last.pressed_at;
  v_ids       uuid[];
  v_t         record;
  v_r         record;
  v_f         record;
  v_s         record;
  v_w_id      uuid;
  v_w_data    jsonb;
  v_w_del     timestamptz;
  v_q         iam.permissions;
  v_revoke    jsonb;
  v_tr        custom.record;
  v_cols      jsonb;
  v_then      jsonb;
  v_then_data jsonb;
  v_patch     jsonb;
  v_arch      boolean;
  v_rest      boolean;
  v_style     jsonb;
  v_meta      jsonb;
  v_label     text;
  v_fmt_now   text;
  v_fmt_then  text;
  v_req       boolean;
  v_changed   boolean;
  v_name      text;
  v_desc      text;
  v_n         bigint;
  n_upd int; n_new int; n_arch int; n_rest int; n_col int; n_share int;
  b_colour boolean; b_renamed boolean;
  v_rows      jsonb;
  v_fields    jsonb;
  v_perms     jsonb;
  v_table_before jsonb;
  v_parts     text[];
  v_tnot      text[];
  v_says      text[] := '{}';
  v_not       text[] := '{}';
  v_tables    jsonb := '[]'::jsonb;
  v_born      jsonb;
  v_sentence  text;
  v_keep      text;
  -- CHOICE-COLUMN-EDIT: a column's choices and a pick list's choices, edited in the new system.
  v_c         record;
  v_o         record;
  v_l         record;
  v_oldch     jsonb;
  v_newch     jsonb;
  v_ren       jsonb;
  v_pair      record;
  v_rw        record;
  v_words     text;
  v_items     jsonb;
  v_lrows     jsonb;
  v_lparts    text[];
  v_lists     jsonb := '[]'::jsonb;
  n_ch int; n_cells int;
  n_lr int; n_la int; n_lg int; n_lb int; n_le int; n_lc int;
  b_ch boolean;
begin
  if p_last.id is null or p_last.direction <> 'new' or p_last.seam_key <> 'older_tables' then
    return jsonb_build_object('tables', '[]'::jsonb, 'says', '[]'::jsonb, 'not_carried', '[]'::jsonb,
                              'born', '[]'::jsonb, 'needs_confirm', false);
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p_last.did -> 'archived', '[]'::jsonb)) x;

  if p_apply then
    v_keep := current_setting('app.relabel_keeps_updated_at', true);
    perform set_config('app.relabel_keeps_updated_at', 'on', true);
  end if;

  for v_t in
    select d.id, d.table_name::text as table_name, d.description, d.metadata, d.user_id, d.created_by
      from workbench.udt_datasets d
     where d.id = any (v_ids) and d.organization_id = p_org
     order by d.table_name, d.id
  loop
    n_upd := 0; n_new := 0; n_arch := 0; n_rest := 0; n_col := 0; n_share := 0; n_ch := 0; n_cells := 0;
    b_colour := false; b_renamed := false;
    v_rows := '[]'::jsonb; v_fields := '[]'::jsonb; v_perms := '[]'::jsonb; v_table_before := null;
    v_parts := '{}'; v_tnot := '{}';
    v_name := v_t.table_name;

    -- The columns both sides hold (same id: the mover kept it), keyed as each side keys its cells.
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', f.field_name, 'key', cf.data ->> 'key', 'st', cf.data ->> 'type',
             'opt', cf.data -> 'config' ->> 'options_table_id', 'ot', f.data_type::text)), '[]'::jsonb)
      into v_cols
      from workbench.udt_dataset_fields f
      join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
     where f.table_id = v_t.id and f.deleted_at is null and cf.data ->> 'key' is not null;

    -- A. ROWS — each record the new system touched since the switch, against itself AT the switch.
    for v_r in
      select r.id, r.data, r.created_at, r.updated_at, r.deleted_at, r.created_by
        from custom.record r
       where r.organization_id = p_org and r.table_id = v_t.id and r.data_class = 'record'
         and greatest(r.created_at, r.updated_at, coalesce(r.deleted_at, r.created_at)) > v_at
       order by r.created_at, r.id
    loop
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_r.id, v_at) s;
      v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
      v_w_id := null; v_w_data := null; v_w_del := null;
      select w.id, w.data, w.deleted_at into v_w_id, v_w_data, v_w_del from workbench.udt_dataset_rows w where w.id = v_r.id;

      select coalesce(jsonb_object_agg(c ->> 'name',
               coalesce(platform._carried_back_value(p_org, c ->> 'st', nullif(c ->> 'opt', '')::uuid, c ->> 'ot',
                                                    v_r.data -> (c ->> 'key')), 'null'::jsonb)), '{}'::jsonb)
        into v_patch
        from jsonb_array_elements(v_cols) c
       where (v_then is null and v_r.data ? (c ->> 'key'))
          or (v_then is not null and (v_r.data -> (c ->> 'key')) is distinct from (v_then_data -> (c ->> 'key')));

      if v_w_id is null then
        -- Made in the new system. Made and archived there: nobody ever saw it here; nothing to bring.
        continue when v_r.deleted_at is not null;
        n_new := n_new + 1;
        if p_apply then
          insert into workbench.udt_dataset_rows
            (id, table_id, organization_id, data, user_id, created_by, created_at, updated_at)
          values
            (v_r.id, v_t.id, p_org, v_patch, coalesce(v_r.created_by, v_t.user_id),
             coalesce(v_r.created_by, v_t.created_by, v_t.user_id), v_r.created_at, v_r.updated_at);
          v_rows := v_rows || jsonb_build_object('id', v_r.id, 'existed', false);
        end if;
        continue;
      end if;

      -- Only what the older row does not already say (compared as words: 12 and "12" are the same).
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_patch
        from jsonb_each(v_patch) e
       where (v_w_data ->> e.key) is distinct from (e.value #>> '{}');
      v_arch := v_r.deleted_at is not null and v_r.deleted_at > v_at and v_w_del is null;
      v_rest := v_r.deleted_at is null and v_w_del is not null and (v_then ->> 'deleted_at') is not null;
      continue when v_patch = '{}'::jsonb and not v_arch and not v_rest;

      if v_patch <> '{}'::jsonb then n_upd := n_upd + 1; end if;
      if v_arch then n_arch := n_arch + 1; end if;
      if v_rest then n_rest := n_rest + 1; end if;
      if p_apply then
        v_rows := v_rows || jsonb_build_object('id', v_r.id, 'existed', true, 'data', v_w_data, 'deleted_at', v_w_del);
        update workbench.udt_dataset_rows
           set data = coalesce(data, '{}'::jsonb) || v_patch,
               deleted_at = case when v_arch then v_r.deleted_at when v_rest then null else deleted_at end,
               updated_at = v_r.updated_at,
               updated_by = coalesce(p_actor, updated_by)
         where id = v_r.id;
      end if;
    end loop;

    -- B. COLUMNS the new system changed since the switch: name, format and required carry; a
    -- column archived there is archived here; checks and kind are the older table's own and are named.
    for v_f in
      select f.id, f.field_name::text as field_name, coalesce(f.display_name, f.field_name)::text as label,
             f.metadata, f.is_required, f.deleted_at as fdel, cf.data as cdoc, cf.deleted_at as cdel
        from workbench.udt_dataset_fields f
        join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
       where f.table_id = v_t.id and f.deleted_at is null
         and greatest(cf.updated_at, coalesce(cf.deleted_at, cf.updated_at)) > v_at
       order by f.field_order, f.id
    loop
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_f.id, v_at) s;
      continue when v_then is null;
      v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
      v_changed := false;
      v_label := v_f.label;
      v_meta := coalesce(v_f.metadata, '{}'::jsonb);
      v_req := v_f.is_required;

      if (v_f.cdoc ->> 'label') is distinct from (v_then_data ->> 'label')
         and nullif(btrim(v_f.cdoc ->> 'label'), '') is not null and (v_f.cdoc ->> 'label') <> v_f.label then
        v_label := v_f.cdoc ->> 'label'; v_changed := true;
      end if;
      v_fmt_now  := coalesce(v_f.cdoc ->> 'format', v_f.cdoc -> 'display_format' ->> 'id');
      v_fmt_then := coalesce(v_then_data ->> 'format', v_then_data -> 'display_format' ->> 'id');
      if v_fmt_now is distinct from v_fmt_then and v_fmt_now is distinct from (v_meta -> 'format' ->> 'id') then
        v_meta := case when v_fmt_now is null then v_meta - 'format'
                       else v_meta || jsonb_build_object('format',
                              coalesce(case when jsonb_typeof(v_meta -> 'format') = 'object' then v_meta -> 'format' end, '{}'::jsonb)
                              || jsonb_build_object('id', v_fmt_now)) end;
        v_changed := true;
      end if;
      if coalesce((v_f.cdoc ->> 'required')::boolean, false) is distinct from coalesce((v_then_data ->> 'required')::boolean, false)
         and coalesce((v_f.cdoc ->> 'required')::boolean, false) is distinct from coalesce(v_f.is_required, false) then
        v_req := coalesce((v_f.cdoc ->> 'required')::boolean, false); v_changed := true;
      end if;
      if (v_f.cdoc -> 'rules') is distinct from (v_then_data -> 'rules') then
        v_tnot := v_tnot || format('%s: the checks on the column %s changed in the new system. The older table keeps the checks it had.',
                                   v_name, v_f.label);
      end if;
      if (v_f.cdoc ->> 'type') is distinct from (v_then_data ->> 'type') then
        v_tnot := v_tnot || format('%s: the column %s became a different kind of column in the new system. The older table keeps it as the kind it was.',
                                   v_name, v_f.label);
      end if;
      if v_f.cdel is not null and (v_then ->> 'deleted_at') is null then
        v_changed := true;
      end if;
      continue when not v_changed;
      n_col := n_col + 1;
      if p_apply then
        v_fields := v_fields || jsonb_build_object('id', v_f.id, 'display_name', v_f.label, 'metadata', v_f.metadata,
                                                   'is_required', v_f.is_required, 'deleted_at', v_f.fdel);
        update workbench.udt_dataset_fields
           set display_name = v_label, metadata = v_meta, is_required = v_req,
               deleted_at = case when v_f.cdel is not null and (v_then ->> 'deleted_at') is null then v_f.cdel else deleted_at end
         where id = v_f.id;
      end if;
    end loop;

    -- B2. A COLUMN'S OWN CHOICES, EDITED IN THE NEW SYSTEM (lane CHOICE-COLUMN-EDIT, 2026-09-27).
    -- A choice re-worded, added, retired or moved on the copy's options since the switch: the older
    -- column's choices become the copy's live options, in their order, each keeping the older
    -- choice's own settings (its colour) where the option is the same one (same key); a re-worded
    -- choice's cells on the older table take the new words, as they would have there. A pick
    -- list's copy is carried below (G), once for every table that chooses from it.
    for v_c in
      select f.id, coalesce(f.display_name, f.field_name)::text as label, f.field_name::text as field_name,
             f.metadata, f.is_required, f.deleted_at as fdel,
             (cf.data -> 'config' ->> 'options_table_id')::uuid as opt
        from workbench.udt_dataset_fields f
        join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
                             and cf.deleted_at is null and cf.data ->> 'type' = 'list'
       where f.table_id = v_t.id and f.deleted_at is null
         and nullif(cf.data -> 'config' ->> 'options_table_id', '') is not null
         and not exists (select 1 from workbench.udt_structured_lists l
                          where l.id::text = cf.data -> 'config' ->> 'options_table_id')
         and exists (select 1 from custom.record o
                      where o.organization_id = p_org
                        and o.table_id = (cf.data -> 'config' ->> 'options_table_id')::uuid
                        and coalesce(o.data_class, 'record') = 'record'
                        and greatest(o.created_at, o.updated_at, coalesce(o.deleted_at, o.created_at)) > v_at)
       order by f.field_order, f.id
    loop
      v_oldch := case when jsonb_typeof(v_c.metadata #> '{format,options,choices}') = 'array'
                      then v_c.metadata #> '{format,options,choices}' else '[]'::jsonb end;
      with opts as (
        select o.id, o.created_at, (o.metadata ->> 'option_position')::integer as pos,
               coalesce(nullif(o.data ->> 'title', ''), nullif(o.data ->> 'name', '')) as words,
               coalesce(nullif(o.metadata ->> 'option_key', ''),
                        custom.choice_slug(coalesce(o.data ->> 'title', o.data ->> 'name'))) as k,
               nullif(o.data ->> 'color', '') as color
          from custom.record o
         where o.organization_id = p_org and o.table_id = v_c.opt
           and coalesce(o.data_class, 'record') = 'record' and o.deleted_at is null
      ), olds as (
        select c, custom.choice_slug(case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label')
                                          else c #>> '{}' end) as k,
               case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label') else c #>> '{}' end as words
          from jsonb_array_elements(v_oldch) c
      )
      select coalesce(jsonb_agg(
               coalesce((select case when jsonb_typeof(x.c) = 'object' then x.c else '{}'::jsonb end
                           from olds x where x.k = o.k limit 1),
                        case when o.color is not null then jsonb_build_object('color', o.color) else '{}'::jsonb end)
               || jsonb_build_object('value', o.words)
               order by o.pos nulls last, o.created_at, o.id), '[]'::jsonb),
             coalesce((select jsonb_object_agg(x.words, o2.words)
                         from olds x join opts o2 on o2.k = x.k
                        where o2.words is distinct from x.words and x.words is not null and o2.words is not null), '{}'::jsonb)
        into v_newch, v_ren
        from opts o
       where o.words is not null;

      continue when (select coalesce(jsonb_agg(case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label') else c #>> '{}' end), '[]'::jsonb)
                       from jsonb_array_elements(v_oldch) c)
                    = (select coalesce(jsonb_agg(c ->> 'value'), '[]'::jsonb) from jsonb_array_elements(v_newch) c);
      n_ch := n_ch + 1;
      if p_apply then
        if not v_fields @> jsonb_build_array(jsonb_build_object('id', v_c.id)) then
          v_fields := v_fields || jsonb_build_object('id', v_c.id, 'display_name', v_c.label, 'metadata', v_c.metadata,
                                                     'is_required', v_c.is_required, 'deleted_at', v_c.fdel);
        end if;
        update workbench.udt_dataset_fields
           set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('format',
                 coalesce(case when jsonb_typeof(metadata -> 'format') = 'object' then metadata -> 'format' end,
                          jsonb_build_object('id', 'choice'))
                 || jsonb_build_object('options',
                      coalesce(case when jsonb_typeof(metadata #> '{format,options}') = 'object' then metadata #> '{format,options}' end, '{}'::jsonb)
                      || jsonb_build_object('choices', v_newch)))
         where id = v_c.id;
      end if;
      -- The older cells that hold a re-worded choice's old words.
      for v_pair in select key as was, value #>> '{}' as now from jsonb_each(v_ren) loop
        for v_rw in
          select w.id, w.data, w.deleted_at from workbench.udt_dataset_rows w
           where w.table_id = v_t.id and w.deleted_at is null
             and ((jsonb_typeof(w.data -> v_c.field_name) = 'string' and w.data ->> v_c.field_name = v_pair.was)
                  or (jsonb_typeof(w.data -> v_c.field_name) = 'array' and (w.data -> v_c.field_name) ? v_pair.was))
        loop
          n_cells := n_cells + 1;
          if p_apply then
            if not v_rows @> jsonb_build_array(jsonb_build_object('id', v_rw.id)) then
              v_rows := v_rows || jsonb_build_object('id', v_rw.id, 'existed', true, 'data', v_rw.data, 'deleted_at', v_rw.deleted_at);
            end if;
            update workbench.udt_dataset_rows
               set data = jsonb_set(data, array[v_c.field_name],
                            case when jsonb_typeof(data -> v_c.field_name) = 'array'
                                 then (select coalesce(jsonb_agg(case when e #>> '{}' = v_pair.was then to_jsonb(v_pair.now) else e end order by n), '[]'::jsonb)
                                         from jsonb_array_elements(data -> v_c.field_name) with ordinality a(e, n))
                                 else to_jsonb(v_pair.now) end),
                   updated_by = coalesce(p_actor, updated_by)
             where id = v_rw.id;
          end if;
        end loop;
      end loop;
    end loop;

    -- C. COLUMNS ADDED IN THE NEW SYSTEM: the older table has no column for them. Named, never guessed.
    for v_f in
      select cf.id, coalesce(nullif(cf.data ->> 'label', ''), cf.data ->> 'key') as label, cf.data ->> 'key' as key
        from custom.record cf
       where cf.organization_id = p_org and cf.data_class = 'field' and cf.deleted_at is null
         and cf.data ->> 'entity_definition_id' = v_t.id::text and cf.created_at > v_at
         and not exists (select 1 from workbench.udt_dataset_fields f where f.id = cf.id)
       order by cf.created_at, cf.id
    loop
      select count(*) into v_n from custom.record r
       where r.organization_id = p_org and r.table_id = v_t.id and r.data_class = 'record' and r.deleted_at is null
         and r.data ? v_f.key and (r.data -> v_f.key) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);
      v_tnot := v_tnot || format('%s: the column %s was added in the new system. It and its %s stay in the new table and are not carried back.',
                                 v_name, v_f.label, case v_n when 1 then '1 value' else v_n || ' values' end);
    end loop;

    -- D. THE TABLE ITSELF: name, description, colours — against the copy at the switch.
    v_tr := null;
    select * into v_tr from custom.record
     where organization_id = p_org and id = v_t.id and data_class = 'table';
    if v_tr.id is not null and greatest(v_tr.updated_at, coalesce(v_tr.deleted_at, v_tr.updated_at)) > v_at then
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_t.id, v_at) s;
      if v_then is not null then
        v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
        v_desc := v_t.description;
        if (v_tr.data ->> 'name') is distinct from (v_then_data ->> 'name')
           and nullif(btrim(v_tr.data ->> 'name'), '') is not null and (v_tr.data ->> 'name') <> v_t.table_name then
          v_name := v_tr.data ->> 'name'; b_renamed := true;
        end if;
        if (v_tr.data ->> 'description') is distinct from (v_then_data ->> 'description')
           and (v_tr.data ->> 'description') is distinct from v_t.description then
          v_desc := v_tr.data ->> 'description'; b_renamed := true;
        end if;
        v_style := v_t.metadata -> 'style';
        if (v_tr.data -> 'decorations') is distinct from (v_then_data -> 'decorations') then
          v_style := platform._decorations_in_older_words(v_t.id, v_tr.data -> 'decorations', v_t.metadata -> 'style');
          b_colour := v_style is distinct from (v_t.metadata -> 'style');
        end if;
        if p_apply and (b_renamed or b_colour) then
          v_table_before := jsonb_build_object('table_name', v_t.table_name, 'description', v_t.description,
                                               'style', v_t.metadata -> 'style');
          update workbench.udt_datasets
             set table_name = v_name, description = v_desc,
                 metadata = case when b_colour then jsonb_set(coalesce(metadata, '{}'::jsonb), '{style}', coalesce(v_style, '{}'::jsonb))
                                 else metadata end
           where id = v_t.id;
        end if;
      end if;
    end if;

    -- E. SHARES: the copy's people and organization lane, at the copy's level, on the older table;
    -- a share the copy no longer holds is TAKEN BACK here through the older Share dialog's own door
    -- (public.revoke_resource_access / revoke_resource_org_access, as the person pressing), which
    -- removes the grant: an archived grant still opened the table (iam.accessible_entity_ids admits
    -- every status but rejected), so marking it archived left the person seeing it (lane
    -- LIST-COPY-PERMISSIVE, 2026-09-26). The grant as it was is kept in this carry's history
    -- (before.shares) so the carry can be undone. A refusal by the door is named, never skipped.
    -- A share to someone outside the organization rides on an outside invitation on the copy and is
    -- left as it is.
    for v_s in
      select p.granted_to_user_id as u, p.granted_to_organization_id as o, p.permission_level as lvl
        from iam.permissions p
       where p.resource_type = 'record' and p.resource_id = v_t.id and p.status = 'active'
         and not coalesce(p.is_public, false)
    loop
      v_q := null;
      select q.* into v_q from iam.permissions q
       where q.resource_type = 'dataset' and q.resource_id = v_t.id
         and ((v_s.u is not null and q.granted_to_user_id = v_s.u) or (v_s.o is not null and q.granted_to_organization_id = v_s.o))
       limit 1;
      if v_s.u is not null and (v_q.id is null or v_q.status <> 'active' or v_q.permission_level <> v_s.lvl) then
        -- A PERSON's share goes through the one writer (T-32e): level set exactly, and access a
        -- person removed on the older table is never given back by the carry — it is named.
        n_share := n_share + 1;
        if p_apply then
          v_share_res := iam.share_with_person('dataset', v_t.id, v_s.u, v_s.lvl, p_actor, false,
                                               'cutover_carry', null, true, null);
          if coalesce((v_share_res ->> 'success')::boolean, false) then
            v_perms := v_perms || case when v_q.id is null
              then jsonb_build_object('user', v_s.u, 'organization', null, 'existed', false)
              else jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level) end;
          else
            v_perms := v_perms || jsonb_build_object('user', v_s.u, 'existed', v_q.id is not null,
                                                     'not_given', v_share_res ->> 'error');
          end if;
        end if;
      elsif v_q.id is null then
        n_share := n_share + 1;
        if p_apply then
          insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                       is_public, permission_level, created_by, status, granted_via)
          values ('dataset', v_t.id, v_s.o, false, v_s.lvl, p_actor, 'active', 'share');
          v_perms := v_perms || jsonb_build_object('user', null, 'organization', v_s.o, 'existed', false);
        end if;
      elsif v_q.status <> 'active' or v_q.permission_level <> v_s.lvl then
        n_share := n_share + 1;
        if p_apply then
          v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level);
          update iam.permissions set status = 'active', permission_level = v_s.lvl where id = v_q.id;
        end if;
      end if;
    end loop;
    for v_q in
      select q.* from iam.permissions q
       where q.resource_type = 'dataset' and q.resource_id = v_t.id and q.status = 'active'
         and not coalesce(q.is_public, false)
         and not exists (select 1 from iam.permissions p
                          where p.resource_type = 'record' and p.resource_id = v_t.id and p.status = 'active'
                            and (p.granted_to_user_id = q.granted_to_user_id or p.granted_to_organization_id = q.granted_to_organization_id))
         and not exists (select 1 from iam.invitations i
                          where i.target_type = 'custom_table' and i.target_id = v_t.id and i.deleted_at is null
                            and i.status in ('pending', 'accepted')
                            and (i.invited_user_id = q.granted_to_user_id
                                 or lower(i.email) = (select lower(u.email) from auth.users u where u.id = q.granted_to_user_id)))
    loop
      n_share := n_share + 1;
      if p_apply then
        v_revoke := case when v_q.granted_to_user_id is not null
                         then public.revoke_resource_access('dataset', v_t.id, v_q.granted_to_user_id)
                         else public.revoke_resource_org_access('dataset', v_t.id, v_q.granted_to_organization_id) end;
        if coalesce((v_revoke ->> 'success')::boolean, false) then
          v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level,
                                                   'taken_back', true, 'grant', to_jsonb(v_q));
        else
          n_share := n_share - 1;
          v_tnot := v_tnot || format('%s: a share the new table no longer holds is still on the older table (%s).',
                                     v_name, coalesce(v_revoke ->> 'error', 'the Share door refused'));
        end if;
      end if;
    end loop;

    -- The sentence for this table.
    if n_upd > 0 then v_parts := v_parts || format('%s edited %s', n_upd, case n_upd when 1 then 'row' else 'rows' end); end if;
    if n_new > 0 then v_parts := v_parts || format('%s new %s', n_new, case n_new when 1 then 'row' else 'rows' end); end if;
    if n_arch > 0 then v_parts := v_parts || format('%s archived %s', n_arch, case n_arch when 1 then 'row' else 'rows' end); end if;
    if n_rest > 0 then v_parts := v_parts || format('%s restored %s', n_rest, case n_rest when 1 then 'row' else 'rows' end); end if;
    if n_col > 0 then v_parts := v_parts || format('%s changed %s', n_col, case n_col when 1 then 'column' else 'columns' end); end if;
    if n_ch > 0 then v_parts := v_parts || format('the changed choices of %s %s', n_ch, case n_ch when 1 then 'column' else 'columns' end); end if;
    if n_cells > 0 then v_parts := v_parts || format('%s %s holding a re-worded choice', n_cells, case n_cells when 1 then 'cell' else 'cells' end); end if;
    if b_renamed then v_parts := v_parts || 'its new name'::text; end if;
    if b_colour then v_parts := v_parts || 'its colours'::text; end if;
    if n_share > 0 then v_parts := v_parts || format('%s changed %s', n_share, case n_share when 1 then 'share' else 'shares' end); end if;

    continue when cardinality(v_parts) = 0 and cardinality(v_tnot) = 0;
    v_sentence := case when cardinality(v_parts) = 0 then null
                       else format('%s: %s %s carried back into the older table.', v_name,
                              case cardinality(v_parts) when 1 then v_parts[1]
                                   else array_to_string(v_parts[1:cardinality(v_parts) - 1], ', ') || ' and ' || v_parts[cardinality(v_parts)] end,
                              case when cardinality(v_parts) = 1 and (v_parts[1] like '1 %' or v_parts[1] = 'its new name')
                                   then 'is' else 'are' end) end;
    if v_sentence is not null then v_says := v_says || v_sentence; end if;
    v_not := v_not || v_tnot;
    v_tables := v_tables || jsonb_build_object(
      'table_id', v_t.id, 'table_name', v_name, 'rows_updated', n_upd, 'rows_created', n_new,
      'rows_archived', n_arch, 'rows_restored', n_rest, 'columns_changed', n_col, 'colours_changed', b_colour,
      'renamed', b_renamed, 'shares_changed', n_share, 'choice_columns_changed', n_ch, 'cells_reworded', n_cells,
      'says', v_sentence, 'not_carried', to_jsonb(v_tnot));

    if p_apply then
      perform history.migration_record(
        p_org, 'carried back from the new tables at Switch back', 'udt_dataset', v_t.id,
        jsonb_build_object(
          'kind', 'none',
          'why', 'the older table''s rows are not store records, so the store''s own undo cannot write them; '
                 || 'before holds each carried older row, column, table and share exactly as it was — writing those back undoes this carry',
          'before', jsonb_build_object('rows', v_rows, 'fields', v_fields, 'table', v_table_before, 'shares', v_perms),
          'press', p_press, 'undid_press', p_last.id,
          'counts', jsonb_build_object('rows_updated', n_upd, 'rows_created', n_new, 'rows_archived', n_arch,
                                       'rows_restored', n_rest, 'columns_changed', n_col, 'colours_changed', b_colour,
                                       'renamed', b_renamed, 'shares_changed', n_share,
                                       'choice_columns_changed', n_ch, 'cells_reworded', n_cells),
          'not_carried', to_jsonb(v_tnot),
          'not_carried_accepted', cardinality(v_tnot) > 0 and coalesce(p_accepted, false)),
        concat_ws(' ', v_sentence, array_to_string(v_tnot, ' ')));
    end if;
  end loop;

  -- G. PICK LISTS EDITED IN THE NEW SYSTEM (lane CHOICE-COLUMN-EDIT, 2026-09-27). A moved list's
  -- copy is the live list while switched (same id, same choice ids), so at Switch back the older list
  -- becomes what the copy is: every choice re-worded, added, retired or brought back on the copy (while
  -- switched, or on the copy before the press — the press does not undo a choice edit) is carried
  -- into the older list, and every older
  -- cell of a column that chooses from the list and holds a re-worded choice's old words takes the
  -- new ones. Before this, Switch back only unarchived the older list and every such edit was lost.
  for v_l in
    select l.id, coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') as name, l.user_id, l.created_by
      from workbench.udt_structured_lists l
      join custom.record t on t.organization_id = p_org and t.id = l.id and t.data_class = 'table'
     where l.organization_id = p_org and (l.deleted_at is null or l.metadata ? 'moved_to')
       and t.metadata #>> '{moved_from,table}' = 'workbench.udt_structured_lists'
     order by l.list_name, l.id
  loop
    n_lr := 0; n_la := 0; n_lg := 0; n_lb := 0; n_le := 0; n_lc := 0;
    v_items := '[]'::jsonb; v_lrows := '[]'::jsonb; v_ren := '{}'::jsonb; v_lparts := '{}';
    for v_o in
      select o.id, o.data, o.deleted_at, i.id as iid, i.label, i.deleted_at as idel,
             i.group_name, i.help_text, i.description
        from custom.record o
        left join workbench.udt_structured_list_items i on i.id = o.id and i.list_id = v_l.id
       where o.organization_id = p_org and o.table_id = v_l.id and coalesce(o.data_class, 'record') = 'record'
         -- A choice the mover once invented from an off-list cell is never an older choice.
         and coalesce(o.metadata #>> '{moved_from,table}', '') <> 'workbench.udt_dataset_rows'
       order by (o.metadata ->> 'option_position')::integer nulls last, o.created_at, o.id
    loop
      v_words := coalesce(nullif(v_o.data ->> 'name', ''), nullif(v_o.data ->> 'title', ''));
      continue when v_words is null;
      if v_o.iid is null then
        -- Made in the new system; made and retired there, nobody here ever saw it.
        continue when v_o.deleted_at is not null;
        n_la := n_la + 1;
        if p_apply then
          insert into workbench.udt_structured_list_items
            (id, list_id, label, description, help_text, group_name, organization_id, user_id, created_by)
          values
            (v_o.id, v_l.id, v_words, v_o.data ->> 'description', v_o.data ->> 'help_text', v_o.data ->> 'group_name',
             p_org, v_l.user_id, coalesce(p_actor, v_l.created_by, v_l.user_id));
          v_items := v_items || jsonb_build_object('id', v_o.id, 'existed', false);
        end if;
        continue;
      end if;
      b_ch := false;
      if v_o.label is distinct from v_words then
        n_lr := n_lr + 1; b_ch := true;
        if v_o.label is not null then v_ren := v_ren || jsonb_build_object(v_o.label, v_words); end if;
      end if;
      if v_o.deleted_at is not null and v_o.idel is null then n_lg := n_lg + 1; b_ch := true; end if;
      if v_o.deleted_at is null and v_o.idel is not null then n_lb := n_lb + 1; b_ch := true; end if;
      if not b_ch and ((v_o.data ? 'group_name' and (v_o.data ->> 'group_name') is distinct from v_o.group_name)
                       or (v_o.data ? 'help_text' and (v_o.data ->> 'help_text') is distinct from v_o.help_text)
                       or (v_o.data ? 'description' and (v_o.data ->> 'description') is distinct from v_o.description)) then
        n_le := n_le + 1; b_ch := true;
      end if;
      continue when not b_ch;
      if p_apply then
        v_items := v_items || jsonb_build_object('id', v_o.iid, 'existed', true, 'label', v_o.label, 'deleted_at', v_o.idel,
                                                 'group_name', v_o.group_name, 'help_text', v_o.help_text,
                                                 'description', v_o.description);
        update workbench.udt_structured_list_items
           set label = v_words,
               group_name = case when v_o.data ? 'group_name' then v_o.data ->> 'group_name' else group_name end,
               help_text = case when v_o.data ? 'help_text' then v_o.data ->> 'help_text' else help_text end,
               description = case when v_o.data ? 'description' then v_o.data ->> 'description' else description end,
               deleted_at = case when v_o.deleted_at is not null and v_o.idel is null then v_o.deleted_at
                                 when v_o.deleted_at is null and v_o.idel is not null then null
                                 else deleted_at end,
               updated_by = coalesce(p_actor, updated_by)
         where id = v_o.iid;
      end if;
    end loop;

    -- The older cells, in every column that chooses from this list, that hold a re-worded choice's old words.
    for v_pair in select key as was, value #>> '{}' as now from jsonb_each(v_ren) loop
      for v_rw in
        select w.id, w.data, w.deleted_at, f.field_name::text as field_name
          from workbench.udt_dataset_fields f
          join workbench.udt_dataset_rows w on w.table_id = f.table_id and w.deleted_at is null
         where f.organization_id = p_org and f.deleted_at is null
           and f.metadata #>> '{format,options,structuredList,listId}' = v_l.id::text
           and ((jsonb_typeof(w.data -> f.field_name::text) = 'string' and w.data ->> f.field_name::text = v_pair.was)
                or (jsonb_typeof(w.data -> f.field_name::text) = 'array' and (w.data -> f.field_name::text) ? v_pair.was))
      loop
        n_lc := n_lc + 1;
        if p_apply then
          if not v_lrows @> jsonb_build_array(jsonb_build_object('id', v_rw.id)) then
            v_lrows := v_lrows || jsonb_build_object('id', v_rw.id, 'existed', true, 'data', v_rw.data, 'deleted_at', v_rw.deleted_at);
          end if;
          update workbench.udt_dataset_rows
             set data = jsonb_set(data, array[v_rw.field_name],
                          case when jsonb_typeof(data -> v_rw.field_name) = 'array'
                               then (select coalesce(jsonb_agg(case when e #>> '{}' = v_pair.was then to_jsonb(v_pair.now) else e end order by n), '[]'::jsonb)
                                       from jsonb_array_elements(data -> v_rw.field_name) with ordinality a(e, n))
                               else to_jsonb(v_pair.now) end),
                 updated_by = coalesce(p_actor, updated_by)
           where id = v_rw.id;
        end if;
      end loop;
    end loop;

    if n_lr > 0 then v_lparts := v_lparts || format('%s re-worded %s', n_lr, case n_lr when 1 then 'choice' else 'choices' end); end if;
    if n_la > 0 then v_lparts := v_lparts || format('%s new %s', n_la, case n_la when 1 then 'choice' else 'choices' end); end if;
    if n_lg > 0 then v_lparts := v_lparts || format('%s removed %s', n_lg, case n_lg when 1 then 'choice' else 'choices' end); end if;
    if n_lb > 0 then v_lparts := v_lparts || format('%s %s brought back', n_lb, case n_lb when 1 then 'choice' else 'choices' end); end if;
    if n_le > 0 then v_lparts := v_lparts || format('%s edited %s', n_le, case n_le when 1 then 'choice' else 'choices' end); end if;
    if n_lc > 0 then v_lparts := v_lparts || format('%s %s holding a re-worded choice', n_lc, case n_lc when 1 then 'cell' else 'cells' end); end if;
    continue when cardinality(v_lparts) = 0;
    v_sentence := format('%s: %s %s carried back into the older list.', v_l.name,
                         case cardinality(v_lparts) when 1 then v_lparts[1]
                              else array_to_string(v_lparts[1:cardinality(v_lparts) - 1], ', ') || ' and ' || v_lparts[cardinality(v_lparts)] end,
                         case when cardinality(v_lparts) = 1 and v_lparts[1] like '1 %' then 'is' else 'are' end);
    v_says := v_says || v_sentence;
    v_lists := v_lists || jsonb_build_object('list_id', v_l.id, 'list_name', v_l.name, 'choices_reworded', n_lr,
                                             'choices_added', n_la, 'choices_removed', n_lg, 'choices_back', n_lb,
                                             'choices_edited', n_le, 'cells_reworded', n_lc, 'says', v_sentence);
    if p_apply then
      perform history.migration_record(
        p_org, 'carried back from the new tables at Switch back', 'udt_structured_list', v_l.id,
        jsonb_build_object(
          'kind', 'none',
          'why', 'the older list''s choices are not store records, so the store''s own undo cannot write them; '
                 || 'before holds each carried older choice and older row exactly as it was — writing those back undoes this carry',
          'before', jsonb_build_object('items', v_items, 'rows', v_lrows),
          'press', p_press, 'undid_press', p_last.id,
          'counts', jsonb_build_object('choices_reworded', n_lr, 'choices_added', n_la, 'choices_removed', n_lg,
                                       'choices_back', n_lb, 'choices_edited', n_le, 'cells_reworded', n_lc)),
        v_sentence);
    end if;
  end loop;

  -- F. TABLES MADE IN THE NEW SYSTEM while switched: they stay there, and the /data home lists them.
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'))
                            order by t.data ->> 'name', t.id), '[]'::jsonb)
    into v_born
    from custom.record t
   where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null
     and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
     and t.created_at > v_at
     and not exists (select 1 from workbench.udt_datasets d where d.id = t.id);
  if jsonb_array_length(v_born) > 0 then
    v_says := v_says || format('%s made in the new system %s there and on /data: %s.',
                               case jsonb_array_length(v_born) when 1 then '1 table' else jsonb_array_length(v_born) || ' tables' end,
                               case jsonb_array_length(v_born) when 1 then 'stays' else 'stay' end,
                               (select string_agg(b ->> 'name', ', ') from jsonb_array_elements(v_born) b));
  end if;
  if cardinality(v_says) = 0 and cardinality(v_not) = 0 then
    v_says := array['Nothing was written in the new tables since the switch, so the older tables come back exactly as they were.'];
  end if;

  if p_apply then
    perform set_config('app.relabel_keeps_updated_at', coalesce(v_keep, ''), true);
  end if;

  return jsonb_build_object('since', v_at, 'undoes', p_last.id, 'tables', v_tables, 'lists', v_lists,
                            'says', to_jsonb(v_says), 'not_carried', to_jsonb(v_not), 'born', v_born,
                            'needs_confirm', cardinality(v_not) > 0);
end;
$function$;
