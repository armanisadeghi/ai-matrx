-- chair-step: deleting platform.taxonomy_node rows un-anchors every registered table, feature doc and picker that resolves through them; never additive, never unattended
--
-- THE INVERSE of `migrations/campaign/w1_prov_branch_taxonomy_levelling.sql` (§4.13).
-- It refuses on production, where these rows are the originals rather than a copy.

set lock_timeout = '2s';
set statement_timeout = '300s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). These 237 rows are production''s '
      'own; the branch copied them from here.', (pg_control_system()).system_identifier;
  end if;
  if exists (select 1 from platform.entity_types where taxonomy_node_id is not null) then
    raise notice
      'platform.entity_types rows still resolve through these nodes; the FK is ON DELETE RESTRICT and will say which.';
  end if;
end
$$;

delete from platform.taxonomy_node;
