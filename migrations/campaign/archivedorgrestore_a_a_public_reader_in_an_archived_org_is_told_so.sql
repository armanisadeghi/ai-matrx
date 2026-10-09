-- additive: yes
-- lane: ARCHIVED-ORG-RESTORE
-- lock: custom
-- based-on: custom.assert_public_reader_names_a_public_table(uuid, uuid, text) b9373a927470aca78b07d8a76c4a51e697cb14be05f48cf4932685f5ad3e2cad
--
-- LANE ARCHIVED-ORG-RESTORE 2. custom.assert_public_reader_names_a_public_table still called the one-argument
-- custom._not_a_member_refusal(door), so a MEMBER of an ARCHIVED organization reaching a table of it through the
-- world lane met "You are not a member of that organization" - the old wording honestrefusals_a replaced everywhere
-- else. It now passes the organization (p_organization_id) to the two-argument form, which answers a member of an
-- archived organization "This organization is archived ... until an owner restores it" (SQLSTATE 42501, DETAIL
-- organization_archived:<org id>) and a non-member today's sentence, unchanged. Who may reach what does NOT change:
-- only the words of a refusal that was already given. Body otherwise byte for byte.
-- Inverse: migrations/inverse/archivedorgrestore_a_a_public_reader_in_an_archived_org_is_told_so_down.sql.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.assert_public_reader_names_a_public_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Only a seat the wall admitted to this organization through the world lane ALONE, in this statement.
  if platform.memo_k_get('w:pub:' || coalesce(p_organization_id::text, '-')) is distinct from '1'
     or platform.memo_k_get('w:r:' || coalesce(p_organization_id::text, '-')) = '1' then
    return;
  end if;
  -- CHAIR-WORLD-LANE-2: the read door has already, in this statement, named only definition rows of a Public Table
  -- held in THIS Table (custom.world_reader_reads_public_definition: a kernel or options Table) — the doors it calls
  -- on its way may know this one Table for this one statement, and nothing more.
  if p_table_id is not null
     and platform.memo_k_get('w:pubd:' || p_organization_id::text || ':' || p_table_id::text) = '1' then
    return;
  end if;
  if p_table_id is not null
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null
                    and t.published_to_web) then
    -- The read door has named a Public Table: the doors it calls on its way pass the wall (see there).
    perform platform.memo_k_put('w:pubt:' || p_organization_id::text, '1');
    return;
  end if;
  -- Any other Table of the organization — or none named — answers exactly what the wall said before, and a member
  -- of an ARCHIVED organization is told it is archived (ARCHIVED-ORG-RESTORE: the organization is passed).
  perform custom._not_a_member_refusal(p_door, p_organization_id);
end
$function$;
