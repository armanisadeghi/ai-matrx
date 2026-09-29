-- LANE SCOPES-READS-ACCESS — THE SHADOW COMPARE: every allow and every refusal of the class, container-
-- access, kernel, creator-page and invitation readers is the same after they read the record store.
--
-- THE USE CASE. Teachers run classes (a class is a scope of the type "class"); students join with a code,
-- ask to join a closed class, buy a paid one; the teacher approves, removes, assigns decks and reads each
-- student's progress; a creator's public page lists her classes with their price; an invitation into a
-- class names it; the platform's access kernel answers "may this person open this scope". The cutover
-- moves every one of those reads from context.scopes to the class's Record in the store. Nobody may gain
-- or lose anything by it.
--
-- HOW (the Scientist method, GitHub): ONE transaction, rolled back. Every probe runs on the OLD bodies,
-- then migrations/campaign/scopesaccess_the_class_and_access_readers_read_the_store.sql is applied inside
-- the same transaction, then every probe runs on the NEW bodies, and the answers are compared as JSON.
-- A probe runs as its seat (role authenticated with the person's claims, role anon, or service_role),
-- under setseed, inside a sub-block that ALWAYS rolls back its writes, and returns the answer (or its
-- SQLSTATE and message) plus — for a writer — the class's memberships, its old row, its Record and its
-- assignments after the call, so a writer's EFFECT is compared, not only what it returned.
--
-- SEATS. Every signed-in person on the database (every member of every organization) and the anonymous
-- seat, for every class and every self-scoped door; the doors that act on another person (grant, approve,
-- remove, confer / revoke purchase, assign / unassign) for every person related to the class (its
-- creator, every member of its organization, every member of the class) plus ten unrelated people and
-- the anonymous seat, against every member of the class, its creator and one unrelated person.
--
-- RED. After the NEW run, a savepoint plants five divergences — four in the store's data (one class's
-- access mode, one class's name, one scope's creator, one join code) and one in a body (the class finder
-- stops requiring the slug `class`) — and the planted probes must MISMATCH; the savepoint is rolled back.
-- GREEN. 0 mismatches between OLD and NEW.
--
-- Precondition: scopesaccess_a_removed_scope_setting_leaves_the_store.sql applied, and the four
-- disabled join codes carried (on production by their owner pressing Disable; on the clone the
-- suite carries them itself, below, through the same door).

\set ON_ERROR_STOP on
\timing off
\set suite 'scopesaccess_shadow_compare.sql'
\set expect 'clone'
\set requires 'function:public.edu_class_state|function:iam._container_authz|function:platform.entity_row_access_attrs'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- REPEATABLE READ: other lanes rehearse on this clone while the compare runs; the world is the one
-- the transaction's first query saw, for the OLD run and the NEW run alike.
begin isolation level repeatable read;
set local statement_timeout = 0;
set local lock_timeout = '180s';
set local work_mem = '64MB';

-- ════════════════════════════════════════════════════════════════════ the world under test
-- Production's data as the clone copied it (CLONE-REF `promoted`, passed as -v world_until=…). A scope
-- or type another lane's rehearsal made on the clone after that is not production's, and the clone runs
-- no follow, so its store twin may lag: it is left out, and counted.
\if :{?world_until}
\else
\echo 'pass -v world_until=<the clone promotion time from common-docs/operations/clone/CLONE-REF>'
\quit
\endif
create temp table l7_world_type on commit drop as
  select st.id from context.scope_types st where st.created_at <= :'world_until'::timestamptz;
create temp table l7_world_scope on commit drop as
  select s.id from context.scopes s where s.created_at <= :'world_until'::timestamptz and s.scope_type_id in (select id from l7_world_type);
create temp table w_types on commit drop as
  select st.id, st.organization_id, st.slug, st.deleted_at from context.scope_types st where st.id in (select id from l7_world_type);
create temp table w_scopes on commit drop as
  select s.id, s.organization_id, s.scope_type_id, s.created_by, s.name, s.settings, s.deleted_at
    from context.scopes s where s.id in (select id from l7_world_scope);
create index on w_scopes (id); create index on w_scopes (organization_id); create index on w_scopes (scope_type_id);
select (select count(*) from context.scopes) - (select count(*) from l7_world_scope) as scopes_made_on_the_clone_after_its_copy_left_out,
       (select count(*) from context.scope_types) - (select count(*) from l7_world_type) as types_left_out;

-- ════════════════════════════════════════════════════════════════════ the machinery
create temp table l7_probe (
  id          serial primary key,
  kind        text not null,
  class_id    uuid,
  seat        uuid,
  seat_role   text not null,     -- authenticated | anon | service_role | none (postgres)
  claims_role text,              -- the role auth.role() reads
  sql         text not null,
  snap        text               -- a query run after the call, as the owner, before the roll back
) on commit drop;
-- An answer is kept as the md5 of its canonical JSON text (equal jsonb, equal text) plus its first words.
create temp table l7_ans (probe int not null, side text not null, h text, preview text, err boolean, primary key (probe, side)) on commit drop;

