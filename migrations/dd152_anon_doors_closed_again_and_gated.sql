-- DD-152 — the nine ungated anonymous doors that regressed the DD-110 class since the sweep:
-- five closed, four kept open BY DESIGN and given a real in-body gate. (B-52, Data Doctrine
-- adoption program, 2026-09-12.)
--
-- WHAT WAS MEASURED, LIVE, BEFORE ANY CHANGE
-- ------------------------------------------
-- `pnpm check:impl-doors` D6 — "a declared ANONYMOUS door that reads visibility-bearing rows must
-- gate on it" (DD-116) — was RED at 9, over a shrink-only baseline of 6:
--
--   communication.meet_meeting_by_slug(p_slug text)
--   communication.meet_record_consent(p_meeting_id uuid, p_identity text, p_acknowledged_at timestamptz)
--   iam.rulebook_ids_curated_by(p_uid uuid)
--   iam.starter_pack_ids_curated_by(p_uid uuid)
--   public.admin_spend_overview(p_tz text)
--   public.creator_public_handles()
--   public.creator_public_page(p_handle text)
--   public.is_pack_curator(p_user uuid, p_pack_id uuid)
--   public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)
--
-- Each one's first gate line, read from `pg_get_functiondef` on the live database:
--
--   meet_meeting_by_slug        NONE. `select * ... where m.slug = p_slug and m.deleted_at is null`
--                               returns the WHOLE meet_meetings row — organization_id, host_user_id,
--                               created_by, metadata — to anyone holding a 10-hex-character slug.
--   meet_record_consent         NONE. An anonymous caller holding a meeting UUID upserts a
--                               communication.meet_participants row for any identity string.
--   iam.rulebook_ids_curated_by NONE, and it takes the user id as an ARGUMENT: `anon` could ask
--                               which rulebooks any user curates.
--   iam.starter_pack_ids_...    NONE, same shape over seo.starter_pack.
--   admin_spend_overview        `IF NOT public.is_super_admin() THEN RAISE ... 42501` — a real gate,
--                               but `public.is_super_admin` is not in the iam access vocabulary D6
--                               derives, and an anonymous caller had EXECUTE on the platform's
--                               whole-spend read for no reason at all.
--   creator_public_handles      `where creator_public = true and deleted_at is null` — a publication
--                               flag, not the row's visibility class.
--   creator_public_page         `where lower(creator_handle) = v_handle and creator_public = true` —
--                               same.
--   is_pack_curator             NONE in the body; it is a policy ARM (seo.starter_pack std_select).
--   is_rulebook_curator         NONE in the body; it is a policy ARM (platform.rulebook std_select).
--
-- THE THREE VERDICTS, EACH WITH THE EVIDENCE THAT SETTLED IT
-- ---------------------------------------------------------
-- (1) CLOSED TO `anon`, KEPT FOR `authenticated` — a real signed-in caller exists, an anonymous one
--     never did:
--
--     public.admin_spend_overview(text)   matrx-frontend features/admin/spend/service.ts:167 calls it
--                                         on the USER-SESSION client behind /administration/billing/
--                                         spend; the body is super-admin-only. `anon` is noise.
--     public.is_pack_curator(uuid,uuid)   Used as a policy arm — and BOTH policies that reference it
--     public.is_rulebook_curator(...)     are `{authenticated}`-only (pg_policy scan, 2026-09-12:
--                                         seo.starter_pack std_select and platform.rulebook
--                                         std_select, both TO authenticated). The `{anon}` policy on
--                                         each table is `pub_read`, whose whole qual is
--                                         `deleted_at is null AND visibility = 'public'` — it does
--                                         not call these functions, so `anon` EXECUTE buys the
--                                         policy engine nothing and buys an attacker a curator
--                                         oracle.
--
-- (2) CLOSED TO EVERY CLIENT ROLE — no caller anywhere (N class, the DD-110 word):
--
--     iam.rulebook_ids_curated_by(uuid)      Their door rows say "RLS kernel predicate ... inside
--     iam.starter_pack_ids_curated_by(uuid)  platform.rulebook std_select". THAT IS NO LONGER TRUE:
--                                            `position('rulebook_ids_curated_by' in
--                                            pg_get_functiondef(iam.entity_read_expr)) = 0`, and no
--                                            live policy on either table references them (the
--                                            generator moved to the boolean `is_*_curator` form).
--                                            Census of all four repos (matrx-frontend, aidream,
--                                            matrx-extend, matrx-local): the only hits are the two
--                                            generated `database.types.ts` files and a FOUND_DEFECTS
--                                            note. No client caller, no policy caller → revoked from
--                                            public, anon AND authenticated, service_role kept, and
--                                            the door rows deleted, because a door row on a function
--                                            no client may call is a standing lie.
--
-- (3) KEPT ANONYMOUS BY DESIGN, AND GIVEN A GATE THAT BOUNDS THEM. Four doors must answer a caller
--     with no account. Declaring that is not the same as saying every row behind them is public —
--     which is exactly the DD-116 defect — so each one now tests the row's visibility class.
--
--     THE VOCABULARY DECISION, AND WHY IT WIDENS NOTHING. `platform.visibility` is ordered
--     `personal < internal < link < public`. A row an anonymous caller reaches by holding an
--     unguessable capability — a meeting's durable slug, a creator handle the creator published —
--     is `link` by definition. Both tables carried `internal` (the column default), which under the
--     canonical vocabulary means "this organization", and that contradicted the guest lane every
--     door was built for. So the rows are raised to `link` and the doors demand `>= link`.
--
--     Raising `internal` → `link` adds NO reader anywhere, checked arm by arm on the live policies:
--       * `pub_read` (anon, both tables) requires `visibility = 'public'` — `link` does not match,
--         so nothing becomes readable over `/rest/v1/` (both `users` and `communication` ARE in the
--         authenticator's `pgrst.db_schemas`, so this mattered: setting these rows to `public`
--         instead would have opened the whole row to the published anon key. It was not done).
--       * `std_select` (authenticated, both tables) has arms for `= 'public'` and for
--         `>= 'internal'` + org membership. `link >= internal` is already true, and no arm keys on
--         `link` itself. Same readers before and after.
--
--     public.creator_public_handles()   `creator_public = true` stays the publication decision;
--     public.creator_public_page(text)  `visibility >= 'link'` is the row-class floor beneath it, so
--                                       a profile pulled back to `internal` or `personal` stops
--                                       being served even if the creator flag is stale.
--                                       `public.creator_set_public` now MOVES that class with the
--                                       flag, so the two can never drift apart again.
--     communication.meet_meeting_by_slug   For an ANONYMOUS caller (`auth.uid() is null`) the door
--     communication.meet_record_consent    refuses a meeting below `link` with a sentence and 42501.
--                                          A signed-in caller is unchanged — the same page serves
--                                          members and guests, and over-tightening the member lane
--                                          would be a defect, not caution (db-rules §6 THE SECURITY
--                                          PHILOSOPHY). `communication.meet_get_or_create_meeting`
--                                          now stamps `link` on creation, so tomorrow's meetings
--                                          arrive gated instead of grandfathered.
--
-- WHAT THIS MIGRATION DOES NOT CLAIM. The meeting slug is 10 hex characters (~40 bits) and the door
-- still returns the full meeting row to whoever holds it; that is the meet feature's design (R3/D6)
-- and is reported, not silently changed here.
--
-- Applied through `pnpm db:apply` (the one matrx-frontend DDL path; the runner owns the ledger row).

