-- ADDITIVE: custom.formula_preview(org, table, record, text) — Notion's live formula sample: the formula a person is
--   still typing, parsed (custom.formula_parse) and, when it parses, evaluated for one record exactly as a saved
--   formula column would be (custom.formula_value: the record's values, the read-time lookups and roll-ups it names,
--   the rule context). Writes nothing — no Field is declared and no record is touched; an evaluation that raises is
--   answered as {ok: true, value: null, error}, never thrown. Adds one function, one platform.client_callable_door
--   row and its grant; nothing is replaced.
--   Locks: pg_proc row, one platform.client_callable_door row.
--   Inverse: migrations/inverse/notionprops_b_a_formula_shows_its_answer_as_it_is_typed_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: NOTION-PROPS

create or replace function custom.formula_preview(p_organization_id uuid, p_table_id uuid, p_record_id uuid, p_text text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_parsed jsonb;
  v_table  uuid;
  v_value  jsonb;
  v_msg    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.formula_preview');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.formula_preview');
  -- The parse is the store's own (it re-asserts the same two things and never throws).
  v_parsed := custom.formula_parse(p_organization_id, p_table_id, p_text);
  if coalesce((v_parsed ->> 'ok')::boolean, false) is not true or p_record_id is null then
    return v_parsed || jsonb_build_object('value', null, 'record_id', null);
  end if;
  select r.table_id into v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id
     and r.data_class = 'record' and r.deleted_at is null;
  if v_table is distinct from p_table_id then
    raise exception 'That record is not in this table.' using errcode = '22023';
  end if;
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.formula_preview',
                                        'viewer'::public.permission_level, 'record');
  begin
    v_value := custom.formula_value(p_organization_id, p_record_id,
                 jsonb_build_object('key', '__formula_preview__', 'type', 'formula',
                                    'entity_definition_id', p_table_id::text,
                                    'config', jsonb_build_object('expr', v_parsed -> 'expr')),
                 null);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    return v_parsed || jsonb_build_object('value', null, 'record_id', p_record_id, 'error', v_msg);
  end;
  return v_parsed || jsonb_build_object('value', v_value, 'record_id', p_record_id);
end
$function$;

comment on function custom.formula_preview(uuid, uuid, uuid, text) is
  'NOTION-PROPS: a formula being typed, parsed and evaluated for one record of the table as a saved formula column would be — the live sample under the formula box. Writes nothing.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes, argument_rules)
select 'custom', 'formula_preview',
   'p_organization_id uuid, p_table_id uuid, p_record_id uuid, p_text text',
   'migrations/campaign/notionprops_b_a_formula_shows_its_answer_as_it_is_typed.sql (lane NOTION-PROPS)',
   'Reads and writes nothing it may not: the organization wall and the right to know the Table are asserted first, the record must be a live record of that Table which the caller may open as viewer (custom.assert_client_may_open), and the value is the one custom.formula_value answers that reader for a formula column. Writes nothing.',
   true, false, null, '{2950,2950,2950,25}',
   jsonb_build_object('version', 1, 'declared_by', 'notionprops_b_a_formula_shows_its_answer_as_it_is_typed.sql',
     'declared_at', '2026-10-08 lane NOTION-PROPS, read from this body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'custom.assert_may_know_table(arg1, arg2).',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_record_id', jsonb_build_object('type', 'uuid', 'position', 3, 'entity', 'custom_record',
         'check', 'must be a live record of p_table_id (22023), then custom.assert_client_may_open(viewer). Null samples nothing.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body'),
       'p_text', jsonb_build_object('type', 'text', 'position', 4,
         'check', 'parsed by custom.formula_parse against the Table''s own columns; nothing is stored.',
         'foreign', jsonb_build_object('not_a_leak', true),
         'verified', '2026-10-08 lane NOTION-PROPS — read from this body')))
on conflict do nothing;

select custom.reopen_declared_doors();
