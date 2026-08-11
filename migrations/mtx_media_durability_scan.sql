-- ============================================================================
-- public.mtx_media_durability_scan() — the repeatable inventory behind
-- `pnpm check:media-durability`.
--
-- THE DEFECT IT LOOKS FOR is NOT "an expiring URL exists". Expiring signed URLs
-- are correct and intended in many places (time-boxed share links, TTL caches,
-- audit rows recording exactly what was issued). The defect is the MISMATCH
-- between a URL's lifetime and its consumer's contract:
--   * a column an ANONYMOUS surface reads must hold a durable ref;
--   * a column that must still resolve for its owner tomorrow must hold a
--     durable ref (public/CDN URL, or a file_id re-minted on read).
--
-- So the default scan is CONTRACT-SCOPED, not a blanket sweep. It probes
-- exactly two populations:
--   (1) every column registered in public.mtx_public_url_guard — the columns a
--       DB designer has declared must stay durable;
--   (2) every text/jsonb column named in platform.shareable_resource_registry
--       .public_columns — literally the projection an anonymous share-link
--       viewer receives. If a signed URL is in there, a logged-out human sees a
--       broken asset once the signature dies, and cannot re-mint it.
--
-- p_full => scan EVERY text-ish column in every non-system schema instead. That
-- is the periodic patrol sweep (minutes, not seconds); it is not a release gate.
--
-- Returns raw counts. The TS checker diffs them against the committed
-- classification allowlist, so INTENTIONAL expiry stays quiet and a hit in a NEW
-- column screams.
-- ============================================================================

create or replace function public.mtx_media_durability_scan(p_full boolean default false, p_schema text default null)
returns table (schema_name text, table_name text, column_name text, row_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  pat constant text := 'X-Amz-Signature|AWSAccessKeyId=|s3\.amazonaws\.com|X-Amz-Credential';
  tgt record;
  n bigint;
begin
  for tgt in
    with guarded as (
      select coalesce(g.schema_name, 'public') as sch, g.table_name as tbl, g.column_name as col
        from public.mtx_public_url_guard g
    ),
    anon_exposed as (
      select r.schema_name as sch, r.table_name as tbl, c.col
        from platform.shareable_resource_registry r
        cross join lateral unnest(r.public_columns) as c(col)
       where r.is_active and r.public_columns is not null
    ),
    everything as (
      select c.table_schema as sch, c.table_name as tbl, c.column_name as col
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema and t.table_name = c.table_name
         and t.table_type = 'BASE TABLE'
       where p_full
         and c.data_type in ('text','character varying','character','json','jsonb','ARRAY')
         and (p_schema is null or c.table_schema = p_schema)
         and c.table_schema not in
           ('pg_catalog','information_schema','pg_toast','extensions','graphql',
            'graphql_public','_realtime','realtime','vault','pgsodium','pgsodium_masks',
            'net','cron','pgbouncer','supabase_migrations','supabase_functions')
    )
    select distinct sch, tbl, col from (
      select * from guarded where not p_full
      union all select * from anon_exposed where not p_full
      union all select * from everything
    ) u
    where (p_schema is null or u.sch = p_schema)
    -- only real, currently-existing columns survive
      and exists (
      select 1 from information_schema.columns c
       where c.table_schema = u.sch and c.table_name = u.tbl and c.column_name = u.col
         and c.data_type in ('text','character varying','character','json','jsonb','ARRAY')
    )
    order by 1, 2, 3
  loop
    begin
      execute format(
        'select count(*) from %I.%I t where t.%I::text ~ $1',
        tgt.sch, tgt.tbl, tgt.col
      ) into n using pat;
    exception when others then
      continue;  -- an unreadable/dropped relation must not abort the whole scan
    end;
    if n > 0 then
      schema_name := tgt.sch; table_name := tgt.tbl;
      column_name := tgt.col; row_count := n;
      return next;
    end if;
  end loop;
end;
$$;

comment on function public.mtx_media_durability_scan(boolean, text) is
  'Contract-scoped scan for stored signed/expiring media URLs: guard-registered columns + the anon-visible shareable_resource_registry projection. p_full scans every text-ish column (patrol sweep); p_schema restricts to one schema so the patrol can batch under the statement timeout. Consumed by pnpm check:media-durability, which diffs against the committed classification allowlist.';

drop function if exists public.mtx_media_durability_scan(boolean);
grant execute on function public.mtx_media_durability_scan(boolean, text) to authenticated, service_role;

-- Schema list for the batched patrol sweep. Kept beside the scan so the checker
-- never has to hardcode a schema list that drifts as schemas are added.
create or replace function public.mtx_media_durability_schemas()
returns table (schema_name text)
language sql
security definer
set search_path = public
as $$
  select distinct c.table_schema::text
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
   where c.data_type in ('text','character varying','character','json','jsonb','ARRAY')
     and c.table_schema not in
       ('pg_catalog','information_schema','pg_toast','extensions','graphql',
        'graphql_public','_realtime','realtime','vault','pgsodium','pgsodium_masks',
        'net','cron','pgbouncer','supabase_migrations','supabase_functions')
   order by 1;
$$;

grant execute on function public.mtx_media_durability_schemas() to authenticated, service_role;
