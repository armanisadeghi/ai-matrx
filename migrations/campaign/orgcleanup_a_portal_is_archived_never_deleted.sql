-- ORG-CLEANUP — A PORTAL IS ARCHIVED, NEVER DELETED.
--
-- The organization archive door (ORG-ARCHIVE, 2026-09-20) gave organizations the primitive
-- Arman's ruling of 2026-09-20 asks of everything important: "Deleting anything important in
-- our system should be a soft-delete… It's absolutely an archive." Portals never got it. So
-- Rincon Plumbing Co carries TEN portals all titled "Your jobs and invoices" — nine of them the
-- residue of a walk repeated nine times — and the "add this table to a portal your clients
-- already use" offer draws ten identical buttons. There was no door to close them with, and
-- `is_active` is not it: `is_active = false` means CLOSED (the clients are told the organization
-- shut it, and `portal_invite_accept` says "% has closed this portal"), which is a state an
-- organization chooses about a portal it still has. Archived means it is out of the way.
--
-- WHAT THIS FILE ADDS
--   * `custom.portal.archived_at / archived_by / archive_reason`, with a partial index.
--   * `custom.portal_archive(org, portal, typed_title, reason)` and
--     `custom.portal_restore(org, portal, typed_title)` — the same ladder every portal WRITE
--     already climbs (`assert_client_may_reach`, `assert_store_door`, then
--     `assert_client_may_change(... 'admin' ... 'table')` on the portal's client Table, which is
--     `custom.portal_declare`'s own rung), the organization's own typed title as the
--     confirmation, and a SENTENCE back — never a constraint name.
--   * `custom.portals(org)` keeps its signature and HIDES archived portals, because the law's
--     default is to hide; `custom.list_portals(org, 'active'|'archived'|'all')` is the
--     archive-aware reader, taking the platform archive filter's own three values so the rail
--     gets the law's one-click reveal from ONE door rather than inventing a second control.
--     This is exactly what ORG-ARCHIVE did with get_user_organizations / list_user_organizations.
--   * `custom.portal_invite_accept` refuses an archived portal in its own sentence, distinct
--     from the closed one, and `custom.portal_public` answers NULL for one — the 404 that never
--     reveals that anything is there.
--
-- NOTHING IS DELETED and there is no purge. An archived portal keeps every `portal_table` row
-- and every `portal_principal`; restore hands it all back exactly as it was.
--
-- chair-step: it GRANTS EXECUTE on three NEW functions to `authenticated`, which is the shape
--   the runner's allow-list refuses by name. Nothing is dropped, nothing is revoked, no row of
--   any feature is deleted or rewritten. The inverse is
--   migrations/inverse/orgcleanup_a_portal_is_archived_never_deleted_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.portals(uuid) c76f49c8ed495c7fd3b3d7d7bf78b4cfed5ee9b9860a06b39aafda5ee26f3060
-- based-on: custom.portal_public(text) 2c8ec3b73c0a3519e16b613e09df16a18bde087bb0155d86b9e83e342ccd31d6
-- based-on: custom.portal_invite_accept(text) 2375092894f3cbe1a318d8caa1953aa4fadb680b970ef1c3f6cec1984fbf8cdd

-- ── 1. The columns ────────────────────────────────────────────────────────────────────────────
alter table custom.portal
  add column if not exists archived_at    timestamptz,
  add column if not exists archived_by    uuid references auth.users(id),
  add column if not exists archive_reason text;

comment on column custom.portal.archived_at is
  'When this portal was archived. NULL means live. Archived is not closed: a closed portal is one '
  'the organization shut and told its clients about; an archived one is out of the lists. Nothing '
  'is ever deleted and there is no purge — custom.portal_restore hands it all back.';
comment on column custom.portal.archived_by is 'Who archived it (auth.users.id).';
comment on column custom.portal.archive_reason is 'The words the person typed, if they typed any.';

-- THE GUARD CAUGHT THIS ONE (provision_shape_guard, 23514, on the first production apply):
-- a NEW foreign key with no covering index makes every delete of the parent row sequentially
-- scan this table. archived_by points at auth.users, so it needs its own index.
create index if not exists portal_archived_by_idx on custom.portal (archived_by);

create index if not exists portal_live_by_org_idx
  on custom.portal (organization_id, opened_at desc)
  where archived_at is null;

-- ── 2. The two doors ──────────────────────────────────────────────────────────────────────────
create or replace function custom.portal_archive(
  p_organization_id uuid,
  p_portal_id       uuid,
  p_confirm_title   text,
  p_reason          text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_p custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_archive');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_archive');

  select * into v_p from custom.portal
   where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;

  -- THE ONE LADDER, at the rung `custom.portal_declare` itself climbs: `admin` on the Table
  -- whose records are the clients. Whoever may open a portal may put it away.
  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_archive', 'admin'::public.permission_level, 'table');

  if btrim(coalesce(p_confirm_title, '')) is distinct from btrim(v_p.title) then
    raise exception 'Type the portal''s title exactly — % — to archive it.', v_p.title
      using errcode = '23514',
            hint = 'Nothing was changed. Ten portals can carry one title, so the title alone is '
                   'not what picks this one — the portal you opened is, and typing its title back '
                   'is how you say you meant this one.';
  end if;

  if v_p.archived_at is not null then
    return jsonb_build_object(
      'archived', true, 'changed', false, 'portal_id', v_p.id,
      'archived_at', v_p.archived_at,
      'sentence', format('%s was already archived on %s.',
                         v_p.title, to_char(v_p.archived_at, 'DD Month YYYY')));
  end if;

  update custom.portal
     set archived_at    = now(),
         archived_by    = custom.query_principal(),
         archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         -- An archived portal is also shut, so every reader that already asks `is_active`
         -- hides it in the same instant, including the ones nobody has touched since.
         is_active      = false,
         closed_at      = coalesce(v_p.closed_at, now())
   where id = v_p.id
  returning * into v_p;

  return jsonb_build_object(
    'archived', true, 'changed', true, 'portal_id', v_p.id,
    'archived_at', v_p.archived_at,
    'sentence', format(
      '%s is archived. Nobody can sign in to it and it is out of your portal list, but nothing '
      'was deleted — every table it showed and everyone invited to it is exactly as it was, and '
      'you can restore it at any time.', v_p.title));
end $$;

create or replace function custom.portal_restore(
  p_organization_id uuid,
  p_portal_id       uuid,
  p_confirm_title   text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_p custom.portal;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.portal_restore');
  perform custom.assert_store_door(p_organization_id, 'custom.portal_restore');

  select * into v_p from custom.portal
   where id = p_portal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal in this organization.' using errcode = '02000';
  end if;

  perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
            'custom.portal_restore', 'admin'::public.permission_level, 'table');

  if btrim(coalesce(p_confirm_title, '')) is distinct from btrim(v_p.title) then
    raise exception 'Type the portal''s title exactly — % — to restore it.', v_p.title
      using errcode = '23514';
  end if;

  if v_p.archived_at is null then
    return jsonb_build_object(
      'archived', false, 'changed', false, 'portal_id', v_p.id,
      'sentence', format('%s is not archived.', v_p.title));
  end if;

  update custom.portal
     set archived_at = null, archived_by = null, archive_reason = null,
         is_active = true, closed_at = null
   where id = v_p.id
  returning * into v_p;

  return jsonb_build_object(
    'archived', false, 'changed', true, 'portal_id', v_p.id,
    'sentence', format(
      '%s is open again. Everyone who was invited to it can sign in exactly as before, and it '
      'shows the same tables it always did.', v_p.title));
end $$;

-- ── 3. The readers ────────────────────────────────────────────────────────────────────────────
-- The list keeps its signature and hides archived portals. THE LAW'S DEFAULT IS TO HIDE.
create or replace function custom.portals(p_organization_id uuid)
returns table(portal_id uuid, title text, slug text, client_table_id uuid, client_table text,
              is_active boolean, tables integer, invited integer, signed_in integer,
              sign_in_method text, opened_at timestamptz)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
begin
  return query select * from custom.list_portals(p_organization_id, 'active');
end $$;

-- The archive-aware reader: the platform archive filter's own three values, and no fourth.
create or replace function custom.list_portals(
  p_organization_id uuid,
  p_archived        text default 'active'
)
returns table(portal_id uuid, title text, slug text, client_table_id uuid, client_table text,
              is_active boolean, tables integer, invited integer, signed_in integer,
              sign_in_method text, opened_at timestamptz)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
declare
  v_filter text := lower(btrim(coalesce(p_archived, 'active')));
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.list_portals');
  if v_filter not in ('active', 'archived', 'all') then
    raise exception 'A list is of the live things, the archived things, or all of them — "%" is none of those.', p_archived
      using errcode = '22023',
            hint = 'Ask for active, archived or all. There is no fourth answer, on any surface of this platform.';
  end if;

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
       and case v_filter
             when 'active'   then p.archived_at is null
             when 'archived' then p.archived_at is not null
             else true
           end
       -- A portal is a way IN to the Tables it exposes, so a person who cannot open the
       -- client Table is not told the portal exists. The list never reveals a Table.
       and custom.has_visibility(custom.query_principal(), 'record', p.client_table_id, 'viewer'::public.permission_level)
     order by p.is_active desc, p.opened_at desc nulls last;
end $$;

-- ── 4. An archived portal admits nobody, and says which of the two it is ──────────────────────
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
  return jsonb_build_object(
    'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
    'sign_in_method', v_p.sign_in_method, 'state', 'open');
end $$;

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
  -- 🚨 THIS IS THE WHOLE POINT OF THE LANE: ONE DOOR, ONE DECISION, ONE TRANSACTION.
  -- The invitation token proves the AUTHORITY — an admin of this portal's organization made
  -- it, through `custom.portal_invite`, which asserted `admin` on the client Table before it
  -- minted anything. From there the bind and the grant are performed AS THAT AUTHORITY. The
  -- arriving person is never asked to hold a level they cannot hold, which is exactly what
  -- made this flow impossible to finish before 2026-09-21.
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
    -- ONE SENTENCE for a token that never existed, one that has been used, one that has run
    -- out, one that was withdrawn and one addressed to somebody else. A link must not be
    -- usable to learn that something is there.
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

  -- ARCHIVED IS NOT CLOSED, AND THE PERSON HOLDING THE LINK IS TOLD WHICH. A closed portal is
  -- one the organization shut and means to re-open; an archived one has been put away. Both
  -- refuse, and neither leaves the arriving person staring at a dead page — the sentence says
  -- what happened and who can undo it. (ORG-CLEANUP, 2026-09-22.)
  if v_p.archived_at is not null then
    raise exception '% has archived this portal, so this invitation cannot be used.', v_org
      using errcode = '42501',
            hint = 'Nothing of yours was lost. Ask whoever invited you — an owner or an administrator of that organization can restore the portal, and this link works again the moment they do.';
  end if;

  if not coalesce(v_p.is_active, false) then
    raise exception '% has closed this portal, so this invitation cannot be used.', v_org
      using errcode = '42501',
            hint = 'Ask whoever invited you — an owner or an administrator of that organization can re-open it.';
  end if;

  -- THE LANE STILL HAS TO BE OPEN AT THIS MOMENT. An organization that closed its outside
  -- door after sending an invitation has closed it, and the link says so instead of quietly
  -- writing a grant that admits nobody. (`custom.portal_admits` reads the same knob, so a
  -- grant written here while it is off would carry the person exactly nowhere.)
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_inv.organization_id) #>> '{}')::boolean, false) then
    raise exception '% has turned off sharing with people outside it, so this invitation cannot be used.', v_org
      using errcode = '42501',
            hint = 'Ask whoever invited you — an owner or an administrator of that organization can turn it back on.';
  end if;

  -- THE BIND AND THE GRANT, through the ONE bind door, in this transaction.
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

