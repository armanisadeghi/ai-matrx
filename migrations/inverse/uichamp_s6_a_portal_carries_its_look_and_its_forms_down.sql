-- chair-step: the inverse of uichamp_s6_a_portal_carries_its_look_and_its_forms.sql. It DROPS the
--   eight-argument `custom.portal_declare` and CREATES the seven-argument one again byte for byte as
--   the main database held it before (2026-09-23), re-points its `platform.client_callable_door`
--   row at the old identity (reason and argument rules as they were), puts `custom.portal_card`,
--   `custom.portal_me` and `custom.portal_public` back as they were, deletes the two new door rows
--   and drops the two new doors and six helpers. WHAT IT UNDOES: a portal's look and forms are no
--   longer read or written by anything — the sign-in page and the portal show the organization's
--   name alone again, the builder's look and forms are refused ("function … does not exist" for
--   p_config), and a client can no longer open or send a portal form. WHAT IT DOES NOT UNDO: the
--   column `custom.portal.config` STAYS, with every organization's settings in it — it is their own
--   data, nothing reads it after this file, and the up file adds it only `if not exists`. Records a
--   client already sent through a portal form stay: each was an ordinary write through
--   custom.record_write with its own history row and `_source.via = portal`. The grant file's
--   inverse runs FIRST.
-- lane: S6
-- lock: custom,platform
-- based-on: custom.portal_card(uuid, uuid) 6d6174146629aea49ff6165a3cdcb744e17fa063e96ccc5532440dbe04033aea
-- based-on: custom.portal_me() d23760fcd768faa9da61d1bcaecdba38b956623a513f989b771f87e49e61eff4
-- based-on: custom.portal_public(text) aadafba9e8a17bfc62ecc82d71a0b2755eaa68d65ea072c7f4bbd1f05a576e26
-- based-on: custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text, jsonb) 11e7ff34b5675631d61ff340d8cc778e284d554bcfef5abe453fd68110f8500e
-- based-on: custom.portal_form(uuid, uuid, uuid) 42fd00f01ab9e9460e22ffe888f6e7f777d1b08b2af30e61e4933bb5b4caae3e
-- based-on: custom.portal_form_submit(uuid, uuid, uuid, jsonb, text) c4df1625598f3e0d2073a9e457504264c2e44473e18bea3f33adfea6d44231c1

set local lock_timeout = '2s';
set local statement_timeout = '120s';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('portal_form', 'portal_form_submit')
   and declared_by = 'uichamp_s6_a_portal_carries_its_look_and_its_forms.sql';

drop function custom.portal_form_submit(uuid, uuid, uuid, jsonb, text);
drop function custom.portal_form(uuid, uuid, uuid);
drop function custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text, jsonb);

