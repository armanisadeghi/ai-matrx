create or replace function private_vault.organization_secret_delete(
  p_actor_id uuid,
  p_secret_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret private_vault.organization_secrets%rowtype;
begin
  select * into v_secret
  from private_vault.organization_secrets
  where id = p_secret_id and deleted_at is null
  for update;
  if not found then
    raise exception 'organization secret not found' using errcode = 'P0002';
  end if;
  perform private_vault.assert_org_admin(p_actor_id, v_secret.organization_id);

  delete from private_vault.organization_secret_grants
  where organization_secret_id = p_secret_id;

  update private_vault.organization_secrets
  set deleted_at = now(), is_active = false, vault_secret_id = null,
      updated_by = p_actor_id, updated_at = now()
  where id = p_secret_id;
  delete from vault.secrets where id = v_secret.vault_secret_id;

  insert into private_vault.organization_secret_audit (
    organization_id, organization_secret_id, actor_id, action, metadata
  ) values (
    v_secret.organization_id, p_secret_id, p_actor_id, 'deleted',
    jsonb_build_object('key', v_secret.key)
  );
end;
$$;

-- Remove grant metadata left by soft-deleted rows created before this fix.
delete from private_vault.organization_secret_grants g
using private_vault.organization_secrets s
where g.organization_secret_id = s.id
  and s.deleted_at is not null;