-- ── 1. CLOSED: five doors an anonymous caller never needed ───────────────────────────────
do $$
declare
  r record;
  v_sig text;
  v_closed int := 0;
begin
  create temporary table _dd152_close (schema_name text, function_name text, klass text) on commit drop;
  insert into _dd152_close values
    ('public','admin_spend_overview','U'),
    ('public','is_pack_curator','U'),
    ('public','is_rulebook_curator','U'),
    ('iam','rulebook_ids_curated_by','N'),
    ('iam','starter_pack_ids_curated_by','N');

  for r in
    select t.klass, n.nspname as sch, p.proname as nm, p.oid,
           pg_get_function_identity_arguments(p.oid) as ident_args
    from _dd152_close t
    join pg_namespace n on n.nspname = t.schema_name
    join pg_proc p on p.pronamespace = n.oid and p.proname = t.function_name
    where p.prosecdef and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
    order by 2, 3
  loop
    v_sig := format('%I.%I(%s)', r.sch, r.nm, r.ident_args);
    if r.klass = 'U' then
      execute format('revoke all on function %s from public, anon', v_sig);
      execute format('grant execute on function %s to authenticated, service_role', v_sig);
    else
      execute format('revoke all on function %s from public, anon, authenticated', v_sig);
      execute format('grant execute on function %s to service_role', v_sig);
      -- An N-class function is not a client door. Its door row is a standing lie; delete it.
      delete from platform.client_callable_door d
       where d.schema_name = r.sch and d.function_name = r.nm and d.identity_args = r.ident_args;
    end if;
    -- DD-110's class fix, applied again: a grandfather row is "the §6d-4 guard stands down here".
    delete from platform.definer_client_grant_grandfather g
     where g.schema_name = r.sch and g.function_name = r.nm;
    v_closed := v_closed + 1;
  end loop;

  if v_closed <> 5 then
    raise exception 'dd152: expected to close 5 functions, closed % — the census does not match the live catalog', v_closed;
  end if;