-- CREATE, not CREATE OR REPLACE: the eight-argument door is dropped just above and the
-- seven-argument one does not exist while S6 is applied, so this is a birth, not a replace.
CREATE FUNCTION custom.portal_declare(p_organization_id uuid, p_title text, p_client_table_id uuid, p_tables jsonb, p_portal_id uuid DEFAULT NULL::uuid, p_slug text DEFAULT NULL::text, p_sign_in_method text DEFAULT 'magic_link'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id       uuid;
  v_slug     text;
  v_spec     jsonb;
  v_table    uuid;
  v_names    text;
  v_field    record;
  v_vis_ids  uuid[];
  v_edit_ids uuid[];
  v_vis_keys jsonb;
  v_ed_keys  jsonb;
  v_key      text;
  v_conveys  public.permission_level;
  v_comments boolean;
  v_ord      integer := 0;
  v_n        integer := 0;
  v_knob     jsonb;
  v_note     text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_declare');

  if p_organization_id is null or coalesce(btrim(p_title), '') = '' or p_client_table_id is null then
    raise exception 'A portal needs the organization it belongs to, a title, and the Table whose records are the clients.'
      using errcode = '22004';
  end if;
  if coalesce(p_sign_in_method, '') <> 'magic_link' then
    raise exception 'The only way into a portal today is a magic link by email, and "%" is not that.', p_sign_in_method
      using errcode = '22023',
            hint = 'The portal never holds a password: it asks the platform''s own auth to email a one-time link. A second sign-in method is a real feature, not a value this door will take.';
  end if;
  if jsonb_typeof(p_tables) is distinct from 'array' or jsonb_array_length(p_tables) = 0 then
    raise exception 'A portal that exposes no Table would show its clients an empty page, so this door does not make one.'
      using errcode = '22004',
            hint = 'Send tables as [{"table_id": …, "names_via": "<the field key that names the client>", "visible_fields": [...], "editable_fields": [...], "comments": false}].';
  end if;

  -- THE ONE LADDER, at the rung whose definition is "may decide who else sees it". A
  -- portal hands records of these Tables to people outside the organization, so the rung
  -- is `admin` on the CLIENT Table and on every Table exposed - the same question
  -- `custom.share_grant` asks before it shares one record.
  perform custom.assert_client_may_change(p_organization_id, p_client_table_id,
            'custom.portal_declare', 'admin'::public.permission_level, 'table');

  if p_portal_id is not null then
    select p.id into v_id from custom.portal p
     where p.id = p_portal_id and p.organization_id = p_organization_id;
    if v_id is null then
      raise exception 'There is no such portal in this organization.' using errcode = '02000';
    end if;
  end if;

  v_slug := coalesce(nullif(btrim(lower(coalesce(p_slug, ''))), ''),
                     custom.portal_slug(p_organization_id, p_title, p_portal_id));

  if v_id is null then
    insert into custom.portal (organization_id, title, slug, client_table_id, sign_in_method,
                               opened_at, created_by)
    values (p_organization_id, btrim(p_title), v_slug, p_client_table_id, 'magic_link',
            now(), custom.query_principal())
    returning id into v_id;
  else
    update custom.portal
       set title = btrim(p_title), slug = v_slug, client_table_id = p_client_table_id,
           is_active = true, closed_at = null
     where id = v_id;
    -- RE-STATING a portal replaces what it exposes, so a Table dropped from the
    -- declaration stops being exposed in the same act. The principals are untouched:
    -- who is invited is not part of what the portal shows.
    delete from custom.portal_table where portal_id = v_id;
  end if;

  for v_spec in select value from jsonb_array_elements(p_tables) loop
    v_ord := v_ord + 1;
    v_table := nullif(v_spec ->> 'table_id', '')::uuid;
    v_names := nullif(btrim(coalesce(v_spec ->> 'names_via', '')), '');
    if v_table is null or v_names is null then
      raise exception 'Every Table a portal exposes has to say which Field on it names the client.'
        using errcode = '22004',
              hint = 'Each entry needs table_id and names_via. names_via is the key of the relation Field that points at the client Table - it is what makes "only theirs" answerable.';
    end if;
    perform custom.assert_client_may_change(p_organization_id, v_table,
              'custom.portal_declare', 'admin'::public.permission_level, 'table');

    select fm.field_id, fm.field_key, fm.field_type, fm.points_at
      into v_field
      from custom.portal_field_map(p_organization_id, v_table) fm
     where fm.field_key = v_names;
    if v_field.field_id is null then
      raise exception 'That Table has no field called "%", so a portal over it cannot say who a record belongs to.', v_names
        using errcode = '42703',
              hint = format('Its fields are %s.',
                            coalesce((select string_agg(fm.field_key, ', ' order by fm.field_key)
                                        from custom.portal_field_map(p_organization_id, v_table) fm), '(none)'));
    end if;
    if v_field.field_type is distinct from 'relation' then
      raise exception 'The field "%" is a % field, and a portal needs a relation - the "belongs to" link that points at the client.', v_names, v_field.field_type
        using errcode = '22023',
              hint = 'REL-10: a relation Field''s key IS the role of the association the store writes, and that association is what carries the record to the client. A text field holding a name carries nothing, so it could never answer "only theirs" without a second query - which is the thing this design exists to avoid.';
    end if;
    if v_field.points_at is distinct from p_client_table_id then
      raise exception 'The field "%" points at a different Table from the one whose records are the clients, so it does not say who this record belongs to.', v_names
        using errcode = '22023',
              hint = 'Point names_via at the relation Field that links this Table to the client Table, or make the client Table the one that Field already points at.';
    end if;

    -- THE FIELDS. Nothing given means every field of that Table is visible and none is
    -- editable - the honest default for a portal, and the one a person describing
    -- "let them see their jobs" means.
    select coalesce(array_agg(fm.field_id order by fm.field_key), '{}'),
           coalesce(jsonb_agg(fm.field_key order by fm.field_key), '[]')
      into v_vis_ids, v_vis_keys
      from custom.portal_field_map(p_organization_id, v_table) fm
     where jsonb_typeof(v_spec -> 'visible_fields') is distinct from 'array'
        or jsonb_array_length(coalesce(v_spec -> 'visible_fields', '[]')) = 0
        or fm.field_key in (select jsonb_array_elements_text(v_spec -> 'visible_fields'));

    v_edit_ids := '{}'; v_ed_keys := '[]';
    if jsonb_typeof(v_spec -> 'editable_fields') = 'array' then
      for v_key in select jsonb_array_elements_text(v_spec -> 'editable_fields') loop
        if not exists (select 1 from custom.portal_field_map(p_organization_id, v_table) fm
                        where fm.field_key = v_key) then
          raise exception 'That Table has no field called "%", so a portal cannot let a client edit it.', v_key
            using errcode = '42703';
        end if;
        if not (v_key = any (select jsonb_array_elements_text(v_vis_keys))) then
          raise exception 'The field "%" is editable in this portal but not visible in it, which is a screen that cannot exist.', v_key
            using errcode = '22023',
                  hint = 'Add it to visible_fields as well, or take it out of editable_fields. Nothing was written.';
        end if;
        select fm.field_id into v_field from custom.portal_field_map(p_organization_id, v_table) fm where fm.field_key = v_key;
        v_edit_ids := v_edit_ids || v_field.field_id;
        v_ed_keys := v_ed_keys || to_jsonb(v_key);
      end loop;
    end if;

    v_comments := coalesce((v_spec ->> 'comments')::boolean, false);
    v_conveys := case
                   when coalesce(array_length(v_edit_ids, 1), 0) > 0 then 'editor'::public.permission_level
                   when v_comments then 'commenter'::public.permission_level
                   else 'viewer'::public.permission_level
                 end;

    select fm.field_id into v_field
      from custom.portal_field_map(p_organization_id, v_table) fm where fm.field_key = v_names;

    insert into custom.portal_table (portal_id, organization_id, table_id, names_via_field_id,
                                     edge_role, visible_field_ids, visible_field_keys,
                                     editable_field_ids, editable_field_keys, comments_allowed,
                                     conveys_max, ord)
    values (v_id, p_organization_id, v_table, v_field.field_id, v_names,
            v_vis_ids, v_vis_keys, v_edit_ids, v_ed_keys, v_comments, v_conveys, v_ord);
    v_n := v_n + 1;
  end loop;

  -- THE ORGANIZATION OPENS ITS OWN EXTERNAL LANE, AND THAT ACT IS THIS ONE.
  -- W2-TRUST's ruling stands: the world-lane admission CHECKS are not switchable, and the
  -- knob holds the LANE closed, not a check. Declaring a portal IS the explicit act VIS-N-5
  -- asks for - an organization admin saying, on the record, that outsiders may sign in
  -- here. It is written as an organization override so the platform default stays false
  -- and every other organization is untouched.
  v_note := format('Opened by custom.portal_declare for the portal "%s".', btrim(p_title));
  if custom.query_principal() is null and custom.query_is_store_owner() then
    -- The server lane. Already judged at `admin` on the client Table, which is a higher bar
    -- than the knob door's own gate; this is the door's own writer, not a second path.
    v_knob := platform._knob_override_write(
      'custom', 'external_principal_enabled', 'organization', p_organization_id,
      p_organization_id, 'true'::jsonb, v_note, null);
  else
    v_knob := platform.knob_override_set(
      'custom', 'external_principal_enabled', 'organization', p_organization_id,
      p_organization_id, 'true'::jsonb, v_note);
  end if;
  if not coalesce((v_knob ->> 'ok')::boolean, false) then
    raise exception 'The portal was not made: this organization''s outside door could not be opened (%).',
      coalesce(v_knob ->> 'reason', 'no reason given')
      using errcode = '42501',
            hint = coalesce(nullif(v_knob ->> 'detail', ''),
                            'custom/external_principal_enabled is what lets somebody with no membership sign in here, and declaring a portal is the act that opens it. Whoever declares a portal has to be an owner or an admin of the organization.');
  end if;

  return v_id;
end $function$
;


update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments('custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text)'::regprocedure),
       identity_argtypes = platform.door_argtypes(p.proargtypes),
       reason = regexp_replace(d.reason, ' S6: p_config .*$', ''),
       argument_rules = case when d.argument_rules is null then null
                             else d.argument_rules #- '{arguments,p_config}' end
  from pg_catalog.pg_proc p
 where p.oid = 'custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text)'::regprocedure
   and d.schema_name = 'custom' and d.function_name = 'portal_declare';

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
      (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false));
