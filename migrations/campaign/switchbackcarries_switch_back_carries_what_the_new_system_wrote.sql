-- chair-step: lane SWITCH-BACK-CARRIES (chair brief 2026-09-26, from VERIFIER-26 item 6): "Switch back carries every write made on the copies since the press back into the older tables (a reverse of the mover: rows edited, rows created, rows archived, colours/formats/checks/shares changed), names what it will carry in the confirm dialog before the press, logs it like the forward re-sync log, and tables born in the new system stay visible in /data after Switch back. Where a reverse carry is impossible for a value kind, the dialog says so by name and the press is withheld until the person confirms the loss explicitly." ADDS platform._carried_back_value, platform._decorations_in_older_words, platform._cutover_carry_back (the reverse mover, plan or apply), platform.data_tables_born_in_the_new_system_for_me (the /data home's read). REPLACES platform._cutover_seam_reverse_readiness (the plan instead of a refusal) and platform.cutover_seam_press (one more argument, p_accept_not_carried; the carry runs inside the press after the older tables come back). Writes only its own door rows (the press's door row moves to the new signature; one new door row).
-- based-on: platform._cutover_seam_reverse_readiness(text, uuid) 2834b696f0b0a8c2ef58144e52b846804287afd10fddc849824da7ea0f3b4988
-- based-on: platform.cutover_seam_press(text, uuid, text, text) c5d2ccab70e68d62e54003470943d0aaa1df8df3d17fb80709f47e6ad903dc06
-- lane: SWITCH-BACK-CARRIES
-- INVERSE: migrations/inverse/switchbackcarries_switch_back_carries_what_the_new_system_wrote_down.sql
--
-- THE DEFECT (VERIFIER-26, production, Harbor Dental Group): while the organization was switched, a
-- person changed Walt Okafor's hygienist on the new table. Switch back brought the older table back
-- as it was the moment of the switch — the older value — while readiness said "Every copy is as
-- current as its older table"; switching again showed the new-system value again. A table an agent
-- made in the new system vanished from /data. The old guard (FLIP-SEAMS) only REFUSED Switch back
-- while it believed a record was not yet carried, and believed it by timestamps: any later write to
-- the older row (the verifier's own probe) made the record look carried.
--
-- THE RULE AFTER THIS FILE: Switch back IS the carry. Inside the press, after the older tables come
-- back, everything the new system changed since the switch goes into them — measured as the
-- difference between each copy now and the same copy AS IT WAS AT THE SWITCH (custom.record_state_as_of,
-- the store's own history), so nothing is inferred from timestamps:
--   · rows: each column value that moved (options back to their labels, JSON columns parsed back),
--     rows made in the new system created, rows archived there archived, rows restored there restored;
--   · columns: a new name, a new format, required on/off, a column archived there;
--   · the table: its name, description and colours (in the older grid's words: columns by name);
--   · shares: the copy's people and organization lane at the copy's level; a share taken away there
--     is archived on the older table.
-- What cannot be carried is NAMED before the press and the press is withheld until the person says
-- "leave these behind": a column added in the new system (the older table has no column for its
-- values; they stay in the new table), a column's checks or kind changed there (the older table
-- keeps its own). Tables made in the new system stay there and the /data home keeps listing them.
-- Every carry writes one history.migration_log row per table (history.migration_record) with the
-- counts, what was left behind, and each touched older row's image before the carry (its inverse).
--
-- WHY updated_at IS KEPT (app.relabel_keeps_updated_at, transaction-local, for the carry only): a
-- carried older row holds exactly its copy's value as of the copy's own last write. Stamping it
-- "now" would make readiness count it as "edited in the older table after it was copied" and hold
-- the next switch for a difference that does not exist. Each row still gets its row version.


-- ── 1. THE LOG ─────────────────────────────────────────────────────────────────────────────────
-- No new table: every carry is ONE history.migration_log row per older table, through
-- history.migration_record — the mover's own log, the row its copy-back (movers/reverse.py) wrote —
-- under the verb "carried back from the new tables at Switch back", with the sentence as its note
-- and, as its inverse, each touched older row, column, table and share as it was before, the counts,
-- and what was left behind (and whether the person confirmed it). The press row
-- (platform.cutover_seam_press.did -> carried_back) holds the same plan for the organization.

-- ── 2. A VALUE IN THE NEW TABLE, IN THE OLDER TABLE'S WORDS ─────────────────────────────────────
-- The mover's conversions, the other way (aidream movers/reverse.py said the same in Python): a
-- choice cell holds an option's key (or id, or name) in the store and the option's LABEL in the
-- older table; a column the older table typed as JSON holds text in the store (the words rule).
-- Everything else is the same value in both.
create or replace function platform._carried_back_value(
  p_org uuid, p_store_type text, p_options uuid, p_older_type text, p_value jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;
  end if;
  if p_store_type = 'list' and p_options is not null then
    if jsonb_typeof(p_value) = 'array' then
      return (select coalesce(jsonb_agg(coalesce(
                 (select to_jsonb(o.data ->> 'name') from custom.record o
                   where o.organization_id = p_org and o.table_id = p_options and o.data_class = 'record'
                     and o.data ->> 'name' is not null
                     and (o.id::text = e.v #>> '{}' or o.data ->> 'key' = e.v #>> '{}' or o.data ->> 'name' = e.v #>> '{}')
                   order by (o.deleted_at is null) desc limit 1), e.v) order by e.n), '[]'::jsonb)
                from jsonb_array_elements(p_value) with ordinality e(v, n));
    end if;
    return coalesce(
      (select to_jsonb(o.data ->> 'name') from custom.record o
        where o.organization_id = p_org and o.table_id = p_options and o.data_class = 'record'
          and o.data ->> 'name' is not null
          and (o.id::text = p_value #>> '{}' or o.data ->> 'key' = p_value #>> '{}' or o.data ->> 'name' = p_value #>> '{}')
        order by (o.deleted_at is null) desc limit 1),
      p_value);
  end if;
  if p_older_type in ('json', 'object', 'array') and jsonb_typeof(p_value) = 'string' then
    begin
      return (p_value #>> '{}')::jsonb;
    exception when others then
      return p_value;
    end;
  end if;
  return p_value;
end;
$$;

revoke all on function platform._carried_back_value(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

-- ── 3. A COPY'S COLOURS, IN THE OLDER GRID'S WORDS ─────────────────────────────────────────────
-- The inverse of the mover's _older_style_in_the_stores_words: the store keys a column's colour by
-- its Field id, the older grid by the column's NAME (columns.<name>, cells.<row>.<name>, colorBy,
-- a rule's field). Row ids are the same on both sides. Everything else the older style holds
-- (its version, its own bookkeeping) is kept.
create or replace function platform._decorations_in_older_words(p_table uuid, p_decorations jsonb, p_style jsonb)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $$
  with k as (
    select f.id::text as fid, f.field_name::text as name
      from workbench.udt_dataset_fields f
     where f.table_id = p_table and f.deleted_at is null
  ), d as (
    select case when jsonb_typeof(p_decorations) = 'object' then p_decorations else '{}'::jsonb end as deco
  )
  select (coalesce(case when jsonb_typeof(p_style) = 'object' then p_style end, '{}'::jsonb)
            - 'rows' - 'columns' - 'cells' - 'colorBy' - 'color_by' - 'rules')
      || jsonb_strip_nulls(jsonb_build_object(
           'rows', (select nullif(d.deco -> 'rows', '{}'::jsonb) from d where jsonb_typeof(d.deco -> 'rows') = 'object'),
           'columns', (select nullif(coalesce(jsonb_object_agg(k.name, e.value), '{}'::jsonb), '{}'::jsonb)
                         from d cross join lateral jsonb_each(case when jsonb_typeof(d.deco -> 'columns') = 'object' then d.deco -> 'columns' else '{}'::jsonb end) e
                         join k on k.fid = e.key),
           'cells', (select nullif(coalesce(jsonb_object_agg(rw.key, x.cells) filter (where x.cells is not null), '{}'::jsonb), '{}'::jsonb)
                       from d cross join lateral jsonb_each(case when jsonb_typeof(d.deco -> 'cells') = 'object' then d.deco -> 'cells' else '{}'::jsonb end) rw
                       cross join lateral (select jsonb_object_agg(k.name, c.value) as cells
                                             from jsonb_each(case when jsonb_typeof(rw.value) = 'object' then rw.value else '{}'::jsonb end) c
                                             join k on k.fid = c.key) x),
           'colorBy', (select jsonb_build_object('field', k.name, 'target', coalesce(d.deco -> 'color_by' ->> 'target', 'row'))
                         from d join k on k.fid = d.deco -> 'color_by' ->> 'field'
                        where jsonb_typeof(d.deco -> 'color_by') = 'object'),
           'rules', (select nullif(coalesce(jsonb_agg(r.value || jsonb_build_object('field', k.name) order by r.n), '[]'::jsonb), '[]'::jsonb)
                       from d cross join lateral jsonb_array_elements(case when jsonb_typeof(d.deco -> 'rules') = 'array' then d.deco -> 'rules' else '[]'::jsonb end) with ordinality r(value, n)
                       join k on k.fid = r.value ->> 'field')))
    from d;
$$;

revoke all on function platform._decorations_in_older_words(uuid, jsonb, jsonb) from public, anon, authenticated;

-- ── 4. THE REVERSE MOVER — what Switch back carries, as a plan (p_apply false) or done ─────────
create or replace function platform._cutover_carry_back(
  p_org uuid, p_last platform.cutover_seam_press, p_apply boolean,
  p_press uuid default null, p_actor uuid default null, p_accepted boolean default false)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
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
    n_upd := 0; n_new := 0; n_arch := 0; n_rest := 0; n_col := 0; n_share := 0;
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
    -- a share the copy no longer holds is archived here (never deleted). A share to someone outside
    -- the organization rides on an outside invitation on the copy and is left as it is.
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
      if v_q.id is null then
        n_share := n_share + 1;
        if p_apply then
          insert into iam.permissions (resource_type, resource_id, granted_to_user_id, granted_to_organization_id,
                                       is_public, permission_level, created_by, status, granted_via)
          values ('dataset', v_t.id, v_s.u, v_s.o, false, v_s.lvl, p_actor, 'active', 'share');
          v_perms := v_perms || jsonb_build_object('user', v_s.u, 'organization', v_s.o, 'existed', false);
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
        v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level);
        update iam.permissions set status = 'archived' where id = v_q.id;
      end if;
    end loop;

    -- The sentence for this table.
    if n_upd > 0 then v_parts := v_parts || format('%s edited %s', n_upd, case n_upd when 1 then 'row' else 'rows' end); end if;
    if n_new > 0 then v_parts := v_parts || format('%s new %s', n_new, case n_new when 1 then 'row' else 'rows' end); end if;
    if n_arch > 0 then v_parts := v_parts || format('%s archived %s', n_arch, case n_arch when 1 then 'row' else 'rows' end); end if;
    if n_rest > 0 then v_parts := v_parts || format('%s restored %s', n_rest, case n_rest when 1 then 'row' else 'rows' end); end if;
    if n_col > 0 then v_parts := v_parts || format('%s changed %s', n_col, case n_col when 1 then 'column' else 'columns' end); end if;
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
      'renamed', b_renamed, 'shares_changed', n_share, 'says', v_sentence, 'not_carried', to_jsonb(v_tnot));

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
                                       'renamed', b_renamed, 'shares_changed', n_share),
          'not_carried', to_jsonb(v_tnot),
          'not_carried_accepted', cardinality(v_tnot) > 0 and coalesce(p_accepted, false)),
        concat_ws(' ', v_sentence, array_to_string(v_tnot, ' ')));
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

  return jsonb_build_object('since', v_at, 'undoes', p_last.id, 'tables', v_tables,
                            'says', to_jsonb(v_says), 'not_carried', to_jsonb(v_not), 'born', v_born,
                            'needs_confirm', cardinality(v_not) > 0);
end;
$function$;

comment on function platform._cutover_carry_back(uuid, platform.cutover_seam_press, boolean, uuid, uuid, boolean) is
  'SWITCH-BACK-CARRIES: the reverse of the mover for the Data tables switch. Compares every copy the switch p_last archived against the same copy as it stood at that switch (custom.record_state_as_of) and carries the difference into the older table: row values, new/archived/restored rows, column name/format/required/archive, table name/description/colours, shares. Names what it cannot carry (columns added in the new system, changed checks or kinds) and the tables born there. p_apply false = the plan (read by the Switch back dialog); true = done inside the press, logged per table in history.migration_log (verb "carried back from the new tables at Switch back"). Server-only.';
revoke all on function platform._cutover_carry_back(uuid, platform.cutover_seam_press, boolean, uuid, uuid, boolean) from public, anon, authenticated;

-- ── 5. WHAT MUST BE TRUE BEFORE A SWITCH GOES BACK — now: nothing; here is what it will carry ───
create or replace function platform._cutover_seam_reverse_readiness(p_seam text, p_org uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
-- SWITCH-BACK-CARRIES: Switch back carries what the new tables gained since the switch into the
-- older tables itself (platform._cutover_carry_back, inside the press), so it no longer waits for
-- an operator's copy-back. This answers the PLAN — what will be carried and what cannot be — for
-- the dialog, and says when the person must first confirm leaving something behind.
declare
  v_last platform.cutover_seam_press;
  v_plan jsonb;
begin
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if v_last.id is null or v_last.direction <> 'new' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'on_new', 'says', 'This is on the new system', 'met', false,
                         'detail', 'There is nothing to switch back.')));
  end if;

  if p_seam = 'older_tables' then
    v_plan := platform._cutover_carry_back(p_org, v_last, false);
    return jsonb_build_object('ready', true, 'checked_at', now(),
      'carries', v_plan -> 'says', 'not_carried', v_plan -> 'not_carried',
      'needs_confirm', v_plan -> 'needs_confirm', 'born', v_plan -> 'born', 'plan', v_plan,
      'checks', jsonb_build_array(
        jsonb_build_object('key', 'carried_back', 'says', 'Switching back carries everything written in the new tables since the switch into the older tables',
          'met', true,
          'detail', (select string_agg(x, ' ') from jsonb_array_elements_text(v_plan -> 'says') x)))
        || case when (v_plan ->> 'needs_confirm')::boolean then jsonb_build_array(
             jsonb_build_object('key', 'not_carried', 'says', 'Some things made in the new system are not carried back',
               'met', true,
               'detail', (select string_agg(x, ' ') from jsonb_array_elements_text(v_plan -> 'not_carried') x)
                         || ' Switching back asks you to confirm leaving them in the new system.'))
           else '[]'::jsonb end);
  end if;

  return jsonb_build_object('ready', true, 'checked_at', now(), 'checks', jsonb_build_array(
    jsonb_build_object('key', 'nothing_written', 'says', 'Nothing is written on the new side of this switch', 'met', true,
                       'detail', 'Switching back leaves nothing behind.')));
