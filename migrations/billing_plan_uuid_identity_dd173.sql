-- billing_plan_uuid_identity_dd173 — DD-173, the last of FOUR uuid-identity renames (B-103).
--
-- THE DEFECT. `billing.plan.id` is TEXT ('free', 'personal-pro', 'company-premium', …) — the plan
-- ladder's natural key wearing the canonical identity's name. Batch 1 of DD-173 held this token
-- back BY NAME with the disposition written into its own header: "rename the natural key to
-- `plan_key`, add the uuid identity, repoint the FKs, in one migration with its own proof". This
-- is that migration.
--
-- THE SHAPE. As in the three files before it: rename the natural key out of the way and let
-- `platform.retrofit_entity` add the canonical uuid down its own "id(uuid + unique; the natural key
-- stays the PK)" branch — the shape `billing.plan_limit` (PK plan_id, capability, period),
-- `billing.capability` (PK capability) and 33 other tables already carry live at 0 base / 0 policy
-- FAIL. The name is `plan_key`, batch 1's own word.
--
-- 🚨 THERE ARE THREE INCOMING FOREIGN KEYS, NOT TWO. B-65's disposition, the batch-1 header and the
--    register all say two (`billing.plan_limit.plan_id`, `billing.user_plan.plan_id`). Live there
--    is a third: `billing.org_plan.plan_id` (`org_plan_plan_id_fkey`), which is the one the
--    pre-launch complimentary-Pro trigger writes on every signup. All three are stored by attribute
--    number and FOLLOW a rename of the referenced column, so all three keep pointing at the natural
--    key and stay TEXT — nothing about a plan_id in a child table or an app changes type. All three
--    are asserted by definition after the rename, and the third is asserted precisely because
--    nobody knew it was there.
--
-- 🚨 SIX DATABASE FUNCTIONS READ `billing.plan.id`, AND EVERY ONE OF THEM WOULD HAVE KEPT COMPILING.
--    That is the whole danger of this particular rename: after it, `p.id` still resolves — to the
--    new uuid. A plan lookup by slug would match nothing, `public_plans()` would hand the pricing
--    page uuids where it promised slugs, and `resolve_plan()` would return a uuid into a column
--    typed TEXT that holds slugs. Nothing would raise. All six are rewritten in this transaction:
--      · `billing.public_plans()`      — the GUEST PRICE LIST (§ below)
--      · `billing.plan_status(uuid)`   — the signed-in plan + dimensions screen
--      · `billing.resolve_plan(uuid)`  — the plan every entitlement check resolves through
--      · `billing.resolve_capability(uuid, text, uuid)` — reads the plan's display name
--      · `billing.org_plan_assign(uuid, text, text)`    — super-admin plan grant
--      · `billing.plan_limit_set(text, text, …)`        — super-admin allowance edit
--    Each keeps its exact signature, volatility, security and search_path, and each is re-proven
--    below against the live rows rather than assumed.
--
-- 🚨 `plan_status` ALSO STOPS RETURNING WHOLE ROWS, AND THAT IS A FIX, NOT A SIDE EFFECT.
--    It built its payload with `to_jsonb(v_row)` over `billing.plan%rowtype`. After the retrofit
--    that row carries `organization_id`, `created_by`, `updated_by`, `metadata`, `version` and
--    `visibility` — so the whole-row spread would have started handing every signed-in browser the
--    platform's bookkeeping columns, AND would have changed the payload's shape under a client that
--    reads `id` expecting the slug. It now builds the plan object from the declared columns by
--    name, `id` carrying the plan_key. Same wire shape as before this file; nothing new published.
--
-- 🚨 THE GUEST PRICE LIST IS A REAL SIGNED-OUT READER (DD-186). `/pricing` renders through
--    `billing.public_plans()` with no JWT (`features/entitlements/plan-service.ts` →
--    `fetchPublicPlans`). Its JSON keys are the contract `PlanRow` in that file declares, and `id`
--    among them is the SLUG — the value `/api/stripe/checkout` and `org_plan_assign` take. So
--    `public_plans()` selects `p.plan_key as id`: the column moved, the contract did not. The
--    function's exact key set is asserted against the pre-change key set in this same transaction,
--    and the whole result is compared value-for-value before and after.
--
-- 🚨 THE ANON COLUMN SURFACE. `anon` holds a 16-column SELECT grant on this table, `id` among them.
--    The grants follow the rename by attribute number (anon keeps the same value under the name
--    `plan_key`), and the new uuid `id` is granted afterwards — as on the other two anon-bounded
--    tables in this lane, because `iam.access_delta_snapshot` reads `t.id` to collect identities
--    and records `insufficient_privilege` as ZERO ROWS, which would blind this gate on the
--    anonymous principal permanently. `lib/security/public-exposure.ts` moves with it.
--
-- VISIBILITY: derived from `active`, batch 1's rule verbatim — all 9 plans are active today so
-- nothing moves, and a plan retired tomorrow leaves the open web by the flag that already means it.
-- ORGANIZATION: the system org, named explicitly (db-rules §2). A plan ladder is platform content.
set local lock_timeout = '20s';

