-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_scope_context(uuid, uuid, integer, integer, integer) d1437c349b5be60e7980dfe57b13dcf7d41a9e1fe8bc30682c3aa19a0d4c0c7e
--
-- A RELATION HAS TO SAY WHICH COLUMN IT CAME THROUGH.
--
-- Lane TALK-TO-RECORD, 2026-09-20, caught by its own suite on the main database:
-- `custom.record_scope_context` read `c.edge_role` off `custom.relation_target_card`, which
-- has no such column — that word belongs to `custom.record_relation_edges`, a server-only
-- door. The card door answers a target's card, whether it was MASKED and at what level, but
-- not the column, because the column is what you ask it WITH.
--
-- So the via is now real: a named pass over this Table's own relation columns (skipping a
-- column this reader may not see at all), and an unnamed pass for everything carried onto
-- the record that no column names. A related record this person may not open stays in the
-- answer, masked and with the store's reason — a chat that silently dropped it would let an
-- agent answer "nothing is connected to this" about a record with five connections.

create or replace function custom.record_scope_context(p_organization_id uuid, p_record_id uuid,
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
  -- THE VIA IS THE COLUMN'S OWN NAME. `custom.relation_target_card` answers a target's
  -- card, whether it was masked and at what level — but not which column it came through,
  -- because the column is what you ASK it with. So the named pass walks this Table's
  -- relation columns, and the unnamed pass picks up everything carried onto the record
  -- that no column names. A relation to something this person may not open is PRESENT and
  -- named, never silently dropped.
  with named as (
    select vk.key as via,
           vk.label as via_label,
           c.target_id, c.is_foreign, c.masked, c.reader_level, c.card, c.why
      from (select f.data ->> 'key' as key,
                   coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') as label
              from custom.applicable_fields(p_organization_id, v_table,
                     v_doc ->> custom.table_type_field(p_organization_id, v_table)) f
             where coalesce(f.data ->> 'type', '') in ('relation', 'member', 'attachment', 'lookup')
               and not custom.mask_says_withheld(
                     jsonb_build_object('notices', coalesce(v_doc -> '_hidden', '{}'::jsonb)),
                     f.data ->> 'key')) vk
      cross join lateral custom.relation_target_card(p_organization_id, p_record_id, vk.key) c
  ),
  carried as (
    select 'carried'::text as via, 'Carried onto this record'::text as via_label,
           c.target_id, c.is_foreign, c.masked, c.reader_level, c.card, c.why
      from custom.relation_target_card(p_organization_id, p_record_id, null) c
     where not exists (select 1 from named n where n.target_id = c.target_id)
  ),
  every_one as (
    select * from named union all select * from carried
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'via', e.via, 'via_label', e.via_label, 'target_id', e.target_id,
           'foreign', e.is_foreign, 'masked', e.masked, 'your_level', e.reader_level,
           'card', e.card, 'why', e.why) order by e.via, e.target_id), '[]'::jsonb)
    into v_relations
    from (select * from every_one order by via, target_id
           limit greatest(1, least(coalesce(p_relations, 12), 50))) e;

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