end $$;

-- The two doors that keep `authenticated` are still declared; their reasons now say what actually
-- holds them shut, instead of claiming an anonymous policy arm that no policy has.
update platform.client_callable_door
   set reason = 'Policy ARM for the curator lane in iam.entity_read_expr; a policy arm runs as the calling role, so `authenticated` must execute it. NOT anon: both policies that reference it are TO authenticated (platform.rulebook / seo.starter_pack std_select); the {anon} pub_read policy tests visibility only. anon EXECUTE revoked DD-152.'
 where schema_name = 'public' and function_name in ('is_pack_curator', 'is_rulebook_curator');

update platform.client_callable_door
   set reason = 'Super-admin-only read behind /administration/billing/spend, called on the USER-SESSION client (features/admin/spend/service.ts). Identity is auth.uid() via public.is_super_admin(); definer because the platform total crosses every organization''s RLS boundary by definition. Returns aggregates and organization/user identities — no execution content. Read-only. anon EXECUTE revoked DD-152: an anonymous caller was never a caller.'
 where schema_name = 'public' and function_name = 'admin_spend_overview';

-- ── 2. THE CREATOR PAGE: the published class moves with the published flag ───────────────
create or replace function public.creator_set_public(p_public boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'users'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- DD-152: publishing a creator page is a VISIBILITY decision, not only a flag. A page an
  -- anonymous visitor reaches by holding the handle is `link` — never `public`, which would open
  -- the whole profile row to the published anon key through the {anon} pub_read policy.
  update users.profiles set
    creator_public = coalesce(p_public, false),
    visibility = case
      when coalesce(p_public, false)
        then greatest(visibility, 'link'::platform.visibility)
      when visibility = 'link'::platform.visibility
        then 'internal'::platform.visibility
      else visibility
    end,
    creator_published_at = case when coalesce(p_public, false)
      then coalesce(creator_published_at, now()) else creator_published_at end,
    updated_at = now()
  where id = v_uid and deleted_at is null and creator_handle is not null;
  if not found then
    raise exception 'Claim a handle before publishing your page' using errcode = 'P0002';
  end if;
  return public.creator_get_mine();
end;
$function$;

-- Backfill the pages that were already published under the old flag-only rule. `personal` is left
-- alone deliberately: raising it would widen, and this migration widens nothing.
update users.profiles
   set visibility = 'link'::platform.visibility
 where creator_public = true
   and deleted_at is null
   and visibility = 'internal'::platform.visibility;

create or replace function public.creator_public_handles()
 returns table(handle text, updated_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public', 'users'
as $function$
  -- DD-152: `creator_public` is the publication decision; `visibility >= 'link'` is the row-class
  -- floor beneath it, so a profile pulled back to internal/personal stops being served here.
  select creator_handle, updated_at
  from users.profiles
  where creator_public = true
    and deleted_at is null
    and creator_handle is not null
    and visibility >= 'link'::platform.visibility;
$function$;

create or replace function public.creator_public_page(p_handle text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'users'
as $function$
declare
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  p record;
  v_item jsonb;
  v_kind text;
  v_out jsonb;
  v_featured jsonb := '[]'::jsonb;
  v_enriched jsonb;
  v_scope context.scopes;
  v_mode text;
  v_cents int;
  v_price jsonb;
begin
  if v_handle = '' then return null; end if;

  -- DD-152: the publication flag AND the row's visibility class. A handle that is not published,
  -- or a profile pulled back below `link`, returns NULL — never an error that would confirm the
  -- handle exists (access DECISIONS 2026-08-11).
  select id, creator_handle, display_name, avatar_url, creator_tagline,
         creator_bio, creator_links, creator_featured, creator_published_at, updated_at
    into p
  from users.profiles
  where lower(creator_handle) = v_handle
    and creator_public = true
    and deleted_at is null
    and visibility >= 'link'::platform.visibility
  limit 1;

  if p.id is null then return null; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p.creator_featured, '[]'::jsonb))
  loop
    v_kind := v_item->>'kind';
    if v_kind = 'youtube' then
      if coalesce(v_item->>'videoId', '') <> '' then
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'youtube', 'videoId', v_item->>'videoId', 'title', v_item->>'title'
        ));
      end if;
    elsif v_kind = 'class' then
      if coalesce(v_item->>'classId', '') <> '' then
        v_mode := coalesce(v_item->>'accessMode', 'open');
        v_price := v_item->'price';
        begin
          select s.* into v_scope
          from context.scopes s
          join context.scope_types st on st.id = s.scope_type_id
          where s.id = (v_item->>'classId')::uuid and st.slug = 'class' and s.deleted_at is null;
          if v_scope.id is not null then
            v_mode := coalesce(nullif(v_scope.settings->>'access_mode', ''), 'open');
            v_cents := nullif(v_scope.settings->>'price_cents', '')::int;
            if v_cents is not null then
              v_price := to_jsonb(round(v_cents / 100.0, 2));
            else
              v_price := null;
            end if;
          end if;
        exception when others then null;
        end;
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'class', 'classId', v_item->>'classId',
          'title', coalesce(v_item->>'title', 'Class'),
          'description', v_item->>'description',
          'accessMode', v_mode, 'price', v_price
        ));
      end if;
    elsif v_kind = 'resource' then
      v_enriched := public.creator_resolve_featured_resource(v_item->>'resourceType', (v_item->>'id')::uuid);
      if v_enriched is not null then
        v_featured := v_featured || jsonb_build_array(v_enriched);
      end if;
    end if;
  end loop;

  v_out := jsonb_build_object(
    'handle', p.creator_handle, 'displayName', p.display_name, 'avatarUrl', p.avatar_url,
    'tagline', p.creator_tagline, 'bio', p.creator_bio,
    'links', coalesce(p.creator_links, '[]'::jsonb), 'featured', v_featured,
    'publishedAt', p.creator_published_at, 'updatedAt', p.updated_at
  );
  return v_out;
