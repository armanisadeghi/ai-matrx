-- LANE FIX-7B-FIELD — THE GREEN SUITE. On the MAIN database, from the seat `authenticated`,
-- in one transaction that ends in ROLLBACK. Everything it makes — one disposable
-- organization, its home, two tables, their columns and their records — disappears with it.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/fix7b_field_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/fix7b_field_red.sql`, which runs the REAL BYTES of
-- `migrations/inverse/fix7b_field_multi_arm_down.sql` — the pre-fix `custom.field_update` —
-- inside its own rolled-back transaction, and asserts the defect exactly as it was measured.
--
-- WHAT IT IS ABOUT. Two things a person could not do on 2026-09-20 morning:
--
--   1. POINT ONE OF THEIR OWN TABLES AT ANOTHER. The field panel offered sixteen kinds and
--      not one of them was "Points at another record" — only Person and File, which point at
--      the platform's own tables. The STORE had taken it since that morning, so this suite's
--      PART 1 is the declaration the panel now sends, asked of the real door.
--
--   2. TICK "CAN HOLD MORE THAN ONE" ON A COLUMN THAT ALREADY EXISTS. The tick would not go
--      down, the patch never mentioned `multi`, and underneath both sat the door: `multi`
--      appeared in `custom.field_update` exactly once, inside its BEHAVIOUR arm, so a patch
--      carrying `multi` alone was answered with the field id and changed nothing. PART 2 is
--      that patch, sent alone, with the column read back through the door a person has.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED, one per part:
--   1  take `relation` back out of `custom._field_document_for`'s alias arm, or make
--      `custom.field_declare` refuse a caller-named `relation_target` → 1a, 1b.
--   2  take the `multi` arm back out of `custom.field_update`'s SETTINGS branch (that is
--      literally what `migrations/inverse/fix7b_field_multi_arm_down.sql` does) → 2a, 2c.
--   2  take the `relation_max` half of that arm out and leave the `multi` half → 2b, 2d.
--   2  drop the list refusal → 2e.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, in every part, because a door that writes
-- `multi` true onto everything passes a test that only ever ticks the box: 2a's `true` is
-- paired with 2c's `false` and the cap that follows it back down; 2b's two links are paired
-- with 2d's refusal of the second one once the column holds one again; 1a's link is paired
-- with 1c's refusal of a target in nobody's organization.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'fix7b_field_green.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_cust    uuid;
  v_job     uuid;
  v_f_link  uuid;
  v_f_stage uuid;
  v_acme    uuid;
  v_globex  uuid;
  v_rec     uuid;
  v_doc     jsonb;
  v_caught  text;
  v_boss    text := current_user;   -- the connected role, for the fixture steps no door covers
begin
  -- ════════════════════════════════════════════════════════════════════════════
  -- FIXTURES, as the connected role. A seat is a PERSON: an organization, two
  -- memberships, the knob that switches the store on for them, and a Home.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('app.actor_system', 'campaign-test/fix7b_field_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Timberline Roofing',
          'timberline-roofing-' || substr(v_org::text, 1, 8), 'TLR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'fix7b_field_green');
  -- No client door makes a Home record (it has no table), so this one fixture step stays out.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- Two tables of this person's own — a Customer and a Job — both through the door.
  v_cust := custom.table_declare(v_org, jsonb_build_object(
    'name','Customer','slug','customer_fix7b_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Customer','label_plural','Customers','title_field','cname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','cname')),
    'parent_id', v_home::text));
  v_job := custom.table_declare(v_org, jsonb_build_object(
    'name','Job','slug','job_fix7b_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Job','label_plural','Jobs','title_field','jname',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','jname')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('key','cname','label','Name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_job,  jsonb_build_object('key','jname','label','Name','plain','text','sort',10));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — "POINTS AT ANOTHER RECORD", declared exactly as the panel sends it.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 1a. The declaration the seventeenth kind makes: a label, the word `relation`, the Table
  --     the person chose from their own list, and what happens when that record goes.
  v_f_link := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Customer', 'type','relation', 'relation_target', v_cust::text,
    'on_target_delete','set_null', 'multi', false, 'sort', 20));
  v_doc := custom.read_record(v_org, v_f_link, false);
  if (v_doc ->> 'type') <> 'relation' then
    raise exception '1a: the column the panel declared reads back as %, not a relation', v_doc ->> 'type';
  end if;
  if (v_doc ->> 'relation_target')::uuid <> v_cust then
    raise exception '1a: the column points at % and the person chose %', v_doc ->> 'relation_target', v_cust;
  end if;
  if (v_doc ->> 'on_target_delete') <> 'set_null' then
    raise exception '1a: on_target_delete reads back as %, and the panel named set_null', v_doc ->> 'on_target_delete';
  end if;
  -- It carries NO parity type, which is why it is not a fourteenth entry in the store's own
  -- thirteen and why the panel offers it beside the three plain behaviours instead.
  if nullif(v_doc ->> 'parity_type','') is not null then
    raise exception '1a: the link came back carrying parity_type %, so the menu''s own guard would now have a fourteenth type to explain', v_doc ->> 'parity_type';
  end if;

  -- 1b. And it is a LINK, not a text box: a record written through the door holds the
  --     customer's id and the store keeps the edge.
  v_acme   := custom.record_write(v_org, v_cust, jsonb_build_object('cname','Meridian Property Group'));
  v_globex := custom.record_write(v_org, v_cust, jsonb_build_object('cname','Fairview Estates'));
  v_rec    := custom.record_write(v_org, v_job,  jsonb_build_object('jname','Re-roof', 'customer', v_acme::text));
  if (custom.read_record(v_org, v_rec, false) ->> 'jname') <> 'Re-roof' then
    raise exception '1b: the job did not read back';
  end if;
  if not (custom.read_record(v_org, v_rec, false) ->> 'customer') like '%' || substr(v_acme::text,1,8) || '%' then
    raise exception '1b: the job reads back customer = %, and it was pointed at %',
      custom.read_record(v_org, v_rec, false) ->> 'customer', v_acme;
  end if;

  -- 1c. THE OTHER SIDE OF 1a: a target that is not a Table of this organization is REFUSED,
  --     which is exactly why the panel offers the store's own list and never a typed id.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_job, jsonb_build_object(
      'label','Nowhere', 'type','relation', 'relation_target', gen_random_uuid()::text));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '1c: the store took a relation pointing at a table that does not exist in this organization';
  end if;
  raise notice 'PART 1 PASSED — a person''s own table points at another of their own tables (1a, 1b), and a target they do not hold is refused (1c): %', left(v_caught, 90);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — "CAN HOLD MORE THAN ONE", ON A COLUMN THAT ALREADY EXISTS, patched ALONE.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 2a. THE ONE CLAUSE THIS LANE EXISTS FOR. Nothing in this patch but `multi`.
  perform custom.field_update(v_org, v_f_link, jsonb_build_object('multi', true));
  v_doc := custom.read_record(v_org, v_f_link, false);
  if not coalesce((v_doc ->> 'multi')::boolean, false) then
    raise exception '2a: custom.field_update answered "saved" for {"multi": true} and the column still holds one — the door is silently failing';
  end if;
  -- And it is still the same column: a settings patch must never retype anything.
  if (v_doc ->> 'type') <> 'relation' or (v_doc ->> 'relation_target')::uuid <> v_cust then
    raise exception '2a: the multi patch changed what the column IS — type % target %',
      v_doc ->> 'type', v_doc ->> 'relation_target';
  end if;

  -- 2b. AND THE TICK IS NOT DECORATION EITHER. A relation's cardinality lives in TWO keys:
  --     `custom.validate_values` counts the links against `relation_max`, so `multi` true
  --     beside `relation_max` 1 would be a box that goes down and a column that still
  --     refuses the second record. The proof is a record holding both customers.
  if coalesce((v_doc ->> 'relation_max')::integer, 0) < 2 then
    raise exception '2b: the column says it holds more than one and its cap is %', v_doc ->> 'relation_max';
  end if;
  v_rec := custom.record_write(v_org, v_job, jsonb_build_object(
    'jname','Two customers', 'customer', jsonb_build_array(v_acme::text, v_globex::text)));
  if v_rec is null then
    raise exception '2b: a record naming two customers was not written';
  end if;

  -- 2c. THE SECOND INPUT, WITH THE OTHER ANSWER. Off again, alone again — a door that simply
  --     wrote `true` over everything would pass 2a and fail here.
  perform custom.field_update(v_org, v_f_link, jsonb_build_object('multi', false));
  v_doc := custom.read_record(v_org, v_f_link, false);
  if coalesce((v_doc ->> 'multi')::boolean, true) then
    raise exception '2c: the column was told to hold one again and reads back multi = %', v_doc ->> 'multi';
  end if;
  if coalesce((v_doc ->> 'relation_max')::integer, 0) <> 1 then
    raise exception '2c: the column holds one again and its cap stayed at %', v_doc ->> 'relation_max';
  end if;

  -- 2d. …and the store REFUSES a second link now, which is what "holds one" means.
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_job, jsonb_build_object(
      'jname','Two again', 'customer', jsonb_build_array(v_acme::text, v_globex::text)));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '2d: the column holds one and the store took two links anyway';
  end if;

  -- 2e. A LIST IS REFUSED BY NAME, NOT SILENTLY WRITTEN. For a choice list "one answer or
  --     several" IS the behaviour, so the settings arm sends the caller to the behaviour word
  --     rather than leaving a document at odds with its own parity type.
  v_f_stage := custom.field_declare(v_org, v_job, jsonb_build_object(
    'label','Stage', 'parity_type','select', 'sort', 30,
    'options', jsonb_build_array('Quoted','Booked','Done')));
  v_caught := null;
  begin
    perform custom.field_update(v_org, v_f_stage, jsonb_build_object('multi', true));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '2e: the door wrote multi onto a choice list, whose multi is decided by its parity type — the document is now at odds with itself';
  end if;
  -- …and the behaviour word it names DOES work, so 2e is a signpost and not a dead end.
  perform custom.field_update(v_org, v_f_stage, jsonb_build_object('parity_type','multi_select'));
  if not coalesce((custom.read_record(v_org, v_f_stage, false) ->> 'multi')::boolean, false) then
    raise exception '2e: the door refused `multi` on a list and named `multi_select`, and `multi_select` did not do it either';
  end if;
  raise notice 'PART 2 PASSED — {"multi": true} alone changes the column (2a), the cap follows it and a record holds two (2b), {"multi": false} alone puts both back and the second link is refused (2c, 2d), and a choice list is refused by name with the word that works (2e): %', left(v_caught, 90);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE WALLS ARE STILL THERE. As test@test.com, a member shared nothing.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 3a. She cannot change the shape of a table she is not an admin of.
  v_caught := null;
  begin
    perform custom.field_update(v_org, v_f_link, jsonb_build_object('multi', true));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '3a: test@test.com ticked "can hold more than one" on a table she is not an admin of';
  end if;

  -- 3b. Nor declare a link out of it.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_job, jsonb_build_object(
      'label','Sneaked in','type','relation','relation_target', v_cust::text));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '3b: test@test.com added a column to a table she is not an admin of';
  end if;

  -- 3c. THE CONTROL, so 3a and 3b are not a door that refuses her everything: the record she
  --     IS given, she reads.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_acme, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_acme, false) ->> 'cname') <> 'Meridian Property Group' then
    raise exception '3c: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'PART 3 PASSED — the walls hold for a member (3a, 3b) and the one thing she was given reads back (3c).';

  raise notice 'fix7b_field_green: ALL PARTS PASSED (relation 1a-1c, multi 2a-2e, access 3a-3c) — every clause from the seat `authenticated`, through the doors a signed-in person reaches.';
end $t$;

rollback;
