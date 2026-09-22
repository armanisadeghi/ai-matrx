-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- CHOICE-VALUE (2 of 4) — EVERY DOOR SAYS THE WORD.
--
-- File 1 made the stored value the option's stable key. This file makes every way OUT of the
-- store speak it: the two read doors, the two query doors, one value's envelope, the export and
-- the aggregate's group-by and filter. Before this, a person, a spreadsheet and an agent all got
-- back a 36-character identifier where the product had shown them "Circle".
--
-- WHAT EACH CALLER NOW GETS:
--   * `custom.read_record` / `custom.read_records` — the LABEL in the cell, plus a `_choices`
--     block naming, per list field, the KEY behind each label and whether that option was
--     retired and why. Rendered AFTER masking, so a field this reader may not see keeps its
--     notice and is never resolved.
--   * `custom.query_across_homes` / `custom.query_by_coordinates` — the same, on the document
--     they hand back.
--   * `custom.value_read` — one value's envelope carries the label.
--   * `custom.io_export` — the label in the cell (which is what a spreadsheet has to read), every
--     row's `_choices`, and the whole vocabulary once under `choices`, so a machine re-importing
--     the file can write by key.
--   * `custom.record_aggregate` — a group-by on a choice column is LABELLED, and a filter on one
--     accepts the label, the key or the option's id. The grouping itself still happens on the
--     stored key, so two options that happen to share a label stay two groups.
--
-- WHAT IS DELIBERATELY NOT DONE: `custom.agg_sql` is untouched. It builds the statement and is
-- shared with every other aggregate caller; the choice vocabulary is a property of the ANSWER,
-- so it is applied where the answer is assembled. One function changed instead of the SQL
-- generator every lane depends on.
--
-- A TOKEN THAT IS NOT ONE OF THE CHOICES IS LEFT EXACTLY AS IT IS — a masking notice, a value
-- written before this lane in an organization whose store is switched off, anything at all. The
-- render is a lookup, never a rewrite, and nothing is ever dropped for failing to resolve.
--
-- THE INVERSE: migrations/inverse/choiceval_every_door_says_the_word_down.sql.

-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) a6e5befd1f453a8e7c933050dc7b33d51644a58b285bf414142711ae77cdbc0a
-- based-on: custom.read_record(uuid, uuid, boolean) c0fd76b055aa51a43fd0ea1660605fe78fc357b5cd20eb279243392e838c79a0
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) 8ab987579c581d32ddbf4c997968d26adac52970d4f6649c1ccf67b1a756cc0a
-- based-on: custom.io_export(uuid, uuid, text[], integer, text) fd84cdbb676db768e007f5a92d3104808585348b48dcb4d1bd73521e4c667d39
-- based-on: custom.query_across_homes(uuid, uuid, integer, integer, text) 25058b1439c08df7c3e4b6f6002368a85cbcca2cb2739e9b7b622d8f7cda1e7f
-- based-on: custom.query_by_coordinates(uuid, uuid, jsonb, integer, integer, text) 5c457fb2843ecbb566c707d7de572223aa93681047d73c11c238c217ceb6ac84
-- based-on: custom.value_read(uuid, uuid, text) e4017c3eab416bb97007e1804778deb90c8d01e89a880fbeaa525f00dacdc9fb

set lock_timeout = '45s';
set statement_timeout = '600s';

-- ── THE RENDERERS ───────────────────────────────────────────────────────────────────────

