-- HR domain C3 — migration 5a (register item HRB-007, lane core-c3-access).
--
-- 🚨 CAUGHT BY A PROBE, NOT BY READING. The first live run of hr.derive_grants_for_employment
-- was refused by the db-rules §6c guard on iam.permissions:
--   "permissions.resource_type=hr_employment is not a registered sharing TOKEN … a table name here
--    would be stored and then silently ignored by iam.has_access, which is the bug this guard kills."
-- The guard is right and it is exactly the right guard. `platform.shareable_resource_registry` is
-- what makes a token grantable, and two of the tokens SPEC-ACCESS §2.1 writes grants on were not
-- in it:
--   · `hr_employment` — because it was a COMPONENT when file 14 of the schema build seeded the
--     registry, and file 2 of THIS lane made it the entity access root §2.1/§3.1 always said it
--     was. Three of §2.1's four roots (hr_employee, hr_requisition, hr_candidate) were already
--     registered; this is the fourth.
--   · `hr_interview` — THE INTERVIEWER WALL (§2.1). It is a component token granted DIRECTLY, on
--     purpose: direct lanes apply to every registered row INCLUDING components, so an interviewer
--     can be given their own panels and the structured kit without a grant on the candidate — and
--     therefore has no path to the EEO, accommodation, reference or background-result rows hanging
--     off it. That wall does not exist unless the token is grantable.
--
-- `is_link_shareable => false` on both, deliberately: these tokens receive DERIVED grants, never a
-- public share link. Nothing in the HR domain is link-shareable except the two public tokens the
-- schema build already capped at (`hr_posting`, `hr_careers_portal`).
--
-- Authority: SPEC-ACCESS §2.1; db-rules §6c. Applied live as `hr_c3_05a_shareable_roots`.
-- Idempotent.

set local statement_timeout = '120s';
set local lock_timeout = '20s';

insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, display_label,
   url_path_template, rls_uses_has_permission, is_link_shareable, is_active, notes)
select v.tok, 'hr', v.tbl, 'id', 'created_by', v.label, v.path, true, false, true, v.note
from (values
 ('hr_employment','employment','Employment spell','/hr/people/{id}/employment',
  'SPEC-ACCESS §2.1 root 2: THE working-record access root. Derived viewer grants go to holders of working_record.read over the population and to managers within hr.access.manager_visibility_depth; the SUBJECT needs no grant because created_by is their login and the kernel''s owner arm answers first.'),
 ('hr_interview','interview','Interview','/hr/hiring/interviews/{id}',
  'SPEC-ACCESS §2.1 THE INTERVIEWER WALL: a component token granted DIRECTLY so an interviewer reaches their own panels and the structured kit without any grant on hr_candidate, and therefore no path to the EEO, accommodation, reference or background-result rows hanging off it.')
) as v(tok,tbl,label,path,note)
where not exists (select 1 from platform.shareable_resource_registry s where s.resource_type = v.tok);

update platform.shareable_resource_registry
   set is_active = true, rls_uses_has_permission = true, is_link_shareable = false
 where resource_type in ('hr_employment','hr_interview')
   and (not is_active or not rls_uses_has_permission or is_link_shareable);

-- ============================================================ assertions
do $$
declare v_missing text;
begin
  -- every token this lane writes a grant on must be registered, or the §6c guard refuses the write
  select string_agg(t, ', ') into v_missing from unnest(
    ARRAY['hr_employee','hr_employment','hr_requisition','hr_candidate','hr_interview']) as t
   where not exists (select 1 from platform.shareable_resource_registry s
                      where s.resource_type = t and s.is_active);
  if v_missing is not null then
    raise exception 'hr_c3_05a: SPEC-ACCESS §2.1 grant targets are not registered as shareable: %', v_missing;
  end if;

  -- and none of them may become link-shareable: a personnel record is never a public link
  if exists (select 1 from platform.shareable_resource_registry
              where resource_type in ('hr_employee','hr_employment','hr_requisition',
                                      'hr_candidate','hr_interview')
                and is_link_shareable) then
    raise exception 'hr_c3_05a: an HR grant root is link-shareable; only hr_posting and hr_careers_portal may ever be public';
  end if;
end $$;