end;
$function$;

update platform.client_callable_door
   set reason = 'Public-page read for app/(public)/c/[handle], rendered for signed-out visitors. Two gates in the body (DD-152): creator_public = true (the publication decision, set by public.creator_set_public) AND visibility >= ''link'' (the row class; creator_set_public moves it with the flag, so the two cannot drift). Not ''public'': that class would open the whole users.profiles row to the anon key through the {anon} pub_read policy.'
 where schema_name = 'public' and function_name in ('creator_public_handles', 'creator_public_page');

-- ── 3. MEET: the guest lane says out loud which meetings a guest may resolve ─────────────
update communication.meet_meetings
   set visibility = 'link'::platform.visibility
 where visibility = 'internal'::platform.visibility
   and deleted_at is null;

create or replace function communication.meet_get_or_create_meeting(
  p_organization_id uuid, p_host_user_id uuid, p_title text, p_kind text,
  p_scheduled_for timestamp with time zone, p_scheduled_duration_minutes integer,
  p_lobby_enabled boolean, p_recording_policy text, p_ai_enabled boolean, p_slug text)
 returns communication.meet_meetings
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare v_actor uuid; v_row communication.meet_meetings; v_slug text;
begin
  v_actor := communication._meet_actor(p_host_user_id);
  if p_organization_id is null then
    raise exception 'meet_get_or_create_meeting: organization_id is required' using errcode = '23502';
  end if;
  if not iam.has_org_access_for(v_actor, p_organization_id) then
    raise exception 'meet_get_or_create_meeting: not a member of this organization' using errcode = '42501';
  end if;

  -- A RECURRING MEETING KEEPS ONE LINK (R3): a known slug resolves, it never
  -- creates a second row behind the same public link.
  if p_slug is not null then
    select * into v_row from communication.meet_meetings m
      where m.slug = p_slug and m.deleted_at is null;
    if found then
      if v_row.organization_id <> p_organization_id then
        raise exception 'meet_get_or_create_meeting: that link belongs to another organization'
          using errcode = '42501';
      end if;
      return v_row;
    end if;
    v_slug := p_slug;
  else
    v_slug := lower(
      substr(md5(gen_random_uuid()::text), 1, 3) || '-' ||
      substr(md5(gen_random_uuid()::text), 1, 4) || '-' ||
      substr(md5(gen_random_uuid()::text), 1, 3));
  end if;

  -- DD-152: a meeting with a durable join link IS `link` visibility. The column default is
  -- `internal` ("this organization"), which contradicted the guest lane this feature is built for
  -- and left communication.meet_meeting_by_slug with nothing to test.
  insert into communication.meet_meetings
    (room_name, slug, title, kind, host_user_id, scheduled_for, scheduled_duration_minutes,
     locked, lobby_enabled, recording_policy, ai_enabled, organization_id, created_by, updated_by,
     visibility)
  values
    ('mx-' || replace(gen_random_uuid()::text, '-', ''), v_slug,
     coalesce(nullif(btrim(p_title), ''), 'Meeting'), coalesce(p_kind, 'instant'), v_actor,
     p_scheduled_for, p_scheduled_duration_minutes, false, coalesce(p_lobby_enabled, true),
     coalesce(p_recording_policy, 'host-controlled'), coalesce(p_ai_enabled, true),
     p_organization_id, v_actor, v_actor,
     'link'::platform.visibility)
  returning * into v_row;
  return v_row;
