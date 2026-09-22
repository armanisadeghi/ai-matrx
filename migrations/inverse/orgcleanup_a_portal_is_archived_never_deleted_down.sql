-- INVERSE of orgcleanup_a_portal_is_archived_never_deleted.sql (ORG-CLEANUP, 2026-09-22).
--
-- NO TRANSACTION CONTROL IN THIS FILE. The applier owns the transaction — PROGRESS-ORG-ARCHIVE
-- §7 records the night a red twin that `\i`'d an inverse carrying its own `commit;` reverted a
-- lane on the live database for nine minutes.
--
-- It puts back the three functions this file replaced, byte for byte as they were, drops the
-- two new doors and the new reader, deletes their declaration rows (a door row that outlives
-- its function is a promise nobody can verify), and drops the three columns and the index.

drop function if exists custom.portal_archive(uuid, uuid, text, text);
drop function if exists custom.portal_restore(uuid, uuid, text);
drop function if exists custom.list_portals(uuid, text);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('portal_archive', 'portal_restore', 'list_portals')
   and declared_by = 'ORG-CLEANUP / orgcleanup_a_portal_is_archived_never_deleted.sql';

-- custom.portals — back to the body that read custom.portal directly.
create or replace function custom.portals(p_organization_id uuid)
returns table(portal_id uuid, title text, slug text, client_table_id uuid, client_table text,
              is_active boolean, tables integer, invited integer, signed_in integer,
              sign_in_method text, opened_at timestamptz)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portals');
  return query
    select p.id, p.title, p.slug, p.client_table_id,
           coalesce(nullif(t.data ->> 'name', ''), 'a table'),
           p.is_active,
           (select count(*)::integer from custom.portal_table pt where pt.portal_id = p.id),
           (select count(*)::integer from custom.portal_principal pp
             where pp.portal_id = p.id and pp.is_active),
           (select count(*)::integer from custom.portal_principal pp
             where pp.portal_id = p.id and pp.is_active and pp.user_id is not null),
           p.sign_in_method, p.opened_at
      from custom.portal p
      left join custom.record t
        on t.organization_id = p.organization_id and t.id = p.client_table_id
     where p.organization_id = p_organization_id
       and custom.has_visibility(custom.query_principal(), 'record', p.client_table_id, 'viewer'::public.permission_level)
     order by p.is_active desc, p.opened_at desc nulls last;
end $$;

-- custom.portal_public — back to the version that knows nothing about archiving.
create or replace function custom.portal_public(p_slug text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
declare
  v_p custom.portal;
  v_o text;
begin
  select * into v_p from custom.portal where slug = lower(btrim(coalesce(p_slug, ''))) and is_active;
  if not found then return null; end if;
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_p.organization_id) #>> '{}')::boolean, false) then
    return null;
  end if;
  select o.name into v_o from iam.organizations o where o.id = v_p.organization_id;
  return jsonb_build_object(
    'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
    'sign_in_method', v_p.sign_in_method, 'state', 'open');
end $$;

-- custom.portal_invite_accept — back to the version with only the "closed" refusal.
create or replace function custom.portal_invite_accept(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_inv  iam.invitations;
  v_pp   custom.portal_principal;
  v_p    custom.portal;
  v_me   uuid := custom.query_principal();
  v_mail text;
  v_org  text;
  v_bind jsonb;
  v_sees text;
begin
  if v_me is null then
    raise exception 'Sign in first, and then this invitation opens the portal it was sent for.'
      using errcode = '42501';
  end if;
  select lower(u.email) into v_mail from auth.users u where u.id = v_me;

  select * into v_inv from iam.invitations i
   where i.token = p_token
     and i.target_type = 'portal_principal'
     and i.deleted_at is null
     and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_me or lower(i.email) = v_mail);
  if not found then
    raise exception 'This invitation cannot be used: it has been withdrawn, already used, run out, or was sent to a different email address than the one you are signed in with.'
      using errcode = '02000',
            hint = 'Ask whoever sent it to send a fresh one, to the address you sign in with.';
  end if;

  select * into v_pp from custom.portal_principal where id = v_inv.target_id;
  if not found or not v_pp.is_active then
    raise exception 'This invitation cannot be used: it has been withdrawn, already used, run out, or was sent to a different email address than the one you are signed in with.'
      using errcode = '02000',
            hint = 'Ask whoever sent it to send a fresh one, to the address you sign in with.';
  end if;
  select * into v_p from custom.portal where id = v_pp.portal_id;
  select coalesce(nullif(btrim(o.name), ''), 'that organization') into v_org
    from iam.organizations o where o.id = v_inv.organization_id;
  v_sees := coalesce(nullif(btrim(v_inv.metadata ->> 'sees'), ''), 'the records that are yours');

  if not coalesce(v_p.is_active, false) then
    raise exception '% has closed this portal, so this invitation cannot be used.', v_org
      using errcode = '42501',
            hint = 'Ask whoever invited you — an owner or an administrator of that organization can re-open it.';
  end if;

  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_inv.organization_id) #>> '{}')::boolean, false) then
    raise exception '% has turned off sharing with people outside it, so this invitation cannot be used.', v_org
      using errcode = '42501',
            hint = 'Ask whoever invited you — an owner or an administrator of that organization can turn it back on.';
  end if;

  v_bind := custom.portal_principal_bind(v_inv.organization_id, v_pp.id, v_me);

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_me,
         updated_by = v_me, updated_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'accepted', true,
    'organization_id', v_inv.organization_id,
    'organization', v_org,
    'portal_id', v_p.id,
    'portal', v_p.title,
    'slug', v_p.slug,
    'principal_id', v_pp.id,
    'client_record_id', v_pp.client_record_id,
    'client', coalesce(nullif(btrim(v_inv.metadata ->> 'client'), ''), 'your records'),
    'sees', v_sees,
    'level', v_bind ->> 'level',
    'say', format('%s is open to you. You will see %s — the records that are yours, and nothing else of %s.',
                  coalesce(v_p.title, 'Your portal'), v_sees, v_org));
end $$;

drop index if exists custom.portal_live_by_org_idx;
drop index if exists custom.portal_archived_by_idx;

alter table custom.portal
  drop column if exists archived_at,
  drop column if exists archived_by,
  drop column if exists archive_reason;
