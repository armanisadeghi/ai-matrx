-- chair-step: this puts `custom.portal_declare` back to the body that called `platform.knob_override_set` with `perform` and threw the answer away. After it a portal can be created with its organization's outside door still SHUT and nobody told — the first symptom is `custom.share_grant` refusing the invitation minutes later, citing a knob nobody knew had not been written. It also loses the server lane's path through `platform._knob_override_write`, so an agent turn or a migration declaring a portal leaves the lane closed every time. It is here because a file that names an inverse must have one.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)

create or replace function custom.portal_declare(
  p_organization_id uuid,
  p_title           text,
  p_client_table_id uuid,
  p_tables          jsonb,
  p_portal_id       uuid default null,
  p_slug            text default null,
  p_sign_in_method  text default 'magic_link')
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
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
  perform platform.knob_override_set(
    'custom', 'external_principal_enabled', 'organization', p_organization_id, p_organization_id,
    'true'::jsonb,
    format('Opened by custom.portal_declare for the portal "%s".', btrim(p_title)));

  return v_id;
end $function$;
