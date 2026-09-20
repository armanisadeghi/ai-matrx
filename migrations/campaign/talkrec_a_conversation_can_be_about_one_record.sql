-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- A CONVERSATION CAN BE ABOUT ONE RECORD (AGT-N-9, product #11 "Talk to this record").
--
-- Lane TALK-TO-RECORD, 2026-09-20. Three new things, and not one of them is a new place to
-- keep data:
--
--   1. THE BINDING is a row of `platform.associations` — the platform's one edge table —
--      `conversation --record_scope--> custom_record`. The context system's scope model says
--      a scope has a TYPE and an instance; here the type is the record's Table and the
--      instance is the Record, which is exactly what §D means by "context items ARE Fields
--      and scopes ARE Records". Nothing new is stored: the Table id is read from the record.
--
--   2. THE CONTEXT is ONE DOOR, one round trip — `custom.record_scope_context` — that
--      assembles the record's Fields, its relations one hop out, its history, its comments
--      and its Table's other records THROUGH THE READ DOOR, under the operating person's own
--      principal. Nothing in it reads `custom.record` directly. A reader who may not see a
--      Field gets the Field NAMED as withheld with the store's reason and never its value;
--      a Field whose `context_policy` is `exclude` is named as kept out of conversations,
--      which is a different absence and says so (AGT-7, AGT-N-7).
--
--      ONE DOOR BECAUSE ROUND TRIPS ARE THE COST. `PROGRESS-CONTEXT-FIELDS` measured the
--      store-backed context path at 4.2–5.6 s against 0.27–0.34 s and named the remedy in
--      one sentence: "FEWER ROUND TRIPS — one door that answers a turn's merge fields — not
--      a tuning knob." This is that door for a record-scoped turn: everything a chat needs
--      to open on a record, in a single call.
--
--   3. THE CITATION. Every Field carries its triple — record id, Field id, value version —
--      because DYN says a merge field resolves to a triple and not to a string, and because
--      an answer a person cannot click back to the record and the version it came from is an
--      assertion, not a citation.

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE SCOPE OF A CONVERSATION — read.
-- ════════════════════════════════════════════════════════════════════════════════════════
create function custom.conversation_scope(p_organization_id uuid, p_conversation_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me    uuid := auth.uid();
  v_row   record;
  v_title text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope');

  select a.target_id, a.metadata, a.created_at, a.created_by
    into v_row
    from platform.associations a
   where a.source_type = 'conversation'
     and a.source_id   = p_conversation_id
     and a.target_type = 'custom_record'
     and a.role        = 'record_scope'
     and a.organization_id = p_organization_id
     and a.deleted_at is null
   order by a.created_at desc
   limit 1;

  if v_row.target_id is null then
    return jsonb_build_object('bound', false,
      'because', 'This conversation is not about a particular record.');
  end if;

  -- THE BINDING IS NOT THE PERMISSION. A conversation can stay bound to a record that was
  -- later unshared; the answer says so plainly instead of pretending the scope is gone.
  if not custom.has_visibility(v_me, 'record', v_row.target_id, 'viewer') then
    return jsonb_build_object('bound', true, 'readable', false,
      'record_id', v_row.target_id,
      'because', 'This conversation is about a record you may no longer open, so nothing of it '
                 'reaches the agent. Ask somebody who holds it to share it with you.');
  end if;

  select coalesce(nullif(btrim(coalesce(r.data ->> nullif(t.data ->> 'title_field', ''), '')), ''),
                  'Untitled')
    into v_title
    from custom.record r
    left join custom.record t
      on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = v_row.target_id;

  return jsonb_build_object(
    'bound', true, 'readable', true,
    'record_id', v_row.target_id,
    'table_id', v_row.metadata -> 'scope_type_id',
    'scope_type', v_row.metadata ->> 'scope_type',
    'title', v_title,
    'bound_at', v_row.created_at,
    'bound_by', v_row.created_by);
end;
$fn$;

revoke all on function custom.conversation_scope(uuid, uuid) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'conversation_scope', 'p_organization_id uuid, p_conversation_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'p_organization_id is decided by custom.assert_client_may_reach on entry; NULL is refused '
   'there. p_conversation_id is NOT itself a secret — this door answers only whether a '
   'conversation carries a record scope, and it answers the RECORD''s identity only when '
   'custom.has_visibility says this caller holds viewer on that record; otherwise it returns '
   'the id with readable=false and the reason, which is what a screen needs to say "you may no '
   'longer open this". A conversation nobody bound answers bound=false, so a guessed id learns '
   'nothing it did not already assume.',
   'talkrec_a_conversation_can_be_about_one_record.sql',
   null, true, false)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE SCOPE OF A CONVERSATION — bind, and unbind.
-- ════════════════════════════════════════════════════════════════════════════════════════
create function custom.conversation_scope_bind(p_organization_id uuid, p_conversation_id uuid,
                                               p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me    uuid := auth.uid();
  v_table uuid;
  v_name  text;
  v_title text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.conversation_scope_bind');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope_bind');

  -- THE RECORD, ON THE ONE LADDER. custom.has_visibility is the store's ladder and the only
  -- one that decides a store record; a person who may not open the record may not point a
  -- conversation at it, because the binding is what puts the record into a prompt.
  if not custom.has_visibility(v_me, 'record', p_record_id, 'viewer') then
    raise exception 'You do not have access to that record, so a conversation cannot be about it.'
      using errcode = '42501',
            hint = 'AGT-N-9: the binding is what puts a record into a prompt, so it takes the same '
                   'viewer level the read door takes. Ask somebody who holds it to share it with you.';
  end if;

  -- THE CONVERSATION, ON ITS OWN LADDER — and deliberately not the store''s. A conversation is
  -- not a Record of this store; `iam.has_access` is the platform ladder every other door onto
  -- `chat.conversation` uses, and `custom.has_visibility` cannot decide a row it has never
  -- heard of. (This is not the rival ladder `custom.doors_not_on_one_ladder` refuses: that
  -- census is about deciding a STORE RECORD with iam.has_access_for / iam.effective_level /
  -- public.has_permission_for, and the store record above is decided by custom.has_visibility.)
  if not coalesce(iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level), false) then
    raise exception 'That conversation is not yours to point at a record.'
      using errcode = '42501',
            hint = 'A conversation is bound by somebody who may write in it.';
  end if;

  select r.table_id,
         coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'Record'),
         coalesce(nullif(btrim(coalesce(r.data ->> nullif(t.data ->> 'title_field', ''), '')), ''), 'Untitled')
    into v_table, v_name, v_title
    from custom.record r
    left join custom.record t
      on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;

  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000';
  end if;

  -- ONE SCOPE PER CONVERSATION. Re-binding to the same record is idempotent; pointing a
  -- conversation at a DIFFERENT record retires the old edge rather than leaving two, because
  -- "what is this chat about" may only have one answer.
  update platform.associations a
     set deleted_at = now(), deleted_via_type = 'conversation', deleted_via_id = p_conversation_id
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type = 'custom_record'
     and a.role = 'record_scope'
     and a.deleted_at is null
     and a.target_id is distinct from p_record_id;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id, label, metadata, created_by)
  values
    ('conversation', p_conversation_id, 'custom_record', p_record_id, 'record_scope',
     p_organization_id, v_title,
     jsonb_build_object('scope_type', v_name, 'scope_type_id', v_table,
                        'bound_by_door', 'custom.conversation_scope_bind'),
     v_me)
  on conflict (source_type, source_id, target_type, target_id, role)
  do update set deleted_at = null, label = excluded.label, metadata = excluded.metadata;

  return jsonb_build_object('bound', true, 'readable', true,
                            'record_id', p_record_id, 'table_id', v_table,
                            'scope_type', v_name, 'title', v_title);