create or replace function custom.choice_render_value(p_field jsonb, p_value jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- The stored key (or keys) become the label (or labels). A token that names no choice is
  -- handed back untouched, which is what keeps a masking notice a masking notice.
  select case
    when p_field is null or jsonb_typeof(p_field) <> 'object' then p_value
    when p_value is null or jsonb_typeof(p_value) = 'null' then p_value
    when jsonb_typeof(p_value) = 'array' then
      (select coalesce(jsonb_agg(coalesce(p_field -> 'options' -> (e #>> '{}') -> 'label', e)
                                 order by ord), p_value)
         from jsonb_array_elements(p_value) with ordinality t(e, ord))
    when jsonb_typeof(p_value) = 'string' then
      coalesce(p_field -> 'options' -> (p_value #>> '{}') -> 'label', p_value)
    else p_value end;
$function$;

create or replace function custom.choice_render_note(p_field jsonb, p_value jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- {key, label, id, retired, reason} for every token that really is one of the choices, and
  -- NULL when none of them is — which is the signal the caller uses to leave the cell alone.
  -- A retired option is in here with its reason, because a value that points at one must read
  -- as its label and say what happened, not disappear.
  select case
    when p_field is null or jsonb_typeof(p_field) <> 'object'
      or p_value is null or jsonb_typeof(p_value) = 'null' then null
    when jsonb_typeof(p_value) = 'array' then
      (select jsonb_agg(x order by ord)
         from (select (p_field -> 'options' -> (e #>> '{}')) || jsonb_build_object('key', e #>> '{}') as x,
                      ord
                 from jsonb_array_elements(p_value) with ordinality t(e, ord)
                where (p_field -> 'options') ? (e #>> '{}')) q)
    when jsonb_typeof(p_value) = 'string' and (p_field -> 'options') ? (p_value #>> '{}') then
      (p_field -> 'options' -> (p_value #>> '{}')) || jsonb_build_object('key', p_value #>> '{}')
    else null end;
$function$;

create or replace function custom.choice_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_map   jsonb;
  v_out   jsonb;
  v_notes jsonb := '{}'::jsonb;
  v_note  jsonb;
  e       record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  if v_map = '{}'::jsonb then
    return p_doc;                       -- no list Field on this Table: nothing to say.
  end if;

  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_map) loop
    if not (p_doc ? e.k) then
      continue;
    end if;
    v_note := custom.choice_render_note(e.v, p_doc -> e.k);
    if v_note is null then
      continue;                         -- a notice, or a token that names no choice: untouched.
    end if;
    v_out   := v_out   || jsonb_build_object(e.k, custom.choice_render_value(e.v, p_doc -> e.k));
    v_notes := v_notes || jsonb_build_object(e.k, v_note);
  end loop;

  if v_notes <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_choices', v_notes);
  end if;
  return v_out;
end;
$function$;

create or replace function custom.choice_render_groups(p_map jsonb, p_groups jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- The GROUPING happened on the stored key, so two options that happen to share a label stay
  -- two groups; only what the group is CALLED changes.
  select case
    when p_groups is null or jsonb_typeof(p_groups) <> 'object' then p_groups
    else (select coalesce(jsonb_object_agg(e.key,
            case when p_map ? e.key and jsonb_typeof(e.value) = 'string'
                      and (p_map -> e.key -> 'options') ? (e.value #>> '{}')
                 then p_map -> e.key -> 'options' -> (e.value #>> '{}') -> 'label'
                 else e.value end), '{}'::jsonb)
            from jsonb_each(p_groups) e)
  end;
$function$;

create or replace function custom.choice_filter_normalize(p_map jsonb, p_filter jsonb)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- A filter on a choice column accepts the label, the key or the option's id, and is compared
  -- against what is stored. A value that names no choice is passed through unchanged, so a
  -- filter that matches nothing still says so honestly rather than being silently widened.
  select case
    when p_filter is null or jsonb_typeof(p_filter) <> 'object' then p_filter
    else (select coalesce(jsonb_object_agg(e.key,
            case when p_map ? e.key
                      and custom.choice_key_of(p_map -> e.key, e.value #>> '{}') is not null
                 then to_jsonb(custom.choice_key_of(p_map -> e.key, e.value #>> '{}'))
                 else e.value end), '{}'::jsonb)
            from jsonb_each(p_filter) e)
  end;
$function$;

-- ── THE AGGREGATE: THE GROUP IS NAMED, THE FILTER IS UNDERSTOOD ─────────────────────────

create or replace function custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 returns TABLE(groups jsonb, measures jsonb, row_count bigint)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_map jsonb;
  v_row record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate');

  -- CHOICE-VALUE. One map per call: the filter is normalised to what is STORED before the
  -- statement is built, and the groups are named on the way out.
  v_map := custom.choice_field_map(p_organization_id, p_table_id);

  for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                      p_bucket, custom.choice_filter_normalize(v_map, p_filter),
                                      p_limit, p_required) loop
    groups    := custom.choice_render_groups(v_map, v_row.groups);
    measures  := v_row.measures;
    row_count := v_row.row_count;
    return next;
  end loop;
end;
$function$;

-- ── THE READ, QUERY, VALUE AND EXPORT DOORS ─────────────────────────────────────────────
-- custom.read_record
CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE. `custom.resolve_id` walks the whole
  -- chain and ignores a REVOKED alias, so an undone merge puts the id back to itself. The
  -- read then happens on the record the id MEANS, and the answer SAYS which id was asked
  -- for — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  v_level := custom.effective_level(v_me, p_organization_id, v_now);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, v_table, v_level, 'read') f;

  -- EVERY key this Table has a Field record for, visible or not. The difference between
  -- this list and v_visible is what masking is about; a key in NEITHER is undeclared.
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')) , '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  v_out := custom.mask_document(v_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);

  -- CHOICE-VALUE. A cell of a list Field holds the option's stable key; a person reads the
  -- WORD. Rendered AFTER masking, so a field this reader may not see keeps its notice and is
  -- never resolved; `_choices` names, per visible list field, the key behind each label, and
  -- whether the option was retired and why - so a value whose choice was retired reads as its
  -- label with the reason rather than vanishing.
  v_out := custom.choice_render(p_organization_id, v_table, v_out);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT. Two Chens become one Person and BOTH phone
  -- numbers survive, each with its source — and until now the read door showed one of them.
  -- Only for keys this reader may see: an alternate IS the value, so a masked field's
  -- alternates are masked with it.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY. When a merge
  -- meets a key that is not a declared Field, and when a Field changes what it holds and a
  -- value cannot be converted, the store does NOT drop the value: it keeps it in `_retired`
  -- WITH THE SENTENCE SAYING WHY ("not a declared field", "Phone now holds numbers"). That
  -- whole design exists so nothing is lost in silence — and this door, the only way a person
  -- ever sees a record, did not carry it. Measured from the seat `authenticated` on the main
  -- database, 2026-09-19: the stored row holds `_retired: [{key: nickname, value: "Chen-Chen",
  -- reason: "… not a declared field …"}]` and `custom.read_record` answers a document with no
  -- `_retired` at all. Only the suites that read `custom.record` directly — as the role that
  -- owns it — could ever see it, which is why four lanes shipped this green.
  --
  -- MASKED EXACTLY LIKE THE VALUE IT USED TO BE. A retired value IS a value, so an entry whose
  -- key is a declared Field this reader may not see is withheld with it; a key that is not a
  -- declared Field at all carries no field-level sensitivity (there is no Field to carry one)
  -- and rides with the rest of the undeclared document, exactly as `custom.mask_document`
  -- already treats it.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  return v_out;
end;
$function$;

-- custom.read_records
CREATE OR REPLACE FUNCTION custom.read_records(p_organization_id uuid, p_table_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_set      record;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records');
  if p_limit is null or p_limit < 1 or p_limit > 1000 then p_limit := 200; end if;

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, ONCE: Visibility. `custom.visible_set` asks the ONE ladder a bounded number of
  -- times — once per visibility class, once per granted id, once per container — and hands back
  -- a predicate the planner can drive an index with. The comment this door used to carry is now
  -- true of the code under it (VIS-N-1; DOOR-10: filtered INSIDE the query, never post-filtered).
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where custom.has_visibility(v_me, 'record', r.id, 'viewer')
         and r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  elsif v_set.o_all_visible then
    -- THE ORDINARY PAGE. Every live row of this Table is this caller's to see, so the scan
    -- carries no visibility predicate at all and the LIMIT stops it at p_limit rows.
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
    -- A CLASS THIS CALLER HOLDS, WITH EXCEPTIONS. A granted id is never answered by its class:
    -- a grant addressed to this person on that record replaces what membership confers (VIS-19),
    -- so it is excluded from the class arm and admitted only by its own answer. Containment is a
    -- separate arm and only ever adds (VIS-6).
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  else
    -- NOTHING THIS CALLER HOLDS BY CLASS — `shared_only`, or a Table nobody shared with them.
    -- What is left is small and named: the rows this person made, the rows somebody gave them,
    -- and the rows a container they reach carries.
    for v_rec in
      select r.id, custom.record_values(r.organization_id, r.id) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;
  end if;
end;
$function$;

-- custom.io_export
CREATE OR REPLACE FUNCTION custom.io_export(p_organization_id uuid, p_table_id uuid, p_columns text[] DEFAULT NULL::text[], p_limit integer DEFAULT 10000, p_required text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols  text[];
  v_token text;
  v_rows  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_export');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_export');
  perform custom.assert_store_door(p_organization_id, 'custom.io_export');

  select t.data ->> 'token' into v_token from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id;

  -- The column list is the TABLE's own Fields unless the caller named one. Exporting whatever
  -- keys happen to be in the documents would ship whatever an older shape left behind.
  v_cols := coalesce(p_columns,
    (select array_agg(f.data ->> 'key' order by coalesce((f.data ->> 'sort')::int, 0),
                                                 f.data ->> 'key')
       from custom.applicable_fields(p_organization_id, p_table_id, null) f),
    (select array_agg(k order by k)
       from (select distinct jsonb_object_keys(r.data) k
               from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = p_table_id
                and r.deleted_at is null) ks
      where left(k, 1) <> '_'),
    array[]::text[]);

  -- THE READ DOOR DECIDES WHICH ROWS. `custom.query_visible_ids` answers SETOF uuid, so it is
  -- an id set and not a joinable row source; an export that selected from custom.record
  -- directly would hand a viewer every row in the organization, which is the single worst bug
  -- an export can have.
  select coalesce(jsonb_agg(r.doc order by r.created_at, r.id), '[]'::jsonb) into v_rows
    from (select rec.id, rec.created_at,
                 (select coalesce(jsonb_object_agg(c, coalesce(lv.vals -> c, 'null'::jsonb)),
                                  '{}'::jsonb)
                    from unnest(v_cols) c) as doc
            from custom.record rec
     cross join lateral (select custom.choice_render(p_organization_id, p_table_id,
                                  custom.record_values(p_organization_id, rec.id)) as vals) lv
           where rec.organization_id = p_organization_id
             and rec.table_id = p_table_id
             and rec.deleted_at is null
             and rec.id in (select custom.query_visible_ids(p_organization_id, p_table_id, p_required))
           order by rec.created_at, rec.id
           limit greatest(1, least(coalesce(p_limit, 10000), 100000))) r;

  -- CHOICE-VALUE. The rows carry the LABEL, because that is what an export is for and what a
  -- spreadsheet has to be able to read back. The KEY is not lost: every row carries `_choices`
  -- (key, label, retired, reason) and the export names the whole vocabulary once in `choices`,
  -- so a machine re-importing this file can write by key and a person can read it.
  return jsonb_build_object('table_id', p_table_id, 'token', v_token,
                            'columns', to_jsonb(v_cols), 'rows', v_rows,
                            'choices', custom.choice_field_map(p_organization_id, p_table_id));
end;
$function$;

-- custom.query_across_homes
CREATE OR REPLACE FUNCTION custom.query_across_homes(p_organization_id uuid, p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, home_record_id uuid, data jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_across_homes');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.query_across_homes: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  return query execute format($q$
  with homes as (select h from custom.query_table_homes($1, $2) h)
  select r.id,
         -- The record's own Home: the nearest ancestor in its containment chain that is one
         -- of this Table's Homes. A record directly under a Home has depth 1; a record three
         -- containers down still reports the Home it ultimately sits in.
         (select c.ancestor_id
            from custom.containment_chain($1, r.id) c
            join homes on homes.h = c.ancestor_id
           order by c.depth
           limit 1),
         custom.choice_render($1, $2, r.data),
         r.created_at
    from custom.record r
   where r.organization_id = $1
     and r.table_id = $2
     and r.deleted_at is null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and %s
   order by r.created_at desc, r.id
   limit $3 offset $4
  $q$, custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                    p_required::public.permission_level, 'r'))
  using p_organization_id, p_table_id,
        greatest(coalesce(p_limit, 50), 0), greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- custom.query_by_coordinates
CREATE OR REPLACE FUNCTION custom.query_by_coordinates(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_coordinates jsonb DEFAULT '[]'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_by_coordinates');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.query_by_coordinates');
  end if;
  if p_organization_id is null then
    raise exception 'custom.query_by_coordinates: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if jsonb_typeof(coalesce(p_coordinates, '[]'::jsonb)) <> 'array' then
    raise exception 'custom.query_by_coordinates: p_coordinates is a JSON ARRAY of coordinates, one object per relation end; got %',
                    jsonb_typeof(p_coordinates)
      using errcode = '22023',
            hint = 'e.g. [{"role":"client","target_id":"…"},{"role":"project","target_id":"…","direction":"to"}]. An empty array means no coordinate constraint, which is the whole Table.';
  end if;

  select count(*) into v_n from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb));

  return query execute format($q$
  with coord as (
    select ord                                        as n,
           c ->> 'role'                               as role,
           (c ->> 'target_id')::uuid                  as target_id,
           coalesce(c ->> 'direction', 'from')        as direction
      from jsonb_array_elements(coalesce($1, '[]'::jsonb))
           with ordinality as t(c, ord)
  ),
  -- ONE pass over the edges: every record that satisfies at least one coordinate, with the
  -- count of DISTINCT coordinates it satisfies. Two edges answering the same coordinate count
  -- once, which is why `distinct co.n` and not `count(*)`.
  hit as (
    select case when co.direction = 'to' then a.source_id else a.target_id end as other_id,
           case when co.direction = 'to' then a.target_id else a.source_id end as rec_id,
           co.n
      from coord co
      join platform.associations a
        on a.organization_id = $2
       and a.deleted_at is null
       and a.relation_field_id is not null
       and (co.role is null or a.role = co.role)
       and ((co.direction = 'from' and a.source_type = 'record'
             and a.target_id = co.target_id)
         or (co.direction = 'to'
             and a.source_id = co.target_id))
  ),
  satisfied as (
    select rec_id, count(distinct n)::integer as matched
      from hit
     group by rec_id
    having count(distinct n) = $3
  )
  select r.id, r.table_id, custom.choice_render($2, r.table_id, r.data), coalesce(s.matched, 0)
    from custom.record r
    left join satisfied s on s.rec_id = r.id
   where r.organization_id = $2
     and ($4::uuid is null or r.table_id = $4::uuid)
     and r.deleted_at is null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and %s
     and ($3 = 0 or s.rec_id is not null)
   order by r.created_at desc, r.id
   limit $5 offset $6
  $q$, custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                    p_required::public.permission_level, 'r'))
  using coalesce(p_coordinates, '[]'::jsonb), p_organization_id, v_n, p_table_id,
        greatest(coalesce(p_limit, 50), 0), greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- custom.value_read
CREATE OR REPLACE FUNCTION custom.value_read(p_organization_id uuid, p_record_id uuid, p_key text)
 RETURNS TABLE(field_key text, field_id uuid, value jsonb, value_version integer, source jsonb, absent_reason text, actor text, on_behalf_of text, written_at timestamp with time zone, alternates jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.value_read');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.value_read',
                                        'viewer'::public.permission_level, 'record');
  -- CHOICE-VALUE. One value, said the way a person reads it: a list Field's envelope carries
  -- the option's LABEL, resolved through the same map every other read door uses. The stored
  -- key is what `custom.read_record`'s `_choices` block names.
  return query
    select v.field_key, v.field_id,
           custom.choice_render_value(
             custom.choice_field_map(p_organization_id,
               (select r.table_id from custom.record r
                 where r.organization_id = p_organization_id and r.id = p_record_id)) -> p_key,
             v.value),
           v.value_version, v.source, v.absent_reason, v.actor, v.on_behalf_of,
           v.written_at, v.alternates
      from custom.record_values_versioned(p_organization_id, p_record_id) v
     where v.field_key = p_key;
end;
$function$;