create temp table l7_unmeasured (probe int, side text, code text) on commit drop;

create function pg_temp.l7_call(p_seat uuid, p_role text, p_claims_role text, p_sql text, p_snap text, p_seed float8)
 returns jsonb language plpgsql as $f$
declare v jsonb; v_snap jsonb;
begin
  perform setseed(p_seed);
  perform set_config('request.jwt.claims',
    case when p_seat is null then json_build_object('role', coalesce(p_claims_role, p_role))::text
         else json_build_object('sub', p_seat, 'role', coalesce(p_claims_role, p_role))::text end, true);
  if p_role <> 'none' then perform set_config('role', p_role, true); end if;
  begin
    execute p_sql into v;
    perform set_config('role', 'none', true);
    if p_snap is not null then execute p_snap into v_snap; end if;
    raise exception using errcode = 'P0L7A', message = jsonb_build_object('ok', v, 'snap', v_snap)::text;
  exception
    when sqlstate 'P0L7A' then
      perform set_config('role', 'none', true);
      return sqlerrm::jsonb;
    when others then
      perform set_config('role', 'none', true);
      return jsonb_build_object('err', sqlstate, 'msg', sqlerrm);
  end;
end $f$;

create function pg_temp.l7_run(p_side text, p_kinds text[] default null, p_classes uuid[] default null)
 returns int language plpgsql as $f$
declare p record; n int := 0; v jsonb;
begin
  for p in select * from l7_probe
            where (p_kinds is null or kind = any (p_kinds))
              and (p_classes is null or class_id = any (p_classes))
            order by id loop
    v := pg_temp.l7_call(p.seat, p.seat_role, p.claims_role, p.sql, p.snap, 0.42);
    insert into l7_ans values (p.id, p_side, md5(v::text), left(v::text, 400), v ? 'err');
    if v ->> 'err' in ('55P03', '40001', '40P01') then
      insert into l7_unmeasured values (p.id, p_side, v ->> 'err');
    end if;
    n := n + 1;
  end loop;
  return n;
end $f$;

-- ════════════════════════════════════════════════════════════════════ the world, as it is
-- On the clone the four join codes their owner disabled are still on their Records (production's
-- data as of the clone's copy); their owner presses Disable again through the class door, which is
-- exactly what is done on production after scopesaccess_a_removed_scope_setting_leaves_the_store.sql.
-- Production is pressed for every organization (PROGRESS-SCOPES-PRESS-EVERYONE); the clone may carry the
-- undo rehearsal. Mirror production: every organization with scopes writes them in the store.
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
select distinct 'custom', 'scopes_written_in_the_store', 'organization', st.organization_id, st.organization_id, 'true'::jsonb, 'scopesaccess compare fixture'
  from context.scope_types st
 where st.organization_id is not null and custom.context_writer(st.organization_id) <> 'store'
on conflict do nothing;
update platform.knob_override set value = 'true'::jsonb
 where feature = 'custom' and key = 'scopes_written_in_the_store' and scope_kind = 'organization'
   and value <> 'true'::jsonb and scope_id in (select organization_id from context.scope_types);
select count(*) filter (where custom.context_writer(o) = 'store') as store_writers, count(*) as with_scopes
  from (select distinct organization_id o from context.scope_types) x;

do $fx$
declare c record; v_org uuid;
begin
  for c in
    select s.id, s.organization_id, s.created_by
      from w_scopes s join custom.record r on r.id = s.id
     where s.scope_type_id in (select id from w_types where slug = 'class')
       and not (s.settings ? 'join_code') and r.data ? 'join_code' and jsonb_typeof(r.data -> 'join_code') <> 'null'
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', c.created_by, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.edu_class_join_code(c.id, 'disable');
    perform set_config('role', 'none', true);
    raise notice 'fixture: the disabled join code of class % carried to its Record by its owner', c.id;
  end loop;
end $fx$;

-- A creator's public page features every class (and a non-class scope, an archived class, a missing id
-- and a malformed id), with the price and mode the creator typed, which the page must override from the
-- class itself.
do $fx$
declare v_profile uuid; v_items jsonb;
begin
  select id into v_profile from users.profiles
   where creator_public and deleted_at is null and creator_handle is not null order by id limit 1;
  if v_profile is null then raise exception 'FIXTURE: no published creator profile on this database'; end if;
  select jsonb_agg(jsonb_build_object('kind', 'class', 'classId', s.id, 'title', s.name, 'accessMode', 'open', 'price', 9.99) order by s.id)
    into v_items from w_scopes s where s.scope_type_id in (select id from w_types where slug = 'class');
  v_items := v_items
    || jsonb_build_array(jsonb_build_object('kind', 'class', 'classId', (select id from w_scopes where scope_type_id not in (select id from w_types where slug = 'class') order by id limit 1), 'title', 'Not a class'))
    || jsonb_build_array(jsonb_build_object('kind', 'class', 'classId', gen_random_uuid(), 'title', 'Gone'))
    || jsonb_build_array(jsonb_build_object('kind', 'class', 'classId', 'not-a-uuid', 'title', 'Broken link'))
    || jsonb_build_array(jsonb_build_object('kind', 'youtube', 'videoId', 'dQw4w9WgXcQ', 'title', 'Intro'));
  update users.profiles set creator_featured = coalesce(creator_featured, '[]'::jsonb) || v_items where id = v_profile;
