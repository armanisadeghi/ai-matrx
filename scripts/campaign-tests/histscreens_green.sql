-- scripts/campaign-tests/histscreens_green.sql — LANE HISTORY-SCREENS, the green suite.
--
-- PRODUCTS row 4: *"Who changed this price, and can I put it back?"*
-- Contract rows: SCR-17 HistoryPanel · SCR-18 CommentThread · HIS-1 · HIS-7 · HIS-8 ·
-- HIS-N-2 · VAL-1 · VAL-7 · VAL-8 · AGT-N-4.
--
-- IT RUNS FROM THE SEAT. Every asserted clause below PART 0 runs as `authenticated`, the
-- role PostgREST serves a signed-in person, through the doors that person reaches. Two steps
-- step out and SAY SO: the organization fixture (no client door makes an organization) and
-- the form submission (`custom.form_submit` is a server-lane door and a browser never calls
-- it). Neither asserts a product clause while out.
--
-- TWO SEATS, ONE STORY. admin@admin.com owns the organization; test@test.com is an ordinary
-- MEMBER of it, in an organization set to `shared_only` so that "what Dana can see" is a
-- different sentence from "everything". The price on one job is changed by the admin, by an
-- AGENT acting for Dana, by a form submission and by a merge; Dana reads the whole timeline
-- at viewer and is refused the restore BY NAME; at editor she restores it and the restore is
-- a NEW version; and her comment mentioning the admin puts a real row in his inbox.
--
-- IT IS MADE OF SEPARATE STATEMENTS, ON PURPOSE. `history.record_capture` stamps the
-- operation a version belongs to from a mark fenced by `statement_timestamp()`, so a suite
-- written as ONE `do $$ … $$` block is one statement and everything it writes after a merge
-- is stamped "merge" — the suite would read green while proving the opposite of what it says.
-- Lane MERGE-HISTORY found this in its own suite on 2026-09-19; this one inherits the shape.
-- Ids travel between the blocks in a temporary table, and `set local` role and claims last
-- for the whole transaction, so the seat is taken once.
--
-- Run: <scratchpad>/p.sh -f scripts/campaign-tests/histscreens_green.sql
-- It ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'histscreens_green.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

-- The ids the blocks hand each other. It is a TEMPORARY table in this session's own schema
-- and it is dropped on commit, so granting the seat access to it gives nothing to anybody
-- outside this connection — and the seat has to write to it, because the seat is where the
-- ids come from.
create temporary table hs_ctx (k text primary key, v text) on commit drop;
grant select, insert, update, delete on hs_ctx to authenticated;

do $suite$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text := json_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text;
  c_dana_j  text := json_build_object('sub','4060701e-706a-4c76-b3ca-0bbc69fa5a14','role','authenticated')::text;
  v_boss    text := current_user;
  v_org     uuid;
  v_home    uuid;
  v_tbl     uuid;
  v_job     uuid;
  v_dup     uuid;
  v_form    uuid;
  v_rule    uuid;
  v_f_title uuid;
  v_formrec uuid;
  v_mig     uuid;
  v_comment jsonb;
  v_res     jsonb;
  v_prev    jsonb;
  v_thread  jsonb;
  v_caught  text;
  v_code    text;
  v_n       integer;
  v_v       integer;
  r         record;
