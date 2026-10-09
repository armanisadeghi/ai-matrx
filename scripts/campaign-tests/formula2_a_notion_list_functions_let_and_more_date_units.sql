-- FORMULA-2 (a) — NOTION'S LIST FUNCTIONS, let/lets AND MORE DATE UNITS WORK IN THE STORE'S FORMULAS.
--
-- THE USE CASE: a creative studio moves its Notion "Client retainers" database over. Each retainer links its
-- "Deliverables" (a relation); each deliverable has Hours and a Done box. The retainer formulas she wrote there:
--   prop("Deliverables").filter(current.prop("Done")).length()          how many are finished
--   prop("Deliverables").map(current.prop("Hours")).sum()               hours promised
--   prop("Deliverables").map(current.prop("Name")).join(" | ")          the list as one line
--   lets(fee, prop("Monthly fee"), n, prop("Deliverables").length(), fee * n)
--   dateBetween(date, prop("Signed"), "months")  /  dateAdd(..., 36, "hours")  /  replace(..., "(\\w+) (\\w+)", "$2 $1")
-- From the seat (role authenticated, admin@admin.com owns a fresh disposable org) every one of them:
--   A  is accepted as typed and the live sample (custom.formula_preview) answers what Notion answers
--   B  saves as a formula column and reads back the same answer
--   C  an unknown function is still refused by NAME, and CURRENT() outside a list says so
--   D  the store's own spelling and every formula written before today still answer as before
--
-- RUN IT (ONE transaction ending in ROLLBACK — nothing persists):
--   scripts via psql, `-f scripts/campaign-tests/formula2_a_notion_list_functions_let_and_more_date_units.sql`
-- RED before migrations/campaign/formula2_a_notion_list_functions_let_and_more_date_units.sql; GREEN after.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid;
  v_ret uuid; v_del uuid;
  d1 uuid; d2 uuid; d3 uuid;
  v_rec uuid;
  f_col uuid;
  v_j jsonb; v_a jsonb;
  v_fail text[] := '{}';
  v_cases text[][];
  v_unsupported text[][];
  v_text text;
  i integer;