end $function$
;

CREATE OR REPLACE FUNCTION custom.portal_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  -- The outsider's own standing, and NOTHING about anybody else's. It answers what the
  -- portal DECLARED - which Tables, which fields - and not one record: the records come
  -- back through `custom.read_records` like everybody else's, so there is one read path
  -- on this platform and a portal is not a second one.
  if v_me is null then
    return jsonb_build_object('signed_in', false, 'portals', '[]'::jsonb,
      'explanation', 'Nobody is signed in, so there is no portal to show.');
  end if;
  return jsonb_build_object(
    'signed_in', true,
    'user_id', v_me,
    'external', iam.is_external_principal(v_me),
    'portals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'portal_id', p.id,
               'title', p.title,
               'slug', p.slug,
               'organization_id', p.organization_id,
               'organization', o.name,
               'principal_id', pp.id,
               'client_record_id', pp.client_record_id,
               'client', coalesce(custom.portal_record_title(p.organization_id, pp.client_record_id), 'your records'),
               'tables', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'table_id', pt.table_id,
                          'name', coalesce(nullif(t.data ->> 'name', ''), 'Records'),
                          'visible_fields', pt.visible_field_keys,
                          'editable_fields', pt.editable_field_keys,
                          'comments', pt.comments_allowed) order by pt.ord)
                   from custom.portal_table pt
                   left join custom.record t on t.organization_id = pt.organization_id and t.id = pt.table_id
                  where pt.portal_id = p.id), '[]'::jsonb))
             order by p.title)
        from custom.portal_principal pp
        join custom.portal p on p.id = pp.portal_id and p.is_active
        join iam.organizations o on o.id = p.organization_id
       where pp.user_id = v_me and pp.is_active
         and coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p.organization_id) #>> '{}')::boolean, false)),
      '[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION custom.portal_public(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_p custom.portal;
  v_o text;
