-- scripts/campaign-tests/digests_green.sql — lane DIGESTS, from the seat.
--
-- PRODUCTS row 8: "Text me on a new lead; email me a Monday summary." Every asserted
-- clause below PART 0 runs as `authenticated` — the role PostgREST serves a signed-in
-- person — through the five doors this lane declared (`custom.view_declare`,
-- `custom.views`, `custom.subscription_declare`, `custom.subscription_preview`, and
-- `custom.subscriptions` widened), and never against `platform.saved_view`,
-- `communication.notification` or `custom.record` behind them.
--
-- The two seats: `admin@admin.com` owns the organization and the Table; `test@test.com`
-- is an ordinary member who was shared nothing, in an organization whose
-- `custom/member_default_visibility` is `shared_only` — without that the organization
-- shows every member every record and there would be no wall for PART 8 to test.
--
-- THE THREE STEPS OUT, each one named where it happens: the notifier's own reader, its
-- instant runner and its delivery path hold no client grant BY DESIGN (they are
-- server-only, and DOOR-18's whole shape is that a person reaches the notifier through
-- their own doors and never the other way round). Those three clauses step out to the
-- connected role, say so, and assert nothing about a client's reach while out.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'digests_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_f_name  uuid;
  v_f_stage uuid;
  v_view    uuid;
  v_dana_v  uuid;
  v_instant uuid;
  v_weekly  uuid;
  v_lead1   uuid;
  v_lead2   uuid;
  v_won     uuid;
  v_n       bigint;
  v_i       integer;
  v_txt     text;
  v_cad     text[];
  v_digest  jsonb;
  v_row     record;
  v_mark    timestamptz;
