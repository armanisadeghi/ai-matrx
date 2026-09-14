-- DD-214b — the member read has to clear the RESTRICTIVE wall, and `plan_status`
-- keeps the key DD-173 gave it.
--
-- TWO THINGS DD-214 GOT WRONG, BOTH CAUGHT BY ITS OWN GREEN PROOF (2026-09-14),
-- both fixed here. Neither is theory: each was measured failing after that file
-- applied, and each is re-measured passing after this one.
--
-- ═══ 1. A PERMISSIVE POLICY CANNOT OPEN A RESTRICTIVE WALL ═══════════════════
-- `billing.org_plan` carries THREE policies, and the third is the one that
-- decides: `platform_admin_only` is RESTRICTIVE `FOR ALL`. A restrictive policy
-- is ANDed with the permissive set, so DD-214's `org_plan_member_read` was
-- created, was correct, and changed nothing at all — measured as test@test.com
-- on their OWN organization `8cb71c8b-…` after DD-214 applied: `iam.my_orgs()`
-- returned 2 organizations and `select organization_id, plan_id from
-- billing.org_plan` still returned 0 rows. The ruling's whole point — a member
-- reads their own organization's plan — was still not true.
--
-- THE SHAPE THE PLATFORM ALREADY USES FOR EXACTLY THIS. `billing.usage_ledger`
-- and `rag.retrieval_audit` were here first and B-57 wrote the answer down in
-- `migrations/platform_restrictive_walls_and_class_variant_dd163_dd174c_apply.sql`:
-- keep the admin-only wall on the WRITE commands, where "only the platform
-- writes this" is the actual rule, and leave SELECT to the permissive policies.
-- Both tables carry `platform_admin_{insert,update,delete}_only` today and no
-- restrictive SELECT wall. `billing.org_plan` gets the identical shape, with the
-- identical predicate, so the write axis does not move one inch:
--
--   before   RESTRICTIVE ALL    is_platform_admin()         (select AND writes)
--   after    RESTRICTIVE INSERT is_platform_admin()  (with check)
--            RESTRICTIVE UPDATE is_platform_admin()  (using + with check)
--            RESTRICTIVE DELETE is_platform_admin()  (using)
--
-- SELECT then resolves on the permissive set alone — `platform_admin_all` OR
-- `org_plan_member_read` — which is the ruling, stated once, where the rows are.
-- The drop goes through `iam.supersede_bespoke_policies` (DD-147), so the removal
-- is recorded in `iam.superseded_policy` with its reason instead of being a bare
-- `DROP POLICY` nobody can account for later.
--
-- ═══ 2. A BODY IS PATCHED FROM THE CATALOGUE AS IT IS *NOW* ══════════════════
-- 🚨 DD-214 rewrote `billing.plan_status` from a `pg_get_functiondef` dump taken
-- at the START of that lane's session. `billing_plan_uuid_identity_dd173.sql`
-- applied in between: it renamed `billing.plan.id` to `plan_key`, gave the table
-- a uuid `id`, and rewrote `plan_status` onto the new column — including
-- replacing `to_jsonb(v_row)` with an explicit seventeen-key object so the
-- retrofit's `organization_id`, `created_by`, `updated_by`, `version` and
-- `visibility` could never start leaking onto the wire. Re-applying the older
-- body put `where id = v_plan` back and the door died for EVERYBODY —
--
--   billing.plan_status(<any org>) -> ERROR 42883: operator does not exist: uuid = text
--   LINE 1: select * from billing.plan where id = v_plan
--
-- — measured as admin@admin.com and as a member, immediately after DD-214.
-- A door that raises for its rightful callers is not a narrower door, it is a
-- broken one, and it took DD-173's disclosure fix down with it.
--
-- THE RULE THIS RESTATES, because it has now cost two lanes:
-- **A FUNCTION IS PATCHED FROM THE LIVE CATALOGUE AT THE MOMENT YOU WRITE THE
-- PATCH, NEVER FROM A COPY TAKEN EARLIER.** (matrx-frontend db-rules §6d records
-- the same lesson from the generator side: "A GENERATOR IS PATCHED FROM THE
-- CATALOG, NEVER REPLACED FROM A FILE.") In a shared checkout with peer lanes
-- applying migrations to the same database, "earlier in this session" is old.
--
-- The body below is DD-173's, verbatim from that file, with DD-214's gate added
-- and nothing else changed: `plan_key` lookups, the explicit key objects, the
-- audience comment, the dimension loop and the key order all as DD-173 left them.
-- The other three DD-214 doors (`entitlement_check(text,uuid)`,
-- `org_capability_status(uuid)`, `resolve_capability_effective(uuid,text,uuid)`)
-- are NOT touched by DD-173 — they reach `billing.plan` only through
-- `billing.resolve_capability`, which DD-173 patched separately — and all three
-- were re-measured answering correctly for a member and refusing a stranger, so
-- they stand as DD-214 left them.

-- ── 1. the wall becomes write-only, the member read comes through ────────────
SELECT iam.supersede_bespoke_policies(
  'billing', 'org_plan', array['platform_admin_only'],
  'DD-214b: this RESTRICTIVE FOR ALL wall also covered SELECT, so it silently voided the member read DD-214 put on the table and no organization could see its own plan. Replaced, in this same migration, by the command-scoped write walls platform_admin_{insert,update,delete}_only — the identical predicate, the shape billing.usage_ledger and rag.retrieval_audit already carry (B-57, DD-163/DD-174) — so the write axis is unchanged and SELECT resolves on the permissive policies alone.');

CREATE POLICY platform_admin_insert_only ON billing.org_plan
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY platform_admin_update_only ON billing.org_plan
  AS RESTRICTIVE FOR UPDATE TO public
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

CREATE POLICY platform_admin_delete_only ON billing.org_plan
  AS RESTRICTIVE FOR DELETE TO public
  USING ((SELECT public.is_platform_admin()));

-- ── 2. plan_status: DD-173's body, with DD-214's gate ────────────────────────
CREATE OR REPLACE FUNCTION billing.plan_status(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $fn$
declare
  v_user  uuid := auth.uid();
  v_plan  text;
  v_row   billing.plan%rowtype;
  v_next  billing.plan%rowtype;
  v_dims  jsonb := '[]'::jsonb;
  r       record;
  v_res   jsonb;
begin
  if v_user is null then
    return jsonb_build_object('signed_in', false, 'plan', null, 'dimensions', '[]'::jsonb);
  end if;

  -- 🚨 DD-214: an organization's plan is its members' to see. `p_org` is a CLAIM.
  -- This door returns the organization's whole plan row — key, name, rank, seat
  -- model, price band — plus its per-dimension usage. It is the single widest
  -- disclosure in the family, and it was open to any signed-in caller.
  if p_org is not null
     and not iam.has_org_access_for(v_user, p_org)
     and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;

  v_plan := billing.resolve_plan(p_org);
  select * into v_row from billing.plan where plan_key = v_plan;
  -- The next plan up WITHIN THE SAME AUDIENCE — what "upgrade" means here.
  --
  -- Audience matters: ranking personal and company plans on one line makes the
  -- plan after Max ($199, 1.4M points) come out as Team ($39/seat, 260k) — an
  -- "upgrade" that gives less on every dimension. A personal account upgrades
  -- along the personal ladder; moving to a company plan is a different decision
  -- and belongs on the pricing page, not in an inline nudge. Free sits outside
  -- both ladders, so it points at the entry-level personal plan.
  -- NULL next_plan is a real answer: they are on the top plan, and the surface
  -- says so instead of inventing somewhere to send them.
  select * into v_next from billing.plan
    where active and is_public and rank > coalesce(v_row.rank, 0)
      and audience = case when coalesce(v_row.audience,'free') = 'free'
                          then 'personal' else v_row.audience end
    order by rank limit 1;

  for r in
    select c.capability, c.period, c.enforced
    from billing.capability c
    join billing.plan_limit pl on pl.capability = c.capability
    where pl.plan_id = v_plan
    order by c.capability
  loop
    v_res := billing.resolve_capability(v_user, r.capability, p_org);
    v_dims := v_dims || jsonb_build_array(jsonb_build_object(
      'capability', r.capability,
      'period',     r.period,
      'enforced',   r.enforced,
      'used',       v_res->'used',
      'limit',      v_res->'limit',
      'remaining',  v_res->'remaining',
      'unlimited',  (v_res->'limit') = 'null'::jsonb,
      'from_addon', coalesce(v_res->'from_addon', 'false'::jsonb),
      'resets_at',  v_res->'windows'->0->'resetsAt',
      'next_plan_limit', (
        select pl2.limit_value from billing.plan_limit pl2
        where pl2.plan_id = v_next.plan_key and pl2.capability = r.capability
          and pl2.period is not distinct from r.period)
    ));
  end loop;

  -- 🚨 `to_jsonb(v_row)` / `to_jsonb(v_next)` are GONE — DD-173. The object below is
  --    THE EXACT KEY SET THE WHOLE-ROW SPREAD PRODUCED BEFORE THAT FILE: all seventeen
  --    columns billing.plan had, with `id` carrying the plan_key. Nothing is added and
  --    nothing is dropped — a whole-row spread would have started publishing
  --    organization_id, created_by, updated_by, version and visibility to every
  --    signed-in browser the moment the retrofit added them, and nothing would have
  --    raised.
  return jsonb_build_object(
    'signed_in', true,
    'organization_id', p_org,
    'plan', case when v_row.plan_key is null then null else jsonb_build_object(
      'id', v_row.plan_key, 'name', v_row.name, 'audience', v_row.audience,
      'tagline', v_row.tagline, 'rank', v_row.rank, 'tier', v_row.tier,
      'monthly_cents', v_row.monthly_cents, 'annual_cents', v_row.annual_cents,
      'per_seat', v_row.per_seat, 'min_seats', v_row.min_seats,
      'badge', v_row.badge, 'is_public', v_row.is_public,
      'is_default', v_row.is_default, 'active', v_row.active,
      'metadata', v_row.metadata, 'created_at', v_row.created_at,
      'updated_at', v_row.updated_at) end,
    'next_plan', case when v_next.plan_key is null then null else jsonb_build_object(
      'id', v_next.plan_key, 'name', v_next.name, 'audience', v_next.audience,
      'tagline', v_next.tagline, 'rank', v_next.rank, 'tier', v_next.tier,
      'monthly_cents', v_next.monthly_cents, 'annual_cents', v_next.annual_cents,
      'per_seat', v_next.per_seat, 'min_seats', v_next.min_seats,
      'badge', v_next.badge, 'is_public', v_next.is_public,
      'is_default', v_next.is_default, 'active', v_next.active,
      'metadata', v_next.metadata, 'created_at', v_next.created_at,
      'updated_at', v_next.updated_at) end,
    'tier', billing.resolve_effective_tier(v_user, p_org),
    'dimensions', v_dims);
end;
$fn$;

COMMENT ON FUNCTION billing.plan_status(uuid) IS
  'DD-214: the organization argument is a claim, checked against iam.has_org_access_for before the organization''s plan is disclosed. DD-173''s plan_key body and explicit key set, restored by DD-214b after DD-214 re-applied a stale copy.';

-- ── 3. the file proves both halves before it commits ─────────────────────────
DO $dd214b$
DECLARE
  v_member  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com
  v_mine    constant uuid := '8cb71c8b-5b49-4563-a5fe-d77ff600f8ee';  -- Test's Org (they are a member)
  v_other   constant uuid := '7cd12da2-2213-4378-8fba-a9e2dc4ea657';  -- Castellano & Reyes, LLP (they are not)
  v_plan    text;
BEGIN
  -- (a) plan_status answers again, for a caller with standing, on the live bodies.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role','authenticated','aud','authenticated')::text, true);
  v_plan := billing.plan_status(v_mine) #>> '{plan,id}';
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'dd214b: plan_status returned no plan id for a member of their own organization. The door is still broken.';
  END IF;
  RAISE NOTICE 'dd214b: plan_status(own org) -> %', v_plan;

  -- (b) and still refuses a stranger.
  BEGIN
    PERFORM billing.plan_status(v_other);
    RAISE EXCEPTION 'dd214b: plan_status disclosed an organization the caller has no standing in. DD-214 is not in force.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'dd214b: plan_status(stranger org) refused, as DD-214 requires';
  END;

  -- (c) the wall: exactly one restrictive SELECT policy would be one too many.
  IF EXISTS (SELECT 1 FROM pg_policy p
              WHERE p.polrelid = 'billing.org_plan'::regclass
                AND NOT p.polpermissive AND p.polcmd IN ('r','*')) THEN
    RAISE EXCEPTION 'dd214b: a RESTRICTIVE policy still covers SELECT on billing.org_plan, so the member read is still dead text.';
  END IF;
  IF (SELECT count(*) FROM pg_policy p
       WHERE p.polrelid = 'billing.org_plan'::regclass
         AND NOT p.polpermissive AND p.polcmd IN ('a','w','d')) <> 3 THEN
    RAISE EXCEPTION 'dd214b: the three command-scoped write walls are not all present on billing.org_plan. The write axis must not move.';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
END
$dd214b$;