begin
  -- THE SIGN-IN PAGE, AND NOTHING ELSE. A slug that does not exist, one that is closed, one
  -- that is ARCHIVED, and one whose organization has not opened the external lane all answer
  -- the same NULL, which is the 404: the address cannot be used to learn that anything is
  -- there.
  select * into v_p from custom.portal
   where slug = lower(btrim(coalesce(p_slug, ''))) and is_active and archived_at is null;
  if not found then return null; end if;
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_p.organization_id) #>> '{}')::boolean, false) then
    return null;
  end if;
  select o.name into v_o from iam.organizations o where o.id = v_p.organization_id;

  if not custom.store_is_open(v_p.organization_id) then
    return jsonb_build_object(
      'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
      'sign_in_method', v_p.sign_in_method, 'state', 'unavailable',
      'message', custom.store_off_sentence(v_p.organization_id));
  end if;

  return jsonb_build_object(
    'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
    'sign_in_method', v_p.sign_in_method, 'state', 'open');
end $function$
;


drop function custom._portal_principal_here(uuid, uuid, text);
drop function custom._portal_config_judge(uuid, uuid[], jsonb, jsonb);
drop function custom._portal_stage(uuid, uuid, jsonb);
drop function custom._portal_forms(uuid, jsonb, boolean);
drop function custom._portal_style(uuid, jsonb);
drop function custom._portal_picture_url(uuid, uuid, boolean);
drop function custom.portal_accents();

-- The re-created seven-argument door is revoked at birth by the ddl guard; its door row still
-- declares the signed-in lane, so the sweep puts the builder's grant back.
select custom.reopen_declared_doors();
