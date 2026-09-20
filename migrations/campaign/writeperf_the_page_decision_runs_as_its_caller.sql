-- additive: yes
-- based-on: custom.page_ceiling(uuid) 8f3db9be6039359c0af5397ca08ebb59ac643cca0b3b1d9f92b72ee13d93e0fb
-- based-on: custom.export_ceiling(uuid) a1ce26a1631b626101540b8e9f35895c6d01d9d8110a58b01364c951e3833766
-- based-on: custom.page_size(uuid, text, integer, integer, integer) d8c98c68f6cfbfdfcf0daab846c7b4b040dc65d42682c43068540d07ecf17dc9
--
-- chair-step: it REPLACES three live bodies (`custom.page_ceiling`, `custom.export_ceiling`,
--   `custom.page_size`), changing each from SECURITY DEFINER to SECURITY INVOKER and nothing
--   else, and it removes their three `platform.client_callable_door` rows because a SECURITY
--   INVOKER function has no definer privilege to declare. No grant is issued, nothing is dropped
--   and no data is touched. The inverse is
--   `migrations/inverse/writeperf_the_page_decision_runs_as_its_caller_down.sql`.
--
-- WRITE-PERF — THE PAGE DECISION RUNS AS ITS CALLER. (A DEFECT OF MINE, NAMED BY A GUARD.)
--
-- `pnpm check:store-doors-decide` went red the moment the page contract landed, and it was right:
--
--     [FAIL] client-executable functions in schema custom that are SECURITY INVOKER - 1:
--            custom.entity_records_find(...) - a client may execute it and it is SECURITY INVOKER,
--            so it runs with the CALLER's privileges - and it reaches custom.page_ceiling,
--            page_size, which authenticated may not execute - so the grant is worth nothing and
--            the call dies on the body's own first line
--
-- That is a LIVE BREAKAGE, not a lint. `custom.entity_records_find` is a client door that runs as
-- the person calling it; I made it call three helpers that `authenticated` has no EXECUTE on,
-- because `platform.enforce_definer_client_grants` correctly revokes the default client grant
-- from an undeclared SECURITY DEFINER function. Every signed-in call of that door would have died
-- on `permission denied for function page_size`.
--
-- WHY SECURITY INVOKER IS THE RIGHT ANSWER AND A GRANT IS NOT. These three read two rows of the
-- knob register and return an integer. `authenticated` may already execute
-- `platform.knob_resolve` and may already SELECT `platform.feature_knob`,
-- `platform.knob_override` and `platform.knob_rung_lock` — that is how `custom.store_is_open`,
-- which is SECURITY INVOKER and is read on every door call in the store, has always worked. They
-- never needed the definer's privileges; I gave them privileges they had no use for, and the
-- guard that exists to stop exactly that took the grant back.
--
-- Declaring them as client doors and granting instead would have been the wrong repair twice
-- over: it would hand a signed-in caller a definer-privileged function for no reason, and
-- `custom.page_size` takes an organization id, so the shape guard would then have demanded an
-- access decision inside a function whose whole job is to turn one integer into another — and an
-- `assert_client_may_reach` in there would have refused the ANONYMOUS lane
-- (`custom.anon_submissions` serves a public form) for a question that reveals nothing but a
-- page size.
--
-- `custom.page_contract` is untouched: it IS a client door, it IS declared, it IS granted, and it
-- decides access in its own body before it reads anything.

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('page_ceiling', 'export_ceiling', 'page_size');

create or replace function custom.page_ceiling(p_organization_id uuid default null)
returns integer language sql stable set search_path to ''
as $function$
  select (platform.knob_resolve('custom', 'page_size_ceiling', p_organization_id) #>> '{}')::integer;
$function$;
comment on function custom.page_ceiling(uuid) is
  'PAGE-1. The most rows any reader page serves, from the knob custom/page_size_ceiling. A door may declare a LOWER ceiling of its own; none may declare a higher one. SECURITY INVOKER, like custom.store_is_open: it reads the knob register with the caller''s own privileges and needs none of its own.';

create or replace function custom.export_ceiling(p_organization_id uuid default null)
returns integer language sql stable set search_path to ''
as $function$
  select (platform.knob_resolve('custom', 'export_rows_ceiling', p_organization_id) #>> '{}')::integer;
$function$;
comment on function custom.export_ceiling(uuid) is
  'PAGE-1. The most rows one export produces, from the knob custom/export_rows_ceiling. An export is not a page. SECURITY INVOKER for the same reason as custom.page_ceiling.';

create or replace function custom.page_size(p_organization_id uuid,
                                            p_door text,
                                            p_limit integer,
                                            p_default integer default null,
                                            p_ceiling integer default null)
returns integer language plpgsql stable set search_path to ''
as $function$
declare
  v_knob    integer := custom.page_ceiling(p_organization_id);
  v_ceiling integer := coalesce(p_ceiling, v_knob);
  v_default integer := coalesce(p_default, least(200, v_ceiling));
begin
  -- NOTHING WAS ASKED. The door's own default is not a short page: no number was named, so no
  -- number was substituted for one.
  if p_limit is null then
    return least(greatest(v_default, 1), v_ceiling);
  end if;

  if p_limit < 1 then
    raise exception '% was asked for a page of % rows, and a page has at least one row in it.',
      p_door, p_limit
      using errcode = '22023',
            detail = jsonb_build_object('page', jsonb_build_object(
                       'requested', p_limit, 'returned', 0,
                       'ceiling', v_ceiling, 'next', null))::text,
            hint = 'PAGE-1: ask for between 1 and ' || v_ceiling || ' rows, and move through the rest with the offset. Leave the page size out entirely to take the door''s own default of ' || v_default || '.';
  end if;

  if p_limit > v_ceiling then
    raise exception '% was asked for % rows; this store serves at most % rows in one page, so nothing was read rather than quietly reading fewer.',
      p_door, p_limit, v_ceiling
      using errcode = '22023',
            detail = jsonb_build_object('page', jsonb_build_object(
                       'requested', p_limit, 'returned', 0,
                       'ceiling', v_ceiling, 'next', null))::text,
            hint = 'PAGE-1: ask for ' || v_ceiling || ' or fewer and page with the offset — custom.page_contract() answers the ceiling without you having to find it this way. An organization that genuinely pages bigger raises the knob custom/page_size_ceiling.';
  end if;

  return p_limit;
end;
$function$;
comment on function custom.page_size(uuid, text, integer, integer, integer) is
  'PAGE-1. The ONE page-size decision every list door makes. NULL takes the door''s default; under 1 and over the ceiling are REFUSED by name with the page contract in DETAIL; anything else is served exactly as asked. SECURITY INVOKER: it reads two knob rows and returns an integer, and it has no business holding the definer''s privileges inside a SECURITY INVOKER client door such as custom.entity_records_find.';
