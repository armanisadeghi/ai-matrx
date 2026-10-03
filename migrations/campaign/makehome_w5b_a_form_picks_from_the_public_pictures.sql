-- target: clone,production
-- additive: yes
--   It ADDS two functions and one platform.client_callable_door row, and REPLACES one body:
--     · custom._public_pictures(uuid)                internal, EXECUTE to postgres only: the
--                                                     organization's PUBLIC pictures in Files, newest
--                                                     first, each with the address a stranger loads
--     · custom.form_look_options(uuid, jsonb)         the door: the pictures a form's look may use,
--                                                     the colours, and the look a stranger would see
--                                                     for the draft presentation it is handed
--     · custom.portal_card(uuid, uuid)                body: `logo_candidates` now reads
--                                                     custom._public_pictures — the same list, one place
--   No table, column, trigger, policy or grant is touched; nothing is dropped or revoked.
--   The grant is its own chair-step file, `makehome_w5b_the_form_look_door_can_be_reached.sql`.
--   The inverse is `migrations/inverse/makehome_w5b_a_form_picks_from_the_public_pictures_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
-- lane: MAKE-HOME
-- based-on: custom.portal_card(uuid, uuid) 6d6174146629aea49ff6165a3cdcb744e17fa063e96ccc5532440dbe04033aea
--
-- LANE 2 MAKE-HOME, WAVE 5b — A FORM'S LOGO AND COVER ARE PICKED FROM THE PICTURES A STRANGER CAN SEE.
--
-- THE DEFECT (verifier walk 2026-10-02, Cedar Ridge Physical Therapy): the form builder's logo and
-- cover opened the general file picker, so an owner could pick any of her files; custom.form_declare
-- then refused the save ("That picture is not one of this organization's public pictures"). The
-- portal look editor never had this defect because custom.portal_card hands it the list of pictures
-- the store would accept (`logo_candidates`). A form has no portal card, so it had no list.
--
-- THE FIX: the list moves into ONE internal function (custom._public_pictures) that portal_card and
-- the new door both read, so the portal and the form can never offer two different lists. The door
-- also answers the look a stranger would see for the builder's DRAFT presentation
-- (custom._form_look — the same resolution custom.form_public hands the public page), so the
-- builder's preview draws the organization's logo and cover exactly as /f/<id> does.

create function custom._public_pictures(p_organization_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- THE PICTURES THAT COULD BE A PORTAL'S LOGO OR A FORM'S LOGO AND COVER: the organization's own
  -- PUBLIC pictures in Files, newest first, each with the address a stranger would load. A private
  -- file is not offered, because the store refuses it (custom._portal_picture_url is the judge).
  select coalesce((
    select jsonb_agg(jsonb_build_object('file_id', c.id, 'name', c.file_name, 'url', c.url)
                     order by c.created_at desc)
      from (select f.id, f.file_name, f.created_at,
                   custom._portal_picture_url(p_organization_id, f.id, true) as url
              from files.files f
             where f.organization_id = p_organization_id
               and f.deleted_at is null
               and coalesce(f.mime_type, '') like 'image/%'
               and f.storage_uri like 's3://cdn.matrxserver.com/%'
               -- PUBLIC IS ASKED OF THE ONE JUDGE, never re-read here: custom._portal_picture_url
               -- answers an address only for a public picture (and T-13 forbids a new reader of
               -- the retiring row column).
               and custom._portal_picture_url(p_organization_id, f.id, true) is not null
             order by f.created_at desc
             limit 50) c), '[]'::jsonb);
$function$;


create function custom.form_look_options(p_organization_id uuid, p_presentation jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
begin
  if p_organization_id is null then
    raise exception 'Say which organization the form belongs to.' using errcode = '22004';
  end if;
  perform custom.assert_store_door(p_organization_id, 'custom.form_look_options');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.form_look_options');

  return jsonb_build_object(
    -- What the look editor may offer: the pictures the store accepts and its colours.
    'pictures', custom._public_pictures(p_organization_id),
    'accents', to_jsonb(custom.portal_accents()),
    -- What a stranger would see for this draft: the one look resolution custom.form_public uses.
    'look', custom._form_look(p_organization_id, coalesce(p_presentation, '{}'::jsonb)));
end $function$;


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
    'logo_candidates', custom._public_pictures(p_organization_id));
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'form_look_options',
   'p_organization_id uuid, p_presentation jsonb',
   array['uuid'::regtype::oid, 'jsonb'::regtype::oid],
   'Takes an organization and a form''s draft presentation. Refuses unless custom.assert_store_door and custom.assert_client_may_reach admit the caller to that organization; then answers that organization''s public pictures (the same list custom.portal_card offers as logo_candidates), the look colours, and the look custom._form_look resolves for the draft. It writes nothing.',
   'makehome_w5b_a_form_picks_from_the_public_pictures.sql', null, true, false,
   '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "check": "this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "entity": "organization", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "position": 1, "optional": false, "null_rule": {"sqlstate": "22004"}, "verified": "2026-10-02 lane MAKE-HOME — read from this body"}, "p_presentation": {"type": "jsonb", "check": "the caller''s own draft presentation; only its look is read, and every picture in it is resolved by custom._portal_picture_url against arg1''s own public files.", "position": 2, "not_an_id": true}}, "declared_at": "2026-10-02 lane MAKE-HOME", "declared_by": "makehome_w5b_a_form_picks_from_the_public_pictures.sql"}'::jsonb)
on conflict do nothing;
