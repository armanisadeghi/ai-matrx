-- MIRROR-2, the inverse of file 2: the policy on custom.record put back to the whole-database
-- bound it carried before this lane. Built from the LIVE text the same way the forward file is:
-- the memo arm is stripped and the candidate SELECT is put back into the union, so nothing else
-- in the policy can move. Run it and a member's read of 100 records costs 6.7 s again.
do $mirror2_down$
declare
  v_qual   text;
  v_arm    text;
  v_needle text;
  v_new    text;
begin
  select p.qual into v_qual
    from pg_catalog.pg_policies p
   where p.schemaname = 'custom' and p.tablename = 'record' and p.policyname = 'std_select';
  if v_qual is null then
    raise exception 'MIRROR-2 down: custom.record has no std_select policy.';
  end if;

  v_arm := pg_catalog.substring(v_qual from ' OR \(\(deleted_at IS NULL\) AND iam\.record_visible_in_org\(.*?\)\)\)$');
  if v_arm is null then
    raise exception 'MIRROR-2 down: this policy does not carry the MIRROR-2 arm; nothing to undo.';
  end if;
  v_new := pg_catalog.replace(v_qual, v_arm, '');

  v_needle := 'SELECT p.resource_id' || chr(10) || '   FROM iam.permissions p';
  if pg_catalog.strpos(v_new, v_needle) = 0 then
    raise exception 'MIRROR-2 down: the candidate union is not the shape this inverse expects.';
  end if;
  v_new := pg_catalog.replace(v_new, v_needle,
             'SELECT iam.unnest_uuids(iam.accessible_entity_ids(''record''::text, '
          || '''viewer''::permission_level, 0, true)) AS unnest_uuids' || chr(10)
          || 'UNION' || chr(10) || ' ' || v_needle);

  execute pg_catalog.format('alter policy std_select on custom.record using (%s)', v_new);
end
$mirror2_down$;
