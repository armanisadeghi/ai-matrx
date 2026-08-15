-- Applied 2026-08-14. FOUND_DEFECTS D133 (remainder): there was NO product path
-- to move a site between organizations. It had to be done by hand-written SQL
-- because `organization_id` is DENORMALIZED onto ~60 child tables across
-- web.*, seo.*, plan.* and growth.* — updating only `web.site` leaves every
-- child stranded in the old tenant (invisible to the new org, still readable by
-- the old one).
--
-- ONE mutation path: public.move_site_to_organization(). SECURITY DEFINER
-- because the move must cross RLS on every child table and because
-- `organization_id` is a GOVERNED column (iam._guard_governance_columns) — the
-- guard's own hint says re-homing "is a deliberate, audited operation, never a
-- column write". This function IS that operation. The guard early-returns for
-- non-`authenticated` current_user, so the definer lane passes it by design.
--
-- WHAT DOES NOT MOVE, deliberately:
--   * Append-only fact tables (web.snapshot, web.crawl_url, web.crawl_event,
--     web.analysis_result, web.link_edge). Their rows are historical facts
--     stamped with the org that held the site AT THE TIME, they are protected
--     by web.reject_immutable_fact_mutation / reject_crawl_fact_mutation, and
--     access to them resolves through the parent site anyway. This preserves
--     the decision made during the manual aimatrx.com move (3 web.snapshot
--     rows left on the old org, on purpose). Detected structurally — by the
--     presence of a BEFORE UPDATE reject-trigger — so a future append-only
--     table is preserved automatically, and the 55000 handler is a backstop.
--   * seo.keyword_market / seo.keyword_market_observation. Shared market
--     dimensions keyed by (keyword, location); they are reachable from a site
--     only incidentally via seo.collection_run and are not site-owned.
--
-- THE BRAND IS NOT A FOOTNOTE — it is an access path. `platform.entity_relationships`
-- registers `web_site <- web_brand` as CONTAINMENT, so viewer access to the
-- brand conveys to every site inside it. Live-proven 2026-08-14: after moving a
-- site org-to-org, a member of the SOURCE org still read the site, its pages and
-- its competitors, purely because the brand stayed behind. A move that leaves
-- that path open has not moved anything. So the caller must say what happens to
-- the brand — `p_brand_action`:
--   'move_brand' — take the brand along. Refused if the brand still holds sites
--                  that are NOT going to the destination org, because moving it
--                  would silently drag their access with it.
--   'detach'     — clear the site's brand_id. The site keeps all of its data.
--   'keep'       — deliberately leave the brand (and the access it conveys) in
--                  the old org. Legitimate for a brand shared across orgs, and
--                  reported loudly in the result so it is never silent.
-- No default: with a cross-org brand and no choice, the function raises and
-- names the three options rather than guessing.
--
-- Direct children are DISCOVERED at runtime (any base table with an
-- `organization_id` column and a single-column FK to web.site), so a new
-- site-scoped table is covered the day it is created — no list to rot.
-- Indirect children have no such rule and are listed explicitly below.

-- The first cut of this function shipped without p_brand_action. PostgREST
-- resolves an RPC by the argument names in the body, so leaving that overload
-- in place would let a 3-argument call reach a version with no brand guard —
-- the exact hole this migration exists to close.
drop function if exists public.move_site_to_organization(uuid, uuid, integer);