end $fx$;

-- ════════════════════════════════════════════════════════════════════ the probes
create temp table l7_class on commit drop as
  select s.id, s.organization_id, s.created_by, coalesce(s.settings->>'access_mode', 'closed') as mode
    from w_scopes s where s.scope_type_id in (select id from w_types where slug = 'class');
-- Ids that are NOT classes: another type's scope, a scope-type Table, a context Field, nothing at all.
create temp table l7_notclass on commit drop as
  select x.id from (
    (select s.id from w_scopes s where s.scope_type_id not in (select id from w_types where slug = 'class') order by s.id limit 3)
    union all (select st.id from w_types st where st.slug = 'class' limit 1)
    union all (select ci.id from context.context_items ci limit 1)
    union all select '00000000-0000-4000-8000-000000000001'::uuid) x;
create temp table l7_seat on commit drop as
  select u.id as seat, 'authenticated'::text as seat_role from auth.users u
  union all select null::uuid, 'anon';
-- related seats per class: its creator, its organization's members, its members, ten unrelated, anon
create temp table l7_rel on commit drop as
  select c.id as class_id, x.seat, x.seat_role from l7_class c
  cross join lateral (
    select c.created_by as seat, 'authenticated'::text as seat_role where c.created_by is not null
    union select m.user_id, 'authenticated' from iam.memberships m
     where m.container_type = 'organization' and m.container_id = c.organization_id and m.deleted_at is null
    union select m.user_id, 'authenticated' from iam.memberships m
     where m.container_type = 'scope' and m.container_id = c.id
    union (select u.id, 'authenticated' from auth.users u
            where not exists (select 1 from iam.memberships m where m.user_id = u.id and m.container_id in (c.id, c.organization_id))
            order by u.id limit 10)
    union select null::uuid, 'anon') x;
create temp table l7_target on commit drop as
  select c.id as class_id, x.t from l7_class c
  cross join lateral (
    select m.user_id as t from iam.memberships m where m.container_type = 'scope' and m.container_id = c.id
    union select c.created_by where c.created_by is not null
    union (select u.id from auth.users u
            where not exists (select 1 from iam.memberships m where m.user_id = u.id and m.container_id in (c.id, c.organization_id))
            order by u.id desc limit 1)) x;

-- the snapshot of a class after a writer
create function pg_temp.l7_snap(p_class uuid) returns text language sql immutable as $f$
  select format($q$select jsonb_build_object(
    'm', (select coalesce(jsonb_agg(jsonb_build_array(m.user_id, m.role, m.status, m.deleted_at, m.created_by, m.updated_by, m.metadata, m.organization_id, m.updated_at, m.created_at)
                                    order by m.user_id, m.status, m.role, m.deleted_at nulls first), '[]'::jsonb)
            from iam.memberships m where m.container_type = 'scope' and m.container_id = %1$L),
    'old', (select jsonb_build_array(s.settings, s.name, s.deleted_at, s.updated_by, s.updated_at) from context.scopes s where s.id = %1$L),
    'rec', (select jsonb_build_array(r.data - '_values' - '_sources', r.deleted_at, r.version, r.updated_at) from custom.record r where r.id = %1$L),
    'a', (select coalesce(jsonb_agg(jsonb_build_array(a.source_type, a.source_id, a.role, a.metadata, a.deleted_at) order by a.source_type, a.source_id), '[]'::jsonb)
            from platform.associations a where a.target_type = 'scope' and a.target_id = %1$L and a.role = 'assignment'))$q$, p_class)
$f$;