begin
  -- ── fixtures, as the connected role (a seat is a PERSON; these make one) ───────
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Fairhaven Steelworks suite ' || left(v_org::text, 8), 'fairhaven-steelworks-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin),
         (v_org, 'organization', v_org, c_dana, 'member', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'digests_green.sql', c_admin),
         ('custom', 'member_default_visibility', 'organization', v_org, v_org,
          '"shared_only"'::jsonb, 'digests_green.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/digests_green.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
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
  raise notice 'PART 0 PASSED — seated as %, which cannot read custom.record directly', current_user;

  -- ══ PART 0b — WHAT THE DOORS STAND IN FRONT OF STAYS SHUT ═════════════════════
  -- If either of these opens, `custom.views` and the summary are decoration and a
  -- browser is filtering tenancy for itself.
  -- MEASURED, and it is the reason `custom.views` exists at all: `platform.saved_view`
  -- IS readable by a signed-in person — it carries its own row-level security, which
  -- is ORGANIZATION-level. It knows nothing about which TABLE a view is over, so RLS
  -- alone hands every member of an organization every saved view in it, including the
  -- ones over Tables they were never shown. That is not a hypothetical: PART 8 makes
  -- `test@test.com` read both and shows the gap. The door narrows where the table's
  -- own security cannot.
  if not has_table_privilege('authenticated', 'platform.saved_view', 'SELECT') then
    raise exception '0b: platform.saved_view stopped being client-readable, so the sharper clause in PART 8 no longer measures anything — re-read this suite before deleting it';
  end if;
  -- The notifier's own three: server-only by design, and this is where that is proven
  -- rather than asserted in a comment.
  if has_function_privilege('authenticated', 'custom.agg_subscriptions(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'custom.agg_digest_run(uuid,uuid,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'custom.agg_deliver(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)', 'EXECUTE') then
    raise exception '0b: a client may execute one of the notifier''s own functions, so the person''s doors are not the only way in';
  end if;
  raise notice 'PART 0b PASSED — the three agg_* internals are refused to this seat, and platform.saved_view''s own RLS is organization-level (which is what custom.views narrows)';

  -- ══ PART 1 — a Table, two Fields, three leads, all through client doors ═══════
  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Workspace', 'description', 'the suite''s home', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Leads', 'slug', 'leads', 'description', 'the suite''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Lead', 'label_plural', 'Leads',
      'title_field', 'name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'name'), jsonb_build_object('name', 'stage'),
                                  jsonb_build_object('name', 'phone')),
      'parent_id', v_home));
  v_f_name  := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'name', 'key', 'name', 'type', 'text', 'required', true));
  v_f_stage := custom.field_declare(v_org, v_table, jsonb_build_object('label', 'stage', 'key', 'stage', 'type', 'text'));
  -- PHONE IS DECLARED BECAUSE THIS SUITE WRITES IT (FIELD-TRUTH, 2026-09-21). Every lead
  -- below carries a phone number and PART 5 edits one, and `custom._undeclared_key_guard`
  -- refuses a value for a key no Field declares — a value with no column is a value nobody
  -- will ever see, which is the whole point of the digest. The refusal is correct; the
  -- fixture was writing an undeclared column.
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'phone', 'key', 'phone', 'type', 'text'));
  raise notice 'PART 1 PASSED — table %', v_table;

  -- ══ PART 2 — custom.views and custom.view_declare ═════════════════════════════
  -- Before this lane there was NO door onto platform.saved_view for schema custom at
  -- all, so a subscription needed a saved_view_id nobody could obtain.
  select count(*) into v_n from custom.views(v_org, v_table);
  if v_n <> 0 then
    raise exception '2a: a brand-new table already has % saved views', v_n;
  end if;
  v_view := custom.view_declare(v_org, v_table,
              jsonb_build_object('name', 'New leads', 'filters', jsonb_build_object('stage', 'new')));
  select count(*) into v_n from custom.views(v_org, v_table);
  if v_n <> 1 then
    raise exception '2b: after declaring one view the door answers % of them', v_n;
  end if;
  select v.name, v.filters into v_row from custom.views(v_org, v_table) v;
  if v_row.name <> 'New leads' or v_row.filters ->> 'stage' <> 'new' then
    raise exception '2c: the door gave back name=% filters=%', v_row.name, v_row.filters;
  end if;
  raise notice 'PART 2 PASSED — view % declared and listed through the doors', v_view;

  -- ══ PART 3 — THE PICKER AND THE RUNNER READ ONE LIST, and a bad word is refused
  v_cad := custom.subscription_cadences(v_org);
  if not (v_cad @> array['instant','hourly','daily','weekly'] and array_length(v_cad, 1) = 4) then
    raise exception '3a: the cadence catalogue is %, not the four the runner acts on', v_cad;
  end if;

  -- EVERY REFUSAL BY NAME. A setting that does nothing is worse than a missing one.
  begin
    perform custom.subscription_declare(v_org, v_table, jsonb_build_object(
      'name', 'fortnightly', 'saved_view_id', v_view, 'cadence', 'fortnightly'));
    raise exception '3b: the store accepted a cadence no runner acts on';
  exception when invalid_parameter_value then
    get stacked diagnostics v_txt = message_text;
    if v_txt not like '%fortnightly%' or v_txt not like '%weekly%' then
      raise exception '3b: the refusal did not name the bad word and the real ones: %', v_txt;
    end if;
  end;
  begin
    perform custom.subscription_declare(v_org, v_table, jsonb_build_object(
      'name', 'by pigeon', 'saved_view_id', v_view, 'cadence', 'instant', 'channel', 'pigeon'));
    raise exception '3c: the store accepted a channel this platform does not send on';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform custom.subscription_declare(v_org, v_table, jsonb_build_object(
      'name', 'bad night', 'saved_view_id', v_view, 'cadence', 'daily',
      'quiet_hours', jsonb_build_object('start', 'the evening', 'end', 'morning')));
    raise exception '3d: the store stored quiet hours nobody can read, so the screen would show a setting that does nothing at 3am';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform custom.subscription_declare(v_org, v_table, jsonb_build_object(
      'name', 'no view', 'cadence', 'instant'));
    raise exception '3e: the store accepted a subscription with no view, which admits nothing forever';
  exception when null_value_not_allowed then null;
  end;
  raise notice 'PART 3 PASSED — four cadences, and a bad cadence, channel, night and missing view each refused by name';

  -- ══ PART 4 — the two subscriptions the product is named after ════════════════
  v_instant := custom.subscription_declare(v_org, v_table, jsonb_build_object(
      'name', 'New lead', 'saved_view_id', v_view, 'cadence', 'instant', 'channel', 'in_app'));
  v_weekly := custom.subscription_declare(v_org, v_table, jsonb_build_object(
      'name', 'Monday summary', 'saved_view_id', v_view, 'cadence', 'weekly',
      'schedule', 'monday 08:00', 'channel', 'in_app',
      'quiet_hours', jsonb_build_object('start', '22:00', 'end', '07:00', 'tz', 'America/Chicago')));

  select count(*) into v_n from custom.subscriptions(v_org, v_table);
  if v_n <> 2 then
    raise exception '4a: the person''s own door answers % subscriptions, not 2', v_n;
  end if;
  select * into v_row from custom.subscriptions(v_org, v_table) s where s.rule_id = v_weekly;
  if v_row.cadence <> 'weekly' or v_row.schedule <> 'monday 08:00' then
    raise exception '4b: the weekly one reads cadence=% schedule=%', v_row.cadence, v_row.schedule;
  end if;
  if v_row.quiet_hours ->> 'start' <> '22:00' or v_row.quiet_hours ->> 'tz' <> 'America/Chicago' then
    raise exception '4c: the quiet hours came back as %', v_row.quiet_hours;
  end if;
  -- "WHEN IS MY NEXT SUMMARY?" — the question nobody could ask before this lane, and
  -- it must be a real Monday at 08:00 in the subscription's OWN zone, not the server's.
  if v_row.next_digest_at is null then
    raise exception '4d: the weekly subscription has no next summary time';
  end if;
  if extract(dow from (v_row.next_digest_at at time zone 'America/Chicago')) <> 1
     or (v_row.next_digest_at at time zone 'America/Chicago')::time <> '08:00'::time then
    raise exception '4e: the next summary falls at % in America/Chicago, which is not Monday 08:00',
                    v_row.next_digest_at at time zone 'America/Chicago';
  end if;
  if v_row.last_sent_at is not null then
    raise exception '4f: a subscription made one second ago claims it has already told somebody';
  end if;
  select * into v_row from custom.subscriptions(v_org, v_table) s where s.rule_id = v_instant;
  if v_row.next_digest_at is not null then
    raise exception '4g: an instant subscription was given a next-summary time, which is a promise nothing keeps';
  end if;
  raise notice 'PART 4 PASSED — instant + weekly written, and the door answers quiet hours and the next Monday 08:00 America/Chicago';

  -- ══ PART 5 — three leads, and INSTANT MEANS ENTERING ═════════════════════════
  v_lead1 := custom.record_write(v_org, v_table, jsonb_build_object('name', 'Renee Castillo', 'stage', 'new', 'phone', '555-0101', '_actor', 'user'));
  v_lead2 := custom.record_write(v_org, v_table, jsonb_build_object('name', 'Marcus Reyes', 'stage', 'new', 'phone', '555-0102', '_actor', 'user'));
  v_won   := custom.record_write(v_org, v_table, jsonb_build_object('name', 'Priya Raman', 'stage', 'won', 'phone', '555-0103', '_actor', 'user'));
  v_mark := clock_timestamp();
  perform custom.record_update(v_org, v_lead1, jsonb_build_object('phone', '555-0999'), null);

  -- STEPPING OUT, and saying why: `custom.agg_subscription_fire_entered` is the
  -- NOTIFIER's own runner and holds no client grant by design — PART 0b just proved
  -- its siblings are refused to this seat. Nothing about a client's reach is asserted
  -- while out.
  perform set_config('role', v_boss, true);
  v_i := custom.agg_subscription_fire_entered(v_org, v_lead1, v_table, v_mark);
  if v_i <> 0 then
    raise exception '5a: editing a lead''s phone number told % people, so "a new lead" means "a lead was touched"', v_i;
  end if;
  v_i := custom.agg_subscription_fire_entered(v_org, v_lead2, v_table, v_mark - interval '1 hour');
  if v_i <> 1 then
    raise exception '5b: a lead arriving told % people, not 1', v_i;
  end if;
  v_i := custom.agg_subscription_fire_entered(v_org, v_won, v_table, v_mark - interval '1 hour');
  if v_i <> 0 then
    raise exception '5c: a record the view does not admit told % people', v_i;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 5 PASSED — a phone edit fires 0, an arrival fires 1, a record outside the view fires 0';

  -- ══ PART 6 — THE SUMMARY IS A DELTA, AND IT NAMES THINGS ═════════════════════
  v_digest := custom.subscription_preview(v_org, v_weekly);
  if v_digest ->> 'incomplete' is not null then
    raise exception '6a: the summary says it cannot be made: %', v_digest ->> 'incomplete';
  end if;
  if (v_digest -> 'counts' ->> 'entered')::int <> 2 then
    raise exception '6b: % leads arrived, not 2 — %', v_digest -> 'counts' ->> 'entered', v_digest ->> 'body';
  end if;
  -- IT NAMES THEM. "2 records changed" is a number; a summary somebody acts on says who.
  if v_digest ->> 'body' not like '%Renee Castillo%' or v_digest ->> 'body' not like '%Marcus Reyes%' then
    raise exception '6c: the summary counted the leads without naming them: %', v_digest ->> 'body';
  end if;
  if (v_digest -> 'counts' ->> 'in_view')::int <> 2 then
    raise exception '6d: the summary says % are in the view while the view holds 2 — it counted the whole table',
                    v_digest -> 'counts' ->> 'in_view';
  end if;
  if v_digest ->> 'link' is null or v_digest ->> 'link' not like '%' || v_view::text || '%' then
    raise exception '6e: the summary has no click-through to the filtered grid: %', v_digest ->> 'link';
  end if;

  -- AND WHEN ONE LEAVES — but only against a watermark she was INSIDE. A departure is
  -- a statement about two moments, so the first summary has to have been sent before
  -- the second one can say anything left: with no previous summary the window opens a
  -- week ago, Renee did not exist then, and "she left" would be a claim about a record
  -- the reader was never told about. That is the correct answer and the suite proves
  -- it rather than working around it.
  if (v_digest -> 'counts' ->> 'left')::int <> 0 then
    raise exception '6f: a first summary reported a departure from a window that opened before the record existed';
  end if;

  -- Stepping out for the notifier's own runner, for the reason PART 0b measured: it is
  -- server-only, and this is the SEND that moves the watermark.
  perform set_config('role', v_boss, true);
  v_i := custom.agg_digest_run(v_org, v_weekly, null);
  if v_i <> 1 then
    raise exception '6g: the weekly summary sent % messages, not 1', v_i;
  end if;
  perform set_config('role', 'authenticated', true);

  -- THE WATERMARK IS THE LAST SEND, AND THE LAST SEND IS THE NOTIFICATION. There is no
  -- second ledger, so the door now says when it last told this person anything.
  select * into v_row from custom.subscriptions(v_org, v_table) s where s.rule_id = v_weekly;
  if v_row.last_sent_at is null then
    raise exception '6h: a summary was sent and the person''s own door still says nothing has ever told them anything';
  end if;

  perform custom.record_update(v_org, v_lead1, jsonb_build_object('stage', 'won'), null);
  v_digest := custom.subscription_preview(v_org, v_weekly);
  if (v_digest -> 'counts' ->> 'entered')::int <> 0 then
    raise exception '6i: the second summary announced the same arrivals again — the watermark did not move: %',
                    v_digest ->> 'body';
  end if;

  -- WHY THE "LEFT" LINE IS NOT ASSERTED END TO END HERE, said plainly rather than
  -- quietly skipped. A departure is a statement about TWO moments, and inside one
  -- transaction there is only one: `now()` is the transaction's start time, so every
  -- outbox row this suite wrote and every window it can ask for carry the same
  -- instant. No arrangement of this file can put a change on one side of a watermark
  -- and a state on the other. It is proven instead by the live run recorded in
  -- v5/BUILD-LOG.md, on the main database, in separate transactions: after Renee's
  -- stage moved to `won` the summary read *"1 left the view: Renee Castillo. 1 in the
  -- view now."*
  --
  -- WHAT IS ASSERTED HERE IS THE DECISION THAT LINE RESTS ON, and it is the exact
  -- thing that was broken until this lane's second fix: the predicate is handed a
  -- state and must answer about the RECORD, not about the shape history happened to
  -- return. `custom.record_as_of` replays the whole ROW with the document nested under
  -- `data`, and reading that envelope as a document answered "not in the view" for
  -- every record at every past moment — so nothing had ever been in a view before,
  -- a phone edit re-announced its record, and no digest could EVER report a departure.
  select sv.definition into v_digest from platform.saved_view sv where sv.id = v_view;
  -- Stepping out once more: this predicate is the notifier's own and holds no client
  -- grant, exactly as PART 0b measured for its three siblings. No clause about a
  -- client's reach is asserted while out.
  perform set_config('role', v_boss, true);
  if not custom.agg_view_admits_state(v_digest, jsonb_build_object('stage', 'new')) then
    raise exception '6j: the view does not admit a plain document that matches its filter';
  end if;
  if custom.agg_view_admits_state(v_digest, jsonb_build_object('stage', 'won')) then
    raise exception '6k: the view admits a document that does not match its filter';
  end if;
  if not custom.agg_view_admits_state(v_digest, jsonb_build_object(
       'id', v_lead1, 'data_class', 'record', 'deleted_at', null,
       'data', jsonb_build_object('stage', 'new'))) then
    raise exception '6l: the predicate read a replayed ROW as a document, so nothing was ever in a view before and no summary could ever report a departure';
  end if;
  if custom.agg_view_admits_state(v_digest, jsonb_build_object(
       'id', v_lead1, 'data_class', 'record', 'deleted_at', now(),
       'data', jsonb_build_object('stage', 'new'))) then
    raise exception '6m: a record that was in the bin at that moment is reported as having been in the view at that moment';
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 6 PASSED — the summary names who arrived, counts the VIEW not the table, links to it, moves its watermark on the send, repeats nobody, and the departure predicate reads a replayed ROW as a row';

  -- ══ PART 7 — SWITCHED OFF MEANS SWITCHED OFF ═════════════════════════════════
  perform custom.subscription_mute(v_org, v_weekly, true);
  select * into v_row from custom.subscriptions(v_org, v_table) s where s.rule_id = v_weekly;
  if not v_row.muted then
    raise exception '7a: the door says a muted subscription is on';
  end if;
  -- A MUTED SUBSCRIPTION HAS NO NEXT TIME. "Next Monday" beside a switch that is off
  -- is a screen that lies about something it can check.
  if v_row.next_digest_at is not null then
    raise exception '7b: a switched-off subscription still promises a summary at %', v_row.next_digest_at;
  end if;
  -- Stepping out again, for the notifier's own reader, for the same stated reason.
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.agg_subscriptions(v_org, null, null) a where a.rule_id = v_weekly;
  if v_n <> 0 then
    raise exception '7c: the one reader every consumer goes through still sees the muted subscription, so "off" on the screen and "does not fire" are two facts that can drift';
  end if;
  v_i := custom.agg_digest_run(v_org, v_weekly, null);
  if v_i <> 0 then
    raise exception '7d: a muted subscription sent % summaries', v_i;
  end if;
  perform set_config('role', 'authenticated', true);
  raise notice 'PART 7 PASSED — muted: the door says off, there is no next time, the notifier cannot see it and it sends nothing';

  -- ══ PART 8 — THE WALL, as test@test.com, still seated ════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  -- THE CONTROL FIRST, so the clauses below are not satisfied by a door that refuses
  -- her everything: she is a member, so the catalogue of cadences is hers to read.
  v_cad := custom.subscription_cadences(v_org);
  if array_length(v_cad, 1) <> 4 then
    raise exception '8a: an ordinary member cannot read the cadence catalogue, so PART 8 proves nothing';
  end if;
  -- She was shared nothing in an organization set to `shared_only`.
  select count(*) into v_n from custom.views(v_org, v_table);
  if v_n <> 0 then
    raise exception '8b: a member who was shared nothing listed % saved views of a Table she cannot open', v_n;
  end if;
  -- THE WHOLE ARGUMENT FOR THE DOOR, MEASURED FROM HER SEAT. The table's own
  -- row-level security is ORGANIZATION-level, so she can read the row itself; it has
  -- no idea which Table the view is over. The door does, and answers her nothing.
  select count(*) into v_n from platform.saved_view sv where sv.id = v_view;
  if v_n <> 1 then
    raise exception '8b2: this clause measures nothing — she cannot even see the row RLS lets her see';
  end if;
  select count(*) into v_n from custom.subscriptions(v_org, v_table);
  if v_n <> 0 then
    raise exception '8c: a member who was shared nothing sees % of somebody else''s notifications', v_n;
  end if;
  begin
    perform custom.subscription_preview(v_org, v_instant);
    raise exception '8d: she read a summary addressed to somebody else — and a summary is assembled UNDER its recipient, so that is their records';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.subscription_mute(v_org, v_instant, true);
    raise exception '8e: she switched off a notification that is not hers';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 8 PASSED — the member reads the catalogue and nothing else: no views, no subscriptions, no preview, no mute';

  raise notice 'ALL PARTS PASSED (0, 0b, 1-8) — lane DIGESTS, from the authenticated seat';
end;
$suite$;

rollback;
