-- LANE AUTOMATION-TIME — THE GREEN SUITE. A table acts when a date arrives, and on a schedule.
--
-- THE USE CASE. Dana Whitfield runs a small agency. Her "Client content calendar" lists each post with a post date and
-- an owner; she wants the owner reminded two days before the post date, and a "Monday planning" row to appear every
-- Monday. The suite takes the seat of admin@admin.com (editor of the table); the tick runs as the store's own role,
-- exactly as pg_cron runs it, on an injected clock (custom.automation_clock).
--
-- WHAT MAKES IT FAIL — one production change per part:
--   1  automation_declare storing a date trigger on a non-date property, a bad time, a schedule with no `every`, a
--      weekly schedule with no weekday, a "set" step or a condition on a schedule -> each must be `_errors`.
--   2  the tick not reminding the owner of a post whose date is two days away, reminding about a far or long-past
--      date, reminding twice for the same date, or not re-arming when the date changes.
--   3  a weekly schedule not adding its row on its day, adding it twice, firing for an occurrence before it was
--      declared, or {"in_days"} not writing a date.
--   4  a monthly "day 31" not running on the last day of a short month, or running in the wrong month.
--   5  a scheduled "edit rows" not editing exactly the rows its filter names.
--   6  an off or archived timed automation still running; no run row in the existing runs list.
--
-- FAILING-THEN-PASSING: before automationtime_a_a_table_acts_when_a_date_arrives_and_on_a_schedule.sql is applied this
-- fails at part 1 (the trigger is refused by name). Run: the whole file in one transaction, rolled back at the end.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid; v_posts uuid; v_tasks uuid;
  f_title uuid; f_date uuid; f_owner uuid; f_t_title uuid; f_t_status uuid; f_t_due uuid;
  p1 uuid; p2 uuid; p3 uuid;
  a_remind uuid; a_week uuid; a_month uuid; a_edit uuid; a_off uuid;
  v_res jsonb; v_n integer; v_runs jsonb; v_zone text; v_today date; v_clock timestamptz; v_log text := '';
  t1 uuid; t2 uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/automation-time', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Whitfield Content Studio ' || substr(v_org::text, 1, 8), 'whitfield-content-' || substr(v_org::text, 1, 8), 'WCS', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'automation-time fixture');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_posts := custom.table_declare(v_org, jsonb_build_object('name', 'Client content calendar', 'slug', 'content_calendar', 'type', 'entity',
    'label_singular', 'Post', 'label_plural', 'Posts', 'title_field', 'title', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'title'))));
  v_tasks := custom.table_declare(v_org, jsonb_build_object('name', 'Agency tasks', 'slug', 'agency_tasks', 'type', 'entity',
    'label_singular', 'Task', 'label_plural', 'Tasks', 'title_field', 'title', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'title'))));
  f_title := custom.field_declare(v_org, v_posts, jsonb_build_object('key', 'title', 'label', 'Post', 'type', 'text', 'sort', 10));
  f_date  := custom.field_declare(v_org, v_posts, jsonb_build_object('key', 'post_date', 'label', 'Post date', 'type', 'range', 'config', jsonb_build_object('kind', 'date'), 'sort', 20));
  f_owner := custom.field_declare(v_org, v_posts, jsonb_build_object('key', 'owner_id', 'label', 'Owner', 'type', 'text', 'sort', 30));
  f_t_title  := custom.field_declare(v_org, v_tasks, jsonb_build_object('key', 'title', 'label', 'Task', 'type', 'text', 'sort', 10));
  f_t_status := custom.field_declare(v_org, v_tasks, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 20,
                  'options', jsonb_build_array('Todo', 'Done', 'Archived')));
  f_t_due    := custom.field_declare(v_org, v_tasks, jsonb_build_object('key', 'due', 'label', 'Due', 'type', 'range', 'config', jsonb_build_object('kind', 'date'), 'sort', 30));

  v_zone := custom.day_zone(v_org);
  v_today := (now() at time zone v_zone)::date;
  p1 := custom.record_write(v_org, v_posts, jsonb_build_object('title', 'Spring menu announcement', 'post_date', (v_today + 2)::text, 'owner_id', c_admin::text));
  p2 := custom.record_write(v_org, v_posts, jsonb_build_object('title', 'Chef profile carousel', 'post_date', (v_today + 10)::text, 'owner_id', c_admin::text));
  p3 := custom.record_write(v_org, v_posts, jsonb_build_object('title', 'Last winter recap', 'post_date', (v_today - 30)::text, 'owner_id', c_admin::text));
  t1 := custom.record_write(v_org, v_tasks, jsonb_build_object('title', 'Send March invoices', 'status', 'Done'));
  t2 := custom.record_write(v_org, v_tasks, jsonb_build_object('title', 'Book the studio', 'status', 'Todo'));

  perform set_config('role', 'authenticated', true);
  if current_user is distinct from 'authenticated' then raise exception '0: not seated'; end if;

  -- ══ PART 1 — THE TRIGGERS, JUDGED WHOLE ═══════════════════════════════════════════════
  v_res := custom.automation_declare(v_org, v_posts, jsonb_build_object('name', 'Bad field',
    'trigger', jsonb_build_object('on', 'date_arrives', 'field', f_title), 'actions', jsonb_build_array(jsonb_build_object('do', 'webhook', 'url', 'https://example.com/h'))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'trigger.field' is null then raise exception '1a: a date trigger on a text property was stored: %', v_res; end if;
  v_res := custom.automation_declare(v_org, v_posts, jsonb_build_object('name', 'Bad time',
    'trigger', jsonb_build_object('on', 'date_arrives', 'field', f_date, 'at', '25:61'), 'actions', jsonb_build_array(jsonb_build_object('do', 'webhook', 'url', 'https://example.com/h'))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'trigger.at' is null then raise exception '1b: a bad time of day was stored: %', v_res; end if;
  v_res := custom.automation_declare(v_org, v_tasks, jsonb_build_object('name', 'No every',
    'trigger', jsonb_build_object('on', 'schedule'), 'actions', jsonb_build_array(jsonb_build_object('do', 'add_row', 'table_id', v_tasks, 'values', jsonb_build_object(f_t_title, 'x')))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'trigger.every' is null then raise exception '1c: a schedule with no frequency was stored: %', v_res; end if;
  v_res := custom.automation_declare(v_org, v_tasks, jsonb_build_object('name', 'No weekday',
    'trigger', jsonb_build_object('on', 'schedule', 'every', 'week'), 'actions', jsonb_build_array(jsonb_build_object('do', 'add_row', 'table_id', v_tasks, 'values', jsonb_build_object(f_t_title, 'x')))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'trigger.weekday' is null then raise exception '1d: a weekly schedule with no weekday was stored: %', v_res; end if;
  v_res := custom.automation_declare(v_org, v_tasks, jsonb_build_object('name', 'Set on schedule',
    'trigger', jsonb_build_object('on', 'schedule', 'every', 'day'), 'actions', jsonb_build_array(jsonb_build_object('do', 'set', 'values', jsonb_build_object(f_t_status, 'Done')))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'actions.0' is null then raise exception '1e: a set step on a schedule was stored: %', v_res; end if;
  v_res := custom.automation_declare(v_org, v_tasks, jsonb_build_object('name', 'Condition on schedule',
    'trigger', jsonb_build_object('on', 'schedule', 'every', 'day'),
    'condition', jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', f_t_title))),
    'actions', jsonb_build_array(jsonb_build_object('do', 'add_row', 'table_id', v_tasks, 'values', jsonb_build_object(f_t_title, 'x')))));
  if (v_res ->> 'ok')::boolean or v_res -> '_errors' -> 'condition' is null then raise exception '1f: a condition on a schedule was stored: %', v_res; end if;
  if jsonb_array_length(custom.automations(v_posts, v_org) -> 'automations') <> 0 or jsonb_array_length(custom.automations(v_tasks, v_org) -> 'automations') <> 0
    then raise exception '1g: a refused spec left an automation behind'; end if;
  v_log := v_log || E'\n1 PASS — six bad timed specs came back as _errors; nothing stored.';

  -- ══ PART 2 — "REMIND THE OWNER TWO DAYS BEFORE THE POST DATE" ═════════════════════════
  v_res := custom.automation_declare(v_org, v_posts, jsonb_build_object('name', 'Remind owner two days before',
    'trigger', jsonb_build_object('on', 'date_arrives', 'field', f_date, 'offset_days', -2, 'at', '00:00'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'notify', 'to', jsonb_build_object('field', f_owner),
      'text', '{{' || f_title::text || '}} goes out in two days.'))));
  if not (v_res ->> 'ok')::boolean then raise exception '2a: a good date automation was refused: %', v_res; end if;
  a_remind := (v_res ->> 'automation_id')::uuid;
  if v_res -> 'spec' -> 'trigger' ->> 'offset_days' <> '-2' or v_res -> 'spec' -> 'trigger' ->> 'at' <> '00:00' then raise exception '2b: trigger not normalized: %', v_res; end if;

  perform set_config('role', 'postgres', true);
  perform custom.automation_time_tick();
  select count(*) into v_n from communication.notification n where n.organization_id = v_org and n.recipient_user_id = c_admin
     and n.payload -> 'notice' ->> 'body' = 'Spring menu announcement goes out in two days.';
  if v_n < 1 then raise exception '2c: the owner of the post two days away was not reminded (% notices)', v_n; end if;
  select count(*) into v_n from communication.notification n where n.organization_id = v_org and (n.payload -> 'notice' ->> 'body' like '%Chef profile%' or n.payload -> 'notice' ->> 'body' like '%Last winter%');
  if v_n <> 0 then raise exception '2d: a post ten days away or long past was reminded (% notices)', v_n; end if;
  perform custom.automation_time_tick();
  perform custom.automation_time_tick();
  v_runs := custom.automation_runs(a_remind, 50, null, v_org);
  if jsonb_array_length(v_runs -> 'runs') <> 1 or v_runs -> 'runs' -> 0 ->> 'status' <> 'ran' or v_runs -> 'runs' -> 0 ->> 'record_id' <> p1::text
    then raise exception '2e: run history wrong (a second tick must not fire again): %', v_runs; end if;
  -- the date changes: it re-arms. Tomorrow's date is two days away from the day after tomorrow... pick the date that is due now.
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(v_org, p1, jsonb_build_object('post_date', (v_today + 1)::text));
  perform set_config('role', 'postgres', true);
  perform custom.automation_time_tick();
  v_runs := custom.automation_runs(a_remind, 50, null, v_org);
  if jsonb_array_length(v_runs -> 'runs') <> 2 then raise exception '2f: a changed date did not re-arm (% runs, want 2)', jsonb_array_length(v_runs -> 'runs'); end if;
  perform set_config('role', 'authenticated', true);
  v_log := v_log || E'\n2 PASS — owner reminded once for the post two days away; far and stale posts ignored; no second reminder; a changed date re-armed it; runs listed.';

  -- ══ PART 3 — THE WEEKLY "MONDAY PLANNING" ROW ═════════════════════════════════════════
  v_clock := now() + interval '8 days';
  v_res := custom.automation_declare(v_org, v_tasks, jsonb_build_object('name', 'Monday planning',
    'trigger', jsonb_build_object('on', 'schedule', 'every', 'week', 'weekday', extract(isodow from (v_clock at time zone v_zone)::date)::integer, 'at', '00:00'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'add_row', 'table_id', v_tasks,
      'values', jsonb_build_object(f_t_title, 'Monday planning', f_t_status, 'Todo', f_t_due, jsonb_build_object('in_days', 4))))));
  if not (v_res ->> 'ok')::boolean then raise exception '3a: a good weekly schedule was refused: %', v_res; end if;
  a_week := (v_res ->> 'automation_id')::uuid;
  perform set_config('role', 'postgres', true);
  -- before it was declared: the real clock is before its first occurrence, so nothing is added
  perform custom.automation_time_tick();
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tasks and r.data ->> 'title' = 'Monday planning' and r.deleted_at is null;
  if v_n <> 0 then raise exception '3b: a schedule fired for an occurrence before it was declared (% rows)', v_n; end if;
  perform set_config('custom.automation_clock', v_clock::text, true);
  perform custom.automation_time_tick();
  perform custom.automation_time_tick();
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tasks and r.data ->> 'title' = 'Monday planning' and r.deleted_at is null;
  if v_n <> 1 then raise exception '3c: Monday planning rows on its day = % (want 1, once only)', v_n; end if;
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tasks and r.data ->> 'title' = 'Monday planning' and r.data ->> 'due' ~ '^\d{4}-\d{2}-\d{2}$';
  if v_n < 1 then raise exception '3d: the row has no due date four days out'; end if;
  perform set_config('custom.automation_clock', (v_clock + interval '1 day')::text, true);
  perform custom.automation_time_tick();
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tasks and r.data ->> 'title' = 'Monday planning' and r.deleted_at is null;
  if v_n <> 1 then raise exception '3e: the next day added another Monday row (% rows)', v_n; end if;
  perform set_config('custom.automation_clock', (v_clock + interval '7 days')::text, true);
  perform custom.automation_time_tick();
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tasks and r.data ->> 'title' = 'Monday planning' and r.deleted_at is null;
  if v_n <> 2 then raise exception '3f: the next Monday did not add its row (% rows)', v_n; end if;
  v_runs := custom.automation_runs(a_week, 50, null, v_org);
  if jsonb_array_length(v_runs -> 'runs') <> 2 or v_runs -> 'runs' -> 0 ->> 'record_id' is not null then raise exception '3g: run history wrong: %', v_runs; end if;
  perform set_config('role', 'authenticated', true);
  v_log := v_log || E'\n3 PASS — Monday planning row added on its day only, once, with a due date four days out; none before declaration; the next Monday added its own.';

  perform custom.automation_archive(v_org, a_week);
  perform custom.automation_archive(v_org, a_remind);

  -- ══ PART 4 — A MONTHLY "DAY 31" RUNS ON THE LAST DAY OF A SHORT MONTH ════════════════
  v_res := custom.automation_declare(v_org, v_tasks, jsonb_build_object('name', 'Month-end close',
    'trigger', jsonb_build_object('on', 'schedule', 'every', 'month', 'day', 31, 'at', '00:00'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'add_row', 'table_id', v_tasks, 'values', jsonb_build_object(f_t_title, 'Month-end close', f_t_status, 'Todo')))));
  if not (v_res ->> 'ok')::boolean then raise exception '4a: a monthly schedule was refused: %', v_res; end if;
  a_month := (v_res ->> 'automation_id')::uuid;
  perform set_config('role', 'postgres', true);
  perform set_config('custom.automation_clock', (timestamp '2027-02-27 12:00' at time zone v_zone)::text, true);
  perform custom.automation_time_tick();
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tasks and r.data ->> 'title' = 'Month-end close' and r.deleted_at is null;
  if v_n <> 0 then raise exception '4b: day 31 ran on Feb 27 (% rows)', v_n; end if;
  perform set_config('custom.automation_clock', (timestamp '2027-02-28 12:00' at time zone v_zone)::text, true);
  perform custom.automation_time_tick();
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tasks and r.data ->> 'title' = 'Month-end close' and r.deleted_at is null;
  if v_n <> 1 then raise exception '4c: day 31 did not run on the last day of February (% rows)', v_n; end if;
  perform custom.automation_time_tick();
  select count(*) into v_n from custom.record r where r.organization_id = v_org and r.table_id = v_tasks and r.data ->> 'title' = 'Month-end close' and r.deleted_at is null;
  if v_n <> 1 then raise exception '4d: ran twice in one month (% rows)', v_n; end if;
  perform set_config('role', 'authenticated', true);
  perform custom.automation_archive(v_org, a_month);
  v_log := v_log || E'\n4 PASS — day 31 skipped Feb 27, ran on Feb 28, once.';

  -- ══ PART 5 — A SCHEDULED "EDIT ROWS" EDITS EXACTLY THE ROWS ITS FILTER NAMES ══════════
  v_res := custom.automation_declare(v_org, v_tasks, jsonb_build_object('name', 'Archive finished tasks',
    'trigger', jsonb_build_object('on', 'schedule', 'every', 'day', 'at', '00:00'),
    'actions', jsonb_build_array(jsonb_build_object('do', 'edit_rows', 'table_id', v_tasks,
      'where', jsonb_build_object('op', 'eq', 'args', jsonb_build_array(jsonb_build_object('field', f_t_status), jsonb_build_object('const', 'done'))),
      'values', jsonb_build_object(f_t_status, 'Archived')))));
  if not (v_res ->> 'ok')::boolean then raise exception '5a: a scheduled edit rows was refused: %', v_res; end if;
  a_edit := (v_res ->> 'automation_id')::uuid;
  perform set_config('role', 'postgres', true);
  perform set_config('custom.automation_clock', (now() + interval '30 days')::text, true);
  perform custom.automation_time_tick();
  if (select lower(r.data ->> 'status') from custom.record r where r.id = t1) <> 'archived' then raise exception '5b: the Done task was not archived: %', custom.automation_runs(a_edit, 5, null, v_org); end if;
  if (select lower(r.data ->> 'status') from custom.record r where r.id = t2) <> 'todo' then raise exception '5c: a Todo task was touched'; end if;
  v_runs := custom.automation_runs(a_edit, 50, null, v_org);
  if v_runs -> 'runs' -> 0 ->> 'status' <> 'ran' then raise exception '5d: run: %', v_runs; end if;
  v_log := v_log || E'\n5 PASS — the filter named one task and only it was archived.';

  -- ══ PART 6 — OFF AND ARCHIVED DO NOT RUN ═════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  perform custom.automation_set_enabled(v_org, a_edit, false);
  perform custom.record_update(v_org, t2, jsonb_build_object('status', 'Done'));
  perform set_config('role', 'postgres', true);
  perform set_config('custom.automation_clock', (now() + interval '60 days')::text, true);
  perform custom.automation_time_tick();
  if (select lower(r.data ->> 'status') from custom.record r where r.id = t2) <> 'done' then raise exception '6a: a switched-off schedule still ran'; end if;
  perform set_config('custom.automation_clock', '', true);
  perform set_config('role', 'authenticated', true);
  v_log := v_log || E'\n6 PASS — a switched-off schedule did nothing.';

  raise notice 'AUTOMATION-TIME GREEN — %', v_log;
end
$t$;

rollback;