end;
$fn$;

revoke all on function custom.conversation_scope_bind(uuid, uuid, uuid) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'conversation_scope_bind',
   'p_organization_id uuid, p_conversation_id uuid, p_record_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'p_organization_id is decided by custom.assert_store_door and custom.assert_client_may_reach '
   'on entry; NULL is refused there. p_record_id is decided by custom.has_visibility at viewer — '
   'the store''s one ladder, the same level the read door takes — and refused by name otherwise, '
   'so a record in another organization or one nobody shared cannot be bound. '
   'p_conversation_id is decided by iam.has_access(''conversation'', …, ''editor''), the platform '
   'ladder that owns chat.conversation, so a conversation somebody else owns cannot be pointed '
   'at your record. A NULL on either id fails its own check and nothing is written.',
   'talkrec_a_conversation_can_be_about_one_record.sql',
   null, true, false)
on conflict do nothing;

create function custom.conversation_scope_unbind(p_organization_id uuid, p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_n integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope_unbind');

  if not coalesce(iam.has_access('conversation', p_conversation_id, 'editor'::public.permission_level), false) then
    raise exception 'That conversation is not yours to change.'
      using errcode = '42501';
  end if;

  update platform.associations a
     set deleted_at = now(), deleted_via_type = 'conversation', deleted_via_id = p_conversation_id
   where a.source_type = 'conversation'
     and a.source_id = p_conversation_id
     and a.target_type = 'custom_record'
     and a.role = 'record_scope'
     and a.organization_id = p_organization_id
     and a.deleted_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('bound', false, 'released', v_n,
    'because', case when v_n = 0 then 'This conversation was not about a record.'
                    else 'This conversation is no longer about a particular record.' end);
end;
$fn$;

revoke all on function custom.conversation_scope_unbind(uuid, uuid) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'conversation_scope_unbind', 'p_organization_id uuid, p_conversation_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'p_organization_id is decided by custom.assert_client_may_reach on entry; NULL is refused '
   'there. p_conversation_id is decided by iam.has_access(''conversation'', …, ''editor''), the '
   'ladder that owns chat.conversation, and the UPDATE is additionally fenced to this '
   'organization''s own rows — so a conversation somebody else owns is refused by name and a '
   'conversation in another organization matches nothing. It only ever tombstones an edge THIS '
   'door created; it can neither read nor write a record.',
   'talkrec_a_conversation_can_be_about_one_record.sql',
   null, true, false)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE CONTEXT — ONE DOOR, ONE ROUND TRIP, EVERY PIECE THROUGH THE READ DOOR.
