-- W3-HIST — CHECK C-17, plus T6, T14 and T15's audit half.
-- VIS-16 · HIS-1…HIS-8 · HIS-N-1 · HIS-N-2 · DYN-19.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w3_hist_c17.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it ROLLS
-- BACK. Everything it makes — one disposable organization, its home, its tables, its fields,
-- its records, its grants and one knob override — disappears with it.
--
-- ITS RED TWIN is `scripts/campaign-tests/w3_hist_red.sql`.
--
-- 🚨 RE-POINTED AND SEATED (lane SEAT-SUITES, 2026-09-19). This suite used to refuse to run
-- anywhere but the rehearsal branch — a copy carrying 226 functions in schema `custom` against
-- main's 332, granting `authenticated` 29 of them against main's 103, and carrying no
-- `custom.field_declare` at all. It had ALREADY BEEN FAILING there on 2026-09-19 before anyone
-- touched it: the store it was measuring was not the store anybody uses. The owner's 2026-09-18
-- ruling is that there is no production and everything is the main database, so it now runs
-- there, against the real doors, on a disposable organization of its own rather than inside the
-- Matrx System organization.
--
-- And it used to run every clause as the connected owner of `custom.record`. In that seat
-- `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are free,
-- SECURITY INVOKER and SECURITY DEFINER are the same thing and `custom.record`,
-- `history.capture_window` and `iam.permissions` are all directly readable — so History's whole
-- subject, "what a person is allowed to be told about the past", was never asked. It now builds
-- its fixtures as the connected role, takes the seat `authenticated` in PART 0, asserts that it
-- holds it, and runs every asserted product clause through the doors a signed-in person
-- reaches: `custom.query_record_as_of`, `custom.io_revisions`, `custom.io_restore`,
-- `custom.history_retention`, `custom.history_retention_set`,
-- `custom.history_retention_floor_raise`, `custom.history_prune`, `custom.migrations`,
-- `custom.migrate_rename`, `custom.migrate_undo`, `custom.visibility_as_of`,
-- `custom.share_grant`, `custom.share_revoke`, `custom.read_record` and `custom.record_update`.
--
-- WHAT STAYS OUT OF THE SEAT, AND WHY. Several things History does have no client door, by
-- design rather than by omission, and each steps out with
-- `perform set_config('role', v_boss, true)`, says so, and asserts no product clause while out:
--   · the raw store: WRITES into `history.row_versions`, any read of
--     `history.capture_window`, and PART 1's six data_class values. `authenticated` holds
--     SELECT on `row_versions` (RLS `std_select`: your own organizations) and nothing else at
--     all — so the simulated-time shift cannot be done from the seat, and the class census
--     cannot be READ from it either, because one of the six is the kernel row and a kernel row
--     belongs to no tenant. PART 1's (d) asks the same store the person's own question,
--     `custom.io_revisions`, from the seat.
--   · `history.migration_record` with a null inverse (PART 4a) — a client never records a
--     Migration by hand; the `custom.migrate_*` verbs write their own inverse as they run.
--   · `history.value_undo` (PART 5d/5e) — one Value put back has no client door today.
--   · `history.merge_field_resolve` (PART 7) — a merge field is resolved by the agent runtime
--     on the server, under the person it is operating for, exactly as `custom.agent_context` is.
-- A Rule record and a Merge field record are declared by direct insert for the same reason:
-- there is no `custom.rule_declare` or `custom.merge_field_declare` door yet.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3):
--   · drop the `zzz_history_capture` trigger                        → PART 1 and every replay
--   · give `history.record_capture` a `data_class = 'record'` filter → PART 1's six classes
--   · make `history.value_in_force` fall back to `p_data -> p_key`
--     when no period covers the date                                → PART 2's (d) and (c)
--   · make `custom.query_record_as_of` ignore `p_recorded_at`       → PART 2's (c): one clock
--   · take the floor comparison out of `custom.history_retention_set` → PART 3's two refusals
--   · let `custom.history_retention_floor_raise` accept a lowering  → PART 3's (f)
--   · take the `migration_log` arm out of `custom.history_prune`    → PART 3's (g)
--   · let `history.migration_record` accept a null inverse          → PART 4's (a)
--   · let `custom.migrate_undo` write around `custom.record_update` → PART 4's (d)
--   · make `custom.io_restore` write with a direct UPDATE           → PART 5's (b)
--   · make `custom.visibility_as_of` read `iam.permissions` live    → PART 6's (a)
--   · take the watching test out of `custom.visibility_as_of`       → PART 6's (d)
--   · default `custom._merge_field_temporal_guard` to `live`        → PART 7's four refusals
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, everywhere it could matter (rule 3):
-- PART 2 asks FOUR dates of ONE stored row set and expects four different answers, so a
-- single-clock implementation returns the same value twice and is caught by construction.
-- PART 3 refuses 10 days naming 30, RAISES the floor to 60, and then refuses 45 naming 60 —
-- the same door, two different numbers in its refusal. PART 7 resolves one merge field under
-- four temporal declarations over one record.
--
-- EVERY REFUSAL IS PAIRED WITH A POSITIVE CONTROL that performs the same act successfully
-- (rule 14): the lowering refusal beside the raise that takes effect; the Table refused below
-- the floor beside the Table set above it; `custom.history_prune('migration_log')` refused by
-- name beside `custom.history_prune('values')` actually pruning rows; PART 6's refusal of the
-- audit to a plain member beside the record and the past she CAN read.
--
-- SIMULATED TIME. `history.row_versions.occurred_at` defaults to `now()`, which is constant
-- inside one transaction, so a recorded-clock question would otherwise have one moment to ask
-- about. This file therefore SHIFTS the version rows it has just written back to real past
-- moments. It shifts only rows whose id is above a mark it took itself, and it rolls back.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w3_hist_c17.sql'
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
  -- The two real past moments the recorded clock is asked about. Today is after both.
  v_t_open   constant timestamptz := '2026-07-01 00:00:00+00';
  v_t_before constant timestamptz := '2026-08-10 12:00:00+00';
  v_t_ask    constant timestamptz := '2026-08-15 12:00:00+00';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_tbl     uuid;
  v_tbl2    uuid;
  v_f_addr  uuid;
  v_f_ctr   uuid;
  v_f_name  uuid;
  v_rule    uuid;
  v_mf      uuid;
  v_rec     uuid;
  v_rec2    uuid;
  v_mark    bigint;
  v_log     uuid;
  v_undo    jsonb;
  v_res     jsonb;
  v_doc     jsonb;
  v_txt     text;
  v_wpath   record;
  v_msg     text;
  v_n       integer;
  v_days    integer;
  v_ver     integer;
  v_ver2    integer;
  v_boss    text := current_user;   -- the connected role, for the steps no client door covers
begin
  -- WHO IS WRITING. `platform.associations` refuses an automated write that does not name the
  -- system doing it, and the store reaches that table on every containment write.
  perform set_config('app.actor_system', 'campaign-test/w3_hist_c17', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Fairhaven Steelworks — Records Vault', 'fairhaven-steelworks-records-' || substr(v_org::text, 1, 8), 'FHS', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- And the store answers a person only where it is switched on.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w3_hist_c17');

  -- A Home record has no client door of its own (a Home is made by the onboarding path, not by
  -- a person's browser), so it is built here, as the connected role, before the seat is taken.
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
  -- AND HISTORY'S OWN STORE IS REACHED THE WAY A PERSON REACHES IT. `history.row_versions` IS
  -- granted to `authenticated` and carries RLS (`std_select`: the organizations this person
  -- belongs to), so the seat reads THIS organization's versions and nobody else's; its
  -- `capture_window` and `migration_log` are not granted at all. That is why every replay
  -- clause below goes through `custom.io_revisions`, `custom.query_record_as_of`,
  -- `custom.migrations` and `custom.visibility_as_of` rather than the table, and why the
  -- WRITES into the History store (the simulated-time shift) step out.
  begin
    perform 1 from history.row_versions limit 1;
  exception when insufficient_privilege then
    raise exception '0: this seat cannot SELECT history.row_versions, and the RLS policy std_select says a member may read their own organization''s versions';
  end;
  begin
    perform 1 from history.capture_window limit 1;
    raise exception '0: this seat can read history.capture_window, which is the mechanism''s own bookkeeping and holds no client grant';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, custom.record is not readable from it, and history.row_versions is reached only through its RLS.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 1 — C-17 / HIS-1 + HIS-7. ONE store, ONE trigger, EVERY data_class.
  -- ══════════════════════════════════════════════════════════════════════════
  -- THE MARK, taken out of the seat so it is the store's real high-water mark and not one
  -- narrowed by RLS. It asserts nothing.
  perform set_config('role', v_boss, true);
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  perform set_config('role', 'authenticated', true);

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-HIST Client', 'slug', 'w3_hist_client', 'type', 'entity',
    'label_singular', 'Client', 'label_plural', 'Clients', 'title_field', 'client_name',
    'display', 'page', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name'),
                                jsonb_build_object('name','address'),
                                jsonb_build_object('name','contract')),
    'parent_id', v_home::text));

  -- A SECOND Table, so "a Table at the floor" and "a Table above it" are two real inputs.
  v_tbl2 := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W3-HIST Light', 'slug', 'w3_hist_light', 'type', 'entity',
    'label_singular', 'Light', 'label_plural', 'Lights', 'title_field', 'client_name',
    'display', 'list', 'weight', 'light', 'ordered', false, 'row_order', 'sorted',
    'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 30,
    'fields', jsonb_build_array(jsonb_build_object('name','client_name')),
    'parent_id', v_home::text));

  -- THE COLUMNS, through the door a person reaches. HIS-5: the world clock is OPT IN, per
  -- Field. Address and Contract declare it; Client name does not, which is what makes PART 2's
  -- (f) a real second input.
  v_f_name := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));
  v_f_addr := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','address','label','Address','plain','text','sort',20,'dated',true));
  v_f_ctr  := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'key','contract','label','Contract','plain','text','sort',30,'dated',true));
  perform custom.field_declare(v_org, v_tbl2, jsonb_build_object(
    'key','client_name','label','Client name','plain','text','sort',10));

  -- ── THE DECLARATIONS NO CLIENT DOOR COVERS ───────────────────────────────────
  -- There is no `custom.rule_declare` and no `custom.merge_field_declare` today: a Rule and a
  -- Merge field are still written as records of their kernel Tables. Both step out and say so,
  -- and no clause is asserted while out. The sixth data_class — a kernel row — is touched here
  -- too, for the same reason.
  perform set_config('role', v_boss, true);
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.rule_kernel_id(), 'rule', jsonb_build_object(
    'name','Has an address at all','kind','predicate','sort',10,
    'uses', jsonb_build_array('membership'),
    'expr', jsonb_build_object('op','present','args', jsonb_build_array(jsonb_build_object('field', v_f_addr::text))),
    'message','this client has an address',
    'scope_table_id', v_tbl::text, 'applies_to_types','[]'::jsonb))
  returning id into v_rule;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.merge_field_kernel_id(), 'merge_field', jsonb_build_object(
    'key','client_address','label','The client''s address','source','record',
    'semantic_type','value','override_policy','derived',
    'modifiers', jsonb_build_array('temporal'),
    'temporal', jsonb_build_object('mode','live')))
  returning id into v_mf;

  -- The sixth class. A kernel row is the store's own shape; this touches one, watches the same
  -- trigger record it, and rolls back like everything else here.
  -- 🚨 NAMED, because it is the one thing this suite touches that its disposable organization
  -- does not own: a kernel row belongs to NO tenant — it lives in the system organization —
  -- so it is matched by id alone. The old file said `organization_id = <the Matrx System org>`
  -- and only worked because it ran INSIDE that organization; re-pointed at a fresh one it
  -- matched zero rows and the sixth class silently disappeared from (a).
  update custom.record set data = data || jsonb_build_object('w3_hist_probe', true)
   where id = custom.file_kernel_id() and data_class = 'kernel';
  perform set_config('role', 'authenticated', true);
  -- ─────────────────────────────────────────────────────────────────────────────

  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'client_name', 'ABC',
    'address', 'X',
    'contract', 'CT-77',
    '_values', jsonb_build_object(
      'address',  jsonb_build_object('dated', jsonb_build_array(
                    jsonb_build_object('from', null, 'to', null, 'value', 'X'))),
      'contract', jsonb_build_object('dated', jsonb_build_array(
                    jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-77'))))));

  v_rec2 := custom.record_write(v_org, v_tbl2, jsonb_build_object('client_name', 'Light one'));

  -- (a) ONE store carries all six live data_class values, and they got there from ONE trigger.
  --     This is a fact about the MECHANISM, and one of the six — the kernel row — belongs to
  --     no tenant at all, so `history.row_versions`' own RLS (`organization_id in my_orgs`)
  --     hides it from every seat by construction: measured on main 2026-09-19, the seat sees
  --     five classes and the store holds six. So this clause steps OUT, says so, and asserts
  --     nothing about what a person may do. (d) below asks the same store the shape of
  --     question a person's screen asks, `custom.io_revisions`, from the seat.
  perform set_config('role', v_boss, true);
  select string_agg(distinct v.row_data ->> 'data_class', ',' order by v.row_data ->> 'data_class')
    into v_txt
    from history.row_versions v
   where v.entity_type = 'custom.record' and v.id > v_mark
     and (v.organization_id = v_org or v.row_id = custom.file_kernel_id());
  perform set_config('role', 'authenticated', true);
  if v_txt is distinct from 'field,kernel,merge_field,record,rule,table' then
    raise exception 'C-17 (a): HIS-1/HIS-7 — the store recorded the classes "%", and the six live classes are field,kernel,merge_field,record,rule,table', coalesce(v_txt, 'none at all');
  end if;

  -- (b) ONE mechanism: exactly one trigger on custom.record runs a function whose body writes
  --     into history.row_versions. HIS-7's "no second mechanism" as a measurement, not a claim.
  --     The catalogue IS readable from the seat, so this stays in it.
  -- 🚨 RE-PINNED (lane RED-SUITES-2, 2026-09-21). This counted TRIGGERS where HIS-7 means
  -- MECHANISMS, and it read 1 only while the capture was a single row-level trigger. The perf
  -- rewrite moved it to statement level, and Postgres needs one trigger PER OPERATION there —
  -- `zzz_history_capture_s_i`, `_s_u`, `_s_d` over `custom.record_capture_stmt_insert`,
  -- `_update` and `_delete`. That is still ONE mechanism; the old clause could only ever read
  -- 3 and call it a second writer.
  --
  -- "One store means one writer" is asserted as what it actually says, and this is STRICTER
  -- than the count: NO OPERATION MAY HAVE TWO WRITERS. A count of 1 would have passed a single
  -- trigger that fired on INSERT while a second mechanism quietly handled UPDATE; this cannot.
  -- Every write path is also required to have a writer at all, so a capture silently dropped
  -- for one operation is caught too — something the old clause never looked at.
  for v_wpath in
    select op,
           count(*) filter (where writes) as writers
      from (
        select unnest(array['INSERT','UPDATE','DELETE']) as op, tg.tgname,
               (pg_get_functiondef(p.oid) ~* 'insert into history\.row_versions') as writes,
               tg.tgtype::int as ty
          from pg_trigger tg
          join pg_class c on c.oid = tg.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_proc p on p.oid = tg.tgfoid
         where n.nspname = 'custom' and c.relname = 'record' and not tg.tgisinternal
      ) x
     where writes
       and ((op = 'INSERT' and (ty & 4) > 0)
         or (op = 'UPDATE' and (ty & 16) > 0)
         or (op = 'DELETE' and (ty & 8) > 0))
     group by op
  loop
    if v_wpath.writers <> 1 then
      raise exception 'C-17 (b): HIS-7 — % trigger(s) on custom.record write into history.row_versions on %, and one store means one writer per write path', v_wpath.writers, v_wpath.op;
    end if;
  end loop;
  select count(distinct op) into v_n
    from (
      select unnest(array['INSERT','UPDATE','DELETE']) as op,
             (pg_get_functiondef(p.oid) ~* 'insert into history\.row_versions') as writes,
             tg.tgtype::int as ty
        from pg_trigger tg
        join pg_class c on c.oid = tg.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = tg.tgfoid
       where n.nspname = 'custom' and c.relname = 'record' and not tg.tgisinternal
    ) x
   where writes
     and ((op = 'INSERT' and (ty & 4) > 0)
       or (op = 'UPDATE' and (ty & 16) > 0)
       or (op = 'DELETE' and (ty & 8) > 0));
  if v_n <> 3 then
    raise exception 'C-17 (b): HIS-7 — only % of the three write paths (insert, update, delete) on custom.record has a writer into history.row_versions, so something is not being recorded at all', v_n;
  end if;

  -- (c) The window opened on the first row actually recorded, not on the apply. The capture
  --     window is the mechanism's own bookkeeping and holds no client grant; it steps out.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from history.capture_window w where w.entity_type = 'custom.record';
  perform set_config('role', 'authenticated', true);
  if v_n < 1 then
    raise exception 'C-17 (c): HIS-1 — nothing opened the capture window for custom.record';
  end if;

  -- (d) AND THE PERSON CAN SEE IT. Every clause above is about the mechanism; this is the one
  --     that says the mechanism reaches somebody. `custom.io_revisions` is the door onto the
  --     same rows, and it answers for the record this person just wrote.
  select count(*) into v_n from custom.io_revisions(v_org, v_rec);
  if v_n < 1 then
    raise exception 'C-17 (d): HIS-1 — the record was written through the door and custom.io_revisions shows % versions of it, so the store records nothing a person can read', v_n;
  end if;

  raise notice 'PART 1 — C-17 / HIS-1 / HIS-7: six data_class values (%) in ONE store from ONE trigger, and custom.io_revisions shows the person % version(s) of their own record.', v_txt, v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 2 — T6. FOUR dates over ONE stored row set. HIS-5 · HIS-6.
  -- ══════════════════════════════════════════════════════════════════════════
  -- Simulated time: everything written so far becomes what the store held BEFORE the
  -- September 2026 correction, and the window opens before that. Two operator writes into the
  -- History store, out of the seat, asserting nothing.
  perform set_config('role', v_boss, true);
  update history.row_versions set occurred_at = v_t_before where id > v_mark;
  update history.capture_window set opened_at = v_t_open where entity_type = 'custom.record';
  perform set_config('role', 'authenticated', true);

  -- The September 2026 correction: address was X until June 2024, then Y. Through the door.
  perform custom.record_update(v_org, v_rec, jsonb_build_object(
    'address', 'Y',
    '_values', jsonb_build_object(
      'address', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', null,         'to', '2024-06-01', 'value', 'X'),
        jsonb_build_object('from', '2024-06-01', 'to', null,         'value', 'Y'))),
      -- `_values` is one block: a patch that named only the address would drop the contract's
      -- periods, which is the store working, not a bug to route round.
      'contract', jsonb_build_object('dated', jsonb_build_array(
        jsonb_build_object('from', '2027-01-01', 'to', '2029-01-01', 'value', 'CT-77'))))));

  -- (a) WORLD clock, March 2024 → X. `custom.query_record_as_of` is the person's door onto
  --     both clocks; `history.value_as_of` holds no client grant and never did.
  v_doc := custom.query_record_as_of(v_org, v_rec, null, date '2024-03-01');
  if (v_doc ->> 'address') is distinct from 'X' then
    raise exception 'T6 (a): as-of March 2024 on the world clock returned %, and the address was X',
                    coalesce(v_doc -> 'address', 'null'::jsonb)::text;
  end if;

  -- (b) WORLD clock, March 2025 → Y. Same stored row set, different answer.
  v_doc := custom.query_record_as_of(v_org, v_rec, null, date '2025-03-01');
  if (v_doc ->> 'address') is distinct from 'Y' then
    raise exception 'T6 (b): as-of March 2025 on the world clock returned %, and the address was Y',
                    coalesce(v_doc -> 'address', 'null'::jsonb)::text;
  end if;

  -- (c) RECORDED clock: what the system SAID in August 2026, before the correction → X, even
  --     though the world clock now answers Y for that same date. The two clocks, apart.
  v_doc := custom.query_record_as_of(v_org, v_rec, v_t_ask, date '2025-03-01');
  if (v_doc ->> 'address') is distinct from 'X' then
    raise exception 'T6 (c): what this store SAID on % for March 2025 came back as %, and it said X — a single-clock implementation answers Y here',
                    v_t_ask, coalesce(v_doc -> 'address', 'null'::jsonb)::text;
  end if;

  -- (d) A contract valid 2027–2029 is storable today and ABSENT from every as-of before 2027,
  --     and PRESENT from 2027. Two dates, two different expected values — and the store says
  --     WHICH kind of nothing the first one is.
  v_doc := custom.query_record_as_of(v_org, v_rec, null, date '2026-06-01');
  if v_doc -> 'contract' is not null and jsonb_typeof(v_doc -> 'contract') <> 'null' then
    raise exception 'T6 (d): a contract that starts in 2027 was returned for June 2026 as %', v_doc -> 'contract';
  end if;
  if (v_doc -> '_effective' -> 'contract' ->> 'state') is distinct from 'not_yet' then
    raise exception 'T6 (d): the store must say WHICH kind of nothing this is, and _effective reads %',
                    coalesce((v_doc -> '_effective' -> 'contract')::text, 'nothing');
  end if;
  v_doc := custom.query_record_as_of(v_org, v_rec, null, date '2027-06-01');
  if (v_doc ->> 'contract') is distinct from 'CT-77' then
    raise exception 'T6 (d) second input: the 2027–2029 contract read % in June 2027',
                    coalesce(v_doc -> 'contract', 'null'::jsonb)::text;
  end if;

  -- (e) History shows the September 2026 edit itself — asked of the door.
  select count(*) into v_n from custom.io_revisions(v_org, v_rec);
  if v_n < 2 then
    raise exception 'T6 (e): the correction is not on the record — % versions of ABC', v_n;
  end if;

  -- (f) The world clock is opt-in per Field: a period on a Field that never declared `dated`
  --     is refused BY THE FIELD'S NAME, through the write door.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object(
      '_values', jsonb_build_object('client_name', jsonb_build_object('dated',
        jsonb_build_array(jsonb_build_object('from', null, 'to', null, 'value', 'ABC'))))));
    raise exception 'T6 (f): a period was accepted on Client name, which keeps a single value';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'Client name' then
      raise exception 'T6 (f): the refusal did not name the field — "%"', v_msg;
    end if;
  end;

  raise notice 'PART 2 — T6: world 2024-03 -> X, world 2025-03 -> Y, recorded % -> X, contract absent before 2027 (state not_yet) and present in 2027. % versions on the record, every answer through custom.query_record_as_of.', v_t_ask, v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 3 — T14 and HIS-2 · HIS-3 · HIS-4. The floor, and what cannot be pruned.
  -- ══════════════════════════════════════════════════════════════════════════
  -- (a) The floor is READ, never written twice: the platform knob is the only floor, and
  --     `custom.history_retention` is the door a person asks it through — the clause T14 opens
  --     with could not be asked from a client seat at all until that door existed.
  v_res := custom.history_retention(v_org);
  v_days := (v_res ->> 'floor_days')::integer;
  if v_days <> 30 then
    raise exception 'T14 (a): this organization''s floor reads % days and the platform floor is 30. Door answered: %', coalesce(v_days::text,'nothing'), v_res::text;
  end if;

  -- (b) A lowering below the floor is refused BY NAME, with the floor in the sentence.
  begin
    perform custom.history_retention_set(v_org, v_tbl2, 10);
    raise exception 'T14 (b): a ten-day retention was accepted under a thirty-day floor';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ '30' then
      raise exception 'T14 (b): the refusal did not name the floor — "%"', v_msg;
    end if;
  end;

  -- (c) THE POSITIVE CONTROL. The same door, the same table, a legal number: it lands, and the
  --     READ door says so — never a direct read of `custom.record`, which this seat cannot do.
  if custom.history_retention_set(v_org, v_tbl2, 30) <> 30 then
    raise exception 'T14 (c): setting the light table to the floor did not return 30';
  end if;
  v_res := custom.history_retention(v_org, v_tbl2);
  v_days := (v_res ->> 'days')::integer;
  if v_days <> 30 then
    raise exception 'T14 (c): the light table reads % days after being set to 30. Door answered: %', coalesce(v_days::text, 'nothing'), v_res::text;
  end if;

  -- (d) AN ORGANIZATION RAISES ITS FLOOR, and it takes effect.
  if custom.history_retention_floor_raise(v_org, 60) <> 60 then
    raise exception 'T14 (d): raising the floor to 60 did not return 60';
  end if;
  v_days := (custom.history_retention(v_org) ->> 'floor_days')::integer;
  if v_days <> 60 then
    raise exception 'T14 (d): after the raise the floor reads % days', coalesce(v_days::text, 'nothing');
  end if;

  -- (e) THE SECOND INPUT. The same door now refuses a DIFFERENT number, naming 60 not 30.
  begin
    perform custom.history_retention_set(v_org, v_tbl2, 45);
    raise exception 'T14 (e): forty-five days was accepted under a sixty-day floor';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ '60' then
      raise exception 'T14 (e): the refusal did not name the raised floor — "%"', v_msg;
    end if;
  end;
  if custom.history_retention_set(v_org, v_tbl2, 90) <> 90 then
    raise exception 'T14 (e) control: ninety days above a sixty-day floor was not accepted';
  end if;

  -- (f) The floor only ever goes UP, and the refusal says so before anything is written.
  begin
    perform custom.history_retention_floor_raise(v_org, 30);
    raise exception 'T14 (f): the floor was lowered from 60 to 30';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ '60' then
      raise exception 'T14 (f): the lowering refusal did not name the current floor — "%"', v_msg;
    end if;
  end;
  if (custom.history_retention(v_org) ->> 'floor_days')::integer <> 60 then
    raise exception 'T14 (f): the refused lowering changed the floor anyway';
  end if;

  -- (g) HIS-4. The Migration log is refused BY NAME, before anything is read.
  begin
    perform custom.history_prune(v_org, 'migration_log');
    raise exception 'T14 (g): the Migration log was accepted as a prune scope';
  exception when feature_not_supported then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'Migration log' then
      raise exception 'T14 (g): the refusal did not name the Migration log — "%"', v_msg;
    end if;
  end;

  -- (g) POSITIVE CONTROL: the same door, a scope it does prune, actually pruning rows.
  --     The versions written above are shifted well past the floor so there is something to
  --     prune, and the two most recent versions of every row survive whatever retention says.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC old one'));
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC old two'));
  perform set_config('role', v_boss, true);
  update history.row_versions set occurred_at = now() - interval '400 days'
   where id > v_mark and entity_type = 'custom.record' and organization_id = v_org
     and row_id = v_rec;
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC two'));
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'ABC three'));
  v_res := custom.history_prune(v_org, 'values', v_tbl, false);
  if coalesce((v_res ->> 'rows_pruned')::bigint, 0) < 1 then
    raise exception 'T14 (g) control: custom.history_prune(''values'') pruned nothing — %', v_res::text;
  end if;
  select count(*) into v_n from custom.io_revisions(v_org, v_rec);
  if v_n < 2 then
    raise exception 'T14 (g) control: the prune left % versions of ABC, and the two most recent always survive', v_n;
  end if;

  raise notice 'PART 3 — T14: 10 refused naming 30, 30 accepted, floor raised to 60, 45 refused naming 60, 90 accepted, a lowering to 30 refused, the Migration log refused by name, and custom.history_prune(''values'') deleted % rows leaving % versions — every one of them asked from the client seat.',
               v_res ->> 'rows_pruned', v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 4 — HIS-8. Record an inverse, undo it, and watch the undo get recorded.
  -- ══════════════════════════════════════════════════════════════════════════
  -- (a) A Migration with nothing to put it back with is REFUSED at the time, not discovered
  --     sixty days later. `history.migration_record` is a SERVER LANE and holds no client
  --     grant — a person never records a Migration by hand; the `custom.migrate_*` verbs write
  --     their own inverse as they run, which is (b). So this ONE statement steps out and says
  --     so, and asserts nothing about what a person may do.
  perform set_config('role', v_boss, true);
  v_msg := null;
  begin
    perform history.migration_record(v_org, 'rename', 'record', v_rec, null);
  exception when null_value_not_allowed then
    get stacked diagnostics v_msg = message_text;
  end;
  perform set_config('role', 'authenticated', true);
  if v_msg is null then
    raise exception 'HIS-8 (a): a Migration with no inverse was recorded';
  end if;
  if v_msg !~* 'put it back' then
    raise exception 'HIS-8 (a): the refusal did not say what was missing — "%"', v_msg;
  end if;

  -- (b) The real thing, THROUGH THE PERSON'S OWN VERB: `custom.migrate_rename` renames ABC and
  --     stores the inverse WHILE it runs, and `custom.migrations` is how the person reads the
  --     log back. Neither `history.migration_log` nor `history.migration_record` is reachable
  --     from this seat at all.
  v_txt := custom.read_record(v_org, v_rec, false) ->> 'client_name';
  v_res := custom.migrate_rename(v_org, v_rec, 'Renamed',
             'W3-HIST C-17: rename, with the old name stored at the time');
  v_log := (v_res ->> 'migration_id')::uuid;
  if v_log is null then
    raise exception 'HIS-8 (b): the rename door returned no migration id — %', v_res::text;
  end if;

  select count(*) into v_n from custom.migrations(v_org, v_rec) m
   where m.id = v_log and m.undone_at is null and m.verb = 'rename';
  if v_n <> 1 then
    raise exception 'HIS-8 (b): the rename is not on the log as an outstanding Migration — custom.migrations answered % row(s)', v_n;
  end if;

  -- (c) UNDO, through the door. It restores the old name, and through the same write path.
  perform set_config('role', v_boss, true);
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  perform set_config('role', 'authenticated', true);
  v_undo := custom.migrate_undo(v_org, v_log);
  if (custom.read_record(v_org, v_rec, false) ->> 'client_name') <> v_txt then
    raise exception 'HIS-8 (c): the undo left the name as "%" and it was "%" before the rename',
      custom.read_record(v_org, v_rec, false) ->> 'client_name', v_txt;
  end if;
  if not exists (select 1 from custom.migrations(v_org, v_rec) m
                  where m.id = v_log and m.undone_at is not null) then
    raise exception 'HIS-8 (c): the log entry was not marked undone';
  end if;

  -- (d) THE UNDO ITSELF IS ON THE RECORD. Putting something back is not the same as it never
  --     having happened, and that is the difference between a log and a rewrite.
  select count(*) into v_n
    from history.row_versions v
   where v.id > v_mark and v.entity_type = 'custom.record'
     and v.organization_id = v_org and v.row_id = v_rec;
  if v_n < 1 then
    raise exception 'HIS-8 (d): the undo wrote no version of its own — it went round custom.record_update';
  end if;

  -- (e) Undoing it twice changes nothing and says why.
  begin
    perform custom.migrate_undo(v_org, v_log);
    raise exception 'HIS-8 (e): the same Migration was undone twice';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'already undone' then
      raise exception 'HIS-8 (e): the second undo failed for the wrong reason — "%"', v_msg;
    end if;
  end;

  raise notice 'PART 4 — HIS-8: an inverse-less Migration refused, a rename logged through custom.migrate_rename, undone back to "%", the log marked undone on custom.migrations, % version row(s) written BY the undo, and a second undo refused.', v_txt, v_n;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 5 — HIS-N-1 and HIS-N-2. Snapshots and one Value, put back, forwards.
  -- ══════════════════════════════════════════════════════════════════════════
  -- (a) THE CHAIN, asked of `custom.io_revisions` — the door onto the same rows
  --     `history.snapshot_chain` walks, and the only one a person reaches. A version is picked
  --     by WHAT HAPPENED and WHEN, so each entry carries an operation and a moment.
  select count(*) into v_n from custom.io_revisions(v_org, v_rec);
  if v_n < 2 then
    raise exception 'HIS-N-1 (a): the chain holds % entries', v_n;
  end if;
  if exists (select 1 from custom.io_revisions(v_org, v_rec) r
              where coalesce(nullif(btrim(r.operation), ''), '') = '' or r.changed_at is null) then
    raise exception 'HIS-N-1 (a): a version is picked by what happened and when, and an entry carries neither';
  end if;

  -- (b) RESTORE an earlier version through `custom.io_restore`, and it becomes a NEW version
  --     rather than a hole.
  select min(r.version) into v_ver from custom.io_revisions(v_org, v_rec) r;
  perform set_config('role', v_boss, true);
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  perform set_config('role', 'authenticated', true);
  v_ver2 := custom.io_restore(v_org, v_rec, v_ver);
  select count(*) into v_n
    from history.row_versions v
   where v.id > v_mark and v.entity_type = 'custom.record' and v.row_id = v_rec;
  if v_n < 1 then
    raise exception 'HIS-N-1 (b): restoring version % wrote no new version', v_ver;
  end if;
  -- THE CHAIN WENT FORWARD, asked of the door rather than of the restore's return value.
  -- `custom.io_restore` is documented to answer NULL when it cannot read the new version
  -- number back — "done, and I cannot tell you which version" — and a clause written as
  -- `v_ver2 <= v_ver` passes silently on NULL, which is no clause at all. So the top of the
  -- chain is read from `custom.io_revisions` and compared to the version that was restored.
  select max(r.version) into v_ver2 from custom.io_revisions(v_org, v_rec) r;
  if v_ver2 is null then
    raise exception 'HIS-N-1 (b): after the restore custom.io_revisions shows no version at all';
  end if;
  if v_ver2 <= v_ver then
    raise exception 'HIS-N-1 (b): the record is at version % after restoring version % — the chain went backwards', v_ver2, v_ver;
  end if;

  -- (c) A version that was never saved is refused by name, with the remedy.
  begin
    perform custom.io_restore(v_org, v_rec, 99999);
    raise exception 'HIS-N-1 (c): a version that does not exist was restored';
  exception when sqlstate '02000' then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'version' then
      raise exception 'HIS-N-1 (c): the refusal did not say what was missing — "%"', v_msg;
    end if;
  end;

  -- (d) HIS-N-2: ONE Value put back, through the same write path, producing a NEW version.
  --     `history.value_undo` has NO CLIENT DOOR today — a person puts back a whole version
  --     (`custom.io_restore`, above) or undoes a Migration (`custom.migrate_undo`, PART 4), and
  --     one Value on its own is not yet reachable. So (d) and (e) step OUT of the seat, say so,
  --     and assert nothing about what a person may do. It is reported as a gap.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('client_name', 'Wrong name'));
  perform set_config('role', v_boss, true);
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  v_res := history.value_undo(v_org, v_rec, 'client_name');
  select r.data ->> 'client_name' into v_txt
    from custom.record r where r.organization_id = v_org and r.id = v_rec;
  select count(*) into v_n from history.row_versions v
   where v.id > v_mark and v.entity_type = 'custom.record' and v.row_id = v_rec;
  -- (e) A Value that has never changed has nothing to put back, and says so.
  v_msg := null;
  begin
    perform history.value_undo(v_org, v_rec2, 'client_name');
  exception when sqlstate '02000' then
    get stacked diagnostics v_msg = message_text;
  end;
  perform set_config('role', 'authenticated', true);
  if v_txt = 'Wrong name' then
    raise exception 'HIS-N-2 (d): undoing client_name left it as "%"', v_txt;
  end if;
  if v_n < 1 then
    raise exception 'HIS-N-2 (d): the value undo wrote no version of its own';
  end if;
  if v_msg is null then
    raise exception 'HIS-N-2 (e): a value that never changed was "put back"';
  end if;
  if v_msg !~* 'nothing to put back' then
    raise exception 'HIS-N-2 (e): the refusal read "%"', v_msg;
  end if;

  raise notice 'PART 5 — HIS-N-1 / HIS-N-2: the chain reads back through custom.io_revisions with an operation and a moment on every entry, custom.io_restore put version % back FORWARDS to version %, a missing version was refused, one Value was put back to "%" with a new version of its own, and an unchanged Value was refused.', v_ver, v_ver2, v_txt;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 6 — VIS-16 and T15's audit half. Who could see R on D, BY REPLAY.
  -- ══════════════════════════════════════════════════════════════════════════
  -- THE GRANT, through the person's own door. The old suite INSERTed straight into
  -- `iam.permissions`, which no signed-in person may write.
  perform set_config('role', v_boss, true);
  select coalesce(max(id), 0) into v_mark from history.row_versions;
  perform set_config('role', 'authenticated', true);

  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);

  -- The grant existed on the date asked about, and the window was open before it. Two operator
  -- writes into the History store, out of the seat, asserting nothing.
  perform set_config('role', v_boss, true);
  update history.row_versions set occurred_at = v_t_before
   where id > v_mark and entity_type = 'iam.permissions';
  update history.capture_window set opened_at = v_t_open where entity_type = 'iam.permissions';
  perform set_config('role', 'authenticated', true);

  -- It has since been revoked — through the person's own door.
  perform custom.share_revoke(v_org, v_rec, 'user', c_dana);

  -- (a) The replay still returns it for that date — which is exactly what an audit asks, and
  --     `custom.visibility_as_of` is the door VIS-16 / T15 gives the person.
  -- THROUGH THE GRANT, not merely "she appears". `test@test.com` is a member of this
  -- organization, so she appears at `now()` too — through her MEMBERSHIP. Keying the clause on
  -- the principal alone would be satisfied by that and would prove nothing about the replay;
  -- `through_kind = 'grant'` is the thing that was revoked and the thing the audit is about.
  select count(*) into v_n from custom.visibility_as_of(v_org, v_rec, v_t_ask) g
   where g.principal_id = c_dana and g.principal_kind = 'user' and g.through_kind = 'grant';
  if v_n < 1 then
    raise exception 'VIS-16 (a): the grant revoked since % came back % times for that date, and it was live then', v_t_ask, v_n;
  end if;
  if not exists (select 1 from custom.visibility_as_of(v_org, v_rec, v_t_ask) g
                  where g.principal_id = c_dana and g.through_kind = 'grant' and g.replayed) then
    raise exception 'VIS-16 (a): the grant came back for % but not as a REPLAY, so it was read off the live table', v_t_ask;
  end if;

  -- (b) SECOND INPUT, DIFFERENT EXPECTED VALUE: today it is gone.
  select count(*) into v_n from custom.visibility_as_of(v_org, v_rec, now()) g
   where g.principal_id = c_dana and g.principal_kind = 'user' and g.through_kind = 'grant';
  if v_n <> 0 then
    raise exception 'VIS-16 (b): a revoked grant is still returned for today';
  end if;
  -- AND THE POSITIVE CONTROL FOR (b), so "0" is not a door that answers nothing today: she is
  -- still reported for today through her MEMBERSHIP, which is the reason that did not change.
  if not exists (select 1 from custom.visibility_as_of(v_org, v_rec, now()) g
                  where g.principal_id = c_dana and g.through_kind = 'organization') then
    raise exception 'VIS-16 (b): test@test.com is a member of this organization and today''s answer does not mention her at all, so the 0 above is the door answering nothing rather than the grant being gone';
  end if;

  -- (c) The same door names the PRINCIPAL and says WHY, which is what turns a row into an
  --     audit answer.
  if not exists (select 1 from custom.visibility_as_of(v_org, v_rec, v_t_ask) g
                  where g.principal_id = c_dana and g.through_kind = 'grant'
                    and coalesce(nullif(btrim(g.reason), ''), '') <> '') then
    raise exception 'T15: "who could see this on %" named test@test.com without saying why', v_t_ask;
  end if;

  -- (d) A moment History was NOT watching is REFUSED BY NAME rather than guessed at.
  begin
    perform * from custom.visibility_as_of(v_org, v_rec, v_t_open - interval '1 day');
    raise exception 'VIS-16 (d): a replay of a moment before the store was recording was answered';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    -- 🚨 RE-MEASURED ON MAIN (SEAT-SUITES, 2026-09-19). The branch's sentence was "not
    -- watching" / "has not started recording"; main's door says it in plainer English and
    -- NAMES THE DATE the store's history begins, which is the remedy a person can act on. The
    -- clause asserts the thing that matters — the refusal states when the window opens and
    -- that the question cannot be answered — rather than a form of words.
    if v_msg !~* 'not watching' and v_msg !~* 'not started recording'
       and not (v_msg ~* 'starts at' and v_msg ~* 'cannot be answered') then
      raise exception 'VIS-16 (d): the refusal read "%"', v_msg;
    end if;
    if v_msg !~ to_char(v_t_open, 'YYYY-MM-DD') then
      raise exception 'VIS-16 (d): the refusal does not name the moment History starts (%) — "%"', v_t_open, v_msg;
    end if;
  end;

  -- (e) AND IT IS AN OWNER'S ANSWER, NOT A MEMBER'S. The audit says who could see a record,
  --     which is a fact about other people; `test@test.com` is a plain member of this
  --     organization and is refused it. Paired with what she CAN do, so the clause is not
  --     satisfied by a door that refuses her everything.
  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_msg := null;
  begin
    perform * from custom.visibility_as_of(v_org, v_rec, v_t_ask);
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'VIS-16 (e): test@test.com, a plain member, was told who else could see this record';
  end if;
  -- THE CONTROL: the record she was shared, she reads, and its own past she may ask about.
  if (custom.read_record(v_org, v_rec, false) ->> 'client_name') is null then
    raise exception 'VIS-16 (e) control: the record shared with test@test.com at viewer does not read back for her';
  end if;
  if custom.query_record_as_of(v_org, v_rec, v_t_ask, null) is null then
    raise exception 'VIS-16 (e) control: test@test.com may read this record and cannot ask what it said in the past';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'PART 6 — VIS-16 / T15: a grant revoked since is returned for % and absent for today, custom.visibility_as_of names the principal and says why, a moment before the window is refused by name, and a plain member is refused the audit while still reading the record and its past.', v_t_ask;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 7 — DYN-19. live / as_of world / as_of recorded / snapshot, and four refusals.
  -- ══════════════════════════════════════════════════════════════════════════
  -- THE FOUR REFUSALS ARE THE PERSON'S HALF and stay in the seat: a merge field is declared by
  -- writing a record, and `custom.record_update` is the door that writes it, so
  -- `custom._merge_field_temporal_guard` is the sentence a person meets.
  --
  -- THE FOUR RESOLUTIONS ARE A SERVER LANE. `history.merge_field_resolve` holds no client
  -- grant, for the same stated reason `custom.agent_context` does not: a merge field is
  -- resolved by the agent runtime on the server, under the person it is operating for. Those
  -- four clauses step OUT of the seat and say so, and assert nothing about what a person may do.

  -- (a) live — whatever it is now.
  perform set_config('role', v_boss, true);
  select value, clock into v_doc, v_txt
    from history.merge_field_resolve(v_org, v_mf, v_rec, 'address');
  perform set_config('role', 'authenticated', true);
  if v_txt <> 'live' or v_doc is distinct from to_jsonb('Y'::text) then
    raise exception 'DYN-19 (a): live resolved % on clock "%"', coalesce(v_doc::text, 'nothing'), v_txt;
  end if;

  -- (b) as_of / world — what was TRUE then. The declaration goes through the write door.
  perform custom.record_update(v_org, v_mf, jsonb_build_object(
    'temporal', jsonb_build_object('mode','as_of','clock','world','at','2024-03-01')));
  perform set_config('role', v_boss, true);
  select value, clock into v_doc, v_txt
    from history.merge_field_resolve(v_org, v_mf, v_rec, 'address');
  perform set_config('role', 'authenticated', true);
  if v_txt <> 'world' or v_doc is distinct from to_jsonb('X'::text) then
    raise exception 'DYN-19 (b): as-of world 2024-03-01 resolved % on clock "%"', coalesce(v_doc::text, 'nothing'), v_txt;
  end if;

  -- (c) as_of / recorded — what the store SAID then. Different clock, different answer.
  perform custom.record_update(v_org, v_mf, jsonb_build_object(
    'temporal', jsonb_build_object('mode','as_of','clock','recorded','at', v_t_ask::text)));
  perform set_config('role', v_boss, true);
  select clock into v_txt from history.merge_field_resolve(v_org, v_mf, v_rec, 'address');
  perform set_config('role', 'authenticated', true);
  if v_txt <> 'recorded' then
    raise exception 'DYN-19 (c): as-of recorded resolved on clock "%"', v_txt;
  end if;

  -- (d) snapshot.
  perform custom.record_update(v_org, v_mf, jsonb_build_object(
    'temporal', jsonb_build_object('mode','snapshot')));
  perform set_config('role', v_boss, true);
  select clock into v_txt from history.merge_field_resolve(v_org, v_mf, v_rec, 'address');
  perform set_config('role', 'authenticated', true);
  if v_txt <> 'snapshot' then
    raise exception 'DYN-19 (d): snapshot resolved on clock "%"', v_txt;
  end if;

  -- THE FOUR REFUSALS, every one of them from the seat, through the write door.
  begin  -- 1: a mode nobody has.
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','whenever')));
    raise exception 'DYN-19 refusal 1: "whenever" was accepted as a mode';
  exception when check_violation then null;
  end;
  begin  -- 2: as_of without a clock.
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','as_of','at','2024-03-01')));
    raise exception 'DYN-19 refusal 2: an as-of with no clock was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'clock' then
      raise exception 'DYN-19 refusal 2 read "%"', v_msg;
    end if;
  end;
  begin  -- 3: as_of without a moment.
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','as_of','clock','world')));
    raise exception 'DYN-19 refusal 3: an as-of with no moment was accepted';
  exception when check_violation then null;
  end;
  begin  -- 4: a moment named by a mode that never reads one.
    perform custom.record_update(v_org, v_mf, jsonb_build_object(
      'temporal', jsonb_build_object('mode','live','at','2024-03-01')));
    raise exception 'DYN-19 refusal 4: a moment was accepted on a live merge field';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~* 'changes nothing' then
      raise exception 'DYN-19 refusal 4 read "%"', v_msg;
    end if;
  end;

  raise notice 'PART 7 — DYN-19: live -> Y, as-of world 2024-03 -> X, as-of recorded, snapshot, and four refusals by name — every refusal met from the seat, through custom.record_update.';

  raise notice '════ C-17 GREEN — HIS-1…HIS-8, HIS-N-1, HIS-N-2, VIS-16, DYN-19, T6, T14 and T15''s audit half, on the MAIN database, every asserted product clause from the seat `authenticated`. Rolling back. ════';
end;
$t$;

rollback;
