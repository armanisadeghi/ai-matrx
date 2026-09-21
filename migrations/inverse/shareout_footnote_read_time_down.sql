-- chair-step: SHARE-OUT item 2's third inverse — it stops the record peek's footnote from naming any READ-TIME worked-out column, which is the store's own default for every formula, lookup and rollup, so the ordinary case goes back to saying nothing was worked out
--
-- Restores the body as `migrations/campaign/shareout_the_footnote_reads_the_block_that_exists.sql`
-- left it: the two stored blocks only.

create or replace function custom.computed_provenance(p_organization_id uuid, p_record_id uuid)
returns table(field_key text, field_id uuid, value jsonb, rule_id uuid,
              rule_version integer, computed_at timestamptz)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_mask jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.computed_provenance');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.computed_provenance',
                                        'viewer'::public.permission_level, 'record');

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  return query
    with blocks as (
      select 1 as rank, e.key as k, e.value as v
        from custom.record r,
             lateral jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = p_record_id
      union all
      select 2 as rank, e.key, e.value
        from custom.record r,
             lateral jsonb_each(coalesce(r.data -> '_derived', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = p_record_id
    ),
    one_per_key as (
      select distinct on (k) k, v from blocks order by k, rank
    )
    select b.k,
           (b.v ->> 'field_id')::uuid,
           case when custom.mask_says_withheld(v_mask, b.k)
                then custom.withheld_marker(v_mask, b.k)
                else b.v -> 'value' end,
           (b.v ->> 'rule_id')::uuid,
           (b.v ->> 'rule_version')::integer,
           (b.v ->> 'at')::timestamptz
      from one_per_key b;
end;
$fn$;