end;
$function$;

create or replace function communication.meet_meeting_by_slug(p_slug text)
 returns communication.meet_meetings
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare v_row communication.meet_meetings;
begin
  select * into v_row from communication.meet_meetings m
    where m.slug = p_slug and m.deleted_at is null;
  if not found then
    raise exception 'meet_meeting_by_slug: no meeting for that link' using errcode = 'P0002';
  end if;
  -- DD-152 / DD-116 class: declaring this an anonymous door says a caller with no account may
  -- REACH it; it never said every meeting behind it is open to one. A guest resolves a meeting
  -- only when its visibility class says the link is the capability. A signed-in caller is
  -- unchanged — the same page serves members and guests.
  if auth.uid() is null and v_row.visibility < 'link'::platform.visibility then
    raise exception 'meet_meeting_by_slug: this meeting is not open to guests — sign in with an '
                    'account in the meeting''s organization, or ask the host to share it by link'
      using errcode = '42501';
  end if;
  return v_row;
end;
$function$;

create or replace function communication.meet_record_consent(
  p_meeting_id uuid, p_identity text, p_acknowledged_at timestamp with time zone)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare v_org uuid; v_vis platform.visibility;
begin
  select organization_id, visibility into v_org, v_vis from communication.meet_meetings
    where id = p_meeting_id and deleted_at is null;
  if v_org is null then
    raise exception 'meet_record_consent: no such meeting' using errcode = 'P0002';
  end if;
  -- DD-152: the same guest bound as meet_meeting_by_slug. Without it an anonymous caller holding
  -- any meeting UUID could mint a participant row on a meeting no guest may join.
  if auth.uid() is null and v_vis < 'link'::platform.visibility then
    raise exception 'meet_record_consent: this meeting is not open to guests' using errcode = '42501';
  end if;
  insert into communication.meet_participants
    (meeting_id, identity, consent_acknowledged_at, organization_id)
  values (p_meeting_id, p_identity, coalesce(p_acknowledged_at, now()), v_org)
  on conflict (meeting_id, identity) do update
    set consent_acknowledged_at = coalesce(
          communication.meet_participants.consent_acknowledged_at,
          excluded.consent_acknowledged_at);