-- ════════════════════════════════════════════════════════════════════════════════════════
create function custom.record_scope_context(p_organization_id uuid, p_record_id uuid,
                                            p_relations integer default 12,
                                            p_history integer default 15,
                                            p_siblings integer default 8)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me        uuid := auth.uid();
  v_doc       jsonb;
  v_table     uuid;
  v_tname     text;
  v_singular  text;
  v_plural    text;
  v_titlek    text;
  v_title     text;
  v_version   integer;
  v_updated   timestamptz;
  v_fields    jsonb := '[]'::jsonb;
  v_withheld  jsonb := '[]'::jsonb;
  v_relations jsonb := '[]'::jsonb;
  v_history   jsonb := '[]'::jsonb;
  v_comments  jsonb := '{}'::jsonb;
  v_siblings  jsonb := '[]'::jsonb;
  v_sib_n     integer := 0;
  v_level     public.permission_level;
  v_suggest   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_scope_context');

  -- THE READ DOOR FIRST, AND EVERYTHING ELSE ONLY IF IT ANSWERS. It refuses by name when this
  -- person may not open the record, and its answer already carries `_hidden`.
  v_doc := custom.read_record(p_organization_id, p_record_id, false);
  v_level := custom.my_level(p_organization_id, p_record_id, 'record');

  select r.table_id, r.version, r.updated_at,
         nullif(t.data ->> 'name', ''),
         coalesce(nullif(t.data ->> 'label_singular', ''), nullif(t.data ->> 'name', ''), 'Record'),
         coalesce(nullif(t.data ->> 'label_plural', ''), 'records'),
         nullif(t.data ->> 'title_field', '')
    into v_table, v_version, v_updated, v_tname, v_singular, v_plural, v_titlek
    from custom.record r
    left join custom.record t
      on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_record_id;

  v_title := coalesce(nullif(btrim(coalesce(v_doc ->> v_titlek, '')), ''), 'Untitled');

  -- ── THE FIELDS, WITH THEIR TRIPLES. custom.record_values_versioned is the door that answers
  -- (field, version) per key and, since TALK-TO-RECORD's other file, withholds a value this
  -- reader may not see. A Field whose `context_policy` says `exclude` is a SECOND kind of
  -- absence — the organization keeping something out of conversations, not the store keeping
  -- it from this person — and it is named separately so neither is mistaken for the other.
  select coalesce(jsonb_agg(x.entry order by x.sort, x.key), '[]'::jsonb),
         coalesce(jsonb_agg(x.held order by x.sort, x.key) filter (where x.held is not null), '[]'::jsonb)
    into v_fields, v_withheld
    from (
      select f.data ->> 'key' as key,
             coalesce((f.data ->> 'sort')::int, 999) as sort,
             case
               when (v_doc -> '_hidden') ? (f.data ->> 'key')
                 or coalesce(f.data ->> 'context_policy', 'include') = 'exclude'
               then null
               else jsonb_build_object(
                 'key',   f.data ->> 'key',
                 'label', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
                 'type',  coalesce(nullif(f.data ->> 'type', ''), 'text'),
                 'value', v_doc -> (f.data ->> 'key'),
                 -- THE TRIPLE (DYN): record, field, value version. An answer that cites this
                 -- can be clicked back to the exact version it was read from.
                 'cite', jsonb_build_object('record_id', p_record_id,
                                            'field_id', f.id,
                                            'value_version', coalesce(vv.value_version, 1),
                                            'written_at', vv.written_at))
             end as entry,
             case
               when (v_doc -> '_hidden') ? (f.data ->> 'key')
               then jsonb_build_object(
                      'key', f.data ->> 'key',
                      'label', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
                      'because', 'masked',
                      'reason', v_doc -> '_hidden' -> (f.data ->> 'key') ->> 'reason',
                      'needs',  v_doc -> '_hidden' -> (f.data ->> 'key') ->> 'needs',
                      'says', 'This field is ' ||
                              coalesce(v_doc -> '_hidden' -> (f.data ->> 'key') ->> 'reason', 'restricted') ||
                              ' and you do not hold ' ||
                              coalesce(v_doc -> '_hidden' -> (f.data ->> 'key') ->> 'needs', 'the level it needs') ||
                              ' on this record, so it is not in this conversation.')
               when coalesce(f.data ->> 'context_policy', 'include') = 'exclude'
               then jsonb_build_object(
                      'key', f.data ->> 'key',
                      'label', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
                      'because', 'policy',
                      'reason', coalesce(f.data ->> 'sensitivity', 'internal'),
                      'says', 'This organization keeps this field out of conversations, so the '
                              'agent was not given it even though you can read it on the record.')
               else null
             end as held
        from custom.applicable_fields(p_organization_id, v_table,
               v_doc ->> custom.table_type_field(p_organization_id, v_table)) f
        left join lateral (
          select vz.value_version, vz.written_at
            from custom.record_values_versioned(p_organization_id, p_record_id) vz
           where vz.field_key = f.data ->> 'key'
           limit 1) vv on true
    ) x
   where x.entry is not null or x.held is not null;

  -- A field with no entry is a withheld one; drop the nulls the aggregate kept.
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_fields
    from jsonb_array_elements(v_fields) e where e <> 'null'::jsonb;

  -- ── ONE HOP OUT. custom.relation_target_card is the door that answers a related record's
  -- card AND says, per target, whether it was masked and at what level — so a relation to
  -- something this person may not open is present and named, never silently dropped.
  select coalesce(jsonb_agg(jsonb_build_object(
           'via', c.edge_role, 'target_id', c.target_id, 'foreign', c.is_foreign,
           'masked', c.masked, 'your_level', c.reader_level, 'card', c.card, 'why', c.why)
         order by c.edge_role), '[]'::jsonb)
    into v_relations
    from (select * from custom.relation_target_card(p_organization_id, p_record_id, null)
           limit greatest(1, least(coalesce(p_relations, 12), 50))) c;

  -- ── WHAT HAPPENED TO IT. The history door, which since TALK-TO-RECORD's other file names a
  -- change to a field this reader may not see without carrying its before or its after.
  select coalesce(jsonb_agg(jsonb_build_object(
           'version', h.version, 'at', h.occurred_at, 'what', h.operation_label,
           'who', h.actor -> 'name', 'changes', h.changes) order by h.version desc), '[]'::jsonb)
    into v_history
    from (select * from custom.record_history(p_organization_id, p_record_id,
                        greatest(1, least(coalesce(p_history, 15), 100)), 0)) h;

  -- ── WHAT PEOPLE SAID ABOUT IT.
  v_comments := custom.comment_thread(p_organization_id, p_record_id, false);

  -- ── THE TABLE'S OTHER RECORDS, ONLY AS THE READ DOOR ALLOWS. custom.read_records IS the
  -- list door: it answers the rows this person may see and masks their cells.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'title', coalesce(nullif(btrim(coalesce(s.document ->> v_titlek, '')), ''), 'Untitled'))
         order by s.id), '[]'::jsonb),
         count(*)
    into v_siblings, v_sib_n
    from (select * from custom.read_records(p_organization_id, v_table, false,
                        greatest(1, least(coalesce(p_siblings, 8), 50)) + 1, 0)) s
   where s.id <> p_record_id;

  -- ── WHAT TO ASK, FROM THE RECORD'S OWN SHAPE. Never a fixed list: a question is offered
  -- only when the record actually carries what it would need to answer it.
  v_suggest := '[]'::jsonb;
  if jsonb_array_length(v_history) > 1 then
    v_suggest := v_suggest || jsonb_build_array('What changed on this ' || lower(v_singular) || ' recently?');
  end if;
  if exists (select 1 from jsonb_array_elements(v_relations) r
              where coalesce((r ->> 'masked')::boolean, false) = false) then
    v_suggest := v_suggest || jsonb_build_array('What is this ' || lower(v_singular) || ' connected to?');
  end if;
  if jsonb_array_length(coalesce(v_comments -> 'comments', '[]'::jsonb)) > 0 then
    v_suggest := v_suggest || jsonb_build_array('Summarise the notes on this ' || lower(v_singular) || '.');
  end if;
  if exists (select 1 from jsonb_array_elements(v_fields) f
              where lower(f ->> 'key') in ('owner','assignee','assigned_to','account_owner')
                 or lower(f ->> 'type') = 'member') then
    v_suggest := v_suggest || jsonb_build_array('Who owns this ' || lower(v_singular) || '?');
  end if;
  if v_sib_n > 0 then
    v_suggest := v_suggest || jsonb_build_array('How does it compare with the other ' || lower(v_plural) || '?');
  end if;
  if jsonb_array_length(v_withheld) > 0 then
    v_suggest := v_suggest || jsonb_build_array('What am I not being shown here?');
  end if;

  return jsonb_build_object(
    'record', jsonb_build_object(
      'id', p_record_id, 'title', v_title, 'table_id', v_table, 'table_name', v_tname,
      'scope_type', v_singular, 'plural', v_plural, 'version', v_version,
      'updated_at', v_updated, 'your_level', v_level),
    'fields',    v_fields,
    'withheld',  v_withheld,
    'relations', v_relations,
    'history',   v_history,
    'comments',  coalesce(v_comments -> 'comments', '[]'::jsonb),
    'may_comment', coalesce(v_comments -> 'may_comment', 'false'::jsonb),
    'siblings',  jsonb_build_object(
      'shown', v_siblings,
      'more_than_shown', v_sib_n > greatest(1, least(coalesce(p_siblings, 8), 50)),
      'says', 'Only the records of this table you may open are here; the table may hold more.'),
    'suggested', v_suggest,
    -- NOTHING FAILS SILENTLY: one sentence a prompt can carry verbatim.
    'says', case when jsonb_array_length(v_withheld) = 0
                 then 'Everything this ' || lower(v_singular) || ' holds that you may read is here.'
                 else 'This ' || lower(v_singular) || ' has ' || jsonb_array_length(v_withheld) ||
                      ' field(s) that are not in this conversation: ' ||
                      (select string_agg(w ->> 'label', ', ') from jsonb_array_elements(v_withheld) w) ||
                      '. An answer here is an answer without them.' end,
    'assembled_at', now());
