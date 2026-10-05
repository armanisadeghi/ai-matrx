-- chair-step: it ADDS one read door, public.templates_public(jsonb) (STABLE, SECURITY DEFINER, search_path pg_catalog), executable by anon and authenticated. It returns ONLY published platform templates (custom.template rows with scope 'platform', not retired, latest version per catalogue id) in the same card shape custom.templates answers, without the per-organization "installed" mark. Nothing else changes: no table, column, policy or existing function is touched; custom.templates still refuses a caller with no session.
-- lane: TEMPLATES
-- lock: none
--
-- Inverse: migrations/inverse/templates7_a_anyone_can_browse_the_platform_templates_down.sql
--
-- v7 TEMPLATES item 2 — THE PUBLIC GALLERY. Arman ruled 2026-10-02: the template gallery is public and indexed.
-- THE USE CASE. A salon owner searching "salon appointment template" lands on aimatrx.com/templates/T0101, sees
-- the bookings template, clicks "Use this template", signs up and it installs. Today /templates says "No public
-- templates yet" for every visitor: the page reads custom.templates with no session and the anonymous caller
-- cannot reach the custom schema (and the door refuses a caller with no session). This door hands a signed-out
-- reader exactly the platform cards, the same thing every signed-in person already sees.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.templates_public(p_filter jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        jsonb := coalesce(p_filter, '{}'::jsonb);
  v_limit  integer := least(greatest(coalesce((f ->> 'limit')::integer, 60), 1), 200);
  v_offset integer := greatest(coalesce((f ->> 'offset')::integer, 0), 0);
  v_q      text := nullif(btrim(f ->> 'q'), '');
  v_out    jsonb;
  v_total  integer;
begin
  with latest as (
    select distinct on (t.catalogue_id) t.*
      from custom.template t
     where t.retired_at is null
       and t.scope = 'platform'
     order by t.catalogue_id, t.template_version desc
  ), picked as (
    select l.* from latest l
     where (f ->> 'catalogue_id' is null or l.catalogue_id = f ->> 'catalogue_id')
       and (f ->> 'industry' is null or l.card ->> 'industry' = f ->> 'industry')
       and (f ->> 'job' is null or l.card ->> 'job' = f ->> 'job')
       and (f ->> 'teaches' is null or l.card ->> 'teaches' = f ->> 'teaches')
       and (v_q is null or (coalesce(l.card ->> 'name', '') || ' ' || coalesce(l.card ->> 'persona', '') || ' '
                            || coalesce(l.card ->> 'vertical', '') || ' ' || coalesce(l.card ->> 'business', '')) ilike '%' || v_q || '%')
  )
  select count(*)::integer,
         coalesce(jsonb_agg(c order by c ->> 'name') filter (where rn > v_offset and rn <= v_offset + v_limit), '[]'::jsonb)
    into v_total, v_out
    from (
      select row_number() over (order by p.card ->> 'name', p.catalogue_id) rn,
             jsonb_build_object(
               'id', p.id, 'catalogue_id', p.catalogue_id, 'version', p.template_version, 'scope', p.scope,
               'owner_organization_id', null,
               'name', p.card ->> 'name', 'persona', p.card ->> 'persona',
               'business', p.card ->> 'business', 'vertical', p.card ->> 'vertical',
               'industry', p.card ->> 'industry', 'job', p.card ->> 'job', 'audience', p.card ->> 'audience',
               'teaches', p.card ->> 'teaches', 'strengths', coalesce(p.card -> 'strengths', '[]'::jsonb),
               'requires', coalesce(p.card -> 'requires', '[]'::jsonb),
               'footprint', p.card -> 'footprint', 'preview_image', p.card ->> 'previewImage',
               'install_door', 'custom.template_install',
               'installed', null) c
        from picked p
    ) x;
  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'cards', v_out);
end;
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers, anonymous_purpose)
values ('public', 'templates_public', 'p_filter jsonb', array['jsonb'::regtype]::oid[],
        'Takes no entity id: p_filter only narrows (catalogue_id, industry, job, teaches, q, limit, offset). Returns only custom.template rows with scope platform and not retired, so no organization''s own template is ever reachable.',
        'templates7_a_anyone_can_browse_the_platform_templates', true, true,
        'The public template gallery at aimatrx.com/templates and its search-engine crawlers have no account; it shows only the platform''s published templates, the same cards every signed-in person sees.');
grant execute on function public.templates_public(jsonb) to anon, authenticated, service_role;
comment on function public.templates_public(jsonb) is 'Published platform templates for anyone, signed in or not (the public gallery at /templates). Organization templates are never here.';