end;
$function$;

update platform.client_callable_door
   set reason = '@ai-matrx/meet: resolve a durable meeting link before/during/after (R3), including for a guest with no session (D6). The unguessable slug is the capability. DD-152 gate: an anonymous caller (auth.uid() is null) is refused a meeting below ''link'' visibility with 42501 and a sentence; meet_get_or_create_meeting stamps ''link'' on creation. Signed-in callers unchanged.'
 where schema_name = 'communication' and function_name = 'meet_meeting_by_slug';

update platform.client_callable_door
   set reason = '@ai-matrx/meet: record that a participant (guests included) saw the recording notice. Grants nothing. DD-152 gate: an anonymous caller is refused a meeting below ''link'' visibility with 42501, so a stranger holding a meeting UUID cannot mint a participant row on a meeting no guest may join.'
 where schema_name = 'communication' and function_name = 'meet_record_consent';

-- Every function this migration re-created keeps the grant shape it is declared for; CREATE OR
-- REPLACE preserves grants, but a door that lost its reach would be an outage, so it is asserted
-- below rather than assumed.
grant execute on function public.creator_public_handles() to anon, authenticated, service_role;
grant execute on function public.creator_public_page(text) to anon, authenticated, service_role;
grant execute on function communication.meet_meeting_by_slug(text) to anon, authenticated, service_role;
grant execute on function communication.meet_record_consent(uuid, text, timestamp with time zone)
  to anon, authenticated, service_role;
grant execute on function public.creator_set_public(boolean) to authenticated, service_role;
grant execute on function communication.meet_get_or_create_meeting(
  uuid, uuid, text, text, timestamp with time zone, integer, boolean, text, boolean, text)
  to authenticated, service_role;

-- ── 4. ASSERTIONS. A migration that cannot prove its own end state is not a fix. ─────────
do $$
declare
  v_n int; v_bad text; v_handle text; v_slug text; v_id uuid; v_uid uuid;
