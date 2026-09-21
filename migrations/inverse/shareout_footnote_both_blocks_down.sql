-- chair-step: SHARE-OUT item 2's second inverse — it puts custom.computed_provenance back to reading only the `_computed` block, which is carried by zero records, so the footnote goes back to answering "nothing was worked out here" about every record in the platform
--
-- Restores the body as `migrations/campaign/shareout_the_provenance_footnote_has_a_door.sql`
-- left it: the ladder and the mask stay, only `_derived` stops being read.

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
    select e.key,
           (e.value ->> 'field_id')::uuid,
           case when custom.mask_says_withheld(v_mask, e.key)
                then custom.withheld_marker(v_mask, e.key)
                else e.value -> 'value' end,
           (e.value ->> 'rule_id')::uuid,
           (e.value ->> 'rule_version')::integer,
           (e.value ->> 'at')::timestamptz
      from custom.record r,
           lateral jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e
     where r.organization_id = p_organization_id
       and r.id = p_record_id;
end;
$fn$;