-- (1) self-scoped class doors, every seat, every class and every not-a-class id
insert into l7_probe (kind, class_id, seat, seat_role, sql, snap)
select f.kind, c.id, s.seat, s.seat_role, format(f.tpl, c.id, s.seat, case c.mode when 'closed' then 'open' else 'closed' end), case when f.w then pg_temp.l7_snap(c.id) end
  from (select id, mode from l7_class union all select id, 'closed' from l7_notclass) c
  cross join l7_seat s
  cross join (values
    ('state',            'select to_jsonb(public.edu_class_state(%1$L))', false),
    ('roster',           'select to_jsonb(public.edu_class_roster(%1$L))', true),
    ('assignments',      'select to_jsonb(public.edu_class_assignments(%1$L))', false),
    ('progress',         'select to_jsonb(public.edu_class_progress_overview(%1$L))', false),
    ('student_progress', 'select to_jsonb(public.edu_class_student_progress(%1$L, %2$L::uuid))', false),
    ('join',             'select to_jsonb(public.edu_class_join(%1$L))', true),
    ('request',          'select to_jsonb(public.edu_class_request(%1$L))', true),
    ('leave',            'select to_jsonb(public.edu_class_leave(%1$L))', true),
    ('code_get',         'select to_jsonb(public.edu_class_join_code(%1$L, ''get''))', true),
    ('code_rotate',      'select to_jsonb(public.edu_class_join_code(%1$L, ''rotate''))', true),
    ('code_disable',     'select to_jsonb(public.edu_class_join_code(%1$L, ''disable''))', true),
    ('set_access',       'select to_jsonb(public.edu_class_set_access(%1$L, %3$L))', true)
  ) f(kind, tpl, w);

-- (2) doors that act on another person: related seats × every target
insert into l7_probe (kind, class_id, seat, seat_role, sql, snap)
select f.kind, r.class_id, r.seat, r.seat_role, format(f.tpl, r.class_id, t.t), pg_temp.l7_snap(r.class_id)
  from l7_rel r join l7_target t on t.class_id = r.class_id
  cross join (values
    ('grant',   'select to_jsonb(public.edu_class_grant(%1$L, %2$L))'),
    ('approve', 'select to_jsonb(public.edu_class_approve(%1$L, %2$L))'),
    ('remove',  'select to_jsonb(public.edu_class_remove(%1$L, %2$L))'),
    ('student_progress_of', 'select to_jsonb(public.edu_class_student_progress(%1$L, %2$L))')
  ) f(kind, tpl);
-- the purchase doors are the webhook's (service_role); a signed-in caller is refused by the grant
insert into l7_probe (kind, class_id, seat, seat_role, claims_role, sql, snap)
select f.kind, t.class_id, null, 'service_role', 'service_role', format(f.tpl, t.class_id, t.t), pg_temp.l7_snap(t.class_id)
  from l7_target t cross join (values
    ('confer', 'select to_jsonb(public.edu_class_confer_purchase(%1$L, %2$L))'),
    ('revoke', 'select to_jsonb(public.edu_class_revoke_purchase(%1$L, %2$L))')) f(kind, tpl)
union all
select 'confer_as_person', c.id, c.created_by, 'authenticated', null, format('select to_jsonb(public.edu_class_confer_purchase(%1$L, %2$L))', c.id, c.created_by), null
  from l7_class c where c.created_by is not null
union all
select f.kind, n.id, null, 'service_role', 'service_role', format(f.tpl, n.id, (select min(id::text)::uuid from auth.users)), null
  from l7_notclass n cross join (values
    ('confer', 'select to_jsonb(public.edu_class_confer_purchase(%1$L, %2$L))'),
    ('revoke', 'select to_jsonb(public.edu_class_revoke_purchase(%1$L, %2$L))')) f(kind, tpl);
-- assign / unassign: every live assignment of the class again, and one deck the seat may or may not see
insert into l7_probe (kind, class_id, seat, seat_role, sql, snap)
select 'assign', r.class_id, r.seat, r.seat_role,
       format('select to_jsonb(public.edu_class_assign(%1$L, %2$L, %3$L, date %4$L))', r.class_id, a.source_type, a.source_id, '2026-12-01'),
       pg_temp.l7_snap(r.class_id)
  from l7_rel r join platform.associations_live a on a.target_type = 'scope' and a.target_id = r.class_id and a.role = 'assignment'
union all
select 'unassign', r.class_id, r.seat, r.seat_role,
       format('select to_jsonb(public.edu_class_unassign(%1$L, %2$L, %3$L))', r.class_id, a.source_type, a.source_id),
       pg_temp.l7_snap(r.class_id)
  from l7_rel r join platform.associations_live a on a.target_type = 'scope' and a.target_id = r.class_id and a.role = 'assignment'
union all
select 'assign_new', r.class_id, r.seat, r.seat_role,
       format('select to_jsonb(public.edu_class_assign(%1$L, ''fc_set'', %2$L, date %3$L))', r.class_id, d.id, '2026-12-01'),
       pg_temp.l7_snap(r.class_id)
  from l7_rel r cross join lateral (select fs.id from education.fc_set fs order by fs.id limit 1) d;

