-- AP-3 U6 — A CHANGE TO A PLATFORM LIST ANNOUNCES ITSELF, TO MEMBERS ONLY, WITH IDS AND NOTHING ELSE.
--
-- THE USE CASE (no fake data): Holloway Creative (owner admin@admin.com, member test@test.com) keeps its
-- 160 client contacts as platform records (`crm.party`, token `party`). The Applets acceptance has both
-- people editing that list at once; each must see the other's change within a second. The screen hears
-- a NOTICE on the private topic `mx:entity-org:<organization>:<token>` (event `entity_bump`, payload
-- `{id, entity_type, organization_id, op, op_id, ids | null, at}`) and re-reads the ids through
-- `platform.entity_get`, so row security decides what it sees at read time.
--
-- THE FIX (migrations ap3_u6_entity_org_notices + ap3_u6_entity_org_notice_triggers_<table>, 2026-10-06):
-- three statement-level AFTER triggers (INSERT / UPDATE / DELETE) on crm.party, crm.deal,
-- projects.projects, projects.tasks, hr.employee → platform.entity_org_notice_stmt → one
-- platform._entity_org_notice per organization the statement touched (read back; a miss is an
-- ops.system_error, never a failed write); prefix `mx:entity-org` admitted by
-- platform.entity_org_topic_admits (her own iam.my_orgs(), not archived, organization-visible type that
-- announces, SELECT on the table — never the admin route).
--
--  1 · an edit by test@test.com through platform.entity_update sends EXACTLY ONE notice on the Holloway
--      party topic, naming that id, op 'updated', event entity_bump, private, no values;
--  2 · the writer's op id rides header x-matrx-op-id into the notice (echo suppression);
--  3 · one statement over 160 contacts (> knob entity_data.realtime_max_ids = 100) sends ONE notice with
--      ids null; one over exactly 100 sends the 100 ids;
--  4 · a contact moved to another organization notifies BOTH organizations, each naming it;
--  5 · admission: test@test.com and admin@admin.com (members) admitted; marcus.tillman (not a member)
--      refused; admin@admin.com refused on an organization she is not a member of (no admin route);
--      signed-out refused; a type that does not announce refused; a malformed topic refused;
--  6 · NO ID LEAKS: every Holloway row of the five types is readable by the member test@test.com
--      (including a Shown-to `only_me` contact created by someone else), and every one of the five
--      tables carries the member arm and data_class 'organization';
--  7 · A LOST SEND IS RECORDED: the live notice body is re-created in this rolled-back transaction with
--      ONE substitution — realtime.send swapped for a stand-in that loses the message the way
--      realtime.send loses one (a warning, nothing inserted). The write still lands and the read-back
--      files `realtime_notice_not_delivered` in ops.system_error against Holloway on that topic.
--
-- RED TWIN: ap3_u6_entity_notices_red.sql. Ends in ROLLBACK; leaves nothing behind.

\set suite 'ap3_u6_entity_notices_green.sql'
\set requires 'relation:crm.party|row:iam.organization_member:organization_id = \'344cfaa8-2b0c-4971-854a-9694614816f2\' and user_id = \'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

create function pg_temp.sent(p_topic text) returns integer language sql as $$
  -- inserted_at defaults to now(), the start of THIS transaction: only this suite's rows match.
  select count(*)::int from realtime.messages m where m.topic = p_topic and m.inserted_at = now()
$$;
create function pg_temp.last_notice(p_topic text) returns jsonb language sql as $$
  select jsonb_build_object('payload', m.payload, 'event', m.event, 'private', m.private)
    from realtime.messages m where m.topic = p_topic and m.inserted_at = now()
   order by m.payload ->> 'at' desc, m.ctid desc limit 1