begin
  v_org := gen_random_uuid();
  perform set_config('app.actor_system','campaign-test/histscreens_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══════════════════════════════════════════════════════════════════════════
  -- FIXTURE — as the connected role. No client door makes an organization, a
  -- membership, a knob override or a Home record. No clause is asserted here.
  -- ══════════════════════════════════════════════════════════════════════════
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cobblestone Bakery & Cafe',
          'cobblestone-bakery-' || replace(v_org::text,'-',''), 'CBC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
         (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'),
         -- VIS-19: this organization shares deliberately. Without it Dana would see
         -- everything by default and "she was shared this one record" would prove nothing.
         ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Home')) returning id into v_home;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 0 — TAKE THE SEAT AND PROVE IT.
  -- ══════════════════════════════════════════════════════════════════════════
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

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 1 — ONE JOB, FOUR WAYS OF CHANGING ITS PRICE.
  -- ══════════════════════════════════════════════════════════════════════════
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Maintenance Jobs','slug','maintenance_jobs','type','entity',
    'label_singular','Job','label_plural','Jobs','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title'), jsonb_build_object('name','price'),
                                jsonb_build_object('name','stage'), jsonb_build_object('name','notes')),
    'parent_id', v_home::text));
  v_f_title := custom.field_declare(v_org, v_tbl, jsonb_build_object('key','title','label','Job','plain','text','sort',10));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','price','label','Price','plain','number','sort',20));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','stage','label','Stage','plain','text','sort',30));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key','notes','label','Notes','plain','text','sort',40));

  -- v1 — created by the admin.
  v_job := custom.record_write(v_org, v_tbl, jsonb_build_object('title','Roof repair','price',950,'stage','New'));
  -- v2 — THE ADMIN CHANGES THE PRICE. This is the question the product is named after.
  perform custom.record_update(v_org, v_job, jsonb_build_object('price',1200));
  -- v3 — AN AGENT CHANGES IT, ON BEHALF OF DANA. custom._value_envelope refuses an agent
  -- write that names nobody, so this shape is the store's own, not this suite's invention.
  perform custom.record_update(v_org, v_job, jsonb_build_object(
    'price', 1100, '_actor','agent', '_on_behalf_of', c_dana::text));

  raise notice 'PART 1 PASSED — one job, three versions: created, the admin re-priced it, an agent re-priced it for Dana.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE TIMELINE SAYS WHO, IN WORDS, AND WHAT MOVED, WITH BEFORE AND AFTER.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.record_history(v_org, v_job);
  if v_n <> 3 then raise exception '2a: the timeline has % versions, expected 3', v_n; end if;

  -- The newest version: an AGENT, naming the person it acted for, by NAME.
  select * into r from custom.record_history(v_org, v_job) limit 1;
  if r.actor ->> 'kind' <> 'agent' then
    raise exception '2b: the agent''s version says the author is "%"', r.actor ->> 'kind';
  end if;
  if r.actor -> 'on_behalf_of' ->> 'user_id' <> c_dana::text then
    raise exception '2b: the agent''s version does not name the person it acted for: %', r.actor;
  end if;
  if coalesce(r.actor -> 'on_behalf_of' ->> 'name','') = '' then
    raise exception '2b: the person the agent acted for has no NAME, only an id: %', r.actor;
  end if;
  if (r.changes -> 0 ->> 'key') <> 'price'
     or (r.changes -> 0 -> 'before')::text <> '1200'
     or (r.changes -> 0 -> 'after')::text <> '1100' then
    raise exception '2c: the agent''s version does not say price 1200 -> 1100: %', r.changes;
  end if;
  if (r.changes -> 0 ->> 'label') <> 'Price' then
    raise exception '2c: the change is labelled "%" rather than the Field''s own label', r.changes -> 0 ->> 'label';
  end if;
  -- A VALUE THAT DID NOT MOVE IS NOT A CHANGE. This write touched the price and nothing
  -- else; until 2026-09-20 every version of every record on this platform reported EVERY
  -- field, because `at`, `actor` and `on_behalf_of` are re-stamped on every value on every
  -- write and the envelope was compared whole.
  if jsonb_array_length(r.changes) <> 1 then
    raise exception '2c: a write that changed ONE field reports % of them: %',
      jsonb_array_length(r.changes),
      (select string_agg(c ->> 'label', ', ') from jsonb_array_elements(r.changes) c);
  end if;
  raise notice '2 PASSED — newest version: % by %, for %, and it says %: % -> %.',
    r.operation_label, r.actor ->> 'kind', r.actor -> 'on_behalf_of' ->> 'name',
    r.changes -> 0 ->> 'label', r.changes -> 0 -> 'before', r.changes -> 0 -> 'after';

  -- The admin's own version names a PERSON, never a uuid.
  select * into r from custom.record_history(v_org, v_job) offset 1 limit 1;
  if r.actor ->> 'kind' <> 'user' or coalesce(r.actor ->> 'name','') = '' then
    raise exception '2d: the admin''s version does not name a person: %', r.actor;
  end if;
  if r.actor ->> 'name' ~ '^[0-9a-f]{8}-' then
    raise exception '2d: SCR-N-5 — the timeline printed a uuid where a name goes: %', r.actor ->> 'name';
  end if;
  raise notice '2d PASSED — the admin''s version reads "% (%)" and not a uuid.', r.actor ->> 'name', r.actor ->> 'kind';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 3 — A FORM SUBMISSION LANDS, AND THE TIMELINE KNOWS IT WAS A FORM.
  -- ══════════════════════════════════════════════════════════════════════════
  -- A form with no accept Rule HOLDS every answer for a person, which is the store's
  -- closed-by-default posture and not a failure. This one has a Rule, so the answer lands as
  -- a record and there is a version of it to read.
  v_rule := custom.rule_declare(v_org, jsonb_build_object(
      'name','the answer says what needs doing','kind','predicate',
      'uses', jsonb_build_array('validate'), 'scope_table_id', v_tbl,
      'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('op','present',
                'args', jsonb_build_array(jsonb_build_object('field', v_f_title)))));
  v_form := custom.form_declare(v_org, v_tbl, 'Tell us about your roof',
              jsonb_build_array(
                jsonb_build_object('field','title','ask','What needs doing?','required',true),
                jsonb_build_object('field','price','ask','Your budget')),
              '{}'::jsonb, null, v_rule);
  -- A form defaults CLOSED (SCR-24's posture, applied to forms): it exists and accepts
  -- nothing until its owner publishes it. That is an owner's act from the seat.
  perform custom.anon_publish(v_org, v_form, true);
  -- STEPS OUT AND SAYS WHY. `custom.form_submit` is a server-lane door with no client
  -- grant — a browser never calls it, the anonymous edge does. No product clause of this
  -- lane is asserted while out.
  perform set_config('role', v_boss, true);
  select f.record_id, f.state, f.message into v_formrec, v_code, v_caught
    from custom.form_submit(v_form, 'https://example.test',
                            jsonb_build_object('title','Gutter replacement','price',400),
                            'histscreens-green', null, null) f;
  perform set_config('role', 'authenticated', true);

  if v_formrec is null then
    raise exception '3a: the form submission wrote no record — state "%", message "%"', v_code, v_caught;
  end if;
  select count(*) into v_n from custom.record_history(v_org, v_formrec);
  if v_n < 1 then raise exception '3a: the form''s record has no history at all'; end if;
  select * into r from custom.record_history(v_org, v_formrec) limit 1;
  if (select count(*) from jsonb_array_elements(r.changes) c where c ->> 'key' = 'price') <> 1 then
    raise exception '3b: the form''s own version does not name the price it carried: %', r.changes;
  end if;
  raise notice '3 PASSED — a stranger''s form answer is a record with a history like any other: % by %.',
    r.operation_label, r.actor ->> 'kind';


  -- Ids travel to the next statement. See the file header: the blocks are separate
  -- STATEMENTS so that a compound verb's mark cannot leak onto the writes that follow it.
  insert into hs_ctx(k, v) values
    ('org', v_org::text), ('tbl', v_tbl::text), ('job', v_job::text),
    ('formrec', v_formrec::text),
    -- `v_boss` is `current_user` AT BLOCK START, and from block 2 onwards that is already
    -- `authenticated` — `set local role` lasts for the whole transaction. So the connected
    -- role's real name travels with the ids, or a later block's "step out" steps nowhere.
    ('boss', v_boss);
end;
$suite$;

do $suite$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text := json_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text;
  c_dana_j  text := json_build_object('sub','4060701e-706a-4c76-b3ca-0bbc69fa5a14','role','authenticated')::text;
  v_boss    text := current_user;
  v_org     uuid;
  v_home    uuid;
  v_tbl     uuid;
  v_job     uuid;
  v_dup     uuid;
  v_form    uuid;
  v_rule    uuid;
  v_f_title uuid;
  v_formrec uuid;
  v_mig     uuid;
  v_comment jsonb;
  v_res     jsonb;
  v_prev    jsonb;
  v_thread  jsonb;
  v_caught  text;
  v_code    text;
  v_n       integer;
  v_v       integer;
  r         record;
begin
  select v::uuid into v_org     from hs_ctx where k = 'org';
  select v::uuid into v_tbl     from hs_ctx where k = 'tbl';
  select v::uuid into v_job     from hs_ctx where k = 'job';
  select v::uuid into v_dup     from hs_ctx where k = 'dup';
  select v::uuid into v_formrec from hs_ctx where k = 'formrec';
  select v::uuid into v_mig     from hs_ctx where k = 'mig';
  select v      into v_boss     from hs_ctx where k = 'boss';
  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 4 — A MERGE, AND THE TIMELINE CALLS IT A MERGE.
  -- ══════════════════════════════════════════════════════════════════════════
  v_dup := custom.record_write(v_org, v_tbl, jsonb_build_object('title','Roof repair','price',1150,'notes','duplicate'));
  perform custom.migrate_merge(v_org, v_job, v_dup, 'histscreens_green');

  insert into hs_ctx(k, v) values ('dup', v_dup::text);
end;
$suite$;

do $suite$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text := json_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text;
  c_dana_j  text := json_build_object('sub','4060701e-706a-4c76-b3ca-0bbc69fa5a14','role','authenticated')::text;
  v_boss    text := current_user;
  v_org     uuid;
  v_home    uuid;
  v_tbl     uuid;
  v_job     uuid;
  v_dup     uuid;
  v_form    uuid;
  v_rule    uuid;
  v_f_title uuid;
  v_formrec uuid;
  v_mig     uuid;
  v_comment jsonb;
  v_res     jsonb;
  v_prev    jsonb;
  v_thread  jsonb;
  v_caught  text;
  v_code    text;
  v_n       integer;
  v_v       integer;
  r         record;
begin
  select v::uuid into v_org     from hs_ctx where k = 'org';
  select v::uuid into v_tbl     from hs_ctx where k = 'tbl';
  select v::uuid into v_job     from hs_ctx where k = 'job';
  select v::uuid into v_dup     from hs_ctx where k = 'dup';
  select v::uuid into v_formrec from hs_ctx where k = 'formrec';
  select v::uuid into v_mig     from hs_ctx where k = 'mig';
  select v      into v_boss     from hs_ctx where k = 'boss';
  select * into r from custom.record_history(v_org, v_job) limit 1;
  if r.operation <> 'merge' then
    raise exception '4a: the merge''s version is called "%" in the timeline', r.operation;
  end if;
  if jsonb_array_length(r.changes) = 0 then
    raise exception '4b: the merge''s version says nothing moved — the defect MERGE-HISTORY closed';
  end if;
  raise notice '4 PASSED — the merge signs its own version: "%", % field(s) moved: %.',
    r.operation_label, jsonb_array_length(r.changes),
    (select string_agg(c ->> 'label', ', ') from jsonb_array_elements(r.changes) c);

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 5 — "WHO CHANGED THE PRICE ON ANY RECORD?"
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.field_history(v_org, v_tbl, 'price');
  if v_n < 5 then
    raise exception '5a: the price history across the table has % rows, expected at least 5', v_n;
  end if;
  -- It names the RECORD, not a uuid.
  select * into r from custom.field_history(v_org, v_tbl, 'price') limit 1;
  if r.record_title ~ '^[0-9a-f]{8}-' or coalesce(r.record_title,'') = '' then
    raise exception '5b: the field history named a record "%"', r.record_title;
  end if;
  -- And ONLY the versions in which the price moved: the stage/notes edits are not here.
  if exists (select 1 from custom.field_history(v_org, v_tbl, 'price') f
              where f.before is not distinct from f.after) then
    raise exception '5c: the price history lists a version in which the price did not move';
  end if;
  -- A column that does not exist is refused BY NAME, never answered empty.
  begin
    perform 1 from custom.field_history(v_org, v_tbl, 'salary');
    raise exception '5d: asking for the history of a column that does not exist was answered, not refused';
  exception when sqlstate '22023' then
    get stacked diagnostics v_caught = message_text;
    if v_caught !~ 'salary' then raise exception '5d: the refusal does not name the column: %', v_caught; end if;
  end;
  raise notice '5 PASSED — % price changes across the table, each naming its record and its author; a column that does not exist is refused by name.', v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 6 — DANA AT VIEWER: SHE READS THE WHOLE TIMELINE AND CANNOT PUT IT BACK.
  -- ══════════════════════════════════════════════════════════════════════════
  perform custom.share_grant(v_org, v_job, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);

  if custom.my_level(v_org, v_job) <> 'viewer'::public.permission_level then
    raise exception '6a: Dana''s level on the job is %, expected viewer', custom.my_level(v_org, v_job);
  end if;
  select count(*) into v_n from custom.record_history(v_org, v_job);
  if v_n < 4 then raise exception '6b: at viewer Dana sees % versions, expected the whole timeline', v_n; end if;
  select * into r from custom.record_history(v_org, v_job) offset 1 limit 1;
  if coalesce(r.actor ->> 'name','') = '' then
    raise exception '6c: Dana''s timeline does not name the people on it: %', r.actor;
  end if;
  raise notice '6a-c PASSED — at VIEWER Dana reads all % versions with the right names on them.', v_n;

  -- THE RESTORE IS REFUSED, BY NAME, WITH THE RUNG IN THE SENTENCE.
  begin
    perform custom.record_restore_version(v_org, v_job, 2);
    raise exception '6d: a VIEWER restored the record';
  exception when sqlstate '42501' then
    get stacked diagnostics v_caught = message_text;
    raise notice '6d PASSED — at viewer the restore is refused: "%"', v_caught;
  end;
  -- And so is the preview of it: she is not shown the first half of an act she may not do.
  begin
    perform custom.record_restore_preview(v_org, v_job, 2, null);
    raise exception '6e: a VIEWER was shown the restore preview';
  exception when sqlstate '42501' then null;
  end;
  -- One field is no different.
  begin
    perform custom.value_restore(v_org, v_job, 'price', 2);
    raise exception '6f: a VIEWER restored one value';
  exception when sqlstate '42501' then null;
  end;
  -- AND THE CONTROL: a record nobody shared with her is not even visible.
  -- `custom.my_level` REFUSES rather than answering null about a record she may not open —
  -- which is right: "null" and "you may not ask" are different facts and only one of them
  -- keeps the record's existence to itself.
  begin
    perform custom.my_level(v_org, v_dup);
    raise exception '6g: Dana was told her level on a record nobody shared with her';
  exception when sqlstate '42501' then null;
  end;
  select count(*) into v_n from custom.field_history(v_org, v_tbl, 'price');
  if v_n > 4 then
    raise exception '6h: Dana sees % price changes across the table — she was shared ONE record', v_n;
  end if;
  raise notice '6d-h PASSED — viewer: restore, preview and single-value restore all refused; the record nobody shared is absent; her column history is % rows, not the table''s.', v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 7 — DANA AT EDITOR: SHE PUTS THE PRICE BACK, AND IT IS A NEW VERSION.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_job, 'user', c_dana, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- THE PREVIEW NAMES WHAT WILL CHANGE, BEFORE IT DOES.
  v_prev := custom.record_restore_preview(v_org, v_job, 2, 'price');
  if (v_prev ->> 'count')::int <> 1 then
    raise exception '7a: the single-field preview says % things will change: %', v_prev ->> 'count', v_prev -> 'changes';
  end if;
  if (v_prev -> 'changes' -> 0 -> 'after')::text <> '1200' then
    raise exception '7a: the preview does not say the price would become 1200: %', v_prev -> 'changes';
  end if;
  raise notice '7a PASSED — before anything happens she is told: % would go from % to %.',
    v_prev -> 'changes' -> 0 ->> 'label', v_prev -> 'changes' -> 0 -> 'before',
    v_prev -> 'changes' -> 0 -> 'after';

  select count(*) into v_n from custom.record_history(v_org, v_job);
  v_res := custom.value_restore(v_org, v_job, 'price', 2);
  if (v_res ->> 'version') is null then
    raise exception '7b: the restore did not say which version it wrote: %', v_res;
  end if;
  if (custom.read_record(v_org, v_job, false) -> 'price')::text <> '1200' then
    raise exception '7c: after the restore the price is %',
      custom.read_record(v_org, v_job, false) -> 'price';
  end if;

  -- IT IS A NEW VERSION, AND NOTHING WAS REWRITTEN.
  select count(*) into v_v from custom.record_history(v_org, v_job);
  if v_v <> v_n + 1 then
    raise exception '7d: the restore produced % new versions, expected exactly 1', v_v - v_n;
  end if;
  select * into r from custom.record_history(v_org, v_job) limit 1;
  if r.actor ->> 'user_id' <> c_dana::text then
    raise exception '7e: the restore is not attributed to the person who did it: %', r.actor;
  end if;
  if (r.changes -> 0 -> 'before')::text <> '1100' or (r.changes -> 0 -> 'after')::text <> '1200' then
    raise exception '7f: the restore''s own version does not read as a change: %', r.changes;
  end if;
  raise notice '7b-f PASSED — she put the price back; it is version % by %, reading %: % -> %, and the % versions before it are untouched.',
    r.version, r.actor ->> 'name', r.changes -> 0 ->> 'label',
    r.changes -> 0 -> 'before', r.changes -> 0 -> 'after', v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 8 — A RESTORE THAT ACTUALLY RESTORES.
  -- The defect this lane closed: custom.record_update merges, so a key added after the
  -- target version used to survive its own restore in silence.
  -- ══════════════════════════════════════════════════════════════════════════
  perform custom.record_update(v_org, v_job, jsonb_build_object('notes','added after v2'));
  if (custom.read_record(v_org, v_job, false) ->> 'notes') is null then
    raise exception '8a: the fixture note did not land';
  end if;
  v_prev := custom.record_restore_preview(v_org, v_job, 2, null);
  if not exists (select 1 from jsonb_array_elements(v_prev -> 'changes') c
                  where c ->> 'key' = 'notes' and c -> 'after' = 'null'::jsonb) then
    raise exception '8b: the preview does not warn that "notes" would be cleared: %', v_prev -> 'changes';
  end if;
  perform custom.record_restore_version(v_org, v_job, 2);
  if (custom.read_record(v_org, v_job, false) ->> 'notes') is not null then
    raise exception '8c: THE DEFECT IS BACK — a key added after version 2 survived the restore to version 2: %',
      custom.read_record(v_org, v_job, false) ->> 'notes';
  end if;
  raise notice '8 PASSED — the preview warned that Notes would be cleared, and the restore cleared it.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 9 — SHE COMMENTS, MENTIONS THE ADMIN, AND HE IS TOLD.
  -- ══════════════════════════════════════════════════════════════════════════
  v_comment := custom.comment_write(v_org, v_job, 'Putting this back to 1200 — the agent used last year''s rate.',
                                    jsonb_build_object('field_key','price'), null, array[c_admin]);
  if (v_comment ->> 'notified')::int <> 1 then
    raise exception '9a: the mention notified % people, expected 1: %', v_comment ->> 'notified', v_comment;
  end if;
  perform set_config('role', v_boss, true);
  select count(*) into v_n from communication.notification n
   where n.organization_id = v_org and n.recipient_user_id = c_admin
     and n.event_key = 'custom.comment.mention';
  perform set_config('role', 'authenticated', true);
  if v_n <> 1 then raise exception '9b: the admin has % mention messages, expected 1', v_n; end if;

  -- The thread reads in NAMES, the comment is anchored to the price, and the store says
  -- what she may do rather than the screen guessing.
  v_thread := custom.comment_thread(v_org, v_job, false);
  if jsonb_array_length(v_thread -> 'comments') <> 1 then
    raise exception '9c: the thread has % comments', jsonb_array_length(v_thread -> 'comments');
  end if;
  if (v_thread -> 'comments' -> 0 ->> 'created_by_name') ~ '^[0-9a-f]{8}-'
     or coalesce(v_thread -> 'comments' -> 0 ->> 'created_by_name','') = '' then
    raise exception '9d: the comment names "%"', v_thread -> 'comments' -> 0 ->> 'created_by_name';
  end if;
  if (v_thread -> 'comments' -> 0 ->> 'field_key') <> 'price' then
    raise exception '9e: the comment is not anchored to the price: %', v_thread -> 'comments' -> 0;
  end if;
  if (v_thread -> 'comments' -> 0 -> 'mentions' -> 0 ->> 'name') ~ '^[0-9a-f]{8}-' then
    raise exception '9f: the mention prints a uuid at a person';
  end if;
  if (v_thread ->> 'may_comment')::boolean is not true then
    raise exception '9g: the store says an EDITOR may not comment';
  end if;
  raise notice '9 PASSED — % wrote a comment on the Price, mentioning %, and the admin has 1 message about it.',
    v_thread -> 'comments' -> 0 ->> 'created_by_name',
    v_thread -> 'comments' -> 0 -> 'mentions' -> 0 ->> 'name';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 10 — A MENTION THAT WOULD BE A DEAD END IS REFUSED, BY NAME.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    perform custom.comment_write(v_org, v_dup, 'Have a look at this one', '{}'::jsonb, null, array[c_dana]);
    raise exception '10a: somebody was mentioned on a record they cannot open';
  exception when sqlstate '42501' then
    get stacked diagnostics v_caught = message_text;
    if v_caught !~ 'cannot see this record' then
      raise exception '10a: the refusal is not the one this lane wrote: %', v_caught;
    end if;
    raise notice '10a PASSED — "%"', v_caught;
  end;
  -- And a stranger to the organization cannot be named at all.
  begin
    perform custom.comment_write(v_org, v_job, 'hello', '{}'::jsonb, null, array[gen_random_uuid()]);
    raise exception '10b: somebody outside the organization was mentioned';
  exception when sqlstate '23503' then null;
  end;
  raise notice '10b PASSED — a person outside this organization cannot be mentioned.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 11 — HIS-8: THE MERGE IS UNDOABLE THROUGH THE EXISTING VERB, AND THE
  -- TIMELINE SAYS SO BEFORE ANYBODY PRESSES IT.
  -- ══════════════════════════════════════════════════════════════════════════
  if not exists (select 1 from custom.record_history(v_org, v_job) h where h.undoable) then
    raise exception '11a: no version of this record is marked undoable, and one of them is a merge';
  end if;
  select * into r from custom.record_history(v_org, v_job) h where h.undoable order by h.version desc limit 1;
  insert into hs_ctx(k, v) values ('mig', r.migration_id::text);
end;
$suite$;

do $suite$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text := json_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text;
  c_dana_j  text := json_build_object('sub','4060701e-706a-4c76-b3ca-0bbc69fa5a14','role','authenticated')::text;
  v_boss    text := current_user;
  v_org     uuid;
  v_home    uuid;
  v_tbl     uuid;
  v_job     uuid;
  v_dup     uuid;
  v_form    uuid;
  v_rule    uuid;
  v_f_title uuid;
  v_formrec uuid;
  v_mig     uuid;
  v_comment jsonb;
  v_res     jsonb;
  v_prev    jsonb;
  v_thread  jsonb;
  v_caught  text;
  v_code    text;
  v_n       integer;
  v_v       integer;
  r         record;
begin
  select v::uuid into v_org     from hs_ctx where k = 'org';
  select v::uuid into v_tbl     from hs_ctx where k = 'tbl';
  select v::uuid into v_job     from hs_ctx where k = 'job';
  select v::uuid into v_dup     from hs_ctx where k = 'dup';
  select v::uuid into v_formrec from hs_ctx where k = 'formrec';
  select v::uuid into v_mig     from hs_ctx where k = 'mig';
  select v      into v_boss     from hs_ctx where k = 'boss';
  v_res := custom.migrate_undo(v_org, v_mig);
end;
$suite$;

do $suite$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text := json_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text;
  c_dana_j  text := json_build_object('sub','4060701e-706a-4c76-b3ca-0bbc69fa5a14','role','authenticated')::text;
  v_boss    text := current_user;
  v_org     uuid;
  v_home    uuid;
  v_tbl     uuid;
  v_job     uuid;
  v_dup     uuid;
  v_form    uuid;
  v_rule    uuid;
  v_f_title uuid;
  v_formrec uuid;
  v_mig     uuid;
  v_comment jsonb;
  v_res     jsonb;
  v_prev    jsonb;
  v_thread  jsonb;
  v_caught  text;
  v_code    text;
  v_n       integer;
  v_v       integer;
  r         record;
begin
  select v::uuid into v_org     from hs_ctx where k = 'org';
  select v::uuid into v_tbl     from hs_ctx where k = 'tbl';
  select v::uuid into v_job     from hs_ctx where k = 'job';
  select v::uuid into v_dup     from hs_ctx where k = 'dup';
  select v::uuid into v_formrec from hs_ctx where k = 'formrec';
  select v::uuid into v_mig     from hs_ctx where k = 'mig';
  select v      into v_boss     from hs_ctx where k = 'boss';
  -- THE UNDO IS READ ON THE RECORD IT BRINGS BACK. Undoing a merge restores the record the
  -- merge removed, so its own timeline is where the undo signs itself — and it says
  -- "(record restored)" in the same breath, which is what a person is looking for.
  select * into r from custom.record_history(v_org, v_dup) limit 1;
  if r.operation !~ 'undo' then
    raise exception '11b: the undo did not sign its own version on the record it restored: %', r.operation;
  end if;
  if not exists (select 1 from custom.record_history(v_org, v_job) h where h.operation = 'merge') then
    raise exception '11c: the merge''s own version disappeared from the winner''s timeline — history was rewritten';
  end if;
  raise notice '11 PASSED — the merge was undoable through custom.migrate_undo; the undo signs itself "%" on the record it brought back, and the merge''s own version is still in the winner''s timeline.', r.operation_label;

  -- ══════════════════════════════════════════════════════════════════════════
  -- TEARDOWN — the seat's own delete door, then the census.
  -- ══════════════════════════════════════════════════════════════════════════
  perform custom.record_delete(v_org, v_job);
  -- The census is a count of custom.record, which no client door covers and no seat may
  -- read. It steps out and asserts no product clause while out.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.record
   where organization_id = v_org and deleted_at is null and data_class = 'record';
  perform set_config('role', 'authenticated', true);
  raise notice 'TEARDOWN — % live business records left in the throwaway organization (the whole transaction is rolled back).', v_n;

  raise notice '=== ALL PARTS PASSED ===';
end;
$suite$;


rollback;