-- (3) seat-wide doors
insert into l7_probe (kind, seat, seat_role, sql, snap)
select 'my_classes', s.seat, s.seat_role, 'select to_jsonb(public.edu_my_classes())', null from l7_seat s;
create temp table l7_code on commit drop as
  select distinct x.code from (
    select s.settings->>'join_code' as code from w_scopes s where s.settings ? 'join_code'
    union select r.data->>'join_code' from custom.record r join w_scopes s on s.id = r.id where r.data ? 'join_code' and jsonb_typeof(r.data->'join_code') = 'string'
    union select r.data->>'setting_join_code' from custom.record r join w_scopes s on s.id = r.id where r.data ? 'setting_join_code' and jsonb_typeof(r.data->'setting_join_code') = 'string'
    union select 'ZZZZ99' union select 'ab') x where x.code is not null;
insert into l7_code select '  ' || lower(code) || ' ' from l7_code where length(code) >= 4 and code <> 'ZZZZ99';
insert into l7_probe (kind, seat, seat_role, sql, snap)
select f.kind, s.seat, s.seat_role, format(f.tpl, k.code), null
  from l7_seat s cross join l7_code k cross join (values
    ('by_code',      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.edu_class_by_code(%1$L) x'),
    ('join_by_code', 'select to_jsonb(public.edu_class_join_by_code(%1$L))')) f(kind, tpl);
-- join_by_code writes; its effect on the class the code names
update l7_probe p set snap = pg_temp.l7_snap(s.id)
  from w_scopes s
 where p.kind = 'join_by_code' and s.settings->>'join_code' is not null
   and p.sql like '%' || (s.settings->>'join_code') || '%';
insert into l7_probe (kind, seat, seat_role, claims_role, sql)
select 'generate_code', null, 'service_role', 'service_role', 'select to_jsonb(public._edu_generate_join_code())';

-- (4) container access: every scope × its creator, every member of its organization, every member of it,
-- one unrelated person; as a signed-in caller and as the service; the role required and not
insert into l7_probe (kind, class_id, seat, seat_role, claims_role, sql)
select 'container_authz', s.id, a.actor, 'none', cr.r,
       format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from iam._container_authz(''scope'', %1$L, %2$L, %3$s) x', s.id, a.actor, rr.b)
  from w_scopes s
  cross join lateral (
    select s.created_by as actor where s.created_by is not null
    union select m.user_id from iam.memberships m where m.container_type = 'organization' and m.container_id = s.organization_id and m.deleted_at is null
    union select m.user_id from iam.memberships m where m.container_type = 'scope' and m.container_id = s.id
    union (select u.id from auth.users u where not exists (select 1 from iam.memberships m where m.user_id = u.id and m.container_id = s.organization_id) order by u.id limit 1)) a
  cross join (values ('authenticated'), ('service_role')) cr(r)
  cross join (values ('true'), ('false')) rr(b);
insert into l7_probe (kind, class_id, seat, seat_role, claims_role, sql)
select 'container_authz', n.id, u.id, 'none', 'authenticated',
       format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from iam._container_authz(''scope'', %1$L, %2$L, true) x', n.id, u.id)
  from (select id from l7_notclass union all select id from w_types) n
  cross join (select id from auth.users order by id limit 3) u;

-- (5) the kernel: attributes of every scope, scope type, context field, value and some ids that are nothing
insert into l7_probe (kind, class_id, seat_role, sql)
select 'row_attrs:' || x.t, x.id, 'none', format('select to_jsonb(a) from platform.entity_row_access_attrs(''context'', %1$L, %2$L) a', x.t, x.id)
  from (select 'scopes' t, id from w_scopes
        union all select 'scope_types', id from w_types
        union all select 'context_items', id from context.context_items where scope_type_id in (select id from l7_world_type)
        union all select 'context_item_values', id from context.context_item_values
        union all select t.t, gen_random_uuid() from (values ('scopes'), ('scope_types'), ('context_items')) t(t), generate_series(1, 30)
        union all select 'scopes', id from w_types
        union all select 'context_items', id from w_scopes where scope_type_id in (select id from w_types where slug = 'class')) x;
-- open / edit / admin through the kernel, for every member of each scope's organization and every member of it
insert into l7_probe (kind, class_id, seat, seat_role, sql)
select 'has_access:' || lv.l, s.id, a.actor, 'none', format('select to_jsonb(iam.has_access_for(%1$L, ''scope'', %2$L, %3$L))', a.actor, s.id, lv.l)
  from w_scopes s
  cross join lateral (
    select m.user_id as actor from iam.memberships m where m.container_type = 'organization' and m.container_id = s.organization_id and m.deleted_at is null
    union select m.user_id from iam.memberships m where m.container_type = 'scope' and m.container_id = s.id
    union (select u.id from auth.users u where not exists (select 1 from iam.memberships m where m.user_id = u.id and m.container_id = s.organization_id) order by u.id limit 1)) a
  cross join (values ('viewer'), ('editor'), ('admin')) lv(l);
-- the list: which scopes the kernel lists for each person
insert into l7_probe (kind, seat, seat_role, sql)
select 'list_scopes', s.seat, 'authenticated',
       'select coalesce(to_jsonb(array(select unnest(iam.accessible_entity_ids(''scope'', ''viewer''::public.permission_level, 0, true)) order by 1)), ''[]''::jsonb)'
  from l7_seat s where s.seat is not null;

-- (6) the creator page and the invitations
insert into l7_probe (kind, seat, seat_role, sql)
select 'creator_page', s.seat, s.seat_role, format('select public.creator_public_page(%1$L)', h.h)
  from (select creator_handle h from users.profiles where creator_public and deleted_at is null and creator_handle is not null
        union all select 'nobody-has-this-handle') h
  cross join ((select seat, seat_role from l7_seat where seat is not null order by seat limit 5) union all select null, 'anon') s;
insert into l7_probe (kind, seat, seat_role, sql)
select 'invitation', x.seat, x.role, format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.inv_get_by_token(%1$L) t', i.token)
  from iam.invitations i
  cross join lateral (
    select i.invited_user_id as seat, 'authenticated'::text as role where i.invited_user_id is not null
    union select u.id, 'authenticated' from auth.users u where lower(u.email) = lower(i.email)
    union (select u.id, 'authenticated' from auth.users u order by u.id limit 2)
    union select null, 'anon') x
 where i.token is not null;


-- ════════════════════════════════════════════════════════════════════ RED's own probes (never sampled)
-- Five divergences will be planted after the NEW bodies are in: four in the store's data and one in a
-- body. Their targets are chosen now, and their probes run on the OLD bodies with everything else.
create temp table l7_plant on commit drop as
  select 'access_mode'::text as what, (select c.id from l7_class c join w_scopes s on s.id = c.id where c.mode = 'closed' and s.deleted_at is null order by c.id limit 1) as target
  union all select 'name', (select c.id from l7_class c order by c.id desc limit 1)
  union all select 'created_by', (select s.id from w_scopes s where s.scope_type_id not in (select id from w_types where slug = 'class') and s.created_by is not null and s.deleted_at is null order by s.id limit 1)
  union all select 'join_code', (select c.id from l7_class c join w_scopes s on s.id = c.id where s.settings ? 'join_code' and s.deleted_at is null order by c.id limit 1)
  union all select 'body', (select s.id from w_scopes s where s.scope_type_id not in (select id from w_types where slug = 'class') and s.deleted_at is null order by s.id limit 1);
create temp table l7_outsider on commit drop as
  select u.id from auth.users u where not exists (select 1 from iam.memberships m where m.user_id = u.id and m.container_type = 'organization'
     and m.container_id in (select organization_id from w_scopes where id in (select target from l7_plant))) order by u.id limit 1;
insert into l7_probe (kind, class_id, seat, seat_role, claims_role, sql)
select 'red:access_mode', pl.target, (select id from l7_outsider), 'authenticated', null, format('select to_jsonb(public.edu_class_join(%L))', pl.target) from l7_plant pl where pl.what = 'access_mode'
union all
select 'red:name', pl.target, s.created_by, 'authenticated', null, format('select to_jsonb(public.edu_class_state(%L))', pl.target) from l7_plant pl join w_scopes s on s.id = pl.target where pl.what = 'name'
union all
select 'red:created_by', pl.target, s.created_by, 'none', 'authenticated', format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from iam._container_authz(''scope'', %L, %L, false) x', pl.target, s.created_by) from l7_plant pl join w_scopes s on s.id = pl.target where pl.what = 'created_by'
union all
select 'red:created_by', pl.target, null, 'none', null, format('select to_jsonb(a) from platform.entity_row_access_attrs(''context'', ''scopes'', %L) a', pl.target) from l7_plant pl where pl.what = 'created_by'
union all
select 'red:join_code', pl.target, (select id from l7_outsider), 'authenticated', null, format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.edu_class_by_code(%L) x', s.settings->>'join_code') from l7_plant pl join w_scopes s on s.id = pl.target where pl.what = 'join_code'
union all
select 'red:body', pl.target, (select id from l7_outsider), 'authenticated', null, format('select to_jsonb(public.edu_class_join(%L))', pl.target) from l7_plant pl where pl.what = 'body';
select what, target from l7_plant;

select kind, count(*) as probes from l7_probe group by kind order by kind;
select count(*) as all_probes from l7_probe;
\if :{?chunks}
-- ONE CHUNK of the compare (-v chunks=N -v chunk=k): every probe whose id is k modulo N, plus RED's own. Each chunk
-- is a whole compare — OLD and NEW in its own transaction, over its own snapshot — so N chunks, each GREEN, prove
-- all probes; one transaction of all 856k sub-blocks is more than the clone's per-connection memory holds.
delete from l7_probe where id % :chunks <> :chunk and kind not like 'red:%';
select :chunk as chunk, :chunks as chunks, count(*) as chunk_probes from l7_probe;
\endif
\if :{?smoke}
-- a smoke run keeps one probe in :smoke of every kind (the verdict then speaks only for those)
delete from l7_probe where id % :smoke <> 0 and kind not like 'red:%';
select count(*) as smoke_probes from l7_probe;
\endif
\if :{?count_only}
rollback;
\quit
\endif

-- A probe that waits on another lane's row lock is UNMEASURED (55P03), never an answer: it waits 20 s at most.
set local lock_timeout = '20s';

-- ════════════════════════════════════════════════════════════════════ OLD
\echo '── OLD bodies'
select clock_timestamp() as old_start, pg_temp.l7_run('old') as probes_run, clock_timestamp() as old_end;
-- the class checkout reads a scope's owner, organization, archive, access mode and price (every scope)
create temp table l7_checkout_old on commit drop as
  select s.id, jsonb_build_object('mode', s.settings->>'access_mode', 'price', s.settings->>'price_cents',
                                  'owner', s.created_by, 'org', s.organization_id, 'archived', s.deleted_at is not null) as v
    from w_scopes s;
-- every function this file replaces: its grants, security, volatility and search path
create temp table l7_shape_old on commit drop as
  select p.oid::regprocedure::text as fn, jsonb_build_object('acl', p.proacl::text, 'secdef', p.prosecdef, 'vol', p.provolatile, 'cfg', p.proconfig, 'ret', pg_get_function_result(p.oid)) as v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname = 'public' and (p.proname like 'edu_class_%' or p.proname in ('edu_my_classes', '_edu_generate_join_code', 'creator_public_page', 'inv_get_by_token')))
      or (n.nspname = 'iam' and p.proname = '_container_authz') or (n.nspname = 'platform' and p.proname = 'entity_row_access_attrs');