begin
  -- 4.1 The five closed functions are unreachable by `anon`.
  select count(*), min(f) into v_n, v_bad from (
    select n.nspname||'.'||p.proname as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('public','admin_spend_overview'), ('public','is_pack_curator'),
          ('public','is_rulebook_curator'), ('iam','rulebook_ids_curated_by'),
          ('iam','starter_pack_ids_curated_by'))
      and has_function_privilege('anon', p.oid, 'EXECUTE')) s;
  if v_n > 0 then raise exception 'dd152: % closed function(s) still anon-executable, e.g. %', v_n, v_bad; end if;

  -- 4.2 The two N-class helpers are unreachable by `authenticated` too, and have no door row.
  select count(*), min(f) into v_n, v_bad from (
    select n.nspname||'.'||p.proname as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'iam' and p.proname in ('rulebook_ids_curated_by','starter_pack_ids_curated_by')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')) s;
  if v_n > 0 then raise exception 'dd152: % N-class helper(s) still authenticated-executable, e.g. %', v_n, v_bad; end if;

  select count(*) into v_n from platform.client_callable_door
   where schema_name = 'iam' and function_name in ('rulebook_ids_curated_by','starter_pack_ids_curated_by');
  if v_n > 0 then raise exception 'dd152: % door row(s) survive on a function no client may call', v_n; end if;

  -- 4.3 The two kept-for-authenticated policy arms did NOT lose authenticated (that would be an
  --     outage on platform.rulebook and seo.starter_pack, not a fix).
  select count(*), min(f) into v_n, v_bad from (
    select n.nspname||'.'||p.proname as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('public','is_pack_curator'), ('public','is_rulebook_curator'),
          ('public','admin_spend_overview'))
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')) s;
  if v_n > 0 then raise exception 'dd152: % function(s) LOST authenticated EXECUTE, e.g. %', v_n, v_bad; end if;

  -- 4.4 The four declared anonymous doors KEPT anon.
  select count(*), min(f) into v_n, v_bad from (
    select n.nspname||'.'||p.proname as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('public','creator_public_handles'), ('public','creator_public_page'),
          ('communication','meet_meeting_by_slug'), ('communication','meet_record_consent'))
      and not has_function_privilege('anon', p.oid, 'EXECUTE')) s;
  if v_n > 0 then raise exception 'dd152: % anonymous door(s) LOST anon EXECUTE, e.g. %', v_n, v_bad; end if;

  -- 4.5 Nothing in this sweep stands on a grandfather row.
  select count(*) into v_n from platform.definer_client_grant_grandfather g
   where (g.schema_name, g.function_name) in (('public','admin_spend_overview'), ('public','is_pack_curator'),
         ('public','is_rulebook_curator'), ('iam','rulebook_ids_curated_by'),
         ('iam','starter_pack_ids_curated_by'), ('public','creator_public_handles'),
         ('public','creator_public_page'), ('communication','meet_meeting_by_slug'),
         ('communication','meet_record_consent'));
  if v_n > 0 then raise exception 'dd152: % grandfather row(s) survived the sweep', v_n; end if;

  -- 4.6 THE GATE ACTUALLY GATES — proven on a real row, both directions, as a real anonymous
  --     caller. This is the half a REVOKE cannot prove.
  perform set_config('request.jwt.claims', '{}', true);

  select m.id, m.slug into v_id, v_slug
    from communication.meet_meetings m
   where m.deleted_at is null and m.visibility >= 'link'::platform.visibility
   limit 1;
  if v_id is null then
    raise exception 'dd152: cannot prove the meet gate — no link-visible meeting exists';
  end if;

  -- open to a guest
  begin
    perform communication.meet_meeting_by_slug(v_slug);
  exception when others then
    raise exception 'dd152: an anonymous caller can no longer resolve the link-visible meeting % — '
                    'over-tightening is a defect, not caution (db-rules §6): %', v_slug, sqlerrm;
  end;

  -- and closed below `link`
  update communication.meet_meetings set visibility = 'internal'::platform.visibility where id = v_id;
  begin
    perform communication.meet_meeting_by_slug(v_slug);
    raise exception 'dd152: an anonymous caller still resolves meeting % at internal visibility — '
                    'the gate does not hold', v_slug;
  exception when insufficient_privilege then null;
  end;
  begin
    perform communication.meet_record_consent(v_id, 'dd152-probe', now());
    raise exception 'dd152: an anonymous caller still writes consent on meeting % at internal '
                    'visibility — the gate does not hold', v_id;
  exception when insufficient_privilege then null;
  end;
  update communication.meet_meetings set visibility = 'link'::platform.visibility where id = v_id;

  -- 4.7 The creator door: the published page still renders, and a page pulled back does not.
  select p.creator_handle, p.id into v_handle, v_uid
    from users.profiles p
   where p.creator_public = true and p.deleted_at is null
     and p.visibility >= 'link'::platform.visibility
   limit 1;
  if v_handle is null then
    raise notice 'dd152: no published creator page exists, so the creator gate is asserted by shape only';
  else
    if public.creator_public_page(v_handle) is null then
      raise exception 'dd152: the published creator page % no longer renders for an anonymous '
                      'visitor — over-tightening is a defect', v_handle;
    end if;
    update users.profiles set visibility = 'internal'::platform.visibility where id = v_uid;
    if public.creator_public_page(v_handle) is not null then
      raise exception 'dd152: creator page % still renders at internal visibility — the gate does '
                      'not hold', v_handle;
    end if;
    select count(*) into v_n from public.creator_public_handles() h where h.handle = v_handle;
    if v_n <> 0 then
      raise exception 'dd152: handle % is still listed at internal visibility', v_handle;
    end if;
    update users.profiles set visibility = 'link'::platform.visibility where id = v_uid;
  end if;

  perform set_config('request.jwt.claims', '{}', true);
  raise notice 'dd152: all assertions passed';
end $$;