create or replace function public.move_site_to_organization(
  p_site_id uuid,
  p_target_organization_id uuid,
  p_expected_version integer default null,
  p_brand_action text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_super boolean;
  v_site record;
  v_target record;
  v_source_name text;
  v_rows bigint;
  v_moved jsonb := '[]'::jsonb;
  v_preserved jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_brand record;
  v_brand_organization_name text;
  v_brand_action text;
  v_brand_strays bigint;
  v_brand_outcome jsonb := null;
  rec record;
begin
  if v_uid is null then
    raise exception using errcode = '42501',
      message = 'Sign in to move a site between organizations.';
  end if;
  if p_brand_action is not null and p_brand_action not in ('move_brand', 'detach', 'keep') then
    raise exception using errcode = '22023',
      message = format('Unknown brand action "%s".', p_brand_action),
      hint = 'Use move_brand, detach, or keep.';
  end if;
  v_is_super := coalesce(public.is_super_admin_for(v_uid), false);

  -- Lock the site for the whole move so a concurrent rename/delete cannot
  -- interleave. SECURITY DEFINER bypasses RLS, so every check below is ours.
  select s.id, s.name, s.domain, s.organization_id, s.created_by, s.version,
         s.deleted_at, s.brand_id
    into v_site
  from web.site s
  where s.id = p_site_id
  for update;

  if v_site.id is null then
    raise exception using errcode = 'P0002',
      message = 'That site does not exist.';
  end if;

  -- Same answer for "hidden from you" as the rest of the platform gives, so a
  -- caller who cannot see the site learns nothing about it.
  if not (v_is_super
          or v_site.created_by = v_uid
          or iam.has_access_for(v_uid, 'web_site', p_site_id, 'viewer')) then
    raise exception using errcode = 'P0002',
      message = 'That site does not exist.';
  end if;

  if v_site.deleted_at is not null then
    raise exception using errcode = '55000',
      message = 'This site is in the trash. Restore it before moving it to another organization.';
  end if;

  -- ADMIN on the site, not editor: re-homing decides who can reach every row
  -- under it (THE GOVERNANCE-COLUMN TIER).
  if not (v_is_super
          or v_site.created_by = v_uid
          or iam.has_access_for(v_uid, 'web_site', p_site_id, 'admin')) then
    raise exception using errcode = '42501',
      message = format('Moving %s to another organization requires owner or admin access to the site.', v_site.name),
      detail  = 'Edit access is not enough: the move changes who can reach the site and all of its data.',
      hint    = 'Ask the site owner to move it, or request admin access to it first.';
  end if;

  if p_expected_version is not null and v_site.version is distinct from p_expected_version then
    raise exception using errcode = '40001',
      message = 'This site changed while you were looking at it. Reload and try the move again.';
  end if;

  select o.id, o.name into v_target
  from iam.organizations o
  where o.id = p_target_organization_id;

  if v_target.id is null then
    raise exception using errcode = 'P0002',
      message = 'That organization does not exist.';
  end if;

  -- Placing a site in an org is membership-gated everywhere else (web.site's
  -- std_insert policy is iam.has_org_access(organization_id)); the destination
  -- bar here is the same one, no tighter.
  if not (v_is_super or iam.has_org_access_for(v_uid, p_target_organization_id)) then
    raise exception using errcode = '42501',
      message = format('You are not a member of %s, so you cannot move a site into it.', v_target.name),
      hint    = 'Ask an owner of that organization to invite you first.';
  end if;

  select o.name into v_source_name from iam.organizations o where o.id = v_site.organization_id;

  -- ------------------------------------------------------- the brand's fate
  -- Resolved BEFORE the same-organization fast path as well as before a move.
  -- A site can already be in its intended organization while its parent brand
  -- is stranded elsewhere; returning early in that state preserves the exact
  -- containment access hole this RPC exists to close.
  if v_site.brand_id is not null then
    select b.id, b.name, b.organization_id into v_brand
    from web.brand b where b.id = v_site.brand_id;
    select o.name into v_brand_organization_name
    from iam.organizations o where o.id = v_brand.organization_id;
  end if;

  if v_brand.id is not null and v_brand.organization_id is distinct from p_target_organization_id then
    v_brand_action := p_brand_action;

    if v_brand_action is null then
        raise exception using errcode = '22023',
        message = format('%s belongs to the brand "%s", which stays in %s.',
                         v_site.name, v_brand.name,
                         coalesce(v_brand_organization_name, 'another organization')),
        detail  = 'A brand conveys access to every site inside it, so leaving it behind '
               || 'lets members of the old organization keep reading this site.',
        hint    = 'Choose: move the brand too, detach this site from the brand, or '
               || 'knowingly keep the brand where it is.';
    end if;

    if v_brand_action = 'move_brand' then
      -- Moving a brand moves what it conveys. If it still holds sites that are
      -- not going along, this would hand the destination org access to them.
      select count(*) into v_brand_strays
      from web.site s
      where s.brand_id = v_brand.id
        and s.id <> p_site_id
        and s.deleted_at is null
        and s.organization_id is distinct from p_target_organization_id;

      if v_brand_strays > 0 then
        raise exception using errcode = '22023',
          message = format('"%s" still has %s other site(s) outside %s, so the brand cannot move with this one.',
                           v_brand.name, v_brand_strays, v_target.name),
          detail  = 'Moving the brand would give the destination organization access to those sites too.',
          hint    = 'Move those sites first, or detach this site from the brand instead.';
      end if;

      update web.brand
         set organization_id = p_target_organization_id,
             updated_by = v_uid,
             updated_at = now()
       where id = v_brand.id;
      v_brand_outcome := jsonb_build_object('action', 'moved', 'id', v_brand.id, 'name', v_brand.name);

    elsif v_brand_action = 'detach' then
      update web.site set brand_id = null where id = p_site_id;
      v_brand_outcome := jsonb_build_object('action', 'detached', 'id', v_brand.id, 'name', v_brand.name);

    else
      v_brand_outcome := jsonb_build_object(
        'action', 'kept',
        'id', v_brand.id,
        'name', v_brand.name,
        'organization_id', v_brand.organization_id,
        'warning', format('Members of %s can still reach this site through the brand "%s".',
                          coalesce(v_source_name, 'the previous organization'), v_brand.name));
    end if;
  end if;

  if v_site.organization_id = p_target_organization_id then
    return jsonb_build_object(
      'moved', false,
      'reason', case
                  when v_brand_outcome is null then 'already_there'
                  when v_brand_outcome ->> 'action' = 'kept' then 'brand_kept'
                  else 'brand_reconciled'
                end,
      'site_id', p_site_id,
      'site_name', v_site.name,
      'organization_id', p_target_organization_id,
      'organization_name', v_target.name,
      'moved_tables', case when v_brand_outcome is null
                                  or v_brand_outcome ->> 'action' = 'kept'
                           then '[]'::jsonb
                           else jsonb_build_array(
                             jsonb_build_object('table', 'web.brand', 'rows', 1)) end,
      'preserved_tables', '[]'::jsonb,
      'rows_moved', case when v_brand_outcome is null
                               or v_brand_outcome ->> 'action' = 'kept'
                         then 0 else 1 end,
      'brand', v_brand_outcome
    );
  end if;

  -- THE SITE ROW MOVES FIRST, and that is not a style choice:
  -- web.enforce_site_component_organization() is a BEFORE INSERT/UPDATE trigger
  -- on the web.* children that REJECTS any child whose organization_id differs
  -- from its parent site's. Touch a child while the site still points at the
  -- old org and the move dies with 23514. Atomicity does not depend on the
  -- order — every statement below is in this one transaction, so a failure
  -- anywhere rolls the site row back with it.
  update web.site
     set organization_id = p_target_organization_id,
         updated_by = v_uid,
         updated_at = now()
   where id = p_site_id;
  v_total := 1;
  v_moved := jsonb_build_array(jsonb_build_object('table', 'web.site', 'rows', 1));

  -- ---------------------------------------------------------------- children
  for rec in
    -- (a) DIRECT: organization_id + a single-column FK straight to web.site.
    select n.nspname as sch, c.relname as tbl,
           format('update %I.%I t set organization_id = $1
                    where t.%I = $2 and t.organization_id is distinct from $1',
                  n.nspname, c.relname, a.attname) as stmt,
           exists (
             select 1 from pg_catalog.pg_trigger tg
             join pg_catalog.pg_proc pr on pr.oid = tg.tgfoid
             where tg.tgrelid = c.oid and not tg.tgisinternal
               and (tg.tgtype & 2) <> 0 and (tg.tgtype & 16) <> 0
               and pr.proname ~ '(immutable|append_only|_fact_mutation)'
           ) as immutable
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = con.conrelid and a.attnum = con.conkey[1] and not a.attisdropped
    where con.contype = 'f'
      and con.confrelid = 'web.site'::regclass
      and array_length(con.conkey, 1) = 1
      and c.relkind = 'r'
      and n.nspname not in ('graveyard', 'pg_catalog')
      and exists (
        select 1 from pg_catalog.pg_attribute o
        where o.attrelid = c.oid and o.attname = 'organization_id' and not o.attisdropped
      )

    union all

    -- (b) INDIRECT: site-owned rows that carry organization_id but reach the
    -- site only through a parent. There is no structural rule for these, so
    -- they are named. Deliberately absent: seo.keyword_market and
    -- seo.keyword_market_observation (shared market dimensions, not site data).
    select v.sch, v.tbl,
           format('update %I.%I t set organization_id = $1
                     where t.organization_id is distinct from $1
                       and exists (select 1 from %I.%I p
                                    where p.id = t.%I and p.%I = $2)',
                  v.sch, v.tbl, v.psch, v.ptbl, v.fk, v.psite) as stmt,
           false as immutable
    from (values
      ('plan', 'cms_fill_item',          'job_id',         'plan', 'cms_fill_job', 'web_site_id'),
      ('seo',  'competitor_observation', 'competitor_id',  'seo',  'competitor',   'site_id'),
      ('seo',  'rank_observation',       'rank_target_id', 'seo',  'rank_target',  'site_id'),
      ('seo',  'serp_snapshot',          'rank_target_id', 'seo',  'rank_target',  'site_id')
    ) as v(sch, tbl, fk, psch, ptbl, psite)
    order by 1, 2
  loop
    if rec.immutable then
      v_preserved := v_preserved || jsonb_build_object(
        'table', rec.sch || '.' || rec.tbl,
        'reason', 'append_only_fact');
      continue;
    end if;

    begin
      execute rec.stmt using p_target_organization_id, p_site_id;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        v_moved := v_moved || jsonb_build_object(
          'table', rec.sch || '.' || rec.tbl, 'rows', v_rows);
        v_total := v_total + v_rows;
      end if;
    exception
      -- Backstop for an append-only table the trigger-name probe did not
      -- recognize. The failed statement rolls back to this block's implicit
      -- savepoint; the rest of the move continues in the same transaction.
      when sqlstate '55000' then
        v_preserved := v_preserved || jsonb_build_object(
          'table', rec.sch || '.' || rec.tbl,
          'reason', 'append_only_fact');
    end;
  end loop;

  return jsonb_build_object(
    'moved', true,
    'site_id', p_site_id,
    'site_name', v_site.name,
    'site_domain', v_site.domain,
    'from_organization_id', v_site.organization_id,
    'from_organization_name', v_source_name,
    'organization_id', p_target_organization_id,
    'organization_name', v_target.name,
    'moved_tables', v_moved,
    'preserved_tables', v_preserved,
    'rows_moved', v_total,
    'brand', v_brand_outcome
  );
end;
$$;

revoke all on function public.move_site_to_organization(uuid, uuid, integer, text) from public;
grant execute on function public.move_site_to_organization(uuid, uuid, integer, text) to authenticated;

comment on function public.move_site_to_organization(uuid, uuid, integer, text) is
  'Atomically re-homes a site and every denormalized organization_id under it '
  '(discovered live) into another organization. Requires owner/admin access to '
  'the site and membership of the destination org. Append-only fact tables and '
  'shared market dimensions are deliberately left on the original org. A brand '
  'in a different org conveys access, so p_brand_action (move_brand|detach|keep) '
  'is required whenever one would be left behind.';

-- Preview for the confirmation dialog: what WOULD move, without moving it.
-- Same discovery, same exclusions, read-only, viewer-gated.
create or replace function public.preview_site_organization_move(p_site_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_super boolean;
  v_site record;
  v_rows bigint;
  v_moved jsonb := '[]'::jsonb;
  v_preserved jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_brand record;
  v_brand_siblings bigint;
  rec record;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Sign in to preview a site move.';
  end if;
  v_is_super := coalesce(public.is_super_admin_for(v_uid), false);

  select s.id, s.name, s.organization_id, s.created_by, s.brand_id into v_site
  from web.site s where s.id = p_site_id;

  if v_site.id is null
     or not (v_is_super or v_site.created_by = v_uid
             or iam.has_access_for(v_uid, 'web_site', p_site_id, 'viewer')) then
    raise exception using errcode = 'P0002', message = 'That site does not exist.';
  end if;

  for rec in
    select n.nspname as sch, c.relname as tbl,
           format('select count(*) from %I.%I t where t.%I = $1',
                  n.nspname, c.relname, a.attname) as stmt,
           exists (
             select 1 from pg_catalog.pg_trigger tg
             join pg_catalog.pg_proc pr on pr.oid = tg.tgfoid
             where tg.tgrelid = c.oid and not tg.tgisinternal
               and (tg.tgtype & 2) <> 0 and (tg.tgtype & 16) <> 0
               and pr.proname ~ '(immutable|append_only|_fact_mutation)'
           ) as immutable
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = con.conrelid and a.attnum = con.conkey[1] and not a.attisdropped
    where con.contype = 'f'
      and con.confrelid = 'web.site'::regclass
      and array_length(con.conkey, 1) = 1
      and c.relkind = 'r'
      and n.nspname not in ('graveyard', 'pg_catalog')
      and exists (
        select 1 from pg_catalog.pg_attribute o
        where o.attrelid = c.oid and o.attname = 'organization_id' and not o.attisdropped
      )
    union all
    select v.sch, v.tbl,
           format('select count(*) from %I.%I t where exists '
                  '(select 1 from %I.%I p where p.id = t.%I and p.%I = $1)',
                  v.sch, v.tbl, v.psch, v.ptbl, v.fk, v.psite) as stmt,
           false as immutable
    from (values
      ('plan', 'cms_fill_item',          'job_id',         'plan', 'cms_fill_job', 'web_site_id'),
      ('seo',  'competitor_observation', 'competitor_id',  'seo',  'competitor',   'site_id'),
      ('seo',  'rank_observation',       'rank_target_id', 'seo',  'rank_target',  'site_id'),
      ('seo',  'serp_snapshot',          'rank_target_id', 'seo',  'rank_target',  'site_id')
    ) as v(sch, tbl, fk, psch, ptbl, psite)
    order by 1, 2
  loop
    execute rec.stmt into v_rows using p_site_id;
    if v_rows > 0 then
      if rec.immutable then
        v_preserved := v_preserved || jsonb_build_object(
          'table', rec.sch || '.' || rec.tbl, 'rows', v_rows, 'reason', 'append_only_fact');
      else
        v_moved := v_moved || jsonb_build_object(
          'table', rec.sch || '.' || rec.tbl, 'rows', v_rows);
        v_total := v_total + v_rows;
      end if;
    end if;
  end loop;

  if v_site.brand_id is not null then
    select b.id, b.name, b.organization_id into v_brand
    from web.brand b where b.id = v_site.brand_id;
    -- Live sibling sites under the same brand. If there are any, 'move_brand'
    -- is only offered when they are all going to the same place, so the UI
    -- needs the count to explain why.
    select count(*) into v_brand_siblings
    from web.site s
    where s.brand_id = v_brand.id and s.id <> p_site_id and s.deleted_at is null;
  end if;

  return jsonb_build_object(
    'site_id', p_site_id,
    'site_name', v_site.name,
    'organization_id', v_site.organization_id,
    'moved_tables', v_moved,
    'preserved_tables', v_preserved,
    'rows_moved', v_total + 1,
    'brand', case when v_brand.id is not null
                  then jsonb_build_object('id', v_brand.id, 'name', v_brand.name,
                                          'organization_id', v_brand.organization_id,
                                          'other_sites', coalesce(v_brand_siblings, 0))
                  else null end
  );
end;
$$;

revoke all on function public.preview_site_organization_move(uuid) from public;
grant execute on function public.preview_site_organization_move(uuid) to authenticated;

comment on function public.preview_site_organization_move(uuid) is
  'Read-only preview of move_site_to_organization: per-table row counts that '
  'would move, and the append-only tables that would deliberately stay.';
