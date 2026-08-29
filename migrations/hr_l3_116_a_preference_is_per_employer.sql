-- hr_l3_116 — A NOTIFICATION PREFERENCE IS PER EMPLOYER, AND THE LADDER HAS ONE BODY.
--
-- hr_l3_114 shipped the user rung to the SQL half and reported, deliberately and loudly, the one
-- thing it would not settle on its own authority: `hr._notify_channels` does NOT filter preferences
-- by organization *because the Python spine does not either*, and a ladder that answers differently
-- depending on which half asked is worse than either answer. Arman's 2026-08-29 doctrine settles it:
-- everything an org-signed-up person does in a business context scopes to that organization, so a
-- preference about an employer's events is a preference about THAT EMPLOYER.
--
-- The defect in one sentence: a person employed by two companies who switches "leave decided" off
-- silences BOTH employers with one switch, and can never say "not from A, still from B".
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 0. WHAT WAS ACTUALLY WRONG — MEASURED, NOT ASSUMED.
--
-- The brief for this lane said "give the preference row an optional organization_id". It already
-- HAS one, and it is NOT NULL:
--
--   communication.notification_preference.organization_id  uuid  NOT NULL  → iam.organizations(id)
--
-- Three things were wrong, and none of them was a missing column:
--
--   (a) UNIQUE (user_id, event_key, channel) — no organization. So a second employer's row was
--       literally unrepresentable: the table could hold exactly ONE answer per person per event
--       per channel, for all of their employers at once.
--   (b) `hr._notify_channels` reads the table with no organization predicate (it says so, in its
--       own comment, on purpose).
--   (c) `_resolve_channel_enabled` in aidream/services/notifications/service.py does the same.
--
-- So the column recorded which org the row was WRITTEN under and then nobody read it. That is the
-- worst of the three states: it looks scoped and is not.
--
-- LIVE ROWS AT THE TIME OF WRITING (all of them — the table has one row):
--   user 87a6e699…(admin)  cms.form_submission  email  enabled=true  org 884d1ce8…  deleted_at NULL
-- and `884d1ce8…` is `admin's Workspace`, `is_personal = true` — the user's PERSONAL organization,
-- which is exactly what the frontend writes (`features/settings/notification-preferences.ts` calls
-- `resolvePersonalOrgId()` for every upsert) and exactly what `public._stamp_org_default` fills in
-- for an unstamped row. That fact is the whole reason the design below is additive: see §2.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE RULING, AND WHY THE GLOBAL RUNG IS NOT A NULL.
--
-- The ruling: the user rung gains an organization dimension. Nearest wins, as D13 always has —
--
--     the user's row for THIS employer
--   → the user's cross-org default row
--   → the organization override           (communication.notification_event_override)
--   → the platform default                (communication.notification_event_type)
--
-- and the ⚖ floor of SPEC-NOTIFICATIONS §7.1 sits under the user tier: a person may MOVE a
-- mandatory notice between channels, never reduce it to none — at EITHER user rung.
--
-- 🚨 THE BRIEF ASKED FOR `organization_id IS NULL` TO MEAN "my cross-org default". THAT IS
-- REFUSED, AND THE REFUSAL IS NOT A STYLE PREFERENCE. Arman's platform-wide ruling is NO NULL
-- ORG, EVER (systems/platform/db-rules/FEATURE.md §2 and §6e), enforced at four layers:
-- `platform._ddl_guard` warns on an ALTER that leaves an org nullable; `aidream/db/generate.py`
-- screams on a generated model with a nullable organization_id; and TWO ratchets on
-- `public.org_null_ratchet_snapshot()` block `aidream/scripts/release.sh` — one on the NULL-org
-- row count, and one on **the set of tables that allow a nullable org, which may only SHRINK**.
-- Making this column nullable would grow that set: the release would be blocked, correctly.
--
-- The 2026-08-29 exemption mechanism does not rescue it either. An exemption is CONSTRAINT-BACKED:
-- an entry in `org_less_by_constraint` names a live CHECK that *requires* the NULL for those rows
-- (`retention_policy_scope_addressing`, `entity_grants_audience_shape`, the user_secrets XOR trio),
-- and both checkers re-verify that constraint against the live catalog on every run. No such CHECK
-- is writable here: a global row and an employer row are the SAME shape, distinguished only by
-- intent. An exemption that cannot be verified is an assertion, and assertions rot in silence.
--
-- SO THE GLOBAL RUNG IS SCOPED, NOT NULLED, AND THE CARRIER IS THE USER'S PERSONAL ORGANIZATION.
-- This is not a sentinel invented here; it is where these rows ALREADY LIVE:
--
--   • `public._stamp_org_default` — the platform's own backstop — fills an unstamped row with
--     `ensure_personal_organization(actor)`. A writer that names no employer already produces a
--     personal-org row.
--   • the ONLY client writer (`features/settings/notification-preferences.ts`) explicitly calls
--     `resolvePersonalOrgId()` and has always done so.
--   • §2's own fallback for a user-owned row is "the personal org, never the system org" — the
--     ruling applied to `users.profiles` in the NULL-org campaign.
--
-- The system org was considered and REFUSED on a live read of the RLS: `std_insert`'s WITH CHECK
-- admits a system-org row only `AND is_super_admin()`, so an ordinary person could not write their
-- own global preference. The personal org passes `iam.has_org_access`, and `std_select`'s
-- `created_by = auth.uid()` arm reads it back. The carrier had to be one the user can actually use.
--
-- WHEN THE NOTIFYING ORG *IS* THE USER'S PERSONAL ORG the two rungs are the same row. That is
-- correct, not a collision: my preference in my own workspace is my personal preference.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. MUST-NOT-BREAK, PROVEN ON THE SHAPE OF THE LIVE ROWS RATHER THAN ASSERTED.
--
-- Every preference row that exists, and every row the only client writer can produce, is a
-- PERSONAL-ORG row. Under the ladder below a personal-org row is the GLOBAL rung, which applies in
-- every organization that has no employer-specific row — which is every organization, because no
-- employer-specific row exists yet. So the effective answer for every live row is byte-identical
-- before and after this migration. The dimension is genuinely additive: nothing is migrated, no
-- row changes meaning, and the first behaviour change happens only when somebody deliberately
-- writes an employer-scoped row.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. THE PRIME LAW: ONE RESOLUTION, TWO CALLERS.
--
-- hr_l3_114 kept the two halves aligned by writing the same logic twice and pinning both. That
-- worked for one day and it is the program's most-repeated defect class — the ⚖ floor had ALREADY
-- drifted (it existed in neither half until hr_l3_114 put it in both). Two rungs and a floor is
-- more than hand-alignment can hold.
--
-- So the user tier becomes ONE BODY: `communication.notification_user_channels`. It takes the
-- platform→organization(→flow-policy) answer as `p_base` and returns the FINAL channel map with
-- both user rungs and the ⚖ floor applied. `hr._notify_channels` calls it. The Python spine's
-- `_resolve_channel_enabled` calls it. Neither contains a preference read any more; there is
-- nothing left to drift.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE KEY. Widening a unique key can never collide (it only ever separates rows that used to
--    share a slot), so this needs no backfill and no conflict handling. Created FIRST, and the old
--    one dropped only after, so the table is never momentarily unconstrained.
--
--    Column ORDER is load-bearing, not cosmetic: PostgREST resolves an upsert's `on_conflict=` by
--    matching a unique index, and the client writer names these four in this order.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create unique index if not exists notification_preference_user_org_event_channel_key
  on communication.notification_preference (user_id, organization_id, event_key, channel);

