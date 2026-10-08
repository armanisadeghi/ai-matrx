-- describe_install_b_the_one_offs_a_describe_run_installed_are_listed.sql — lane DESCRIBE-INSTALL (2026-10-08).
--
-- /make had no way to Remove what a describe run made once its result card was gone: a one-off is on no
-- shelf and custom.templates answered it only by its own id. The catalogue door gains one filter key,
-- installed_one_offs: the one-offs THIS organization (installed_in) has installed and not removed. The
-- gallery's own cards and Remove then serve /make unchanged.
-- based-on: custom.templates(jsonb) 14516d4dd73bd60baa3efcadd9eb602176f2ef460eedb6cf1cb77d34d5dd0003

CREATE OR REPLACE FUNCTION custom.templates(p_filter jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f          jsonb := coalesce(p_filter, '{}'::jsonb);
  v_me       uuid := auth.uid();
  v_scope    text := coalesce(nullif(f ->> 'scope', ''), 'all');
  v_org      uuid := nullif(f ->> 'organization_id', '')::uuid;
  v_inst     uuid := nullif(f ->> 'installed_in', '')::uuid;
  v_limit    integer := least(greatest(coalesce((f ->> 'limit')::integer, 60), 1), 200);
  v_offset   integer := greatest(coalesce((f ->> 'offset')::integer, 0), 0);
  v_q        text := nullif(btrim(f ->> 'q'), '');
  v_id       uuid := nullif(f ->> 'id', '')::uuid;
  -- DESCRIBE-INSTALL b: the one-offs (describe runs) this organization has INSTALLED and not removed.
  v_oneoffs  boolean := coalesce((f ->> 'installed_one_offs')::boolean, false);
  v_out      jsonb;
  v_total    integer;
begin
  if v_me is null then
    raise exception 'Sign in to see the template gallery.' using errcode = '42501';
  end if;
  if v_scope not in ('all', 'platform', 'org') then
    raise exception 'The gallery shows all, platform or org templates; "%" is none of those.', v_scope using errcode = '22023';
  end if;
  if v_inst is not null and not iam.has_org_access(v_inst) then
    v_inst := null;   -- an organization she is not in marks nothing (and says nothing about it)
  end if;

  with latest as (
    select distinct on (t.organization_id, t.catalogue_id) t.*
      from custom.template t
     where t.retired_at is null
       and (t.scope = 'platform' or iam.has_org_access(t.organization_id))
       and (v_scope = 'all' or t.scope = v_scope)
       and (v_org is null or t.scope = 'platform' or t.organization_id = v_org)
       -- A one-off (a describe run) is on no shelf; it is read only by its own id, until it is kept.
       and (not t.ephemeral or t.id = v_id
            or (v_oneoffs and v_inst is not null
                and exists (select 1 from custom.template_install i
                             where i.organization_id = v_inst and i.catalogue_id = t.catalogue_id and i.state <> 'uninstalled')))
       and (not v_oneoffs or t.ephemeral)
       and (v_id is null or t.id = v_id)
     order by t.organization_id, t.catalogue_id, t.template_version desc
  ), picked as (
    select l.* from latest l
     where (f ->> 'industry' is null or l.card ->> 'industry' = f ->> 'industry')
       and (f ->> 'job' is null or l.card ->> 'job' = f ->> 'job')
       and (f ->> 'teaches' is null or l.card ->> 'teaches' = f ->> 'teaches')
       and (f ->> 'strength' is null or coalesce(l.card -> 'strengths', '[]'::jsonb) ? (f ->> 'strength'))
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
               'owner_organization_id', case when p.scope = 'platform' then null else p.organization_id end,
               'name', p.card ->> 'name', 'persona', p.card ->> 'persona',
               'business', p.card ->> 'business', 'vertical', p.card ->> 'vertical',
               'industry', p.card ->> 'industry', 'job', p.card ->> 'job', 'audience', p.card ->> 'audience',
               'teaches', p.card ->> 'teaches', 'strengths', coalesce(p.card -> 'strengths', '[]'::jsonb),
               'requires', coalesce(p.card -> 'requires', '[]'::jsonb),
               'footprint', p.card -> 'footprint', 'preview_image', p.card ->> 'previewImage',
               'install_door', 'custom.template_install', 'ephemeral', p.ephemeral,
               'installed', case when v_inst is null then null else
                 (select jsonb_build_object('install_id', i.id, 'state', i.state, 'version', i.template_version)
                    from custom.template_install i
                   where i.organization_id = v_inst and i.catalogue_id = p.catalogue_id and i.state <> 'uninstalled')
               end) c
        from picked p
    ) x;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'cards', v_out);
end;
$function$
;