-- ════════════════════════════════════════════════════════════════════ the new bodies, in this transaction
\echo '── applying the campaign file inside the transaction'
\i migrations/campaign/scopesaccess_the_class_and_access_readers_read_the_store.sql

-- ════════════════════════════════════════════════════════════════════ RED: planted divergences
\echo '── RED: planted divergences'
savepoint l7_planted;
do $pl$
declare v_fk text; v_t uuid;
begin
  -- planted as the platform itself, not as the last probe's seat
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'none', true);
  -- a closed class opens in the store only
  select target into v_t from l7_plant where what = 'access_mode';
  select f.data->>'key' into v_fk from custom.record r
    join custom.record f on f.organization_id = r.organization_id and f.id = custom._ctx_id('scope-setting-field', r.table_id::text, 'access_mode')
   where r.id = v_t;
  update custom.record set data = data || jsonb_build_object(v_fk, 'open') where id = v_t;
  -- a class renamed in the store only
  update custom.record set data = data || '{"name": "Planted name"}' where id = (select target from l7_plant where what = 'name');
  -- a scope (not a class) whose creator is someone else in the store only
  select target into v_t from l7_plant where what = 'created_by';
  update custom.record set created_by = (select id from l7_outsider) where id = v_t;
  -- a live class's join code changed in the store only
  select target into v_t from l7_plant where what = 'join_code';
  select f.data->>'key' into v_fk from custom.record r
    join custom.record f on f.organization_id = r.organization_id and f.id = custom._ctx_id('scope-setting-field', r.table_id::text, 'join_code')
   where r.id = v_t;
  update custom.record set data = data || jsonb_build_object(v_fk, 'PLNT42') where id = v_t;
