-- NOTION-PROPS-2 (2) — A BUTTON IS A COLUMN: it holds no value and a press opens a link, runs a row action
-- (which sets fields) or runs an automation on that row.
--
-- WHAT IT ASSERTS, from the seat (role authenticated, admin@admin.com owns a fresh disposable org; a sales
-- team's "Leads" table):
--   1  `button` is a published kind (custom.field_kinds) and a declared button reads back as kind button
--   2  Notion's shape — a button with a label only — is declared, and pressing it is refused by name (22023)
--   3  writing a value into a button column is refused (23514)
--   4  open_url: the press answers the link with {{field id}} filled from the row
--   5  run_action: the press runs the row action on this row ("Stage" becomes "Contacted")
--   6  run_automation: the press runs the automation's steps on this row and answers status ran
--   7  regression: the same automation still fires on its own trigger when a row is edited
--   8  a button whose do is not one of the three is refused when declared
--
-- RUN IT (main or clone; ONE transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/notionprops2_b_a_button_is_a_column.sql
-- RED before migrations/campaign/notionprops2_b_a_button_is_a_column.sql; GREEN after.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
create temp table np_fail (m text) on commit drop;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_leads uuid;
  f_name uuid; f_stage uuid; f_next uuid;
  b_site uuid; b_notion uuid; b_contact uuid; b_follow uuid;
  v_lead uuid; v_other uuid;
  v_action uuid; v_auto uuid;
  v_res jsonb; v_j jsonb; v_txt text;
  v_fail text[] := '{}';
begin
  perform set_config('app.actor_system', 'campaign-test/notionprops2_b', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Brightline Solar Sales', 'brightline-np2b-'||substr(v_org::text,1,8), 'BSS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/notionprops2_b');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Brightline — Sales')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_leads := custom.table_declare(v_org, jsonb_build_object(
    'name','Leads','slug','leads_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Lead','label_plural','Leads','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  f_stage := custom.field_declare(v_org, v_leads, jsonb_build_object('key','stage','label','Stage','type','text'));
  f_next  := custom.field_declare(v_org, v_leads, jsonb_build_object('key','next_step','label','Next step','type','text'));
  perform set_config('role', 'postgres', true);
  select f.id into f_name from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_leads::text and f.data ->> 'key' = 'name';
  perform set_config('role', 'authenticated', true);

  v_lead  := custom.record_write(v_org, v_leads, jsonb_build_object('name','Hollis Family Residence','stage','New','parent_id',v_home::text));
  v_other := custom.record_write(v_org, v_leads, jsonb_build_object('name','Marlowe Street Bakery','stage','New','parent_id',v_home::text));

  -- 1 / 4. A link button.
  begin
    if not exists (select 1 from custom.field_kinds() k where k.kind = 'button') then
      v_fail := v_fail || '1a button is not a published kind'::text;
    end if;
    b_site := custom.field_declare(v_org, v_leads, jsonb_build_object('key','look_up','label','Look up', 'type','button',
      'button', jsonb_build_object('do','open_url','url','https://www.google.com/search?q={{' || f_name || '}}')));
    perform set_config('role', 'postgres', true);
    select custom.field_kind_of(f.data) into v_txt from custom.record f where f.id = b_site;
    perform set_config('role', 'authenticated', true);
    if v_txt is distinct from 'button' then v_fail := v_fail || ('1b a declared button reads back as ' || coalesce(v_txt, 'null')); end if;
    v_res := custom.button_press(v_org, v_lead, b_site);
    if v_res ->> 'url' is distinct from 'https://www.google.com/search?q=Hollis%20Family%20Residence' then  -- WALK-FIXES D3: values are encoded
      v_fail := v_fail || ('4 open_url answered ' || coalesce(v_res::text, 'null'));
    end if;
  exception when others then
    perform set_config('role', 'authenticated', true);
    v_fail := v_fail || ('1/4 the link button failed: ' || sqlerrm);
  end;

  -- 2. Notion's shape: label only.
  begin
    b_notion := custom.field_declare(v_org, v_leads, jsonb_build_object('key','send_proposal','label','Send proposal','type','button'));
    begin
      perform custom.button_press(v_org, v_lead, b_notion);
      v_fail := v_fail || '2b a label-only button ran'::text;
    exception when others then
      if sqlstate <> '22023' or sqlerrm not like '%nothing set up%' then
        v_fail := v_fail || ('2b a label-only press was refused with ' || sqlstate || ': ' || sqlerrm);
      end if;
    end;
  exception when others then
    v_fail := v_fail || ('2a a label-only button could not be declared: ' || sqlerrm);
  end;

  -- 3. A button holds no value.
  begin
    perform custom.record_update(v_org, v_lead, jsonb_build_object('send_proposal', 'pressed'));
    v_fail := v_fail || '3 a value was written into a button column'::text;
  exception when others then
    if sqlstate not in ('23514', '22023') then
      v_fail := v_fail || ('3 writing a button was refused with ' || sqlstate || ': ' || sqlerrm);
    end if;
  end;

  -- 5. A row action through a button.
  begin
    v_j := custom.action_declare(v_org, v_leads, jsonb_build_array(jsonb_build_object(
      'name','Mark contacted','kind','update',
      'steps', jsonb_build_array(jsonb_build_object('field', f_stage, 'set', 'value', 'value', 'Contacted')))));
    select (a ->> 'id')::uuid into v_action from jsonb_array_elements(v_j) a where a ->> 'name' = 'Mark contacted';
    b_contact := custom.field_declare(v_org, v_leads, jsonb_build_object('key','contacted','label','Contacted','type','button',
      'button', jsonb_build_object('do','run_action','action_id', v_action)));
    v_res := custom.button_press(v_org, v_lead, b_contact);
    perform set_config('role', 'postgres', true);
    select v.vals ->> 'stage' into v_txt from (select custom.record_values(v_org, v_lead) vals) v;
    perform set_config('role', 'authenticated', true);
    if v_txt is distinct from 'Contacted' then
      v_fail := v_fail || ('5 run_action left Stage as ' || coalesce(v_txt, 'null') || ' — ' || coalesce(v_res::text, 'null'));
    end if;
  exception when others then
    v_fail := v_fail || ('5 the row-action button failed: ' || sqlerrm);
  end;

  -- 6 / 7. An automation through a button, and on its own trigger.
  begin
    v_j := custom.automation_declare(v_org, v_leads, jsonb_build_object(
      'name','Book the site survey','trigger', jsonb_build_object('on','property_edited','field', f_stage, 'to', 'Qualified'),
      'actions', jsonb_build_array(jsonb_build_object('do','set','values', jsonb_build_object(f_next::text, 'Book a site survey')))));
    v_auto := (v_j ->> 'automation_id')::uuid;
    if v_auto is null then raise exception 'automation_declare answered %', v_j; end if;
    b_follow := custom.field_declare(v_org, v_leads, jsonb_build_object('key','book_survey','label','Book survey','type','button',
      'button', jsonb_build_object('do','run_automation','automation_id', v_auto)));
    v_res := custom.button_press(v_org, v_lead, b_follow);
    perform set_config('role', 'postgres', true);
    select v.vals ->> 'next_step' into v_txt from (select custom.record_values(v_org, v_lead) vals) v;
    perform set_config('role', 'authenticated', true);
    if v_txt is distinct from 'Book a site survey' or v_res ->> 'status' is distinct from 'ran' then
      v_fail := v_fail || ('6 run_automation: next step ' || coalesce(v_txt, 'null') || ' — ' || coalesce(v_res::text, 'null'));
    end if;
    perform custom.record_update(v_org, v_other, jsonb_build_object('stage', 'Qualified'));
    perform set_config('role', 'postgres', true);
    select v.vals ->> 'next_step' into v_txt from (select custom.record_values(v_org, v_other) vals) v;
    perform set_config('role', 'authenticated', true);
    if v_txt is distinct from 'Book a site survey' then
      v_fail := v_fail || ('7 the automation did not fire on its own trigger: next step ' || coalesce(v_txt, 'null'));
    end if;
  exception when others then
    v_fail := v_fail || ('6/7 the automation button failed: ' || sqlerrm);
  end;

  -- 8. A do that is not one of the three.
  begin
    perform custom.field_declare(v_org, v_leads, jsonb_build_object('key','dial','label','Dial','type','button',
      'button', jsonb_build_object('do','call_phone')));
    v_fail := v_fail || '8 a button that does "call_phone" was declared'::text;
  exception when others then
    if sqlstate <> '23514' then v_fail := v_fail || ('8 refused with ' || sqlstate || ': ' || sqlerrm); end if;
  end;

  perform set_config('role', 'postgres', true);
  insert into pg_temp.np_fail select unnest(v_fail);
end
$t$;

do $t$
declare v_fail text[];
begin
  perform set_config('role', 'postgres', true);
  select coalesce(array_agg(m), '{}') into v_fail from pg_temp.np_fail;
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % button check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — a button is a column that holds no value; a press opens a filled link, runs a row action or runs an automation; Notion''s label-only button is declared and says it has nothing to do; automations still fire on their own triggers.';
end
$t$;

rollback;
