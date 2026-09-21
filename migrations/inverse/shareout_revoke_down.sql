-- chair-step: SHARE-OUT's revoke inverse — it puts back a body that sets iam.permissions.status to 'revoked', a word that column's CHECK constraint does not hold, so every attempt to take an outside person's table access away raises instead of working
--
-- Restores the hand-written UPDATE that stood before
-- `migrations/campaign/shareout_revoking_uses_the_one_revoke.sql`. It is a SECOND revoke
-- beside `custom.share_revoke`, and it is the broken one; this inverse exists for
-- completeness, not because anybody should run it.

create or replace function custom.table_share_outside_revoke(p_organization_id uuid, p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_inv     iam.invitations;
  v_removed integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_revoke');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_revoke');

  select * into v_inv from iam.invitations
   where id = p_invitation_id and organization_id = p_organization_id
     and target_type = 'custom_table' and deleted_at is null;
  if not found then
    raise exception 'There is no such invitation to a table in this organization.'
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_inv.target_id,
            'custom.table_share_outside_revoke', 'admin'::public.permission_level, 'table');

  -- 🚨 THE GRANT GOES FIRST AND IT GOES COMPLETELY. Because the grant IS the admission
  -- (see `custom.portal_admits`), this single statement ends their access to the table,
  -- to every record in it, and to the organization's doors — there is no second row to
  -- forget. Anything they still had open refuses on its next call.
  if v_inv.invited_user_id is not null then
    update iam.permissions
       set status = 'revoked'
     where resource_type = 'record'
       and resource_id = v_inv.target_id
       and granted_to_user_id = v_inv.invited_user_id
       and status = 'active';
    get diagnostics v_removed = row_count;
  end if;

  update iam.invitations
     set status = 'revoked', deleted_at = now(),
         updated_by = custom.query_principal(), updated_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'revoked', true, 'invitation_id', v_inv.id, 'email', v_inv.email,
    'grants_removed', v_removed,
    'say', case when v_removed > 0
                then format('%s can no longer open this table. Their access ended immediately — anything they had open refuses the next time it asks.', v_inv.email)
                else format('%s''s invitation is withdrawn. They had not joined, so they never had access to take away.', v_inv.email) end);
end;
$fn$;
