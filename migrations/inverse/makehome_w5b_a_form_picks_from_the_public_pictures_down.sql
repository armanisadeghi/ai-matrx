-- chair-step: undoes makehome_w5b_a_form_picks_from_the_public_pictures.sql — restores custom.portal_card's
--   inline `logo_candidates` query, removes the client_callable_door row and drops the two functions it added.
-- lane: MAKE-HOME
-- based-on: custom.portal_card(uuid, uuid) 550856113c6cb4de5474bcf47b63d452ad80f135ac81508aa74ab856a413a65b
CREATE OR REPLACE FUNCTION custom.portal_card(p_organization_id uuid, p_portal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_p custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_card');
  select * into v_p from custom.portal where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;
  perform custom.assert_client_may_open(p_organization_id, v_p.client_table_id,
            'custom.portal_card', 'admin'::public.permission_level, 'table');

  return jsonb_build_object(
    'portal_id', v_p.id,
    'title', v_p.title,
    'slug', v_p.slug,
    'is_active', v_p.is_active,
    'sign_in_method', v_p.sign_in_method,
    'client_table_id', v_p.client_table_id,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
               'table_id', pt.table_id,
               'name', coalesce(nullif(t.data ->> 'name', ''), 'a table'),
               'names_via', pt.edge_role,
               'visible_fields', pt.visible_field_keys,
               'editable_fields', pt.editable_field_keys,
               'comments', pt.comments_allowed,
               'conveys', pt.conveys_max::text) order by pt.ord)
        from custom.portal_table pt
        left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
       where pt.portal_id = v_p.id), '[]'::jsonb),
    'principals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'principal_id', pp.id,
               'email', pp.email,
               'client_record_id', pp.client_record_id,
               'client', coalesce(custom.portal_record_title(pp.organization_id, pp.client_record_id), pp.client_record_id::text),
               'signed_in', pp.user_id is not null,
               'is_active', pp.is_active,
               'invited_at', pp.invited_at,
               'revoked_at', pp.revoked_at,
               -- TAILS-5 (B): THE LINK THE OFFICE COPIES, per person. Built the one way it is
               -- built anywhere, from the invitation custom.portal_invite minted. Null when
               -- there is no live link — the screen says which, and never draws a dead control.
               'accept_path', (
                 select '/invitations/portal/accept/' || i.token
                   from iam.invitations i
                  where i.target_type = 'portal_principal'
                    and i.target_id = pp.id
                    and i.organization_id = pp.organization_id
                    and i.status = 'pending'
                    and i.deleted_at is null
                    and (i.expires_at is null or i.expires_at > now())
                  order by i.created_at desc
                  limit 1)) order by pp.invited_at)
        from custom.portal_principal pp
       where pp.portal_id = v_p.id), '[]'::jsonb),
    'external_lane_open', coalesce(
      (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false),
    -- S6: the look as the owner set it, as a client sees it, and every form with its state.
    'config', coalesce(v_p.config, '{}'::jsonb),
    'style', custom._portal_style(p_organization_id, v_p.config),
    'forms', custom._portal_forms(p_organization_id, v_p.config, false),
    'accents', to_jsonb(custom.portal_accents()),
    -- S6: THE PICTURES THAT COULD BE THIS PORTAL'S LOGO — the organization's own PUBLIC pictures
    -- in Files, newest first, each with the address a client would load. A private file is not
    -- offered at all, because the store would refuse it (a logo is shown before anybody signs in).
    'logo_candidates', coalesce((
      select jsonb_agg(jsonb_build_object('file_id', c.id, 'name', c.file_name, 'url', c.url)
                       order by c.created_at desc)
        from (select f.id, f.file_name, f.created_at,
                     custom._portal_picture_url(p_organization_id, f.id, true) as url
                from files.files f
               where f.organization_id = p_organization_id
                 and f.deleted_at is null
                 and f.visibility = 'public'
                 and coalesce(f.mime_type, '') like 'image/%'
                 and f.storage_uri like 's3://cdn.matrxserver.com/%'
               order by f.created_at desc
               limit 50) c), '[]'::jsonb));
end $function$
;

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'form_look_options';
drop function if exists custom.form_look_options(uuid, jsonb);
drop function if exists custom._public_pictures(uuid);