end $pl$;
-- a body planted: the class finder forgets that a class is a scope of the type `class`
create or replace function public._edu_class_find(p_class uuid)
 returns public._edu_class_row language sql stable set search_path to ''
as $function$
  select row(r.id, r.organization_id, r.data ->> 'name', r.data ->> 'description', r.data ->> 'slug',
             custom._ctx_scope_settings(r.organization_id, r.table_id, r.data), r.created_by, r.deleted_at)::public._edu_class_row
    from custom.record r join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.id = p_class and r.data_class = 'record' and t.data ->> 'kept_for' = 'context'
$function$;
select pg_temp.l7_run('planted', (select array_agg(distinct kind) from l7_probe where kind like 'red:%')) as planted_probes_run;
select p.kind, count(*) filter (where o.h is distinct from n.h) as mismatches, count(*) as probes,
       max(o.preview) as old, max(n.preview) as planted
  from l7_probe p join l7_ans o on o.probe = p.id and o.side = 'old' join l7_ans n on n.probe = p.id and n.side = 'planted'
 where p.kind like 'red:%' group by p.kind order by p.kind;
do $red$
declare r record;
begin
  for r in
    select p.kind, count(*) filter (where o.h is distinct from n.h) as mm
      from l7_probe p join l7_ans o on o.probe = p.id and o.side = 'old' join l7_ans n on n.probe = p.id and n.side = 'planted'
     where p.kind like 'red:%' group by p.kind
  loop
    if r.mm = 0 then raise exception 'RED FAILED: the planted % divergence went unseen by the compare', r.kind; end if;
  end loop;
  if (select count(distinct kind) from l7_probe where kind like 'red:%') <> 5 then
    raise exception 'RED FAILED: not every planted divergence has a probe';
  end if;
  raise notice 'RED: every planted divergence (four in the store''s data, one in a body) was caught';