$$;
create function pg_temp.seat(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then '' else json_build_object('sub', p_user::text, 'role', 'authenticated')::text end, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.admits(p_user uuid, p_topic text) returns boolean language plpgsql as $$
declare v boolean;
begin
  perform pg_temp.seat(p_user);
  v := platform.realtime_topic_admits(p_topic);
  perform set_config('role', 'postgres', true);
  return v;
end $$;
-- The stand-in for a lost send (step 7): realtime.send's own failure shape — a warning, no row.
create function pg_temp.send_lost(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$
begin
  raise warning 'WarnSendingBroadcastMessage: (suite stand-in) the message was lost';
end $$;

do $$
declare
  c_owner   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, Holloway owner
  c_member  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, Holloway member
  c_outside uuid := 'ab94c16c-b4a5-49f0-a068-e2a11db34a2c';  -- marcus.tillman (persona factory), not a member
  c_org     uuid := '344cfaa8-2b0c-4971-854a-9694614816f2';  -- Holloway Creative
  v_topic   text := 'mx:entity-org:344cfaa8-2b0c-4971-854a-9694614816f2:party';
  v_other   uuid;   -- another organization test@test.com belongs to
  v_foreign uuid;   -- an organization admin@admin.com does NOT belong to
  v_id uuid; v_id2 uuid; v_ver int; v_name text; v_n int; v_n2 int; v_msg jsonb; v_op uuid := gen_random_uuid();
  v_def text; v_errs int; v_cap int; v_ids jsonb; v_t text;
begin
  perform set_config('app.actor_system', 'campaign.ap3_u6_entity_notices_green', true);
  v_cap := (platform.knob_resolve('entity_data', 'realtime_max_ids', c_org) #>> '{}')::int;
  if v_cap is distinct from 100 then raise exception '0: knob entity_data.realtime_max_ids for Holloway is %, this suite expects 100', v_cap; end if;
  select m.organization_id into v_other from iam.organization_member m join iam.organizations o on o.id = m.organization_id
   where m.user_id = c_member and o.archived_at is null and m.organization_id <> c_org order by 1 limit 1;
  select o.id into v_foreign from iam.organizations o where o.archived_at is null
     and o.id not in (select organization_id from iam.organization_member where user_id = c_owner) order by o.id limit 1;

  -- 1 · ONE EDIT, ONE NOTICE, NAMING THE ID ------------------------------------------------------
  select id, version, display_name into v_id, v_ver, v_name
    from crm.party where organization_id = c_org and deleted_at is null order by id limit 1;
  perform pg_temp.seat(c_member);
  perform platform.entity_update('party', v_id, v_ver, jsonb_build_object('display_name', v_name || ' (moved desk)'));
  perform set_config('role', 'postgres', true);
  v_n := pg_temp.sent(v_topic);
  v_msg := pg_temp.last_notice(v_topic);
  if v_n <> 1 then raise exception '1: one edit sent % notices on %', v_n, v_topic; end if;
  if v_msg -> 'payload' -> 'ids' <> jsonb_build_array(v_id) or v_msg -> 'payload' ->> 'op' <> 'updated'
     or v_msg ->> 'event' <> 'entity_bump' or (v_msg ->> 'private')::boolean is not true
     or v_msg -> 'payload' ->> 'entity_type' <> 'party' or v_msg -> 'payload' -> 'op_id' <> 'null'::jsonb then
    raise exception '1: wrong notice %', v_msg;
  end if;
  if (select count(*) from jsonb_object_keys(v_msg -> 'payload')) <> 7
     or (v_msg -> 'payload') ?| array['display_name', 'values', 'row'] then
    raise exception '1: the notice carries more than ids: %', v_msg -> 'payload';
  end if;

  -- 2 · THE WRITER'S OP ID COMES BACK ---------------------------------------------------------------
  perform set_config('request.headers', json_build_object('x-matrx-op-id', v_op::text)::text, true);
  perform pg_temp.seat(c_member);
  perform platform.entity_update('party', v_id, v_ver + 1, jsonb_build_object('display_name', v_name));
  perform set_config('role', 'postgres', true);
  perform set_config('request.headers', '', true);
  v_msg := pg_temp.last_notice(v_topic);
  if pg_temp.sent(v_topic) <> 2 or v_msg -> 'payload' ->> 'op_id' <> v_op::text then
    raise exception '2: the op id did not ride back: %', v_msg;
  end if;

  -- 3 · ABOVE THE KNOB, ids IS NULL; AT THE KNOB, ALL OF THEM ---------------------------------------
  update crm.party set display_name = display_name where organization_id = c_org;
  get diagnostics v_n2 = row_count;
  v_msg := pg_temp.last_notice(v_topic);
  if v_n2 <= 100 or pg_temp.sent(v_topic) <> 3 or v_msg -> 'payload' -> 'ids' <> 'null'::jsonb then
    raise exception '3: a % row statement sent % notices, last %', v_n2, pg_temp.sent(v_topic) - 2, v_msg;
  end if;
  update crm.party set display_name = display_name
   where id in (select id from crm.party where organization_id = c_org order by id limit 100);
  v_msg := pg_temp.last_notice(v_topic);
  if pg_temp.sent(v_topic) <> 4 or jsonb_array_length(v_msg -> 'payload' -> 'ids') <> 100 then
    raise exception '3: a 100 row statement did not list its 100 ids: %', left(v_msg::text, 200);
  end if;

  -- 4 · A MOVE BETWEEN ORGANIZATIONS NOTIFIES BOTH ------------------------------------------------
  select id into v_id2 from crm.party where organization_id = c_org and id <> v_id order by id desc limit 1;
  update crm.party set organization_id = v_other where id = v_id2;
  v_msg := pg_temp.last_notice(v_topic);
  if pg_temp.sent(v_topic) <> 5 or v_msg -> 'payload' -> 'ids' <> jsonb_build_array(v_id2) then
    raise exception '4: the organization the row left did not hear: %', v_msg;
  end if;
  v_t := 'mx:entity-org:' || v_other || ':party';
  v_msg := pg_temp.last_notice(v_t);
  if pg_temp.sent(v_t) <> 1 or v_msg -> 'payload' -> 'ids' <> jsonb_build_array(v_id2) then
    raise exception '4: the organization the row joined did not hear: %', v_msg;
  end if;

  -- 5 · WHO IS ADMITTED --------------------------------------------------------------------------
  if not pg_temp.admits(c_member, v_topic) then raise exception '5: test@test.com (member) refused'; end if;
  if not pg_temp.admits(c_owner, v_topic) then raise exception '5: admin@admin.com (owner) refused'; end if;
  if pg_temp.admits(c_outside, v_topic) then raise exception '5: marcus.tillman (not a member) ADMITTED'; end if;
  if pg_temp.admits(c_owner, 'mx:entity-org:' || v_foreign || ':party') then
    raise exception '5: admin@admin.com admitted to % where she is not a member (admin route)', v_foreign;
  end if;
  if pg_temp.admits(null, v_topic) then raise exception '5: a signed-out socket ADMITTED'; end if;
  if pg_temp.admits(c_member, 'mx:entity-org:' || c_org || ':note') then raise exception '5: a type that does not announce ADMITTED'; end if;
  if pg_temp.admits(c_member, v_topic || ':x') or pg_temp.admits(c_member, 'mx:entity-org:' || c_org) then
    raise exception '5: a malformed topic ADMITTED';
  end if;

  -- 6 · NO ID LEAKS -------------------------------------------------------------------------------
  -- 6a: the registry and every table's own policy say a member reads every row of her organization.
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join platform.entity_types e on e.table_ref = c.oid
    join pg_policy p on p.polrelid = c.oid and p.polname = 'std_select'
   where t.tgfoid = 'platform.entity_org_notice_stmt()'::regprocedure
     and e.data_class = 'organization'
     and position($p$((visibility >= 'internal'::platform.visibility) OR (visibility = 'personal'::platform.visibility)) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)))$p$
                  in pg_get_expr(p.polqual, p.polrelid)) > 0
     and (select count(*) from pg_enum where enumtypid = 'platform.visibility'::regtype) = 4;
  if v_n <> 15 then raise exception '6a: % of the 15 announcing triggers sit on a table whose members read every organization row', v_n; end if;
  -- 6b: a Shown-to only_me contact that admin@admin.com made is still OPEN to the member (a filter, not a lock).
  update crm.party set shown_to = 'only_me', created_by = c_owner where id = v_id;
  perform pg_temp.seat(c_member);
  select count(*) into v_n from crm.party where id = v_id;
  select count(*) into v_n2 from crm.party where organization_id = c_org;
  perform set_config('role', 'postgres', true);
  if v_n <> 1 then raise exception '6b: an only_me contact on the topic is NOT readable by the member: an id leak'; end if;
  if v_n2 <> (select count(*) from crm.party where organization_id = c_org) then
    raise exception '6b: the member reads % of % Holloway contacts: ids on the topic would leak', v_n2, (select count(*) from crm.party where organization_id = c_org);
  end if;

  -- 7 · A LOST SEND IS RECORDED, THE WRITE STILL LANDS ---------------------------------------------
  v_def := pg_get_functiondef('platform._entity_org_notice(uuid,text,text,jsonb)'::regprocedure);
  if position('perform realtime.send(' in v_def) = 0 then raise exception '7: the live body no longer calls realtime.send'; end if;
  execute replace(v_def, 'perform realtime.send(', 'perform pg_temp.send_lost(');
  select count(*) into v_errs from ops.system_error where kind = 'realtime_notice_not_delivered' and route = v_topic and created_at >= now();
  select version into v_ver from crm.party where id = v_id;
  v_n := pg_temp.sent(v_topic);   -- 6b's own update was announced too
  perform pg_temp.seat(c_member);
  perform platform.entity_update('party', v_id, v_ver, jsonb_build_object('display_name', v_name || ' (lost send)'));
  perform set_config('role', 'postgres', true);
  if (select display_name from crm.party where id = v_id) <> v_name || ' (lost send)' then raise exception '7: the write did not land'; end if;
  if pg_temp.sent(v_topic) <> v_n then raise exception '7: the stand-in did not lose the message'; end if;
  if (select count(*) from ops.system_error where kind = 'realtime_notice_not_delivered' and route = v_topic and created_at >= now()
        and occurred_in_organization_id = c_org and source_feature = 'entity_data.realtime') <> v_errs + 1 then
    raise exception '7: the lost send was NOT recorded in ops.system_error';
  end if;

  raise notice 'ap3_u6_entity_notices_green: one edit → one notice naming %; op id carried; 160-row statement → ids null, 100-row → 100 ids; a move notifies both; members admitted, outsider/foreign/signed-out/non-announcing/malformed refused; no id leaks; a lost send recorded', v_id;
end $$;

rollback;
