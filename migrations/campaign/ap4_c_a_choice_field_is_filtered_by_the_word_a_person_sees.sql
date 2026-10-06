-- chair-step: it re-writes platform._drill_plan and custom.entity_records_find in place so a filter on a custom choice field accepts the word a person sees.
--   Both live bodies are patched by text inside this file (pg_get_functiondef, each anchor asserted
--   to occur exactly once, executed back); nothing else in them changes. It creates
--   custom.choice_value_keys(jsonb, jsonb) — the one word→key mapper for a filter value, SECURITY
--   DEFINER only so a signed-in caller's invoker door may use custom.choice_key_of; it reads no table —
--   declares its platform.client_callable_door row and runs `select custom.reopen_declared_doors()`,
--   which grants it to `authenticated`; and it creates platform._drill_choice_words_in(jsonb, jsonb),
--   internal to the definer step platform._drill_plan, with every client grant revoked. No table,
--   trigger, policy or row of anybody's data is touched; no refusal is added anywhere.
--   The inverse is migrations/inverse/ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees_down.sql.
-- based-on: platform._drill_plan(uuid,jsonb,jsonb,text) a2770bf530c7c9b180b6dd7584bc2a9cd680064c4d76609ebf9b6e9e066f98fa
-- based-on: custom.entity_records_find(uuid,text,text,jsonb,integer,integer) 9905e36a4a14a41f1542a77952c10d33fbe625110660cbb6b3c01c72008099bf
-- lane: AP-4
-- lock: custom,platform
--
-- LANE AP-4 · A CHOICE FIELD IS FILTERED BY THE WORD A PERSON SEES (CONTRACTS.md §5 acceptance:
-- "an Applet lists contacts with it, filters on it").
--
-- THE GAP (measured live 2026-10-06, Oak Street Studio). custom.entity_row_write accepts the choice
-- word — "Text message" — and the store keeps its stable key, `text_message`
-- (custom._entity_choice_keys, through custom.choice_key_of). Filtering on that custom field by the
-- same word returned 0 rows in BOTH read doors: platform.drill_rows (where {"cf:<field>": "Text
-- message"}, api true or false, scalar, list or {in: [...]}) and custom.entity_records_find
-- (p_value "Text message"). Only the stored key matched. A person and an agent filter by what they see.
--
-- THE FIX, AT THE SHARED LAYER. ONE mapper, custom.choice_value_keys(field, value): a string, each
-- string of a list, and the eq / ne / in operands of an operator object become the option's stable
-- key through custom.choice_key_of — the SAME resolution a write uses (the key, the label, or the
-- option's id; case-insensitive). A value that names no choice passes through unchanged, so the
-- stored key keeps matching and an unknown word still answers an honest 0 rows (allow_other values
-- included). Every read door reaches it:
--   · platform._drill_plan — the planning step every drill door (drill_rows, drill_ask, the Table
--     API, MCP tables) passes — maps the question's where on each custom choice column
--     (`cf:<field id>`, a column the describer listed for this caller) before it is compiled;
--   · custom.entity_records_find maps p_value with the options custom.entity_fields_across reads AS
--     THE CALLER (the organization wall first) before either of its two finders runs. Its answer still
--     echoes the value as asked.
--
-- KEYSET (CONTRACTS §4). platform.drill_rows already offers a keyset page on the Table API path
-- (source api: true → next_cursor {v, id}, question key `cursor`). custom.entity_records_find still
-- pages by offset; a refusal past its limit would be a NEW refusal on its callers, so none is added
-- here (reported to the owner instead).
--
-- Seat suite: scripts/campaign-tests/ap4_choice_words_filter_green.sql; red twin
-- scripts/campaign-tests/ap4_choice_words_filter_red.sql.

set lock_timeout = '4s';

-- ── THE ONE MAPPER ──────────────────────────────────────────────────────────────────────────────
create or replace function custom.choice_value_keys(p_field jsonb, p_value jsonb)
  returns jsonb
  language plpgsql
  immutable
  security definer
  set search_path to 'pg_catalog'
as $function$
begin
  -- AP-4: a FILTER value on a choice field, in the words a person sees, becomes the option's stable
  -- key exactly as a write's value does (custom.choice_key_of: the key, the label or the option's id).
  -- p_field is {options: <custom.choice_options map>}. A value naming no choice passes unchanged.
  if p_value is null then
    return null;
  end if;
  case jsonb_typeof(p_value)
    when 'string' then
      return to_jsonb(coalesce(custom.choice_key_of(p_field, p_value #>> '{}'), p_value #>> '{}'));
    when 'array' then
      return (select coalesce(jsonb_agg(case when jsonb_typeof(x) = 'string'
                                             then to_jsonb(coalesce(custom.choice_key_of(p_field, x #>> '{}'), x #>> '{}'))
                                             else x end order by o), '[]'::jsonb)
                from jsonb_array_elements(p_value) with ordinality e(x, o));
    when 'object' then
      return (select coalesce(jsonb_object_agg(k, case when k in ('eq', 'ne', 'in') and jsonb_typeof(v) in ('string', 'array')
                                                      then custom.choice_value_keys(p_field, v) else v end), '{}'::jsonb)
                from jsonb_each(p_value) e(k, v));
    else
      return p_value;
  end case;
end
$function$;

comment on function custom.choice_value_keys(jsonb, jsonb) is
  'AP-4: the one word→key mapper for a FILTER value on a choice field (a string, a list, or eq/ne/in operands) — custom.choice_key_of, the resolution a write uses. Reads no table. See migrations/campaign/ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees.sql.';

revoke all on function custom.choice_value_keys(jsonb, jsonb) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'choice_value_keys', 'p_field jsonb, p_value jsonb',
   array['jsonb'::regtype, 'jsonb'::regtype]::oid[],
   'A pure function of its two arguments: it reads no table and writes nothing. SECURITY DEFINER only so the invoker door custom.entity_records_find, running as the signed-in caller, may use custom.choice_key_of (granted to no client role). Whatever options a caller passes, she is told only which of HER OWN options her own word names.',
   'ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees.sql',
     'declared_at', '2026-10-06 lane AP-4',
     'arguments', jsonb_build_object(
       'p_field', jsonb_build_object('type', 'jsonb', 'position', 1,
         'check', 'data, not an identity: {options: {...}} as custom.choice_options returns it; nothing is looked up by it.',
         'verified', '2026-10-06 lane AP-4 — written with this body'),
       'p_value', jsonb_build_object('type', 'jsonb', 'position', 2,
         'check', 'data, not an identity: the filter value to map; returned unchanged when it names no choice.',
         'verified', '2026-10-06 lane AP-4 — written with this body'))))
on conflict do nothing;

select custom.reopen_declared_doors();

-- ── THE DRILL DOORS' STEP ───────────────────────────────────────────────────────────────────────
create or replace function platform._drill_choice_words_in(p_def jsonb, p_question jsonb)
  returns jsonb
  language plpgsql
  stable
  set search_path to 'pg_catalog'
as $function$
declare
  v_where jsonb := p_question -> 'where';
  k       text;
  e       jsonb;
  v_org   uuid;
  v_data  jsonb;
  v_otid  uuid;
begin
  -- AP-4: a where on a custom CHOICE column the describer listed for this caller (`cf:<field id>` in
  -- the resolved definition's columns) is mapped word→key before the compiler sees it. Run inside
  -- the definer step platform._drill_plan, after platform._drill_resolve decided which custom fields
  -- this caller reads; a column it did not list is never looked at.
  if p_question is null or jsonb_typeof(v_where) is distinct from 'object' then
    return p_question;
  end if;
  for k, e in select x.key, x.value from jsonb_each(v_where) x loop
    continue when k !~ '^cf:[0-9a-fA-F-]{36}$'
               or not coalesce((p_def -> '_c' -> 'cols' -> k ->> 'custom')::boolean, false);
    select r.organization_id, r.data into v_org, v_data
      from custom.record r
     where r.id = substr(k, 4)::uuid
       and r.table_id = custom.field_kernel_id()
       and r.deleted_at is null;
    continue when v_data is null or coalesce(v_data ->> 'type', '') <> 'list';
    v_otid := coalesce(nullif(v_data ->> 'options_table_id', ''), nullif(v_data -> 'config' ->> 'options_table_id', ''))::uuid;
    continue when v_otid is null;
    v_where := jsonb_set(v_where, array[k],
                 custom.choice_value_keys(jsonb_build_object('options', custom.choice_options(v_org, v_otid)), e));
  end loop;
  return jsonb_set(p_question, '{where}', v_where);
end
$function$;

comment on function platform._drill_choice_words_in(jsonb, jsonb) is
  'AP-4: inside platform._drill_plan, a where on a custom choice column becomes the stored keys (custom.choice_value_keys). Internal: no client role may call it. See migrations/campaign/ap4_c_a_choice_field_is_filtered_by_the_word_a_person_sees.sql.';

revoke all on function platform._drill_choice_words_in(jsonb, jsonb) from public, anon, authenticated;

do $ap4$
declare
  c_old constant text := $o$    v_def := platform._drill_protect(v_def, q, p_kind);   -- LANE7-W4A[p1]: protected custom fields$o$;
  c_new constant text := $n$    v_def := platform._drill_protect(v_def, q, p_kind);   -- LANE7-W4A[p1]: protected custom fields
    q := platform._drill_choice_words_in(v_def, q);         -- AP-4: a choice is filtered by its word too$n$;
  v_def text := pg_get_functiondef('platform._drill_plan(uuid,jsonb,jsonb,text)'::regprocedure);
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
  if v_n <> 1 then
    raise exception 'AP-4: platform._drill_plan carries its anchor % times, not once; this file was written against another body.', v_n
      using errcode = '55000';
  end if;
  execute replace(v_def, c_old, c_new);
end
$ap4$;

-- ── custom.entity_records_find ──────────────────────────────────────────────────────────────────
do $ap4$
declare
  c_decl_old constant text := $o$  v_pf     custom.record;   -- LANE7-W4A[f1]$o$;
  c_decl_new constant text := $n$  v_pf     custom.record;   -- LANE7-W4A[f1]
  v_asked  jsonb := p_value;   -- AP-4: the value as asked, echoed back$n$;
  c_sel_old  constant text := $o$  select * into v_pf from custom.entity_fields(p_organization_id, p_token) f where f.data ->> 'key' = p_key limit 1;$o$;
  c_sel_new  constant text := $n$  select * into v_pf from custom.entity_fields(p_organization_id, p_token) f where f.data ->> 'key' = p_key limit 1;
  -- AP-4: a CHOICE field is found by the word a person sees as well as by its stored key — the same
  -- resolution a write uses (custom.choice_value_keys), over the options read as the caller.
  if p_value is not null and v_pf.data ->> 'type' = 'list' then
    p_value := custom.choice_value_keys(jsonb_build_object('options',
                 (select x -> 'options'
                    from jsonb_array_elements(custom.entity_fields_across(p_token, array[p_organization_id]) -> 'fields') x
                   where x ->> 'id' = v_pf.id::text
                   limit 1)), p_value);
  end if;$n$;
  c_echo_old constant text := $o$'value', p_value, 'rows'$o$;
  c_echo_new constant text := $n$'value', v_asked, 'rows'$n$;
  v_def text := pg_get_functiondef('custom.entity_records_find(uuid,text,text,jsonb,integer,integer)'::regprocedure);
begin
  if (length(v_def) - length(replace(v_def, c_decl_old, ''))) / length(c_decl_old) <> 1
     or (length(v_def) - length(replace(v_def, c_sel_old, ''))) / length(c_sel_old) <> 1
     or (length(v_def) - length(replace(v_def, c_echo_old, ''))) / length(c_echo_old) <> 2 then
    raise exception 'AP-4: custom.entity_records_find does not carry its anchors as written; this file was written against another body.'
      using errcode = '55000';
  end if;
  execute replace(replace(replace(v_def, c_decl_old, c_decl_new), c_sel_old, c_sel_new), c_echo_old, c_echo_new);
end
$ap4$;