-- ── 5. THE DOOR ROWS, DECLARED BEFORE THE GRANTS (DD-223) ─────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, identity_argtypes, argument_rules)
values
  ('custom', 'portal_archive',
   'p_organization_id uuid, p_portal_id uuid, p_confirm_title text, p_reason text',
   'ORG-CLEANUP / orgcleanup_a_portal_is_archived_never_deleted.sql',
   'p_organization_id is the tenant, and custom.assert_client_may_reach refuses a caller who is '
   'not in it (42501) before anything is read. p_portal_id is narrowed to that organization in '
   'the same statement, so an id from another tenant answers "There is no such portal in this '
   'organization." exactly as an invented one does. The decision is then made on the portal''s '
   'own client Table: custom.assert_client_may_change at `admin`, which is the rung '
   'custom.portal_declare demands to CREATE the portal — whoever may open one may put it away. '
   'p_confirm_title and p_reason are the person''s own typing: the title is compared to the '
   'portal''s stored title and never used to select a row, and the reason is stored as written.',
   true, false, array[2950, 2950, 25, 25]::oid[],
   jsonb_build_object(
     'version', 1,
     'declared_by', 'orgcleanup_a_portal_is_archived_never_deleted.sql',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false,
         'entity', 'organization', 'access', 'member',
         'check', 'custom.assert_client_may_reach(p_organization_id) — a non-member is refused 42501 before any read',
         'null_rule', jsonb_build_object('sqlstate', '42501')),
       'p_portal_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'optional', false,
         'entity', 'portal', 'access', 'admin on the portal''s client Table',
         'check', 'narrowed to p_organization_id in the lookup, then custom.assert_client_may_change(client_table_id, admin, table)',
         'foreign', jsonb_build_object('same_as_invented', true, 'sqlstate', '02000'),
         'null_rule', jsonb_build_object('sqlstate', '02000')),
       'p_confirm_title', jsonb_build_object(
         'type', 'text', 'position', 3, 'optional', false,
         'check', 'compared to the portal''s stored title; never selects a row',
         'null_rule', jsonb_build_object('sqlstate', '23514')),
       'p_reason', jsonb_build_object(
         'type', 'text', 'position', 4, 'optional', true, 'sql_default', 'NULL',
         'check', 'free text, stored as written',
         'null_rule', jsonb_build_object('means', 'no reason was typed'))))),
  ('custom', 'portal_restore',
   'p_organization_id uuid, p_portal_id uuid, p_confirm_title text',
   'ORG-CLEANUP / orgcleanup_a_portal_is_archived_never_deleted.sql',
   'The same three checks as custom.portal_archive, in the same order: membership, then the '
   'portal narrowed to that organization, then `admin` on its client Table, then the title '
   'typed back. Restoring changes no access anybody did not already have — it hands back '
   'exactly the tables and principals the portal carried when it was archived.',
   true, false, array[2950, 2950, 25]::oid[],
   jsonb_build_object(
     'version', 1,
     'declared_by', 'orgcleanup_a_portal_is_archived_never_deleted.sql',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false,
         'entity', 'organization', 'access', 'member',
         'check', 'custom.assert_client_may_reach(p_organization_id)',
         'null_rule', jsonb_build_object('sqlstate', '42501')),
       'p_portal_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'optional', false,
         'entity', 'portal', 'access', 'admin on the portal''s client Table',
         'check', 'narrowed to p_organization_id, then custom.assert_client_may_change(client_table_id, admin, table)',
         'foreign', jsonb_build_object('same_as_invented', true, 'sqlstate', '02000'),
         'null_rule', jsonb_build_object('sqlstate', '02000')),
       'p_confirm_title', jsonb_build_object(
         'type', 'text', 'position', 3, 'optional', false,
         'check', 'compared to the portal''s stored title; never selects a row',
         'null_rule', jsonb_build_object('sqlstate', '23514'))))),
  ('custom', 'list_portals',
   'p_organization_id uuid, p_archived text',
   'ORG-CLEANUP / orgcleanup_a_portal_is_archived_never_deleted.sql',
   'Read-only, and the same narrowing custom.portals has always carried: a non-member is '
   'refused 42501, and the rows are then narrowed to portals whose CLIENT Table the caller can '
   'already open at viewer, so the list can never reveal a Table. p_archived is the platform '
   'archive filter''s own three values — active (the default), archived, all — and a fourth '
   'value is refused 22023 rather than silently treated as one of them.',
   true, false, array[2950, 25]::oid[],
   jsonb_build_object(
     'version', 1,
     'declared_by', 'orgcleanup_a_portal_is_archived_never_deleted.sql',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false,
         'entity', 'organization', 'access', 'member',
         'check', 'custom.assert_client_may_reach, then per-row custom.has_visibility on the client Table at viewer',
         'null_rule', jsonb_build_object('sqlstate', '42501')),
       'p_archived', jsonb_build_object(
         'type', 'text', 'position', 2, 'optional', true, 'sql_default', '''active''',
         'check', 'one of active | archived | all; anything else is 22023',
         'null_rule', jsonb_build_object('means', 'active — the law''s default is to hide')))))
on conflict do nothing;

-- ── 6. The grants ─────────────────────────────────────────────────────────────────────────────
grant execute on function custom.portal_archive(uuid, uuid, text, text) to authenticated;
grant execute on function custom.portal_restore(uuid, uuid, text) to authenticated;
grant execute on function custom.list_portals(uuid, text) to authenticated;
