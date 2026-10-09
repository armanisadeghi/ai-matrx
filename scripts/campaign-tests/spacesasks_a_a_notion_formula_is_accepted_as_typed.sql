-- SPACES-ASKS (1) — A NOTION FORMULA IS ACCEPTED AS TYPED: prop("Budget") * 2 is the same formula as {Budget} * 2.
--
-- THE USE CASE: a project coordinator at a renovation company moves her Notion "Projects" database over and types
-- the formulas she wrote there. From the seat (role authenticated, admin@admin.com owns a fresh disposable org):
--   1  prop("Budget") * 2 parses, to exactly the expression {Budget} * 2 parses to
--   2  if(prop("Stage") == "Done", 1, 0) and the method form prop("Name").concat(" - ", prop("Stage")) parse
--   3  the live sample (custom.formula_preview) of prop("Budget") * 2 on a record with Budget 5 is 10
--   4  a formula typed with prop() saves as a formula column (field_declare formula_text) and reads 10 back
--   5  a Notion function the store has no word for (sqrt) is refused, and the refusal names `sqrt`
--   6  the store's own {Budget} * 2 still parses exactly as before
--   7  the importer's 17 mapped Notion formulas come out in exactly the store's words, and 5 it cannot carry are refused by name
--
-- RUN IT (ONE transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/spacesasks_a_a_notion_formula_is_accepted_as_typed.sql
-- RED before migrations/campaign/spacesasks_a_a_notion_formula_is_accepted_as_typed.sql; GREEN after.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid;
  v_t uuid;
  v_rec uuid;
  f_calc uuid;
  v_a jsonb; v_b jsonb; v_j jsonb;
  v_fail text[] := '{}';
begin
  perform set_config('app.actor_system', 'campaign-test/spacesasks_a', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Light Renovations', 'harborlight-sa-'||substr(v_org::text,1,8), 'HLR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/spacesasks_a');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Harbor Light — Projects')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Projects','slug','projects_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Project','label_plural','Projects','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','budget','label','Budget','type','number'));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key','stage','label','Stage','type','text'));
  v_rec := custom.record_write(v_org, v_t, jsonb_build_object('name','Kitchen remodel','budget',5,'stage','Done','parent_id',v_home::text));

  begin
    v_a := custom.formula_parse(v_org, v_t, 'prop("Budget") * 2');
    v_b := custom.formula_parse(v_org, v_t, '{Budget} * 2');
    if (v_a ->> 'ok')::boolean is not true then v_fail := v_fail || ('1 prop("Budget") * 2 was refused: ' || coalesce(v_a ->> 'error', '?')); 
    elsif v_a -> 'expr' is distinct from v_b -> 'expr' then v_fail := v_fail || ('1 the two spellings parse differently: ' || v_a::text); end if;
  exception when others then v_fail := v_fail || ('1 raised ' || sqlerrm); end;

  begin
    v_a := custom.formula_parse(v_org, v_t, 'if(prop("Stage") == "Done", 1, 0)');
    if (v_a ->> 'ok')::boolean is not true then v_fail := v_fail || ('2a if(...) was refused: ' || coalesce(v_a ->> 'error', '?')); end if;
    v_a := custom.formula_parse(v_org, v_t, 'prop("Name").concat(" - ", prop("Stage"))');
    if (v_a ->> 'ok')::boolean is not true then v_fail := v_fail || ('2b .concat(...) was refused: ' || coalesce(v_a ->> 'error', '?')); end if;
  exception when others then v_fail := v_fail || ('2 raised ' || sqlerrm); end;

  begin
    v_j := custom.formula_preview(v_org, v_t, v_rec, 'prop("Budget") * 2');
    if v_j -> 'value' is distinct from '10'::jsonb then v_fail := v_fail || ('3 the live sample answered ' || v_j::text); end if;
  exception when others then v_fail := v_fail || ('3 raised ' || sqlerrm); end;

  begin
    f_calc := custom.field_declare(v_org, v_t, jsonb_build_object('key','double','label','Double','type','formula','formula_text','prop("Budget") * 2'));
    perform set_config('role', 'postgres', true);
    select custom.read_record(v_org, v_rec) into v_j;
    perform set_config('role', 'authenticated', true);
    if (v_j::text) !~ '"double": ?10' then v_fail := v_fail || ('4 the saved formula column did not read 10: ' || left(v_j::text, 300)); end if;
  exception when others then
    perform set_config('role', 'authenticated', true);
    v_fail := v_fail || ('4 the formula column was not saved: ' || sqlerrm);
  end;

  begin
    v_a := custom.formula_parse(v_org, v_t, 'sqrt(prop("Budget"))');
    if (v_a ->> 'ok')::boolean is not false or coalesce(v_a ->> 'error', '') not like '%sqrt%' then
      v_fail := v_fail || ('5 an unknown Notion function was answered ' || v_a::text);
    end if;
  exception when others then v_fail := v_fail || ('5 raised ' || sqlerrm); end;

  begin
    v_a := custom.formula_parse(v_org, v_t, '{Budget} * 2');
    if (v_a ->> 'ok')::boolean is not true then v_fail := v_fail || ('6 the store''s own spelling was refused: ' || v_a::text); end if;
  exception when others then v_fail := v_fail || ('6 raised ' || sqlerrm); end;

  -- 7. The importer's cases, now the store's: each Notion formula written in the store's words, or refused by name.
  declare
    v_types jsonb := '{"Fee":"currency","Name":"text","Status":"status","Due":"date","Notes":"long_text"}';
    v_case text[]; v_out jsonb;
    v_mapped text[][] := array[
      array['prop("Fee") * 1.08', '({Fee} * 1.08)'],
      array['if(prop("Status") == "Done", 1, 0)', 'IF(({Status} = "Done"), 1, 0)'],
      array['prop("Name") + " (" + prop("Status") + ")"', '((({Name} & " (") & {Status}) & ")")'],
      array['prop("Name").concat(" - ", prop("Status"))', 'CONCATENATE({Name}, " - ", {Status})'],
      array['and(prop("Fee") > 100, not empty(prop("Due")))', 'AND(({Fee} > 100), NOT(ISBLANK({Due})))'],
      array['prop("Fee") > 100 and prop("Status") != "Done"', 'AND(({Fee} > 100), ({Status} != "Done"))'],
      array['dateBetween(prop("Due"), now(), "days")', 'DATEDIFF(NOW(), {Due}, "days")'],
      array['dateAdd(prop("Due"), 2, "weeks")', 'DATEADD({Due}, (2 * 7), "days")'],
      array['formatDate(prop("Due"), "MMM D, YYYY")', 'DATETIME_FORMAT({Due}, "MMM D, YYYY")'],
      array['length(prop("Notes"))', 'LEN({Notes})'],
      array['contains(prop("Notes"), "urgent")', 'CONTAINS({Notes}, "urgent")'],
      array['replace(prop("Name"), "LLC", "")', 'SUBSTITUTE({Name}, "LLC", "", 1)'],
      array['round(prop("Fee") * 100) / 100', '(ROUND(({Fee} * 100)) / 100)'],
      array['max(prop("Fee"), 50)', 'MAX({Fee}, 50)'],
      array['toNumber("12") + 1', '(("12" * 1) + 1)'],
      array['ifs(prop("Fee") > 500, "Large", prop("Fee") > 100, "Mid", "Small")', 'IF(({Fee} > 500), "Large", IF(({Fee} > 100), "Mid", "Small"))'],
      array['empty(prop("Notes"))', 'ISBLANK({Notes})']];
    v_refused text[][] := array[
      array['replaceAll(prop("Name"), "Co.", "Company")', 'pattern'],
      array['prop("Fee") ^ 2', 'power'],
      array['map(prop("Tags"), current.length())', 'item by item'],
      array['prop("Due").dateAdd(1, "hours")', 'unit'],
      array['prop("A"', 'closing']];
    i integer;
  begin
    perform set_config('role', 'postgres', true);   -- the translator is internal: the parse calls it, no client does
    for i in 1 .. array_length(v_mapped, 1) loop
      v_out := custom.formula_translate_notion(v_mapped[i][1], v_types);
      if v_out ->> 'formula' is distinct from v_mapped[i][2] then
        v_fail := v_fail || ('7 ' || v_mapped[i][1] || ' came out as ' || coalesce(v_out ->> 'formula', v_out ->> 'reason'));
      end if;
    end loop;
    for i in 1 .. array_length(v_refused, 1) loop
      v_out := custom.formula_translate_notion(v_refused[i][1], v_types);
      if (v_out ->> 'ok')::boolean is not false or coalesce(v_out ->> 'reason', '') not like '%' || v_refused[i][2] || '%' then
        v_fail := v_fail || ('7 ' || v_refused[i][1] || ' was not refused as expected: ' || v_out::text);
      end if;
    end loop;
  exception when others then v_fail := v_fail || ('7 raised ' || sqlerrm);
  end;

  perform set_config('role', 'postgres', true);
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % formula check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — Notion formula syntax is accepted by the parse, the live sample and a saved formula column; an unknown Notion function is refused by name; the store''s own syntax is unchanged.';
end
$t$;

rollback;
