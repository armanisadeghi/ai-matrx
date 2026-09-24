-- LANE S4 — THE WALK'S DATA, on the DEV CLONE only. It COMMITS (the headless walk reads it).
-- Harbor Point Plumbing & Drain (860144a7-…, admin@admin.com owner, test@test.com member) gets:
--   · "Dispatch board — week of Sep 28": New → Scheduled → On site → Done, Scheduled requires a
--     service address; six weekend calls in New (Kowalski has no address); shared to test@test.com
--     as Editor.
--   · "Technician expenses — week of Sep 21": eight expenses, seven filed by the owner and
--     addressed to test@test.com, one (her mileage) filed by her and addressed to the owner.
-- Every business, person, street and amount is synthesized. Run once per walk; it refuses to run
-- anywhere but the clone. Archive the two tables afterwards (never destroy).
\set ON_ERROR_STOP on
\set suite 'uichamp_s4_walk_seed.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
-- `-v seed_expenses=off` makes a fresh board only (a re-walk keeps the expenses it has not decided).
\if :{?seed_expenses}
\else
\set seed_expenses on
\endif
select set_config('s4.seed_expenses', :'seed_expenses', false);

begin;
do $t$
declare
  c_org     constant uuid := '860144a7-efe9-4123-b7fa-28256e02e76e';
  c_home    constant uuid := '4bf97517-71ff-44b1-9d0d-f3200a5e379f';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_disp_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_disp    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_sfx     text := to_char(now() at time zone 'America/Los_Angeles', 'HH24MI');
  v_board   uuid;
  v_exp     uuid;
  v_id      uuid;
  v_doc     jsonb;
begin
  perform set_config('app.actor_system', 'campaign-walk/uichamp_s4', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_board := custom.table_declare(c_org, jsonb_build_object(
    'name','Dispatch board — week of Sep 28','slug','dispatch_sep28_' || v_sfx,'type','entity',
    'label_singular','Service call','label_plural','Service calls','title_field','customer','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','customer'), jsonb_build_object('name','problem'),
                                jsonb_build_object('name','service_address')),
    'parent_id', c_home::text));
  perform custom.field_declare(c_org, v_board, jsonb_build_object('key','customer','label','Customer','plain','text','sort',10));
  perform custom.field_declare(c_org, v_board, jsonb_build_object('key','problem','label','Problem','plain','text','sort',20));
  perform custom.field_declare(c_org, v_board, jsonb_build_object('key','service_address','label','Service address','plain','text','sort',30));
  perform custom.pipeline_declare(c_org, v_board, jsonb_build_object(
    'stage_field', jsonb_build_object('key','call_stage','label','Stage','options', jsonb_build_array('New','Scheduled','On site','Done')),
    'transitions', jsonb_build_array(jsonb_build_object('from','New','to','Scheduled'),
       jsonb_build_object('from','Scheduled','to','On site'), jsonb_build_object('from','On site','to','Done')),
    'requires', jsonb_build_object('Scheduled', jsonb_build_array('service_address'))));
  for v_doc in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('customer','Delgado residence','problem','Kitchen sink backing up into the dishwasher','service_address','418 Pacific Crest Dr, Oceanside'),
      jsonb_build_object('customer','Seaside Laundromat','problem','Floor drain overflowing by machine 7','service_address','2210 Mission Ave, Oceanside'),
      jsonb_build_object('customer','Nguyen residence','problem','No hot water upstairs','service_address','77 Lemon Grove Ln, Vista'),
      jsonb_build_object('customer','Kowalski residence','problem','Water heater leaking in the garage (called in, no address yet)'),
      jsonb_build_object('customer','Harborview Bistro','problem','Grease trap alarm','service_address','15 Harbor Dr S, Oceanside'),
      jsonb_build_object('customer','Ramirez duplex','problem','Main line camera inspection before closing','service_address','903 S Tremont St, Oceanside'))) loop
    perform custom.record_write(c_org, v_board, v_doc || jsonb_build_object('call_stage','New'));
  end loop;
  perform custom.share_grant(c_org, v_board, 'person', c_disp, 'editor'::public.permission_level);

  if current_setting('s4.seed_expenses') <> 'on' then
    raise notice 'WALK SEED board=% (expenses not seeded)', v_board;
    return;
  end if;
  v_exp := custom.table_declare(c_org, jsonb_build_object(
    'name','Technician expenses — week of Sep 21','slug','tech_expenses_sep21_' || v_sfx,'type','entity',
    'label_singular','Expense','label_plural','Expenses','title_field','item','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','item'), jsonb_build_object('name','technician'),
                                jsonb_build_object('name','amount'), jsonb_build_object('name','status')),
    'parent_id', c_home::text));
  perform custom.field_declare(c_org, v_exp, jsonb_build_object('key','item','label','Item','plain','text','sort',10));
  perform custom.field_declare(c_org, v_exp, jsonb_build_object('key','technician','label','Technician','plain','text','sort',20));
  perform custom.field_declare(c_org, v_exp, jsonb_build_object('key','amount','label','Amount','plain','number','sort',30));
  perform custom.field_declare(c_org, v_exp, jsonb_build_object('key','status','label','Status','plain','text','sort',40));
  perform custom.share_grant(c_org, v_exp, 'person', c_disp, 'editor'::public.permission_level);
  for v_doc in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('item','Ferguson — 3/4" PEX and fittings, Delgado job','technician','Luis Ortega','amount',86.40),
      jsonb_build_object('item','Drain camera rental, one day','technician','Priya Raman','amount',145.00),
      jsonb_build_object('item','Palomar transfer station dump fee','technician','Luis Ortega','amount',62.00),
      jsonb_build_object('item','Water heater expansion tank, Nguyen job','technician','Sam Whitaker','amount',71.25),
      jsonb_build_object('item','Van 3 fuel, Tuesday','technician','Priya Raman','amount',94.18),
      jsonb_build_object('item','Grease trap gasket kit','technician','Sam Whitaker','amount',38.99),
      jsonb_build_object('item','Team lunch at Harbor Fish & Chips','technician','Luis Ortega','amount',112.60))) loop
    v_id := custom.record_write(c_org, v_exp, v_doc || jsonb_build_object('status','Submitted'));
    perform custom.work_approval_request(c_org, v_id,
      jsonb_build_object('kind','record_patch','patch', jsonb_build_object('status','Approved')),
      format('%s — $%s', v_doc ->> 'technician', v_doc ->> 'amount'), c_disp, 'person', null);
  end loop;
  perform set_config('request.jwt.claims', c_disp_j, true);
  v_id := custom.record_write(c_org, v_exp, jsonb_build_object(
    'item','Mileage to the Ramirez closing inspection','technician','Office','amount',23.45,'status','Submitted'));
  perform custom.work_approval_request(c_org, v_id,
    jsonb_build_object('kind','record_patch','patch', jsonb_build_object('status','Approved')),
    'My mileage — $23.45', c_admin, 'person', null);
  raise notice 'WALK SEED board=% expenses=%', v_board, v_exp;
end
$t$;
commit;
