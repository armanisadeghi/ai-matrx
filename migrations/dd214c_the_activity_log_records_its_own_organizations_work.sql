-- DD-214c — an organization's ACTIVITY log records its own organization's work,
-- never a stranger's invention. The DD-213 class, in a second log.
--
-- ═══ HOW IT WAS FOUND ════════════════════════════════════════════════════════
-- Not by looking for it. DD-214 widened `check:door-rows`' organization-argument
-- derivation from `p_organization_id` to `p_org` (three of the four billing doors
-- spell it the short way and were therefore UNMEASURED BY NAME). The very first
-- wide run with the wider regex turned one previously-invisible door red:
--
--   platform.log_activity(p_org uuid, p_action text, p_entity_type text,
--                         p_entity_id uuid, p_metadata jsonb)
--
-- SECURITY DEFINER, `LANGUAGE sql`, EXECUTE held by `authenticated`, and its
-- entire body is an unconditional INSERT into `platform.activity_log` with the
-- caller's `p_org`. Measured live 2026-09-14, rolled back, as test@test.com
-- (no standing) and as an org-less signed-in account: each call WROTE a row into
-- Castellano & Reyes, LLP `7cd12da2-2213-4378-8fba-a9e2dc4ea657` — an
-- attacker-chosen `action` string, an attacker-chosen `entity_type`/`entity_id`
-- and attacker-chosen `metadata`, stamped with the real `actor_id` — and the
-- writer could not read back a single one of them under RLS.
--
-- This is DD-213's ruling word for word, in a different log: **an organization's
-- log records its own people, never a stranger's knock.** An activity feed any
-- signed-in account can fill with rows is a feed nobody can trust — the noise is
-- unbounded, attacker-chosen, and indistinguishable from the organization's own
-- record of its own work.
--
-- It is also a decision somebody already made and something quietly undid:
-- `migrations/webhook_hardening.sql` revoked EXECUTE on this exact signature from
-- `authenticated, anon, public` under the heading "#7 actor forgery", and the
-- grant is live again today. `migrations/dd169_grandfather_batch1_volatile_doors.sql`
-- then declared it a client door whose stated reason is only "SIGNED-IN door
-- (authenticated only; anon revoked by this migration)" — which says the caller
-- must be signed in and says nothing at all about WHICH organization they may
-- write to. Signed in is not the same as standing in.
--
-- ═══ THE FIX ═════════════════════════════════════════════════════════════════
-- The organization is a CLAIM, checked before the insert, through
-- `iam.has_org_access_for` — DD-191's helper of record, the same one DD-192,
-- DD-208 and DD-214 use. No new helper, no fourth definition of "member".
--
--   * a signed-in caller with no standing and no platform-admin lane: refused
--     with a real error and a human sentence, and NO row. Nothing about a
--     stranger is that organization's business to keep.
--   * a member, or a platform admin: writes exactly as before, byte-identical.
--   * `auth.uid()` NULL: unchanged. This signature is granted to `authenticated`
--     and NOT to `anon`, so a NULL actor here is the server's own connection or a
--     trigger, never a browser — the same reasoning DD-214 applied to
--     `billing.resolve_capability_effective`, and the reason the six-argument
--     overload (`platform.log_activity(…, p_actor uuid)`, used by the trigger
--     `platform.emit_run_lifecycle`) is untouched: no client holds EXECUTE on it,
--     so it is not a door.
--
-- The body becomes `plpgsql` for one reason only: a `LANGUAGE sql` function
-- cannot raise, and a refusal that is not an error is a silent failure. The
-- INSERT, its column list, its `auth.uid()` stamp and the `RETURNING id` contract
-- are unchanged, so every in-database caller (`crm_merge_parties`,
-- `crm_unmerge_parties`, `crm_party_purge`, `crm_dismiss_merge_candidate`,
-- `crm.ensure_user_party`) sees the same bigint it saw before.