end;
$$;

revoke all on function platform._cutover_seam_reverse_readiness(text, uuid) from public, anon, authenticated;

-- ── 6. THE PRESS — one more argument, and Switch back carries inside it ─────────────────────────
drop function if exists platform.cutover_seam_press(text, uuid, text, text);

CREATE OR REPLACE FUNCTION platform.cutover_seam_press(p_seam_key text, p_organization_id uuid, p_to text, p_note text DEFAULT NULL::text, p_accept_not_carried boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_role text;
  v_is_admin boolean;
  s platform.cutover_seam;
  v_last platform.cutover_seam_press;
  v_state text;
  v_back jsonb;
  v_ready jsonb;
  v_press uuid := gen_random_uuid();
  v_did jsonb;
  v_carry jsonb;
  v_refusal text;
  v_says text;
  v_done text;
begin
  -- Refusals that name no organization of the caller's are answered, never recorded.
  if p_organization_id is null or not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_yours', 'says', 'There is no organization with that id that you belong to.');
  end if;

  if v_uid is null or v_claims is null then
    v_refusal := 'not_a_person';
    v_says := 'A switch is pressed by a person signed in on the organization''s settings page. A server, a script or a database connection cannot press it.';
  elsif coalesce(v_claims ->> 'role', '') <> 'authenticated' or coalesce(v_claims ->> 'session_id', '') = '' then
    v_refusal := 'not_a_person';
    v_says := 'A switch is pressed by a person signed in on the organization''s settings page, not with a service key or a minted token.';
  elsif v_headers is null or coalesce(v_headers ->> 'origin', '') = '' then
    v_refusal := 'not_from_the_screen';
    v_says := 'A switch is pressed from the organization''s settings page in a browser. This request did not come from a page.';
  end if;

  if v_refusal is null then
    v_is_admin := public.is_admin();
    select m.role into v_role from iam.organization_member m
     where m.organization_id = p_organization_id and m.user_id = v_uid;
    if v_role is null and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'not_yours', 'says', 'There is no organization with that id that you belong to.');
    end if;
    if v_role is distinct from 'owner' and not v_is_admin then
      v_refusal := 'not_an_owner';
      v_says := 'Only an owner of this organization can press this switch.';
    end if;
  end if;

  if v_refusal is null then
    select * into s from platform.cutover_seam where seam_key = p_seam_key and retired_at is null;
    if s.seam_key is null then
      return jsonb_build_object('ok', false, 'reason', 'unknown_switch', 'says', format('There is no switch called %s.', p_seam_key));
    elsif p_to is null or p_to not in ('new', 'old') then
      v_refusal := 'bad_direction';
      v_says := 'A switch goes to the new system or back to the old one.';
    elsif s.press_kind <> 'owner_press' then
      v_refusal := 'not_pressed_here';
      v_says := case s.press_kind when 'already_switched' then 'This one is already on the new system.'
                  else 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.' end;
    end if;
  end if;

  if v_refusal is null then
    -- One press per seam per organization at a time.
    perform pg_advisory_xact_lock(hashtextextended('cutover_seam:' || p_seam_key || ':' || p_organization_id::text, 0));
    v_last := platform._cutover_seam_last_done(p_seam_key, p_organization_id);
    v_state := coalesce(v_last.direction, 'old');
    if v_state = p_to then
      v_refusal := 'already_there';
      v_says := case p_to when 'new' then 'This organization is already on the new system here.'
                          else 'This organization is already on the old system here.' end;
    elsif p_to = 'new' then
      v_ready := platform._cutover_seam_readiness(p_seam_key, p_organization_id);
      if not (v_ready ->> 'ready')::boolean then
        v_refusal := 'not_ready';
        v_says := 'Not ready yet: ' || (
          select string_agg(c ->> 'says' || ' — ' || rtrim(coalesce(c ->> 'detail', ''), '.'), '; ')
            from jsonb_array_elements(v_ready -> 'checks') c where not (c ->> 'met')::boolean) || '.';
      end if;
    else
      -- SWITCH BACK CARRIES (SWITCH-BACK-CARRIES): what the new tables gained since the switch goes
      -- into the older tables inside this press. What cannot go is named, and the press waits for the
      -- person to confirm leaving it in the new system.
      v_back := platform._cutover_seam_reverse_readiness(p_seam_key, p_organization_id);
      v_ready := v_back;
      if not (v_back ->> 'ready')::boolean then
        v_refusal := 'not_ready';
        v_says := 'Not ready to switch back: ' || (
          select string_agg(c ->> 'says' || ' — ' || rtrim(coalesce(c ->> 'detail', ''), '.'), '; ')
            from jsonb_array_elements(v_back -> 'checks') c where not (c ->> 'met')::boolean) || '.';
      elsif coalesce((v_back ->> 'needs_confirm')::boolean, false) and not coalesce(p_accept_not_carried, false) then
        v_refusal := 'confirm_not_carried';
        v_says := 'Switching back leaves these in the new system: '
          || (select string_agg(x, ' ') from jsonb_array_elements_text(v_back -> 'not_carried') x)
          || ' Confirm that they stay behind, then switch back.';
      end if;
    end if;
  end if;

  if v_refusal is not null then
    if p_seam_key in (select seam_key from platform.cutover_seam) then
      insert into platform.cutover_seam_press
        (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
      values
        (v_press, p_seam_key, p_organization_id,
         case when p_to in ('new', 'old') then p_to else 'new' end,
         'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press, 'readiness', v_ready);
  end if;

  begin
    v_did := platform._cutover_seam_apply(p_seam_key, p_organization_id, p_to, v_uid, v_press);
    if p_to = 'old' and p_seam_key = 'older_tables' then
      -- The older tables are back (unarchived above); now they take what the new ones gained.
      v_carry := platform._cutover_carry_back(p_organization_id, v_last, true, v_press, v_uid,
                                              coalesce(p_accept_not_carried, false));
      v_did := v_did || jsonb_build_object('carried_back', v_carry);
    end if;
  exception when others then
    v_refusal := 'the_step_failed';
    v_says := 'Nothing was changed: the switch stopped part way and was rolled back whole. ' || sqlerrm;
    insert into platform.cutover_seam_press
      (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
    values
      (v_press, p_seam_key, p_organization_id, p_to, 'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press);
  end;

  v_done := case p_to when 'new' then 'Switched to the new system.'
                 else concat_ws(' ', 'Switched back to the old system.',
                                (select string_agg(x, ' ') from jsonb_array_elements_text(v_carry -> 'says') x)) end;

  insert into platform.cutover_seam_press
    (id, seam_key, organization_id, direction, outcome, says, pressed_by, readiness, did, note)
  values
    (v_press, p_seam_key, p_organization_id, p_to, 'done', v_done, v_uid, v_ready, v_did, p_note);

  return jsonb_build_object('ok', true, 'press_id', v_press, 'state', p_to, 'did', v_did, 'says', v_done);
end;
$function$;

-- A DOOR FOLLOWS ITS FUNCTION: the press's door row moves to the new signature, before the grant.
update platform.client_callable_door d
   set identity_args = iam.door_identity_args(p.oid),
       identity_argtypes = platform.door_argtypes(p.proargtypes),
       reason = d.reason || ' SWITCH-BACK-CARRIES: a switch back carries into the older tables everything the new tables gained since the switch, inside the press; p_accept_not_carried (boolean, default false, null = false) is read only on a switch back and confirms leaving behind what cannot be carried — without it such a press is refused as confirm_not_carried, naming each thing.',
       argument_rules = jsonb_set(coalesce(d.argument_rules, '{"version": 1, "arguments": {}}'::jsonb), '{arguments,p_accept_not_carried}',
         '{"type": "boolean", "check": "true confirms what Switch back leaves in the new system; null or false refuses with confirm_not_carried when anything would be left. Ignored on a switch to new.", "position": 5}'::jsonb),
       declared_by = 'migrations/campaign/switchbackcarries_switch_back_carries_what_the_new_system_wrote.sql (lane SWITCH-BACK-CARRIES)'
  from pg_proc p
 where p.oid = 'platform.cutover_seam_press(text, uuid, text, text, boolean)'::regprocedure
   and d.schema_name = 'platform' and d.function_name = 'cutover_seam_press'
   and d.identity_args = 'p_seam_key text, p_organization_id uuid, p_to text, p_note text';

grant execute on function platform.cutover_seam_press(text, uuid, text, text, boolean) to authenticated;

-- ── 7. THE /data HOME'S READ: tables made in the new system in organizations that switched back ─
create or replace function platform.data_tables_born_in_the_new_system_for_me()
returns table(organization_id uuid, organization_name text, table_id uuid)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- SWITCH-BACK-CARRIES: a table made in the new system while its organization was switched lives
  -- only there (no older table has its id). After Switch back the home would lose it — it lists
  -- switched organizations' tables where they live and everyone else's from the older store — so it
  -- asks here and lists these too, where they live. Only organizations I am a member of, that are
  -- on the old side now, and only tables made after that organization's first switch.
  select o.id, o.name::text, t.id
    from iam.organization_member m
    join iam.organizations o on o.id = m.organization_id and o.archived_at is null
    cross join lateral platform._cutover_seam_last_done('older_tables', o.id) p
    join lateral (select min(x.pressed_at) as first_at from platform.cutover_seam_press x
                   where x.seam_key = 'older_tables' and x.organization_id = o.id
                     and x.outcome = 'done' and x.direction = 'new') f on f.first_at is not null
    join custom.record t on t.organization_id = o.id and t.data_class = 'table' and t.deleted_at is null
                        and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
                        and t.created_at > f.first_at
                        and not exists (select 1 from workbench.udt_datasets d where d.id = t.id)
   where m.user_id = (select auth.uid())
     and p.direction = 'old'
   order by o.name, t.id;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'platform', 'data_tables_born_in_the_new_system_for_me', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/switchbackcarries_switch_back_carries_what_the_new_system_wrote.sql (lane SWITCH-BACK-CARRIES)',
       'Takes no argument. Answers only the caller''s own organizations (iam.organization_member for auth.uid()) that switched their Data tables and switched back, with the ids of the tables made in the new system while switched — ids the caller''s /data home then reads through custom.table_list_everywhere, which decides what the caller may see. Nothing about any row.',
       true
  from pg_proc p where p.oid = 'platform.data_tables_born_in_the_new_system_for_me()'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function platform.data_tables_born_in_the_new_system_for_me() to authenticated;