begin
  perform set_config('app.actor_system', 'campaign-test/formula2_a', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Larkspur Creative Studio', 'larkspur-f2-'||substr(v_org::text,1,8), 'LCS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/formula2_a');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Larkspur — Retainers')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_del := custom.table_declare(v_org, jsonb_build_object(
    'name','Deliverables','slug','deliverables_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Deliverable','label_plural','Deliverables','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_del, jsonb_build_object('key','name','label','Name','type','text'));
  perform custom.field_declare(v_org, v_del, jsonb_build_object('key','hours','label','Hours','type','number'));
  perform custom.field_declare(v_org, v_del, jsonb_build_object('key','done','label','Done','type','boolean'));
  v_ret := custom.table_declare(v_org, jsonb_build_object(
    'name','Client retainers','slug','retainers_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Retainer','label_plural','Client retainers','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_ret, jsonb_build_object('key','name','label','Name','type','text'));
  perform custom.field_declare(v_org, v_ret, jsonb_build_object('key','monthly_fee','label','Monthly fee','type','number'));
  perform custom.field_declare(v_org, v_ret, jsonb_build_object('key','signed','label','Signed','type','text'));
  perform custom.field_declare(v_org, v_ret, jsonb_build_object('key','deliverables','label','Deliverables','type','relation',
    'relation_target', v_del, 'multi', true));

  d1 := custom.record_write(v_org, v_del, jsonb_build_object('name','Logo refresh','hours',12,'done',true,'parent_id',v_home::text));
  d2 := custom.record_write(v_org, v_del, jsonb_build_object('name','Brand guide','hours',20,'done',false,'parent_id',v_home::text));
  d3 := custom.record_write(v_org, v_del, jsonb_build_object('name','Social templates','hours',8,'done',true,'parent_id',v_home::text));
  v_rec := custom.record_write(v_org, v_ret, jsonb_build_object('name','Hartwell Dental','monthly_fee',2400,'signed','2026-10-08',
             'deliverables', jsonb_build_array(d1::text, d2::text, d3::text), 'parent_id',v_home::text));

  -- A. accepted as typed, and the live sample answers what Notion answers
  v_cases := array[
    array['prop("Deliverables").filter(current.prop("Done")).length()', '2'],
    array['prop("Deliverables").map(current.prop("Hours")).sum()', '40'],
    array['sum(prop("Deliverables").map(current.prop("Hours")))', '40'],
    array['prop("Deliverables").map(current.prop("Hours")).mean()', '13.3333333333333333'],
    array['prop("Deliverables").map(current.prop("Hours")).median()', '12'],
    array['prop("Deliverables").map(current.prop("Hours")).max()', '20'],
    array['prop("Deliverables").map(current.prop("Name")).join(" | ")', '"Logo refresh | Brand guide | Social templates"'],
    array['prop("Deliverables").join(", ")', '"Logo refresh, Brand guide, Social templates"'],
    array['prop("Deliverables").find(current.prop("Hours") > 15).prop("Name")', '"Brand guide"'],
    array['prop("Deliverables").some(current.prop("Done"))', 'true'],
    array['prop("Deliverables").every(current.prop("Done"))', 'false'],
    array['prop("Deliverables").sort(current1.prop("Hours") - current2.prop("Hours")).first().prop("Name")', '"Social templates"'],
    array['prop("Deliverables").map(current.prop("Hours")).sort().last()', '20'],
    array['prop("Deliverables").map(current.prop("Hours")).unique().length()', '3'],
    array['prop("Deliverables").at(1).prop("Name")', '"Brand guide"'],
    array['prop("Deliverables").last().prop("Name")', '"Social templates"'],
    array['prop("Deliverables").length()', '3'],
    array['length(prop("Deliverables"))', '3'],
    array['prop("Name").length()', '15'],
    array['prop("Deliverables").map(index).join(",")', '"0,1,2"'],
    array['prop("Deliverables").map(current.prop("Name")).reverse().join(",")', '"Social templates,Brand guide,Logo refresh"'],
    array['prop("Deliverables").slice(1).length()', '2'],
    array['prop("Deliverables").map(current.prop("Name")).includes("Logo refresh")', 'true'],
    array['lets(fee, prop("Monthly fee"), n, prop("Deliverables").length(), fee * n)', '7200'],
    array['let(open, prop("Deliverables").filter(!current.prop("Done")), open.length())', '1'],
    array['ifs(prop("Monthly fee") > 5000, "Large", prop("Monthly fee") > 1000, "Mid", "Small")', '"Mid"'],
    array['(prop("Name") + ",b,Hartwell Dental").split(",").unique().join("+")', '"Hartwell Dental+b"'],
    array['prop("Name").split(" ").first().upper()', '"HARTWELL"'],
    array['replace(prop("Name"), "(\\w+) (\\w+)", "$2 $1")', '"Dental Hartwell"'],
    array['replaceAll(prop("Name"), "[aeiou]", "_")', '"H_rtw_ll D_nt_l"'],
    array['test(prop("Name"), "^Hart")', 'true'],
    array['contains(prop("Name"), "Dental")', 'true'],
    array['dateBetween("2027-01-15", prop("Signed"), "months")', '3'],
    array['dateBetween("2028-10-09", prop("Signed"), "years")', '2'],
    array['dateBetween("2026-10-09", prop("Signed"), "weeks")', '0.14285714285714285714'],
    array['dateAdd(prop("Signed"), 3, "months")', '"2027-01-08"'],
    array['dateAdd(prop("Signed"), 36, "hours")', '"2026-10-09T12:00:00.000Z"'],
    array['formatDate(prop("Signed"), "MMM D, YYYY")', '"Oct 8, 2026"'],
    array['prop("Monthly fee") * 2', '4800']];
  for i in 1 .. array_length(v_cases, 1) loop
    begin
      v_j := custom.formula_preview(v_org, v_ret, v_rec, v_cases[i][1]);
      if (v_j ->> 'ok')::boolean is not true then
        v_fail := v_fail || ('A refused ' || v_cases[i][1] || ' — ' || coalesce(v_j ->> 'error', '?'));
      elsif v_j ->> 'error' is not null then
        v_fail := v_fail || ('A could not be worked out ' || v_cases[i][1] || ' — ' || (v_j ->> 'error'));
      elsif v_j -> 'value' is distinct from v_cases[i][2]::jsonb then
        v_fail := v_fail || ('A ' || v_cases[i][1] || ' answered ' || coalesce((v_j -> 'value')::text, 'null') || ', expected ' || v_cases[i][2]);
      end if;
    exception when others then v_fail := v_fail || ('A raised on ' || v_cases[i][1] || ': ' || sqlerrm); end;
  end loop;

  -- B. saved as a formula column, read back
  begin
    f_col := custom.field_declare(v_org, v_ret, jsonb_build_object('key','finished','label','Finished','type','formula',
               'formula_text','prop("Deliverables").filter(current.prop("Done")).length()'));
    perform set_config('role', 'postgres', true);
    select custom.read_record(v_org, v_rec) into v_j;
    perform set_config('role', 'authenticated', true);
    if (v_j::text) !~ '"finished": ?2' then v_fail := v_fail || ('B the saved column did not read 2: ' || left(v_j::text, 400)); end if;
    perform set_config('role', 'postgres', true);
    v_a := custom.formula_parse(v_org, v_ret, 'prop("Deliverables").map(current.prop("Hours")).sum()');
    if custom.formula_compile_sql(v_org, v_a -> 'expr', 'v.values') is not null then
      v_fail := v_fail || 'B a list formula was planned as plain SQL (it must keep the per-row path)';
    end if;
    perform set_config('role', 'authenticated', true);
  exception when others then
    perform set_config('role', 'authenticated', true);
    v_fail := v_fail || ('B the formula column was not saved/read: ' || sqlerrm);
  end;

  -- C. refusals by name
  v_unsupported := array[
    array['prop("Deliverables").reduce(current, acc)', 'reduce'],
    array['flat(prop("Deliverables"))', 'flat'],
    array['sqrt(prop("Monthly fee"))', 'sqrt'],
    array['prop("Monthly fee") ^ 2', 'power']];
  for i in 1 .. array_length(v_unsupported, 1) loop
    begin
      v_j := custom.formula_preview(v_org, v_ret, v_rec, v_unsupported[i][1]);
      if (v_j ->> 'ok')::boolean is not false or coalesce(v_j ->> 'error', '') not like '%' || v_unsupported[i][2] || '%' then
        v_fail := v_fail || ('C ' || v_unsupported[i][1] || ' was not refused by name: ' || v_j::text);
      end if;
    exception when others then v_fail := v_fail || ('C raised on ' || v_unsupported[i][1] || ': ' || sqlerrm); end;
  end loop;
  begin
    v_j := custom.formula_preview(v_org, v_ret, v_rec, 'CURRENT()');
    if coalesce(v_j ->> 'error', '') not like '%CURRENT%' then
      v_fail := v_fail || ('C CURRENT() outside a list did not say so: ' || v_j::text);
    end if;
  exception when others then v_fail := v_fail || ('C raised on CURRENT(): ' || sqlerrm); end;

  -- D. the store's own spelling, unchanged
  begin
    v_j := custom.formula_preview(v_org, v_ret, v_rec, '{Monthly fee} * 2 + LEN({Name})');
    if v_j -> 'value' is distinct from '4815'::jsonb then v_fail := v_fail || ('D the store''s own spelling answered ' || v_j::text); end if;
    v_j := custom.formula_preview(v_org, v_ret, v_rec, 'DATEDIFF("2026-10-08", "2026-10-11", "days")');
    if v_j -> 'value' is distinct from '3'::jsonb then v_fail := v_fail || ('D DATEDIFF days answered ' || v_j::text); end if;
    v_j := custom.formula_preview(v_org, v_ret, v_rec, 'ARRAYJOIN({Deliverables}, " / ")');
    if v_j -> 'value' is distinct from '"Logo refresh / Brand guide / Social templates"'::jsonb then v_fail := v_fail || ('D ARRAYJOIN answered ' || v_j::text); end if;
  exception when others then v_fail := v_fail || ('D raised ' || sqlerrm); end;

  perform set_config('role', 'postgres', true);
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % formula check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — Notion list functions, let/lets, regex replace and the extra date units work in typed, previewed and saved formulas; unknown functions are refused by name.';
end
$t$;

rollback;
