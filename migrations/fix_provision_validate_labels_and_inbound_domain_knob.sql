-- based-on: platform.provision_validate(jsonb, text, uuid) 7ad3c4d3061c5cb6d31d115b461ab11a4b71772888fa00713c1f37cd39462695
-- based-on: custom.inbound_domain(uuid) 3eb38b441a94d381747d0ec12c25f53c6c1561ff13c32da04e2becb332a0fd1e
-- fix_provision_validate_labels_and_inbound_domain_knob.sql
--
-- Two genuine findings left in audit.broken_functions on 2026-09-27.
--
-- 1. platform.provision_validate — `coalesce(v_item->'labels'::text, '(not set)')`.
--    `->` binds looser than `::`, so this is coalesce(jsonb, '(not set)'), and the
--    literal '(not set)' is coerced to jsonb: 22P02 "invalid input syntax for type
--    json". Any provisioning spec whose types[] entry has missing/empty labels
--    crashed with a JSON parse error instead of returning the friendly
--    `types.shape` finding it was written to return. Reproduced live:
--      select coalesce('{}'::jsonb->'labels'::text, '(not set)');  -- 22P02
--    Census: the only occurrence of this shape in any live function body.
--    Fix: parenthesise — `coalesce((v_item->'labels')::text, '(not set)')`.
--
-- 2. custom.inbound_domain — called platform.knob_value(...), which does not
--    exist; a catch-all `exception when others` hid that and returned the
--    hardcoded default, so an organization's override of the (already
--    registered) knob custom/inbound_domain could never take effect. Now reads the
--    canonical resolver platform.knob_resolve, whose default is the same
--    published domain, and a read failure is a real failure (never a silent
--    default). Only caller: custom.inbound_declare (SECURITY DEFINER).
--
-- Body-only; signatures, owners, volatility and ACLs unchanged.

do $fix$
declare
  v_def text;
  v_old text := $s$coalesce(v_item->'labels'::text, '(not set)')$s$;
  v_new text := $s$coalesce((v_item->'labels')::text, '(not set)')$s$;
  v_n   integer;
begin
  v_def := pg_get_functiondef('platform.provision_validate(jsonb,text,uuid)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'provision_validate: labels coalesce found % times, expected 1', v_n;
  end if;
  execute replace(v_def, v_old, v_new);
end $fix$;

create or replace function custom.inbound_domain(p_organization_id uuid)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v text;
begin
  -- The knob custom/inbound_domain carries the published default
  -- (inbound.matrxserver.com) and any organization's own domain. Failing to read it
  -- is a real failure and says so; it is never papered over with a default here.
  v := nullif(btrim(coalesce(platform.knob_resolve('custom', 'inbound_domain', p_organization_id) #>> '{}', '')), '');
  if v is null then
    raise exception 'inbound_domain: the setting custom/inbound_domain is blank for organization %', p_organization_id
      using errcode = '22023';
  end if;
  return v;
end;
$function$;

do $assert$
begin
  if custom.inbound_domain('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f') is distinct from 'inbound.matrxserver.com' then
    raise exception 'inbound_domain did not resolve the knob default';
  end if;
  if pg_get_functiondef('platform.provision_validate(jsonb,text,uuid)'::regprocedure)
       like $s$%coalesce(v_item->'labels'::text%$s$ then
    raise exception 'provision_validate still carries the broken coalesce';
  end if;
end $assert$;