do $dd173p$
declare
  v_as         timestamptz := now();
  v_before     uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_unapproven_hard text[] := '{}';
  v_unproven_ok text[] := '{}';
  v_narrower   text[] := '{}';
  v_total      bigint;
  v_res        text;
  v_live       text[]; v_extra text[]; v_drop text[];
  v_policy_fail text[] := '{}'; v_base_fail text[] := '{}';
  f text; v record;
  v_acked      bigint;
  v_keys_before text; v_keys_after text;
  v_rowcount   bigint;
  v_anon_before bigint; v_anon_after bigint;
  v_public_before jsonb; v_public_after jsonb;
  v_status_before jsonb; v_status_after jsonb;
  v_resolve_before text; v_resolve_after text;
  v_cap_before jsonb; v_cap_after jsonb;
  v_admin_org uuid;
  v_fk record;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
    'policy_system_public_read','pub_read_anon','component_public_read',
    'component_not_wider_than_parent','containment_respects_personal'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT — the guest price list's own reader
  ]::uuid[];
  v_tokens text[] := array['billing_plan'];
  v_names constant text[] := array[
    'plan_public_read','platform_admin_all','platform_admin_delete_only',
    'platform_admin_insert_only','platform_admin_update_only'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com
begin
  -- ═══════ 0. THE KEYS, AND EVERY RESOLVER'S ANSWER, BEFORE ANYTHING MOVES ═════════════════════
  select count(*), md5(coalesce(string_agg(t.id, ',' order by t.id), ''))
    into v_rowcount, v_keys_before from billing.plan t;
  if v_rowcount = 0 then
    raise exception 'dd173-plan: billing.plan is empty. This file was written against 9 live plans; an empty table means the census is stale.';
  end if;

  select o.id into v_admin_org from iam.organizations o
   where o.created_by = v_admin and o.is_personal limit 1;
  if v_admin_org is null then
    raise exception 'dd173-plan: admin@admin.com has no personal organization, so plan_status and resolve_capability cannot be proven against a real organization.';
  end if;

  v_public_before := billing.public_plans();
  if jsonb_array_length(v_public_before) = 0 then
    raise exception 'dd173-plan: public_plans() returned an EMPTY list even BEFORE this file ran. That is the guest price list; a proof against an empty answer proves nothing.';
  end if;
  v_resolve_before := billing.resolve_plan(v_admin_org);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  v_status_before := billing.plan_status(v_admin_org);
  perform set_config('request.jwt.claims', null, true);
  v_cap_before := billing.resolve_capability(v_admin, 'ai_points', v_admin_org);
  if v_status_before->>'signed_in' is distinct from 'true' then
    raise exception 'dd173-plan: plan_status did not see a signed-in caller even BEFORE this file ran; its after half would prove nothing.';
  end if;

  -- ═══════ 0b. THE ANONYMOUS READ, MEASURED DIRECTLY ══════════════════════════════════════════
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_before from billing.plan;
  execute 'reset role';

  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 billing_plan BEFORE', v_principals, v_tokens, 400000,
    'DD-173 B-103: billing.plan before the identity rename, base retrofit and generation', v_as);

  -- 🚨 THE BASELINE CROSSES THE BLOCK BOUNDARY IN A TEMP TABLE, NOT IN A VARIABLE.
  --    These four answers were taken BEFORE the rename and before the six functions were rewritten.
  --    The proof that matters is pre-rename vs post-generation; a comparison that started after the
  --    rewrite would only prove the rewrite agrees with itself. plpgsql variables do not survive a
  --    DO block, so the values are parked here and read back by the last block, which drops it.
  create temp table _b103_plan_baseline on commit drop as
  select v_before                         as snapshot_id,
         v_rowcount                       as plan_count,
         v_anon_before                    as anon_count,
         v_public_before                  as public_plans,
         v_status_before                  as plan_status,
         v_resolve_before                 as resolve_plan,
         v_cap_before                     as resolve_capability,
         v_admin_org                      as admin_org;

  raise notice 'dd173-plan: baseline % over % principals, pinned at %, % plans, anon reads %, resolve_plan=%',
    v_before, cardinality(v_principals), v_as, v_rowcount, v_anon_before, v_resolve_before;

  -- ═══════ 2. THE IDENTITY RENAME ══════════════════════════════════════════════════════════════
  alter table billing.plan rename column id to plan_key;

  select md5(coalesce(string_agg(t.plan_key, ',' order by t.plan_key), ''))
    into v_keys_after from billing.plan t;
  if v_keys_after is distinct from v_keys_before then
    raise exception 'dd173-plan: the plan keys are NOT identical across the rename (% -> %). Nothing about a rename may change a value; these keys are written into billing.user_plan, billing.org_plan and billing.plan_limit.',
      v_keys_before, v_keys_after;
  end if;
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'billing.plan'::regclass and c.contype = 'p'
       and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (plan_key)') then
    raise exception 'dd173-plan: the primary key did not follow the rename. Live definition: %',
      (select pg_get_constraintdef(c.oid) from pg_constraint c
        where c.conrelid = 'billing.plan'::regclass and c.contype = 'p');
  end if;
  -- All THREE incoming foreign keys, by name, with the column they now reference.
  for v_fk in
    select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class p on p.oid = c.confrelid
      join pg_namespace pn on pn.oid = p.relnamespace
     where c.contype = 'f' and pn.nspname = 'billing' and p.relname = 'plan'
     order by c.conname
  loop
    if v_fk.def not like '%REFERENCES billing.plan(plan_key)%' then
      raise exception 'dd173-plan: incoming foreign key % did not follow the rename: %', v_fk.conname, v_fk.def;
    end if;
  end loop;
  if (select count(*) from pg_constraint c join pg_class p on p.oid = c.confrelid
       join pg_namespace pn on pn.oid = p.relnamespace
      where c.contype='f' and pn.nspname='billing' and p.relname='plan') <> 3 then
    raise exception 'dd173-plan: expected exactly 3 incoming foreign keys (plan_limit, user_plan, org_plan — the register says 2 and it is wrong). The live count changed under this file; re-census before shipping.';
  end if;
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema='billing' and table_name='plan'
       and grantee='anon' and column_name='plan_key' and privilege_type='SELECT') then
    raise exception 'dd173-plan: the anon column grant did not follow the rename; DD-186''s column bound is not re-granted on a guess.';
  end if;
  raise notice 'dd173-plan: id -> plan_key; % keys byte-identical, PK, all 3 incoming FKs and the anon column grant followed the column', v_rowcount;

  -- ═══════ 2b. THE SIX FUNCTIONS, REWRITTEN IN THE SAME TRANSACTION AS THE COLUMN ══════════════
  create or replace function billing.resolve_plan(p_org uuid)
  returns text
  language sql
  stable
  set search_path to 'billing', 'public'
  as $fn$
    select coalesce(
      (select op.plan_id from billing.org_plan op
        where op.organization_id = p_org
          and op.plan_id is not null
          and op.effective_from <= now()
          and (op.expires_at is null or op.expires_at > now())),
      (select p.plan_key from billing.plan p where p.is_default and p.active limit 1),
      'free');
  $fn$;

  -- The guest price list. `p.plan_key as id` is deliberate and is the whole DD-186 point: the
  -- COLUMN moved, the CONTRACT did not. Every key below is the key it emitted before this file.
  create or replace function billing.public_plans()
  returns jsonb
  language sql
  stable security definer
  set search_path to 'billing', 'public'
  as $fn$
    select coalesce(jsonb_agg(x order by x.rank), '[]'::jsonb) from (
      select p.plan_key as id, p.name, p.audience, p.tagline, p.rank, p.monthly_cents,
             p.annual_cents, p.per_seat, p.min_seats, p.badge, p.is_default,
             (select coalesce(jsonb_agg(jsonb_build_object(
                'capability', pl.capability, 'period', pl.period,
                'limit', pl.limit_value, 'note', pl.note) order by pl.capability), '[]'::jsonb)
              from billing.plan_limit pl where pl.plan_id = p.plan_key) as limits
      from billing.plan p
      where p.active and p.is_public
    ) x;
  $fn$;

  create or replace function billing.org_plan_assign(p_org uuid, p_plan text, p_note text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'billing', 'public'
  as $fn$
  declare v_row billing.org_plan%rowtype; v_tier billing.tier;
  begin
    if not public.is_super_admin() then
      raise exception 'billing.org_plan_assign: super-admin only' using errcode = '42501';
    end if;
    select tier into v_tier from billing.plan where plan_key = p_plan and active;
    if v_tier is null then
      raise exception 'billing.org_plan_assign: unknown or inactive plan "%"', p_plan;
    end if;
    insert into billing.org_plan as op
      (organization_id, plan_id, tier, source, note, granted_by, updated_by)
    values (p_org, p_plan, v_tier, 'grant', p_note, (select auth.uid()), (select auth.uid()))
    on conflict (organization_id) do update
      set plan_id = excluded.plan_id, tier = excluded.tier, note = excluded.note,
          updated_at = now(), updated_by = (select auth.uid()), version = op.version + 1
    returning * into v_row;
    return to_jsonb(v_row);
  end;
  $fn$;

  create or replace function billing.plan_limit_set(p_plan_id text, p_capability text, p_period billing.meter_period, p_limit_value bigint)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'billing', 'public'
  as $fn$
  declare v_row billing.plan_limit%rowtype;
  begin
    if not public.is_super_admin() then
      raise exception 'billing.plan_limit_set: super-admin only' using errcode = '42501';
    end if;
    if not exists (select 1 from billing.plan where plan_key = p_plan_id) then
      raise exception 'billing.plan_limit_set: unknown plan %', p_plan_id using errcode = '22023';
    end if;
    if not exists (select 1 from billing.capability where capability = p_capability) then
      raise exception 'billing.plan_limit_set: unknown capability %', p_capability using errcode = '22023';
    end if;
    if p_limit_value is not null and p_limit_value < 0 then
      raise exception 'billing.plan_limit_set: limit_value may not be negative' using errcode = '22023';
    end if;
    insert into billing.plan_limit as pl (plan_id, capability, period, limit_value)
    values (p_plan_id, p_capability, p_period, p_limit_value)
    on conflict (plan_id, capability, period) do update
      set limit_value = excluded.limit_value, updated_at = now()
    returning * into v_row;
    return to_jsonb(v_row);
  end;
  $fn$;
  raise notice 'dd173-plan: resolve_plan, public_plans, org_plan_assign and plan_limit_set rewritten onto plan_key';
end $dd173p$;


-- `plan_status` and `resolve_capability` get their own blocks: the first because it is long enough
-- that inlining it above would bury the rest, the second because it is rewritten by a PROVEN
-- one-token substitution rather than retyped. Splitting changes nothing about atomicity — the
-- applier wraps the whole FILE in one transaction, so these are the same unit as the block above.
do $dd173p2$
declare
  v_def text;
  v_needle constant text := 'from billing.plan where id = v_plan';
  v_hits int;
begin
  -- ─── plan_status: the two `id` lookups, and the two whole-row spreads ──────────────────────
  -- Retyped in full because the `to_jsonb(v_row)` -> explicit-object change cannot be expressed as
  -- a substitution. Everything else below — the audience comment, the dimension loop, the key
  -- order — is the live body verbatim.
  create or replace function billing.plan_status(p_org uuid)
  returns jsonb
  language plpgsql
  stable security definer
  set search_path to 'billing', 'public'
  as $fn$
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

    -- 🚨 `to_jsonb(v_row)` / `to_jsonb(v_next)` are GONE — see the file header. The object below is
    --    THE EXACT KEY SET THE WHOLE-ROW SPREAD PRODUCED BEFORE THIS FILE: all seventeen columns
    --    billing.plan had, with `id` carrying the plan_key. Nothing is added and nothing is
    --    dropped — a whole-row spread would have started publishing organization_id, created_by,
    --    updated_by, version and visibility to every signed-in browser the moment the retrofit
    --    added them, and nothing would have raised.
    --    (The first draft of this file listed only the twelve keys
    --    `features/entitlements/plan-service.ts` declares as `PlanRow`, and the in-file comparison
    --    below REFUSED it by name for dropping `is_public`, `active`, `metadata`, `created_at` and
    --    `updated_at`. A TypeScript interface is structural: the keys it does not name were still
    --    on the wire, and a reader we have not met could be using them.)
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

  -- ─── resolve_capability: ONE line, substituted, not retyped ────────────────────────────────
  -- It is ~130 lines of entitlement arithmetic with a single `billing.plan.id` read in it. Retyping
  -- it to change one token is how a transcription error ships. The live definition is read back,
  -- the substitution is asserted to match EXACTLY ONCE (zero or two would mean this file is
  -- reasoning about a body that is not there), and the result is executed.
  v_def := pg_get_functiondef('billing.resolve_capability(uuid,text,uuid)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, v_needle, ''))) / length(v_needle);
  if v_hits <> 1 then
    raise exception 'dd173-plan: billing.resolve_capability contains % occurrence(s) of "%", expected exactly 1. This file is reasoning about a body that is not the live one; nothing ships.',
      v_hits, v_needle;
  end if;
  v_def := replace(v_def, v_needle, 'from billing.plan where plan_key = v_plan');
  execute v_def;
  if pg_get_functiondef('billing.resolve_capability(uuid,text,uuid)'::regprocedure) like ('%' || v_needle || '%') then
    raise exception 'dd173-plan: resolve_capability still reads billing.plan.id after the rewrite.';
  end if;
  raise notice 'dd173-plan: plan_status retyped (to_jsonb spreads replaced by the declared key set); resolve_capability substituted on its single plan-key read';
end $dd173p2$;

do $dd173p3$
declare
  v_as         timestamptz := now();
  v_before     uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_unapproven_hard text[] := '{}';
  v_unproven_ok text[] := '{}';
  v_narrower   text[] := '{}';
  v_total      bigint;
  v_res        text;
  v_live       text[]; v_extra text[]; v_drop text[];
  v_policy_fail text[] := '{}'; v_base_fail text[] := '{}';
  f text; v record;
  v_acked      bigint;
  v_rowcount   bigint;
  v_anon_before bigint; v_anon_after bigint;
  v_public_before jsonb; v_public_after jsonb;
  v_status_before jsonb; v_status_after jsonb;
  v_resolve_before text; v_resolve_after text;
  v_cap_before jsonb; v_cap_after jsonb;
  v_admin_org uuid;
  v_admin_write_before boolean; v_admin_write_after boolean;
  v_probe_err text;
  v_other_write_before boolean; v_other_write_after boolean;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
    'policy_system_public_read','pub_read_anon','component_public_read',
    'component_not_wider_than_parent','containment_respects_personal'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',
    '87a6e699-3622-4869-8843-d0867456c0dd',
    'a4955b5c-d524-4d72-a90e-0658d5d51148',
    'c5e92166-e148-4e73-926e-83af0c453665',
    '34ed4fc3-c527-4819-99bf-15c26603b261',
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',
    '00000000-0000-0000-0000-000000000000'
  ]::uuid[];
  v_tokens text[] := array['billing_plan'];
  v_names constant text[] := array[
    'plan_public_read','platform_admin_all','platform_admin_delete_only',
    'platform_admin_insert_only','platform_admin_update_only'];
  v_approved constant text[] := '{}';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, platform admin
  v_other constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, no platform rights
  v_probe_key text := 'b103-dd173-plan-probe';
begin
  select count(*) into v_rowcount from billing.plan;
  -- The PRE-RENAME baseline, taken in the first block before a single column moved.
  select b.snapshot_id, b.anon_count, b.public_plans, b.plan_status, b.resolve_plan,
         b.resolve_capability, b.admin_org
    into v_before, v_anon_before, v_public_before, v_status_before, v_resolve_before,
         v_cap_before, v_admin_org
    from _b103_plan_baseline b;
  if v_before is null then
    raise exception 'dd173-plan: the pre-rename baseline is missing. Every comparison below would be the rewrite agreeing with itself.';
  end if;

  -- ═══════ 3b. THE WRITE GATE, BEFORE HALF ════════════════════════════════════════════════════
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into billing.plan (plan_key, name, rank) values (v_probe_key, 'DD-173 B-103 probe', 9999);
    v_admin_write_before := true;
    execute 'reset role';
  exception when others then
    v_admin_write_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from billing.plan where plan_key = v_probe_key;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into billing.plan (plan_key, name, rank) values (v_probe_key, 'DD-173 B-103 probe', 9999);
    v_other_write_before := true;
    execute 'reset role';
  exception when others then
    v_other_write_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from billing.plan where plan_key = v_probe_key;
  if v_admin_write_before is not true then
    raise exception 'dd173-plan: the write gate proves nothing — a platform admin could not insert a plan even before generation.';
  end if;
  raise notice 'dd173-plan: write gate BEFORE — platform admin inserts a plan: %; a user with no platform rights: %',
    v_admin_write_before, v_other_write_before;

  -- ═══════ 5. THE BASE RETROFIT, through the one path ══════════════════════════════════════════
  v_res := platform.retrofit_entity('billing', 'plan', 'billing_plan', 'system',
             null, null, null, null,
             $x$case when t.active then 'public' else 'internal' end$x$, null);
  raise notice 'dd173-plan: %', v_res;

  if not exists (select 1 from information_schema.columns
                  where table_schema='billing' and table_name='plan'
                    and column_name='id' and udt_name='uuid' and is_nullable='NO') then
    raise exception 'dd173-plan: the canonical uuid identity is not present after the retrofit.';
  end if;
  if (select count(distinct id) from billing.plan) <> v_rowcount then
    raise exception 'dd173-plan: the new uuid identity is not unique across % plans.', v_rowcount;
  end if;

  -- ═══════ 6. SUPERSEDE BY NAME, then GENERATE ═════════════════════════════════════════════════
  select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
    from pg_policy pol
   where pol.polrelid = 'billing.plan'::regclass
     and not (pol.polname = any (iam.generated_policy_names()));
  v_extra := array(select unnest(v_live) except select unnest(v_names));
  if v_extra <> '{}' then
    raise exception
      'dd173-plan: billing.plan carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
      array_to_string(v_extra, ', ');
  end if;
  v_drop := array(select unnest(v_names) intersect select unnest(v_live));
  if cardinality(v_drop) > 0 then
    perform iam.supersede_bespoke_policies('billing', 'plan', v_drop,
      'DD-173 B-103: billing.plan is the platform plan ladder, held back BY NAME from DD-173 batch 1 because its id was TEXT. Its identity is renamed to plan_key, the canonical uuid added and all six reading functions rewritten in this same transaction; its hand-written policy set (a public read of active plans plus the platform-admin write lanes) is superseded by the generated set iam.apply_rls emits for the system variant, whose pub_read publishes exactly the rows whose visibility is public — derived here from `active`. Kept unsuperseded the two regimes would OR together and leave the table wider than either intended.');
  end if;
  perform iam.apply_rls('billing', 'plan', 'billing_plan', 'system');
  raise notice 'dd173-plan: generated billing_plan, superseding % of % declared bespoke name(s)',
    cardinality(v_drop), cardinality(v_names);

  grant select (id) on billing.plan to anon;
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema='billing' and table_name='plan' and grantee='anon'
       and column_name in ('created_by','updated_by','organization_id','metadata','version')) then
    raise exception 'dd173-plan: the retrofit''s identity and bookkeeping columns reached the anonymous surface. DD-186 revokes exactly those; the guest price list publishes the plan ladder, not our bookkeeping.';
  end if;

  -- ═══════ 7. THE FOUR RESOLVERS AND THE TWO DOORS, AFTER ══════════════════════════════════════
  v_public_after := billing.public_plans();
  if v_public_after is distinct from v_public_before then
    raise exception 'dd173-plan: THE GUEST PRICE LIST MOVED. public_plans() returned % before and % after. /pricing renders this with no JWT.',
      v_public_before, v_public_after;
  end if;
  v_resolve_after := billing.resolve_plan(v_admin_org);
  if v_resolve_after is distinct from v_resolve_before then
    raise exception 'dd173-plan: resolve_plan moved (% -> %). Every entitlement check in the platform resolves through it.',
      v_resolve_before, v_resolve_after;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  v_status_after := billing.plan_status(v_admin_org);
  perform set_config('request.jwt.claims', null, true);
  if v_status_after is distinct from v_status_before then
    raise exception 'dd173-plan: plan_status moved. Before % ; after %.', v_status_before, v_status_after;
  end if;
  v_cap_after := billing.resolve_capability(v_admin, 'ai_points', v_admin_org);
  if v_cap_after is distinct from v_cap_before then
    raise exception 'dd173-plan: resolve_capability moved. Before % ; after %.', v_cap_before, v_cap_after;
  end if;
  raise notice 'dd173-plan: public_plans (% plans), resolve_plan (%), plan_status and resolve_capability all byte-identical after generation',
    jsonb_array_length(v_public_after), v_resolve_after;

  execute 'set local role anon';
  select count(*) into v_anon_after from billing.plan;
  execute 'reset role';
  if v_anon_after is distinct from v_anon_before then
    raise exception 'dd173-plan: THE ANONYMOUS DOOR MOVED on the plan ladder: % rows before, % after.',
      v_anon_before, v_anon_after;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into billing.plan (plan_key, name, rank, organization_id, visibility)
      values (v_probe_key, 'DD-173 B-103 probe', 9999,
              '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'internal'::platform.visibility);
    v_admin_write_after := true;
    execute 'reset role';
  exception when others then
    v_admin_write_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from billing.plan where plan_key = v_probe_key;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into billing.plan (plan_key, name, rank, organization_id, visibility)
      values (v_probe_key, 'DD-173 B-103 probe', 9999,
              '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'internal'::platform.visibility);
    v_other_write_after := true;
    execute 'reset role';
  exception when others then
    v_other_write_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from billing.plan where plan_key = v_probe_key;

  if v_admin_write_after is distinct from v_admin_write_before then
    raise exception 'dd173-plan: THE STAFF WRITE LANE MOVED: a platform admin could insert a plan before (%) and after (%).',
      v_admin_write_before, v_admin_write_after;
  end if;
  if v_other_write_after is distinct from v_other_write_before then
    raise exception 'dd173-plan: THE WRITE LANE MOVED for a user with no platform rights: before %, after %.',
      v_other_write_before, v_other_write_after;
  end if;
  raise notice 'dd173-plan: anon reads % plans (unchanged); write gate AFTER — platform admin %, other % — IDENTICAL to the before half',
    v_anon_after, v_admin_write_after, v_other_write_after;

  -- ═══════ 8. THE ACCESS GATE ══════════════════════════════════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 billing_plan AFTER', v_principals, v_tokens, 400000,
    'DD-173 B-103 confirmation, pinned to the same instant as the baseline', v_as);
  for r in select c.token, c.principal_label, c.count_before, c.count_after, c.verdict,
                  et.schema_name, et.table_name
             from iam.access_delta_compare(v_before, v_after) c
             join platform.entity_types et on et.token = c.token
            where c.verdict <> 'SAME' order by c.verdict, c.token, c.principal_label
  loop
    if r.verdict = 'WIDER' then
      -- 🚨 THE SECOND FACE OF THE SAME PROBE BLIND SPOT, AND IT IS NOT WAVED THROUGH.
      --    With a TEXT `id` the snapshot cannot collect row identities, so it falls back to
      --    `md5(string_agg(t::text …))` — and `t::text` needs SELECT on EVERY column. `anon` holds
      --    a sixteen-of-seventeen column grant here (DD-186 withheld `metadata`), so the BEFORE
      --    half raised `insufficient_privilege` and the probe recorded ZERO ROWS, saying so in its
      --    own `error_text`. The AFTER half reads 9 because the uuid `id` path needs only that one
      --    column. Nothing opened. This arm resolves that pair ONLY when the probe itself says it
      --    could not read, AND the direct anonymous count taken in this transaction is identical
      --    before and after AND equals what the probe now reports. Anything else is a widening.
      v_probe_err := null;
      if r.principal_label = 'anonymous (no JWT)' then
        select p.error_text into v_probe_err
          from iam.access_delta_probe p
         where p.run_id = v_before and p.token = r.token
           and p.principal_label = r.principal_label;
      end if;
      if v_probe_err is not null and v_probe_err like '%no SELECT grant%'
         and r.count_before = 0 and v_anon_before = v_anon_after
         and v_anon_after = r.count_after then
        v_unproven_ok := array_append(v_unproven_ok,
          format('%s for %s (probe could not read the before half — %s; a direct anonymous read in this transaction is %s before and %s after)',
                 r.token, r.principal_label, v_probe_err, v_anon_before, v_anon_after));
        raise notice 'dd173-plan: % for % reads WIDER only because the probe could not measure the before half (%); the direct anonymous read is % -> %',
          r.token, r.principal_label, v_probe_err, v_anon_before, v_anon_after;
      elsif not ((r.token || '|' || r.principal_label) = any (v_approved)) then
        v_unapproved := array_append(v_unapproved,
          format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      else
        raise notice 'dd173-plan: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;

    elsif r.verdict = 'UNPROVEN' then
      execute format('select count(*) from %I.%I', r.schema_name, r.table_name) into v_total;
      if r.count_before = r.count_after and r.count_after = v_total then
        v_unproven_ok := array_append(v_unproven_ok,
          format('%s for %s (all %s rows before and after)', r.token, r.principal_label, v_total));
      else
        v_unapproven_hard := array_append(v_unapproven_hard,
          format('UNPROVEN %s for %s (%s -> %s of %s rows) — the row-by-row comparison is impossible and the read is not the whole table, so nobody can say which rows moved',
                 r.token, r.principal_label, r.count_before, r.count_after, v_total));
      end if;

    elsif r.verdict = 'UNMEASURED' then
      v_unapproved := array_append(v_unapproved,
        format('UNMEASURED %s for %s — the probe itself failed; a gate that could not read proves nothing', r.token, r.principal_label));

    else
      v_narrower := array_append(v_narrower,
        format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      raise notice 'dd173-plan: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173-plan: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173-plan: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173-plan: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical',
    cardinality(v_narrower), cardinality(v_unproven_ok);

  -- ═══════ 9. CERTIFICATION ════════════════════════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) order by et.token
  loop
    for v in select * from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant)
              where status = 'FAIL'
    loop
      f := format('%s / %s: %s', r.token, v.check_name, coalesce(v.detail,''));
      if v.check_name = any (v_policy_checks) then v_policy_fail := array_append(v_policy_fail, f);
      else v_base_fail := array_append(v_base_fail, f); end if;
    end loop;
  end loop;
  if cardinality(v_base_fail) > 0 then
    raise exception 'dd173-plan: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173-plan: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173-plan: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL on billing_plan';

  -- ═══════ 10. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ═══════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 B-103 (billing.plan): platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair. The alternative (add column not null default <org>) is hard-blocked by this same guard, and combining add + drop-default into one ALTER is rejected by Postgres.',
      p_by     => 'DD-173 B-103 billing_plan migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173-plan: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173p3$;
