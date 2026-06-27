-- run_org_required.sql
--
-- Make organization_id REQUIRED on every canonical run/job table, the standard
-- way: (1) a DB-edge insert default that can never leave it NULL, (2) backfill
-- existing rows from the owner's personal org (ownerless → the Matrx System
-- org), (3) SET NOT NULL.
--
-- Why the trigger before the NOT NULL: some run rows are legitimately ownerless
-- (system/anonymous runs — 13 agent_run + 2 legal.ingest_runs today). Without a
-- default those inserts would start failing the moment org is required. The
-- trigger fills org from the owner's personal org (canonical
-- ensure_personal_organization) or the system org, so the app's explicit org
-- still wins (trigger only fires when org IS NULL) and NOT NULL is always safe.
--
-- Idempotent: safe to re-apply.

-- DB-edge default: stamp organization_id when an insert leaves it NULL.
-- Reads the owner generically (user_id OR triggered_by) from the row jsonb.
create or replace function platform.stamp_run_org()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_owner uuid;
begin
  if NEW.organization_id is not null then return NEW; end if;
  v_owner := coalesce(
    nullif(to_jsonb(NEW)->>'user_id','')::uuid,
    nullif(to_jsonb(NEW)->>'triggered_by','')::uuid);
  if v_owner is not null then
    -- existing personal org (cheap), else create it (rare) — short-circuits.
    NEW.organization_id := coalesce(
      (select id from public.organizations where created_by = v_owner and is_personal order by created_at limit 1),
      public.ensure_personal_organization(v_owner));
  else
    NEW.organization_id := (select id from public.organizations where is_system order by created_at limit 1);
  end if;
  return NEW;
end;
$fn$;

do $each$
declare
  r record;
  v_system uuid := (select id from public.organizations where is_system order by created_at limit 1);
begin
  for r in select * from (values
    ('files','file_rag_jobs','user_id'),
    ('public','kg_sweep_run','user_id'),
    ('public','agent_run','user_id'),
    ('public','pc_studio_runs','user_id'),
    ('public','sch_run','user_id'),
    ('public','scrape_cycle_run','user_id'),
    ('scraper','crawl_runs','user_id'),
    ('public','studio_runs','user_id'),
    ('public','page_extraction_runs','triggered_by'),
    ('public','page_extraction_page_runs','user_id'),
    ('public','derive_runs','user_id'),
    ('legal','ingest_runs','triggered_by')
  ) as v(sch, tbl, owner)
  loop
    -- 1. Insert default (before NOT NULL, so concurrent inserts stay safe).
    execute format('drop trigger if exists stamp_run_org on %I.%I', r.sch, r.tbl);
    execute format(
      'create trigger stamp_run_org before insert on %I.%I '
      || 'for each row execute function platform.stamp_run_org()', r.sch, r.tbl);

    -- 2. Backfill owned rows from the owner's personal org.
    execute format(
      'update %I.%I t set organization_id = public.ensure_personal_organization(t.%I) '
      || 'where t.organization_id is null and t.%I in (select id from auth.users)',
      r.sch, r.tbl, r.owner, r.owner);

    -- 3. Backfill the remainder (ownerless / orphaned owner) → system org.
    execute format(
      'update %I.%I set organization_id = %L where organization_id is null',
      r.sch, r.tbl, v_system);

    -- 4. Require it.
    execute format('alter table %I.%I alter column organization_id set not null', r.sch, r.tbl);
  end loop;
end
$each$;