drop index if exists communication.notification_preference_user_event_channel_key;

-- The resolver reads (user_id, event_key) and then discriminates on organization; the unique index
-- above serves it leading-column-first, so no second index is added. Recorded so the next reader
-- does not add one "for the resolver".

comment on index communication.notification_preference_user_org_event_channel_key is
  'hr_l3_116: one answer per person per EMPLOYER per event per channel. Replaced '
  '(user_id, event_key, channel), under which a second employer''s preference was not '
  'representable at all — one switch silenced every employer. A row on the user''s PERSONAL '
  'organization is their cross-org default (the global rung); a row on any other organization '
  'governs that employer only. Column order matches the client upsert''s on_conflict.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE ONE BODY OF THE USER TIER.
--
--    Both rungs are resolved in ONE pass with `distinct on (channel)`: the ORDER BY *is* the
--    nearest-wins rule, which is why there is no second query and no chance of the two rungs being
--    combined in a different order by a later editor.
--
--    🚨 `iam.personal_org_id` is the canonical body of "which organization is this person's own",
--    and it is deliberately NOT called here: it raises 42501 for any caller that is not
--    service_role asking about somebody else, and this resolver runs constantly while ONE person's
--    action notifies ANOTHER person (a manager decides a request; the employee is told). Calling
--    it would make every cross-person notice raise. The predicate is inlined instead, identically
--    (`is_personal is true and created_by = the user`), and pinned in §7 so it cannot drift from
--    the function that owns the rule.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function communication.notification_user_channels(
  p_user            uuid,
  p_event_key       text,
  p_organization_id uuid,
  p_base            jsonb,
  p_mandatory       boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base jsonb := coalesce(p_base, '{}'::jsonb);
  v_user jsonb := '{}'::jsonb;
  v_out  jsonb;
begin
  -- A non-user recipient has NO user rung at all — we do not run accounts for candidates, and
  -- consent (not a preference row) is their unsubscribe. Same rule as the spine's `is_user` check.
  if p_user is null then
    return v_base;
  end if;

  -- ── BOTH USER RUNGS, NEAREST FIRST.
  --   `pr.organization_id = p_organization_id`  → this employer's row, the NEAREST rung.
  --   `o.is_personal and o.created_by = p_user` → the person's own cross-org default.
  -- `distinct on (pr.channel)` keeps the first row per channel in the ORDER BY's order, so the
  -- employer row wins whenever one exists and the global row is what a channel falls back to.
  -- When p_organization_id IS the personal org both predicates match the same row — correct, and
  -- the reason this is a single scan rather than two.
  select coalesce(jsonb_object_agg(w.channel, to_jsonb(w.enabled)), '{}'::jsonb)
    into v_user
    from (
      select distinct on (pr.channel) pr.channel, pr.enabled
        from communication.notification_preference pr
        join iam.organizations o on o.id = pr.organization_id
       where pr.user_id = p_user
         and pr.event_key = p_event_key
         and pr.deleted_at is null
         and (pr.organization_id = p_organization_id
              or (o.is_personal is true and o.created_by = p_user))
       order by pr.channel,
                (pr.organization_id = p_organization_id) desc,  -- employer beats global
                pr.updated_at desc                              -- deterministic, never arbitrary
    ) w;

  -- `||` is the ladder: a user key overwrites its channel, and a user key the rung above never
  -- mentioned is ADDED — which is how a person turns a channel ON.
  v_out := v_base || v_user;

  -- ── THE ⚖ FLOOR (SPEC-NOTIFICATIONS §7.1). The user tier "may not silence a ⚖ event entirely".
  -- Checked ONCE, after both rungs, and that is deliberate: the floor is a property of the TIER,
  -- not of a rung, so it holds whether the silence came from the employer row, the global row, or
  -- the two of them together. Moving a ⚖ event between channels is untouched.
  if p_mandatory and not exists (select 1 from jsonb_each(v_out) where value = 'true'::jsonb) then
    return v_base;
  end if;

  return v_out;
end
$function$;

comment on function communication.notification_user_channels(uuid, text, uuid, jsonb, boolean) is
  'hr_l3_116: the ONE body of the D13 user tier — employer row → the person''s cross-org default '
  '(their personal-org row) → whatever p_base carried down from the organization/platform rungs — '
  'plus SPEC-NOTIFICATIONS §7.1''s ⚖ floor. hr._notify_channels and the Python spine''s '
  '_resolve_channel_enabled BOTH call this and neither may reimplement it: two implementations of '
  'one ladder is the defect class this function exists to end.';

revoke all on function communication.notification_user_channels(uuid, text, uuid, jsonb, boolean) from public;
grant execute on function communication.notification_user_channels(uuid, text, uuid, jsonb, boolean) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE SQL HALF DELEGATES. Everything above the user tier is unchanged, including the flow
--    type's refinement of the organization rung, which hr_l3_114 correctly moved here so that an
--    employer's `allow` cannot outrank the person's own choice — it is applied to `v_base` BEFORE
--    the user tier, exactly as before.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._notify_channels(
  p_event_key       text,
  p_organization_id uuid,
  p_user            uuid,
  p_flow_policy     jsonb
) returns text[]
language plpgsql
stable
security definer
set search_path to 'hr', 'public'   -- unchanged from hr_l3_114; this lane changes the body, not the environment
as $function$
-- `v_raw`, deliberately NOT the name the emitters use: the hr_l10_02 assertion bans the by-hand
-- array read anywhere in the hr schema by scanning prosrc, and THIS is the one function allowed to
-- know both shapes. Naming its variable differently keeps that ban literal and self-checking rather
-- than carrying an exception list that would eventually grow. (prosrc includes comments, so this
-- note must not spell the banned expression either.)
declare
  v_raw jsonb;
  v_base jsonb := '{}'::jsonb;   -- the platform -> organization answer, as {channel: bool}
  v_final jsonb;
  v_mandatory boolean := false;
  v_out text[];
begin
  -- the event's platform default, overlaid by the organization rung (§7.1 P -> O), and whether the
  -- event is ⚖. `mandatory` is read from the PLATFORM row only, because §7.1 says the organization
  -- rung "May not clear mandatory" — an org patch of it is not a thing this ladder honours.
  select coalesce(o.default_channels, t.default_channels),
         coalesce((t.config ->> 'mandatory')::boolean, false)
    into v_raw, v_mandatory
    from communication.notification_event_type t
    left join communication.notification_event_override o
           on o.event_key = t.event_key and o.organization_id = p_organization_id
          and o.deleted_at is null
   where t.event_key = p_event_key and t.deleted_at is null
   limit 1;

  -- An unregistered event still reaches somebody in-app rather than vanishing. It is a defect that
  -- it is unregistered — `notify()` raises on one — but a notice is not the place to discover that,
  -- so this fails toward telling the person. (Unchanged: there is no registry row to carry a ⚖ or a
  -- user preference for an event that does not exist.)
  if v_raw is null then return ARRAY['in_app']; end if;

  -- The object shape is the only one that can say a channel is explicitly OFF, which is what the
  -- P -> O -> U ladder needs; `communication.notification_event_type` now CHECKs it (`hr_l10_01`).
  -- The array branch survives ONLY so a row written before that constraint, or by something outside
  -- it, still delivers rather than raising mid-transaction.
  if jsonb_typeof(v_raw) = 'array' then
    select coalesce(jsonb_object_agg(value, to_jsonb(true)), '{}'::jsonb)
      into v_base from jsonb_array_elements_text(v_raw);
  else
    select coalesce(jsonb_object_agg(key, to_jsonb(value = 'true'::jsonb)), '{}'::jsonb)
      into v_base from jsonb_each(v_raw);
  end if;

  -- ── THE FLOW TYPE'S OWN REFINEMENT OF THE ORGANIZATION RUNG, applied BEFORE the user tier
  -- because that is where it sits on the ladder. `hr.workflow_flow_type.channel_policy` is
  -- {channel: 'allow'|'deny'} configured per flow by the employer; `deny` wins over the event
  -- default and `allow` re-adds a channel the event default leaves off.
  --
  -- 🚨 THIS MOVED HERE FROM hr._wf_notify, AND THE MOVE IS THE FIX. That function built its own
  -- channel list as "(event defaults minus denies) UNION (everything the policy allows)" and then
  -- asked this resolver only for the first half — so a policy `allow` re-added a channel AFTER the
  -- ladder had finished, on top of a reader who had switched the event off. Falsified before that
  -- change: a reader with every channel disabled still had a notice enqueued, because their flow
  -- carried {"sms": "allow"}. An employer-level setting silently outranking the person's own choice
  -- inverts D13. One ladder, one place, and the nearest rung genuinely last.
  if p_flow_policy is not null and jsonb_typeof(p_flow_policy) = 'object' then
    select v_base || coalesce(jsonb_object_agg(key, to_jsonb(val = 'allow')), '{}'::jsonb)
      into v_base
      from jsonb_each_text(p_flow_policy) e(key, val)
     where val in ('allow', 'deny');
  end if;

  -- ── THE USER TIER — BOTH RUNGS AND THE ⚖ FLOOR — IS NOT IMPLEMENTED HERE, ON PURPOSE.
  -- hr_l3_114 wrote it out longhand and matched it to the Python spine by hand, which is exactly
  -- how the two halves of one ladder drift; hr_l3_116 moved that body into
  -- `communication.notification_user_channels`, which the Python spine calls too. If you are about
  -- to inline a read of the per-user preference table below this line: don't. Change the shared
  -- function and both halves move together. (The table's own name is deliberately not spelled
  -- anywhere in this body — the pin in §7 bans that token here, and prosrc includes comments, so
  -- naming it even in a warning would break the very contract the warning is about.)
  v_final := communication.notification_user_channels(
               p_user, p_event_key, p_organization_id, v_base, v_mandatory);

  select coalesce(array_agg(key order by key), '{}'::text[])
    into v_out from jsonb_each(v_final) where value = 'true'::jsonb;

  return v_out;
end
$function$;

revoke all on function hr._notify_channels(text, uuid, uuid, jsonb) from public;
grant execute on function hr._notify_channels(text, uuid, uuid, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. CONTRACT PINS.
--
--    hr_l3_114's pin on `hr._notify_channels` is AMENDED, not silenced, and the amendment is the
--    honest record of a supersession: its two tokens asserted that this function CONTAINS the
--    preference read and the ⚖ floor. Both still exist and both still run — one layer down, in the
--    shared body — so the pin now asserts the DELEGATION instead, which is the shape that would
--    actually be lost if somebody "simplified" it back. Its original reason is preserved verbatim
--    inside the new one, because the harm it names has not changed.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('communication', 'notification_user_channels', 'hr_l3_116',
   array['o.is_personal is true and o.created_by = p_user',
         'pr.organization_id = p_organization_id',
         'p_mandatory and not exists'],
   array[]::text[],
   'hr_l3_116: this is the ONE body of the D13 user tier and all three tokens are the ruling. '
   || '(1) The personal-org predicate IS the global rung — the user''s cross-org default is carried '
   || 'on their own organization because Arman''s NO NULL ORG ruling forbids the NULL that would '
   || 'otherwise mean "everywhere", and because that is where _stamp_org_default and the client '
   || 'writer already put these rows. It is inlined rather than delegated to iam.personal_org_id '
   || 'ONLY because that function raises 42501 when a non-service caller asks about somebody else, '
   || 'which is every cross-person notice; if the rule ever changes there, change it here. '
   || '(2) The employer predicate is the near rung: without it one switch silences every employer '
   || 'a person works for, which is the defect this migration exists to close. (3) The mandatory '
   || 'clause is SPEC-NOTIFICATIONS §7.1''s floor — the user tier may not silence a ⚖ event '
   || 'entirely — and it must sit AFTER both rungs so it holds no matter which rung produced the '
   || 'silence.',
   true),
  ('hr', '_notify_channels', 'hr_l3_114',
   array['communication.notification_user_channels'],
   array['communication.notification_preference'],
   'hr_l3_116 AMENDS hr_l3_114''s pin. ORIGINAL REASON, unchanged in force: "this is the SQL half '
   || 'of the D13 ladder and it must keep BOTH new rungs. The read of '
   || 'communication.notification_preference IS the user rung — without it a person who switched '
   || 'an event off receives it anyway. The mandatory clause is SPEC-NOTIFICATIONS §7.1''s floor; '
   || 'losing it hands an employee a switch that silences the notice telling them a manager edited '
   || 'their punch. The two must move together." WHAT CHANGED: the rung and the floor were being '
   || 'maintained in TWO places — here and in the Python spine — matched by hand, which is this '
   || 'program''s most-repeated defect class and had already produced one live drift (neither half '
   || 'had the floor until hr_l3_114 added it to both). They now live in '
   || 'communication.notification_user_channels, which BOTH halves call. So the token flipped: this '
   || 'function must CALL the shared body and must NOT contain a preference read of its own, '
   || 'because re-inlining one is precisely how the halves start answering differently again.',
   true)
-- Idempotence: this file may legitimately be replayed (and the repo's applier may pick it up while
-- it is still being edited). A pin is not an admin knob, so a replay should CONVERGE the pin rather
-- than skip it and leave a stale reason behind.
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       is_active        = true;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 8. FALSIFICATION — shape and invariants only. The behavioural matrix (a two-employer fixture,
--    the ⚖ floor at both rungs, and the Python/SQL identical-answers probe) is run against live
--    data in rolled-back transactions and recorded in the session log; a migration is not the
--    place to invent employees.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare
  v_n integer;
  v_broken integer;
begin
  -- the key is the new one, and the old one is gone
  if not exists (select 1 from pg_indexes
                  where schemaname = 'communication'
                    and indexname = 'notification_preference_user_org_event_channel_key') then
    raise exception 'hr_l3_116: the (user, org, event, channel) unique key is missing — a second '
                    'employer''s preference is unrepresentable without it';
  end if;
  if exists (select 1 from pg_indexes
              where schemaname = 'communication'
                and indexname = 'notification_preference_user_event_channel_key') then
    raise exception 'hr_l3_116: the org-blind unique key survived — two keys on one table means '
                    'the narrower one still refuses the second employer''s row';
  end if;

  -- organization_id is still NOT NULL. This migration must never be the one that reopens the
  -- NULL-org lane; if a later edit makes the column nullable, this is where it is caught.
  if exists (select 1 from information_schema.columns
              where table_schema = 'communication' and table_name = 'notification_preference'
                and column_name = 'organization_id' and is_nullable = 'YES') then
    raise exception 'hr_l3_116: notification_preference.organization_id became NULLABLE — that is '
                    'the NO NULL ORG ruling (db-rules §2/§6e) and it blocks release.sh';
  end if;

  -- exactly one resolver, still 4-arg
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_notify_channels';
  if v_n <> 1 then
    raise exception 'hr_l3_116: expected exactly ONE hr._notify_channels, found %', v_n;
  end if;

  -- neither the shared body nor the SQL half is world-executable
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where ((n.nspname = 'hr' and p.proname = '_notify_channels')
                  or (n.nspname = 'communication' and p.proname = 'notification_user_channels'))
                and p.proacl is null) then
    raise exception 'hr_l3_116: a SECURITY DEFINER resolver carries a NULL acl — implicit PUBLIC '
                    'EXECUTE';
  end if;

  -- 🚨 NO SECOND IMPLEMENTATION. Any hr function that reads the preference table directly is a
  -- second copy of the user rung by definition — the ban is the point of §3.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.prosrc like '%communication.notification_preference%';
  if v_n > 0 then
    raise exception 'hr_l3_116: % hr function(s) read communication.notification_preference '
                    'directly — the user tier has ONE body '
                    '(communication.notification_user_channels) and this is how it stops having one',
                    v_n;
  end if;

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l3_116: % contract(s) broken after this migration', v_broken;
  end if;

  raise notice 'hr_l3_116: key widened, user tier has one body, % contracts broken', v_broken;
end
$post$;

commit;