end $red$;
rollback to savepoint l7_planted;

-- ════════════════════════════════════════════════════════════════════ NEW
\echo '── NEW bodies'
select clock_timestamp() as new_start, pg_temp.l7_run('new') as probes_run, clock_timestamp() as new_end;
create temp table l7_checkout_new on commit drop as
  select c.id, jsonb_build_object('mode', x.st ->> 'access_mode', 'price', x.st ->> 'price_cents',
                                  'owner', r.created_by, 'org', r.organization_id, 'archived', r.deleted_at is not null) as v
    from w_scopes c
    left join custom.record r on r.id = c.id and r.data_class = 'record'
    left join lateral (select custom._ctx_scope_settings(r.organization_id, r.table_id, r.data) as st) x on true;
create temp table l7_shape_new on commit drop as
  select p.oid::regprocedure::text as fn, jsonb_build_object('acl', p.proacl::text, 'secdef', p.prosecdef, 'vol', p.provolatile, 'cfg', p.proconfig, 'ret', pg_get_function_result(p.oid)) as v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname = 'public' and (p.proname like 'edu_class_%' or p.proname in ('edu_my_classes', '_edu_generate_join_code', 'creator_public_page', 'inv_get_by_token')))
      or (n.nspname = 'iam' and p.proname = '_container_authz') or (n.nspname = 'platform' and p.proname = 'entity_row_access_attrs');

-- ════════════════════════════════════════════════════════════════════ the verdict
\echo '── GREEN: OLD vs NEW, by probe kind'
select p.kind, count(*) as probes, count(*) filter (where o.h is distinct from n.h) as mismatches,
       count(*) filter (where o.err) as refusals, count(*) filter (where not o.err) as allows
  from l7_probe p join l7_ans o on o.probe = p.id and o.side = 'old' join l7_ans n on n.probe = p.id and n.side = 'new'
 group by p.kind order by p.kind;
select p.kind, u.side, u.code, count(*) as unmeasured from l7_unmeasured u join l7_probe p on p.id = u.probe group by 1, 2, 3;
\echo '── the first mismatches, if any'
select p.kind, p.class_id, p.seat, p.seat_role, o.preview as old, n.preview as new
  from l7_probe p join l7_ans o on o.probe = p.id and o.side = 'old' join l7_ans n on n.probe = p.id and n.side = 'new'
 where o.h is distinct from n.h order by p.id limit 25;
\echo '── the class checkout read, every scope'
select count(*) as scopes, count(*) filter (where o.v is distinct from n.v) as mismatches
  from l7_checkout_old o join l7_checkout_new n on n.id = o.id;
select o.id, o.v, n.v from l7_checkout_old o join l7_checkout_new n on n.id = o.id where o.v is distinct from n.v limit 10;
\echo '── grants, security, volatility, search path, return of every replaced function'
select o.fn, o.v as old, n.v as new from l7_shape_old o full join l7_shape_new n on n.fn = o.fn where o.v is distinct from n.v;
do $green$
declare v_mm int; v_co int; v_sh int; v_n int;
begin
  select count(*), count(*) filter (where o.h is distinct from n.h) into v_n, v_mm
    from l7_probe p join l7_ans o on o.probe = p.id and o.side = 'old' join l7_ans n on n.probe = p.id and n.side = 'new'
   where p.id not in (select probe from l7_unmeasured);
  if exists (select 1 from l7_unmeasured) then
    raise exception 'UNMEASURED: % probes waited on another lane''s lock (%); % of the rest differ. Run again when the clone is quiet.',
      (select count(distinct probe) from l7_unmeasured), (select string_agg(distinct code, ', ') from l7_unmeasured), v_mm;
  end if;
  select count(*) filter (where o.v is distinct from n.v) into v_co from l7_checkout_old o join l7_checkout_new n on n.id = o.id;
  select count(*) into v_sh from l7_shape_old o full join l7_shape_new n on n.fn = o.fn where o.v is distinct from n.v;
  if v_mm > 0 or v_co > 0 or v_sh > 0 then
    raise exception 'RED: % of % probes answer differently, % scopes read differently by the class checkout, % function shapes moved', v_mm, v_n, v_co, v_sh;
  end if;
  raise notice 'GREEN: % probes, 0 mismatches; the class checkout reads every scope the same; every replaced function keeps its grants, security, volatility, search path and return', v_n;
end $green$;

rollback;
