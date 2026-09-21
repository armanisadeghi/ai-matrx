-- chair-step: it restores the PREVIOUS body of custom.portal_principal_bind, byte for byte as
--   pg_get_functiondef printed it before guardstamps_portal_bind_decides_who_the_outsider_is.sql
--   replaced it. Running this re-opens the arm that let a signed-in stranger claim somebody
--   else's unopened portal invitation, so run it only to undo that file.
--
-- based-on: custom.portal_principal_bind(uuid, uuid, uuid) 056157493d89f200ad7663a165589bf56b057e11b7a2ff8417e61167e8ef5281
--
CREATE OR REPLACE FUNCTION custom.portal_principal_bind(p_organization_id uuid, p_principal_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pp custom.portal_principal;
  v_p  custom.portal;
  v_lv public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.portal_principal_bind');
  if p_user_id is null then
    raise exception 'Binding a portal principal needs the identity the platform''s auth gave them.'
      using errcode = '22004';
  end if;

  select * into v_pp from custom.portal_principal
   where id = p_principal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal principal in this organization.' using errcode = '02000';
  end if;
  select * into v_p from custom.portal where id = v_pp.portal_id;

  -- WHO MAY BIND. The organization admin who invited them, or the server lane that has
  -- just watched the platform's auth create the identity for that exact address. A
  -- signed-in person cannot bind an identity that is not their own invitation.
  if not custom.query_is_store_owner() then
    if custom.query_principal() = p_user_id then
      null;  -- the outsider arriving on their own link
    else
      perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
                'custom.portal_principal_bind', 'admin'::public.permission_level, 'table');
    end if;
  end if;

  if not v_pp.is_active or not v_p.is_active then
    raise exception 'That invitation has been withdrawn, so it cannot be used to sign in.'
      using errcode = '42501';
  end if;

  update custom.portal_principal
     set user_id = p_user_id, bound_at = coalesce(bound_at, now())
   where id = v_pp.id;

  -- THE ONE GRANT, THROUGH THE ONE SHARE DOOR. This is the only access a portal ever
  -- writes: the outsider holds their own client record, and the association the portal
  -- declared carries every record that names it. Nothing here touches a Job or an
  -- Invoice, and nothing has to be re-run when one is written.
  select max(pt.conveys_max) into v_lv from custom.portal_table pt where pt.portal_id = v_p.id;
  perform custom.share_grant(p_organization_id, v_pp.client_record_id, 'person', p_user_id,
                             coalesce(v_lv, 'viewer'::public.permission_level));

  return jsonb_build_object(
    'bound', true,
    'principal_id', v_pp.id,
    'user_id', p_user_id,
    'client_record_id', v_pp.client_record_id,
    'level', coalesce(v_lv, 'viewer'::public.permission_level)::text,
    'say', format('%s now holds their own client record at %s, and every record that names it reaches them through it.',
                  v_pp.email, coalesce(v_lv, 'viewer'::public.permission_level)::text));
end $function$
;
