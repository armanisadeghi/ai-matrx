-- LANE SN-SCOPES (2026-10-01) — A CLASS SELLS, OPENS AND LISTS THE SAME THROUGH THE SWITCH.
--
-- THE USE CASE. A teacher runs "World Literature" (a class is a scope of the type `class`). A parent
-- buys a seat through the Stripe class checkout (app/api/stripe/class-checkout/route.ts reads the class
-- through custom.context_class_for_checkout); the teacher opens the class page (public.edu_class_state)
-- and her class list (public.edu_my_classes). Since SCOPES-READS-ACCESS these read the record store;
-- the old context.scopes row is still written. Every class must read the same from both:
--   S15  the checkout reader hands back the class's name, owner, organization, archived state and its
--        WHOLE settings (access mode, price, join code, term, teacher, exam dates) exactly as the old row
--   S16  as the class's own creator, edu_class_state answers (no refusal) with the old row's name and
--        access mode and says she owns it, and edu_my_classes lists the class when she holds a live
--        class membership (the list is membership-based on both systems)
--
-- WHAT MAKES IT FAIL: a store copy that disagrees with its old row on any of the above, a class the
-- store cannot find, or an education function that refuses the class's owner.
--
-- SEAT: the checkout reader as the server calls it (owner); the education functions as role
-- `authenticated` with the creator's claims. Read-only; rolled back.

\set ON_ERROR_STOP on
\timing off
\set suite 'safetynet_scopes_classes_through_the_switch_red_green.sql'
\set requires 'function:custom.context_class_for_checkout|function:public.edu_class_state|function:public.edu_my_classes'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '300s';

do $sn$
declare
  c record; v_co jsonb; v_st jsonb; v_my jsonb; v_err text;
  v_n int := 0; v_n16 int := 0; v_fails text[] := '{}';
begin
  for c in
    select s.id, s.name, s.organization_id, s.created_by, s.deleted_at, s.settings
      from context.scopes s join context.scope_types st on st.id = s.scope_type_id
     where st.slug = 'class' and s.deleted_at is null and st.deleted_at is null
     order by s.id
  loop
    v_n := v_n + 1;
    -- S15: the checkout's read
    perform set_config('role', 'none', true);
    begin
      v_co := custom.context_class_for_checkout(c.id);
    exception when others then v_co := null; v_err := sqlerrm; end;
    if v_co is null then
      v_fails := array_append(v_fails, format('S15 %s (%s): the checkout reader found no class %s', c.name, c.id, coalesce(v_err, '')));
    elsif v_co->>'name' is distinct from c.name
       or (v_co->>'created_by')::uuid is distinct from c.created_by
       or (v_co->>'organization_id')::uuid is distinct from c.organization_id
       or (v_co->>'deleted_at') is not null
       or coalesce(v_co->'settings', '{}'::jsonb) <> coalesce(c.settings, '{}'::jsonb) then
      v_fails := array_append(v_fails, format('S15 %s (%s): checkout reads %s, the old row says name %s owner %s settings %s',
        c.name, c.id, left(v_co::text, 300), c.name, c.created_by, left(coalesce(c.settings, '{}'::jsonb)::text, 200)));
    end if;

    -- S16: the education functions as the class's creator
    if c.created_by is not null and exists (select 1 from auth.users u where u.id = c.created_by) then
      v_n16 := v_n16 + 1;
      perform set_config('request.jwt.claims', json_build_object('sub', c.created_by, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      v_err := null;
      begin
        v_st := public.edu_class_state(c.id);
        v_my := public.edu_my_classes();
      exception when others then v_st := null; v_err := sqlerrm; end;
      perform set_config('role', 'none', true);
      if v_st is null then
        v_fails := array_append(v_fails, format('S16 %s (%s): edu_class_state refused its own creator: %s', c.name, c.id, coalesce(v_err, 'null')));
      elsif v_st->>'name' is distinct from c.name
         or v_st->>'access_mode' is distinct from coalesce(c.settings->>'access_mode', v_st->>'access_mode')
         or (v_st->>'is_owner')::boolean is not true then
        v_fails := array_append(v_fails, format('S16 %s (%s): edu_class_state says %s', c.name, c.id, left(v_st::text, 300)));
      elsif exists (select 1 from iam.memberships m where m.container_type = 'scope' and m.container_id = c.id
                      and m.user_id = c.created_by and m.deleted_at is null)
            and position(c.id::text in coalesce(v_my::text, '')) = 0 then
        v_fails := array_append(v_fails, format('S16 %s (%s): edu_my_classes does not list it for its creator', c.name, c.id));
      end if;
    end if;
  end loop;

  if v_n = 0 then raise exception 'fixture: no live class on this database'; end if;
  if cardinality(v_fails) > 0 then
    raise exception 'RED (% of % classes, % with a creator): %', cardinality(v_fails), v_n, v_n16, array_to_string(v_fails[1:8], ' | ');
  end if;
  raise notice 'GREEN S15 S16: % classes read the same through the checkout; % open and list for their creator through the education functions', v_n, v_n16;
end
$sn$;

rollback;
