-- LANE CONTEXT-VALUES-NAMED-2 (chair ruling, 2026-09-25) — AN OLD CALLER GETS THE DEFAULT LIST.
--
-- THE USE CASE. The server released before the lane's engine calls both context resolvers with
-- four arguments and no System list. An agent turn it resolves must still carry today's date, the
-- date-time and the person's timezone (the knob context/system_item_defaults). A caller that says
-- "none" with an explicit empty array gets none; a caller naming a list gets exactly that list.
--
-- WHAT MAKES IT FAIL (RED on the bodies of cvn2_a_system_item_is_read_only_when_it_is_named.sql):
--   D1/D4  the old four-argument call returns no System item (NULL read as none)
-- (D2/D5 explicit '{}' → none and D3/D6 a named list → exactly it hold on both bodies.)
--
-- SEAT: public.resolve_full_context as the server calls it (postgres); custom.resolve_context as
-- `authenticated` with admin@admin.com's claims.

\set ON_ERROR_STOP on
\timing off
\set suite 'cvn3_an_old_caller_gets_the_default_system_items_red_green.sql'
\set requires 'function:context.named_system_context_items|relation:context.system_context_item'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_nothing constant uuid := '00000000-0000-0000-0000-000000000000';
  v_defaults text[];
  v_out jsonb; v_keys text[]; v_fail int := 0; v_path text; v_case text;
begin
  select array(select jsonb_array_elements_text(value) order by 1) into v_defaults
    from platform.feature_knob where feature = 'context' and key = 'system_item_defaults' and archived_at is null;
  if v_defaults is null or cardinality(v_defaults) = 0 then
    raise exception 'fixture: the knob context/system_item_defaults is missing or empty';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  foreach v_path in array array['old', 'new'] loop
    foreach v_case in array array['four_args', 'empty', 'named'] loop
      if v_path = 'old' then
        v_out := case v_case
          when 'four_args' then public.resolve_full_context(c_admin, 'conversation', c_nothing, null)
          when 'empty' then public.resolve_full_context(c_admin, 'conversation', c_nothing, null, '{}'::text[])
          else public.resolve_full_context(c_admin, 'conversation', c_nothing, null, array['company_name']) end;
      else
        perform set_config('role', 'authenticated', true);
        v_out := case v_case
          when 'four_args' then custom.resolve_context('conversation', c_nothing, null, null)
          when 'empty' then custom.resolve_context('conversation', c_nothing, null, null, '{}'::text[])
          else custom.resolve_context('conversation', c_nothing, null, null, array['company_name']) end;
        perform set_config('role', 'postgres', true);
      end if;
      select coalesce(array_agg(k order by k), '{}') into v_keys
        from jsonb_each(coalesce(v_out -> 'variables', '{}')) e(k, v) where v ->> 'source' = 'system';
      if (v_case = 'four_args' and v_keys is distinct from v_defaults)
         or (v_case = 'empty' and cardinality(v_keys) <> 0)
         or (v_case = 'named' and v_keys is distinct from array['company_name']) then
        v_fail := v_fail + 1;
        raise notice 'FAIL — % path, %: handed %', v_path, v_case, v_keys;
      else
        raise notice 'PASS — % path, %: handed %', v_path, v_case, v_keys;
      end if;
    end loop;
  end loop;

  if v_fail > 0 then
    raise exception 'cvn3_an_old_caller_gets_the_default_system_items_red_green.sql: % FAILURE(S)', v_fail;
  end if;
  raise notice 'cvn3_an_old_caller_gets_the_default_system_items_red_green.sql: ALL PASS (old call = defaults %, empty = none, named = exactly it; both paths)', v_defaults;
end
$t$;

rollback;