end;
$fn$;

revoke all on function custom.record_scope_context(uuid, uuid, integer, integer, integer) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'record_scope_context',
   'p_organization_id uuid, p_record_id uuid, p_relations integer, p_history integer, p_siblings integer',
   array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype, 'int4'::regtype, 'int4'::regtype]::oid[],
   'p_organization_id is decided by custom.assert_client_may_reach on entry; NULL is refused '
   'there. p_record_id takes its decision in custom.read_record — the FIRST thing this door '
   'calls — which refuses by name unless custom.has_visibility gives this caller viewer, so a '
   'record in another organization and a record nobody shared are both refused before anything '
   'else runs. Every other piece is another DOOR with its own decision on the same caller: '
   'custom.record_values_versioned, custom.relation_target_card, custom.record_history, '
   'custom.comment_thread and custom.read_records. Nothing in this body reads custom.record for '
   'a VALUE; the three integers are clamped and cannot widen anything.',
   'talkrec_a_conversation_can_be_about_one_record.sql',
   null, true, false)
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- THE BOUND CONVERSATION'S CONTEXT — the binding and the context in ONE round trip, which is
-- what a chat surface and an agent turn each actually ask for.
-- ════════════════════════════════════════════════════════════════════════════════════════
create function custom.conversation_scope_context(p_organization_id uuid, p_conversation_id uuid,
                                                  p_relations integer default 12,
                                                  p_history integer default 15,
                                                  p_siblings integer default 8)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_scope jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.conversation_scope_context');

  v_scope := custom.conversation_scope(p_organization_id, p_conversation_id);

  if not coalesce((v_scope ->> 'bound')::boolean, false)
     or not coalesce((v_scope ->> 'readable')::boolean, false) then
    return jsonb_build_object('scope', v_scope, 'context', null);
  end if;

  return jsonb_build_object(
    'scope', v_scope,
    'context', custom.record_scope_context(p_organization_id,
                 (v_scope ->> 'record_id')::uuid, p_relations, p_history, p_siblings));
end;
$fn$;

revoke all on function custom.conversation_scope_context(uuid, uuid, integer, integer, integer) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'conversation_scope_context',
   'p_organization_id uuid, p_conversation_id uuid, p_relations integer, p_history integer, p_siblings integer',
   array['uuid'::regtype, 'uuid'::regtype, 'int4'::regtype, 'int4'::regtype, 'int4'::regtype]::oid[],
   'p_organization_id is decided by custom.assert_client_may_reach on entry; NULL is refused '
   'there. It reaches a record ONLY through custom.conversation_scope, which answers a record '
   'id only when custom.has_visibility gives this caller viewer on it, and then through '
   'custom.record_scope_context, which decides that record again on its own first line. A '
   'conversation this caller may not read answers scope.readable = false and context = null. '
   'The three integers are clamped downstream.',
   'talkrec_a_conversation_can_be_about_one_record.sql',
   null, true, false)
on conflict do nothing;