CREATE OR REPLACE FUNCTION platform.log_activity(p_org uuid, p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_id    bigint;
begin
  -- 🚨 DD-214c (the DD-213 class): an organization's activity log records its own
  -- organization's work. `p_org` is a CLAIM and it is checked BEFORE the insert.
  -- Until 2026-09-14 any signed-in account wrote an arbitrary action, entity and
  -- metadata into ANY organization's feed, repeatably, for free.
  if v_actor is not null
     and p_org is not null
     and not iam.has_org_access_for(v_actor, p_org)
     and not public.is_platform_admin() then
    raise exception 'An organization''s activity log records that organization''s own work. You have no standing in that organization, so nothing was written to its log.'
      using errcode = '42501';
  end if;

  insert into platform.activity_log (organization_id, action, entity_type, entity_id, actor_id, metadata)
  values (p_org, p_action, p_entity_type, p_entity_id, v_actor, p_metadata)
  returning id into v_id;

  return v_id;
end;
$function$;

COMMENT ON FUNCTION platform.log_activity(uuid, text, text, uuid, jsonb) IS
  'DD-214c: the organization argument is a claim, checked against iam.has_org_access_for before a row is written into that organization''s activity log. Platform admins and the server''s own NULL-actor lane are unchanged. The DD-213 ruling — an organization''s log records its own people, never a stranger''s knock — applied to platform.activity_log.';

UPDATE platform.client_callable_door d
   SET gate_predicate = 'iam.has_org_access_for(auth.uid(), p_org) or public.is_platform_admin() (DD-214c)',
       reason = 'SIGNED-IN door (authenticated only; anon revoked by DD-169 batch 1). DD-214c: signed in is not standing — the organization argument is now checked against iam.has_org_access_for before anything is written to that organization''s activity log.'
 WHERE d.schema_name = 'platform'
   AND d.function_name = 'log_activity'
   AND d.identity_args = 'p_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb';

-- ── the file proves it before it commits ────────────────────────────────────
DO $dd214c$
DECLARE
  v_stranger constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com
  v_theirs   constant uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';  -- Castellano & Reyes, LLP
  v_mine     constant uuid := '8cb71c8b-5b49-4563-a5fe-d77ff600f8ee';  -- Test's Org
  v_before   bigint;
  v_id       bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stranger, 'role','authenticated','aud','authenticated')::text, true);

  SELECT count(*) INTO v_before FROM platform.activity_log WHERE organization_id = v_theirs;
  BEGIN
    PERFORM platform.log_activity(v_theirs, 'dd214c.probe', null, null, '{}'::jsonb);
    RAISE EXCEPTION 'dd214c: a stranger wrote into another organization''s activity log. The gate is not in force.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF (SELECT count(*) FROM platform.activity_log WHERE organization_id = v_theirs) <> v_before THEN
    RAISE EXCEPTION 'dd214c: the refusal still wrote a row into that organization''s log.';
  END IF;
  RAISE NOTICE 'dd214c: stranger refused, 0 rows written into %', v_theirs;

  -- A member still writes, exactly as before — proven, and then UNDONE. The probe
  -- row is rolled back by raising out of its own sub-block rather than deleted:
  -- `platform.activity_log` carries a DELETE trigger (`platform._gc_entity_associations`)
  -- that itself raises `42883 operator does not exist: uuid = bigint` on this
  -- table's bigint key, so a DELETE cleanup cannot run here. A forcing test never
  -- leaves a row behind, and it never routes around a defect it found either:
  -- that trigger bug is real, it is NOT this file's, and it is reported as found.
  BEGIN
    v_id := platform.log_activity(v_mine, 'dd214c.probe', null, null, '{}'::jsonb);
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'dd214c: a member of the organization could not write to its own activity log. The gate is too tight.';
    END IF;
    RAISE EXCEPTION 'dd214c-probe-wrote:%', v_id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'dd214c-probe-wrote:%' THEN RAISE; END IF;
    RAISE NOTICE 'dd214c: member wrote into their own organization''s log (% — rolled back, no row left behind)', SQLERRM;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
END
$dd214c$;
