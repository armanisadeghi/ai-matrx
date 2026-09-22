-- INVITE-DELIVERY — THE RED TWIN.
--
-- The same three questions `invitedelivery_green.sql` answers, asked against the bytes that
-- stood BEFORE this lane. It restores lane SHARE-OUT's own `custom.table_share_outside_invite`
-- and `custom.table_share_outside` inside a transaction that rolls back, removes the peek
-- door, and shows each clause failing — because a guard nobody has watched fail is not a guard.
--
-- 🚨 IT IS NOT A WEAKER SUITE. It runs from the same seat, builds the same Ojai branch of
-- the same real business, and invites the same customer. Only the FUNCTION BODIES differ.
--
--   A RED  there is no public.table_share_peek — the person holding the link has no way to
--          learn what they were offered, so the accept page can only ask before it explains
--   B RED  inviting the customer writes NOTHING anywhere: no notice, no message, no record
--          that anybody was ever told. This is the defect, exactly as SHARE-OUT named it.
--   C RED  the dialog's pending row carries no link, so "Invited, not yet joined" is a
--          dead end: nothing was sent and there is nothing to send by hand either
--
-- Everything this file does is inside ONE transaction that ends in ROLLBACK.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'invitedelivery_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ── PUT THE OLD BYTES BACK, for this transaction only. ─────────────────────────────
drop function if exists public.table_share_peek(text);

create or replace function custom.table_share_outside_invite(
  p_organization_id uuid, p_table_id uuid, p_email text,
  p_level public.permission_level default 'viewer'::public.permission_level)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_row  custom.record;
  v_user uuid;
  v_id   uuid;
  v_name text;
begin
  -- SHARE-OUT's door, reduced to the part under test: it mints the invitation and
  -- returns the token, and that is ALL it ever did. Every gate above it is unchanged in
  -- the real body and is not what this twin is about.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_invite');
  perform custom.assert_client_may_change(p_organization_id, p_table_id,
            'custom.table_share_outside_invite', 'admin'::public.permission_level, 'table');
  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  v_name := coalesce(nullif(v_row.data ->> 'name', ''), 'this table');
  select u.id into v_user from auth.users u where lower(u.email) = v_mail order by u.created_at limit 1;

  insert into iam.invitations
    (organization_id, target_type, target_id, email, invited_user_id, role, status,
     expires_at, metadata, created_by, updated_by)
  values
    (p_organization_id, 'custom_table', p_table_id, v_mail, v_user, p_level::text, 'pending',
     now() + interval '14 days',
     jsonb_build_object('level', p_level::text, 'subject', 'custom_table', 'table_name', v_name),
     custom.query_principal(), custom.query_principal())
  returning id into v_id;

  return jsonb_build_object(
    'invited', true, 'invitation_id', v_id, 'email', v_mail, 'table', v_name,
    'token', (select i.token from iam.invitations i where i.id = v_id),
    'joined', false);
end;
$fn$;

create or replace function custom.table_share_outside(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_rows jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside');
  perform custom.assert_client_may_open(p_organization_id, p_table_id,
            'custom.table_share_outside', 'viewer'::public.permission_level, 'table');
  -- SHARE-OUT's row shape: everything about the invitation EXCEPT the one thing the
  -- office needed, which is the link.
  select coalesce(jsonb_agg(jsonb_build_object(
           'invitation_id', i.id, 'email', i.email, 'status', i.status,
           'joined', i.status = 'accepted')), '[]'::jsonb)
    into v_rows
    from iam.invitations i
   where i.target_type = 'custom_table' and i.target_id = p_table_id
     and i.organization_id = p_organization_id and i.deleted_at is null;
  return jsonb_build_object('lane_open', true, 'may_invite', true, 'invitations', v_rows);
end;
$fn$;

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_mail    constant text := 'test@test.com';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_jobs    uuid;
  v_out     jsonb;
  v_state   jsonb;
  v_inv     uuid;
  v_n       integer;
  v_link    text;
begin
  perform set_config('app.actor_system', 'campaign.invitedelivery.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Ojai Branch',
          'rincon-plumbing-ojai-red-' || substr(v_org::text, 1, 8), 'RPO', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'INVITE-DELIVERY red twin.'),
         ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'INVITE-DELIVERY red twin.');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Ojai Branch')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED: this twin did not take the seat — current_user is %', current_user;
  end if;

  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Jobs', 'slug', 'jobs', 'type', 'entity', 'display', 'list',
    'label_singular', 'Job', 'label_plural', 'Jobs', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'work_order', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','work_order'),
                                jsonb_build_object('name','address'),
                                jsonb_build_object('name','problem'))));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'work_order','RPO-4471','address','812 Grand Ave, Ojai',
    'problem','Water heater replacement — 50 gal gas, old unit leaking at the base'));

  -- ═══ A RED — THERE IS NO WAY TO SEE WHAT A LINK OFFERS. ════════════════════════════
  begin
    perform public.table_share_peek('anything');
    raise exception 'A DID NOT FAIL: public.table_share_peek answered, so this is not the old state';
  exception when undefined_function then
    raise notice 'CLAUSE A RED: there is no public.table_share_peek — the person holding the link cannot learn what it offers before being asked to make an account';
  end;

  -- ═══ B RED — INVITING SOMEBODY SENDS NOTHING AT ALL. ══════════════════════════════
  v_out := custom.table_share_outside_invite(v_org, v_jobs, c_mail, 'viewer');
  v_inv := (v_out ->> 'invitation_id')::uuid;

  select count(*) into v_n
    from communication.notification n
   where n.target_id = v_inv or n.payload -> 'invite' ->> 'invitation_id' = v_inv::text;
  if v_n <> 0 then
    raise exception 'B DID NOT FAIL: % notice(s) exist, so the old bytes are not in place', v_n;
  end if;
  -- And nothing anywhere else either: the whole outbox is the platform's ONE outbox.
  raise notice 'CLAUSE B RED: % was invited to Jobs and % message(s) were sent — the invitation exists and nobody was told',
    c_mail, v_n;

  -- ═══ C RED — AND THERE IS NO LINK TO SEND BY HAND. ════════════════════════════════
  v_state := custom.table_share_outside(v_org, v_jobs);
  select r ->> 'accept_path' into v_link
    from jsonb_array_elements(v_state -> 'invitations') r
   where (r ->> 'invitation_id')::uuid = v_inv;
  if v_link is not null then
    raise exception 'C DID NOT FAIL: the dialog carried a link (%), so the old bytes are not in place', v_link;
  end if;
  raise notice 'CLAUSE C RED: the pending row offers no link, so "Invited, not yet joined" is where the feature ends';

  perform set_config('role', v_boss, true);
  raise notice 'INVITE-DELIVERY red: all three clauses failed on the pre-lane bytes, so the green suite is known to be able to fail.';
end
$red$;

rollback;
