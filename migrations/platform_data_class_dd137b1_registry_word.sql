-- platform_data_class_dd137b1_registry_word — THE REGISTRY WORD AND THE LANE SET (DD-137b, step 1).
--
-- Design: common-docs /projects/data-doctrine-adoption/discovery/VISIBILITY-BY-CLASS.md §3.1 (the
-- class names a LANE SET, not a comparison), §3.2 (the interlock: one source read by the kernel and
-- by the mirror), §3.3 (the second axis — where a list lands), §3.6 (organization overrides tighten
-- only) and §3.9 steps 2-3 (fill the registry from reality, classify every active token).
-- Ruling: common-docs /systems/platform/access/DECISIONS.md, row 2026-09-12 — the private class
-- exists; an organization admin has no standing read of a person's private data.
--
-- 🚨 WHAT THIS FILE DOES NOT DO. It changes NO live policy and regenerates NO table. `iam.apply_rls`
-- and `iam.entity_read_expr` are untouched here on purpose: the registry has to become a true
-- DESCRIPTION of the live lane sets before it is allowed to become a RULE. DD-137b2 (the access
-- delta harness) and DD-137b3 (the interlock + regeneration) follow, in that order, and step 3 is
-- the only one that moves a policy byte.
--
-- What is here:
--   1. `platform.data_class`  — private | confidential | organization | public (§3.1, Arman's four
--                               categories in his own order).
--   2. `platform.list_scope`  — mine | organization (§3.3). A SECOND axis: where a list STARTS.
--                               It is never an access decision, which is why it is not the class.
--   3. `platform.lane_set`    — the composite the §3.1 lane table becomes in code.
--   4. `platform.entity_types.data_class` / `data_class_reason` / `default_list_scope` — the same
--                               shape `audit_class` / `audit_class_reason` already uses.
--   5. `iam.class_lanes(token)` — THE ONE SOURCE. Every lane decision is made here and nowhere
--                               else, so the kernel and the mirror cannot answer differently.
--                               UNSET RESOLVES TO `private` (chair R3): both directions of "unset"
--                               fail toward privacy.
--   6. `platform.derive_data_class` / `platform.derive_list_scope` — the classification rules, as
--                               functions, so the backfill below and the BEFORE INSERT trigger on
--                               `platform.entity_types` use the SAME rule and a new table can never
--                               be born unclassified.
--   7. The classification of all 339 active entity/system/restricted/personal tokens, each with a
--                               stored reason. Components (311) and ledgers (22) carry NULL and
--                               inherit their parent's class (§3.3, F-20).
--   8. `platform.entity_default_list_scope(token)` — the registry word in the RPCs' own vocabulary
--                               (`organization` -> `orgs`). We do not rename a live parameter
--                               vocabulary to make a new column prettier (§3.3 item 4).
--   9. §3.6 organization overrides — `data_class`, `default_list_scope`, `member_default_level` on
--                               `platform.org_module_config`, resolved by `platform.module_config`,
--                               with a TIGHTEN-ONLY trigger on the class and free movement on the
--                               list scope. Plus `platform.orgs_tightening(token)`.
--  10. `iam.verify_canonical` gains four class checks (§3.2 interlock two).
--
-- 🚨 IDEMPOTENT. `migrations/` is a live drop box and another lane's applier will re-run this file.
-- Every object is guarded on absence or written CREATE OR REPLACE; the backfill is a rule, not a
-- list of literals, so re-running it re-derives the same answer.
--
-- 🚨 NOTHING SILENT. A token this file cannot classify raises and names itself. There is no branch
-- that quietly writes a default and moves on.

-- ═════════════════════════════════════════════════════════ 1. the two words and the lane set
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'platform' and t.typname = 'data_class') then
    create type platform.data_class as enum ('private','confidential','organization','public');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'platform' and t.typname = 'list_scope') then
    create type platform.list_scope as enum ('mine','organization');
  end if;
end $$;

-- The §3.1 lane table, as a composite. One boolean per ROW of that table: the class decides which
-- lanes EXIST AT ALL. Where a lane exists and the table has a `visibility` column, the row's own
-- value narrows it — that is DD-136's guard, a different mechanism, and neither substitutes for
-- the other.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'platform' and t.typname = 'lane_set') then
    create type platform.lane_set as (
      resolved_class       platform.data_class,
      owner_lane           boolean,   -- created_by / owner_id = me
      owner_grant_lane     boolean,   -- a grant in iam.permissions made by the owner
      org_member_lane      boolean,   -- organization members (gated >= internal where the column exists)
      org_role_lane        boolean,   -- organization owner/admin BY ROLE
      platform_admin_lane  boolean,   -- is_platform_admin() / platform_admin_all
      anon_lane            boolean,   -- pub_read
      share_link_lane      boolean,
      owner_rewrite_lane   boolean,
      emergency_door       text       -- none | one_admin | owner_plus_approver
    );
  end if;
end $$;

-- ═════════════════════════════════════════════════════════ 2. the registry columns
alter table platform.entity_types add column if not exists data_class platform.data_class;
alter table platform.entity_types add column if not exists data_class_reason text;
alter table platform.entity_types add column if not exists default_list_scope platform.list_scope;

comment on column platform.entity_types.data_class is
  'DD-137b (VISIBILITY-BY-CLASS §3.1). The registry word that names a LANE SET: which access lanes '
  'are emitted for this token at all. NOT a comparison against the per-row visibility column — that '
  'column narrows a lane where it exists, it does not decide whether the lane exists. NULL on '
  'component and ledger variants, which inherit their parent''s class by construction (§3.3). NULL '
  'anywhere else is a REFUSAL, not a value: iam.apply_rls will not generate for it and '
  'iam.class_lanes resolves it to `private` (chair R3 — both directions fail toward privacy).';
comment on column platform.entity_types.data_class_reason is
  'Why this token holds that class, in a sentence. Same shape as audit_class_reason. A class with '
  'no reason is a guess someone will later mistake for a decision.';
comment on column platform.entity_types.default_list_scope is
  'DD-137b (VISIBILITY-BY-CLASS §3.3). THE SECOND AXIS, and it is never an access decision: where a '
  'list STARTS. `mine` opens on my own rows, `organization` opens on the organization''s. Everything '
  'else is one click away and never blocked. Kept separate from data_class so that changing where a '
  'screen lands never changes a table''s security posture — the conflation that produced the '
  'complaint. NULL on component and ledger (a component has no owner column, so "mine" is not '
  'expressible there).';

-- Components and ledgers carry NULL on both columns: THE COMPONENT OWNERSHIP LAW (db-rules §6d-1)
-- says a component's access IS its parent's, so a class on a component would be a second answer to
-- a question its parent already answers.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entity_types_class_scope_ck'
                   and conrelid = 'platform.entity_types'::regclass) then
    alter table platform.entity_types add constraint entity_types_class_scope_ck check (
      case when rls_variant in ('component','ledger')
           then data_class is null and default_list_scope is null
           else true end);
  end if;
  -- §3.1 derivation one: the `personal` variant emits no org lane, no platform-admin lane and no
  -- sharing lane. The registry may not claim otherwise.
  if not exists (select 1 from pg_constraint where conname = 'entity_types_personal_is_private_ck'
                   and conrelid = 'platform.entity_types'::regclass) then
    alter table platform.entity_types add constraint entity_types_personal_is_private_ck check (
      rls_variant <> 'personal' or data_class is null or data_class = 'private');
  end if;
end $$;

-- ═════════════════════════════════════════════════════════ 3. the classification rules, as code
--
-- 🚨 §3.9 step 2: FILL THE REGISTRY FROM REALITY, NOT THE OTHER WAY ROUND. The derivation below is
-- the inverse of §3.1's birth table (`organization` is born `internal`, `confidential` is born
-- `personal`, `public` is born `public`) — so for the overwhelming majority of tokens the class
-- DESCRIBES the lane set the table already has, and the WIDER-diff gate of step 4 has nothing to
-- complain about. The deliberate DELTAS are named one by one in §4 below, and they all narrow.
create or replace function platform.derive_data_class(p_variant text, p_visibility text)
returns platform.data_class
language sql immutable
as $$
  select case
    when p_variant in ('component','ledger') then null
    -- §3.1 derivation one.
    when p_variant = 'personal' then 'private'::platform.data_class
    -- `restricted` builds an owner-only std_select inside iam._apply_rls_unchecked: no org lane of
    -- any kind exists on it today, so the class that DESCRIBES it is a private one. `confidential`
    -- rather than `private` because a restricted table keeps its door (HR's 27 tokens are all here).
    when p_variant = 'restricted' then 'confidential'::platform.data_class
    when p_visibility = 'public' then 'public'::platform.data_class
    when p_visibility = 'personal' then 'confidential'::platform.data_class
    when p_visibility in ('internal','link') then 'organization'::platform.data_class
    -- chair R3: unset resolves strictest. A new table is born private and its owner raises it.
    else 'private'::platform.data_class
  end;
$$;

comment on function platform.derive_data_class(text, text) is
  'DD-137b. The ONE classification rule, used by the DD-137b1 backfill and by '
  'platform.create_entity_table, so a table cannot be born unclassified and two callers cannot '
  'derive different answers. It is the inverse of VISIBILITY-BY-CLASS §3.1''s birth table.';

create or replace function platform.derive_list_scope(p_variant text, p_class platform.data_class)
returns platform.list_scope
language sql immutable
as $$
  select case
    when p_variant in ('component','ledger') then null
    -- A list of MY private things opens on mine; there is nothing else to open on.
    when p_class in ('private','confidential') then 'mine'::platform.list_scope
    -- §3.3 / FT-3: an organization''s data that opens on "mine" is the complaint. It lands on the
    -- organization, and "just mine" is one click away.
    else 'organization'::platform.list_scope
  end;
$$;

-- ═════════════════════════════════════════════════════════ 4. classify every active token
--
-- Rule cascade, strictest-named-first. Every branch writes a REASON; there is no silent default.
do $$
declare
  -- F-7's eleven bespoke owner-only tokens. Their hand-written policies are STRICTER than what the
  -- generator emits, so classifying them BEFORE anything regenerates is what stops step 3 from
  -- widening them (chair R3). This list is load-bearing and is asserted non-empty below.
  v_bespoke_private text[] := ARRAY[
    'user_form_profile','user_preference','user_analysis_preference','access_request',
    'wbx_guidance','industry_curator','invitation','membership','agent_surface_binding',
    'processed_document','system_personal_org_failure'];
  -- §3.9 step 3: the person's own communications and own thinking.
  v_named_private text[] := ARRAY[
    'conversation','dm_conversation','dm_message','user_memory','user_markdown_sample',
    'cx_agent_memory','cx_user_request'];
  -- §3.9 step 2: the eight tables that default to `public` BY DESIGN (db-rules §6a-1 — content that
  -- came OFF the public web). Named here so `public` is always a deliberate choice with a reason.
  v_named_public text[] := ARRAY[
    'seo_keyword','seo_keyword_edge','seo_keyword_market','seo_keyword_topic','seo_topic',
    'web_analysis_item','web_provider','global_origin'];
  v_n integer;
begin
  -- (a) the bespoke owner-only eleven — FIRST, before anything else can claim them.
  update platform.entity_types et set
    data_class = 'private',
    data_class_reason = 'F-7: hand-written owner-only policy, stricter than the generator emits. '
      'Classified private BEFORE any regeneration so the regeneration cannot widen it (chair R3).'
  where et.token = any(v_bespoke_private) and et.is_active;

  -- (b) the named private tokens — a person's own communications and own thinking (§3.9 step 3).
  update platform.entity_types et set
    data_class = 'private',
    data_class_reason = 'VISIBILITY-BY-CLASS §3.9 step 3: the person''s own communications and own '
      'thinking. No standing read for anyone, our own staff included; the audited emergency door '
      'needs two people and tells the subject.'
  where et.token = any(v_named_private) and et.is_active
    and et.rls_variant not in ('component','ledger') and et.data_class is null;

  -- (c) the deliberately-public web tables (§3.9 step 2).
  update platform.entity_types et set
    data_class = 'public',
    data_class_reason = 'db-rules §6a-1: this content CAME OFF the public web, or is broadcast to '
      'it. `public` is the internet, never "everyone in the organization" (§3.1, F-16).'
  where et.token = any(v_named_public) and et.is_active
    and et.rls_variant not in ('component','ledger') and et.data_class is null;

  -- (d) the rls_variant='personal' six, by derivation (§3.1 derivation one).
  update platform.entity_types et set
    data_class = 'private',
    data_class_reason = 'VISIBILITY-BY-CLASS §3.1 derivation one: rls_variant=personal already '
      'emits no org lane, no platform-admin lane and no sharing lane. The registry may not claim '
      'otherwise, and iam.verify_canonical FAILs it if it does.'
  where et.rls_variant = 'personal' and et.is_active and et.data_class is null;

  -- (e) everything else: the class that DESCRIBES the lane set the table already has.
  update platform.entity_types et set
    data_class = platform.derive_data_class(et.rls_variant, et.default_visibility::text),
    data_class_reason = format(
      'Derived from what the registry already holds (rls_variant=%s, default_visibility=%s) by '
      'platform.derive_data_class — the inverse of §3.1''s birth table. §3.9 step 2: fill the '
      'registry from reality, not the other way round.',
      et.rls_variant, coalesce(et.default_visibility::text, 'unset'))
  where et.is_active and et.rls_variant not in ('component','ledger') and et.data_class is null;

  -- (f) the second axis, derived from the class.
  update platform.entity_types et set
    default_list_scope = platform.derive_list_scope(et.rls_variant, et.data_class)
  where et.is_active and et.rls_variant not in ('component','ledger')
    and et.default_list_scope is null;

  -- ── the deliberate deltas, each one NARROWING and each one named ───────────────────────────
  --
  -- The 23 tables V-33 measured carrying an UNGUARDED organization-role read lane: they have no
  -- `visibility` column at all, so DD-136's guard has nothing to assert on them and an
  -- organization's admins read every member's rows there (66 user_feedback rows and 96
  -- transcripts.studio_runs for one real admin, measured 2026-09-12). Every one of them is a
  -- person's own record, an operational record of the platform, or a social signal on a canvas —
  -- so the class is assigned by WHAT THE DATA IS, one table at a time, with the reason stored.

  -- (g) a person's own settings and own state. Nobody else has standing, and there is nothing an
  --     organization admin could need from them that the person cannot hand over.
  update platform.entity_types et set
    data_class = 'private', default_list_scope = 'mine',
    data_class_reason = 'V-33 §6: an UNGUARDED organization-role read lane on a table with no '
      'visibility column. This is one person''s own settings/state — private, no standing read.'
  where et.is_active and et.token in (
    'user_bookmark','user_email_preference','user_stat','user_surface_state',
    'app_setting','app_sync_status','dict_setting');

  -- (h) a person's own work product. An organization admin can have a real need for it — through
  --     the audited door, one admin, with a reason, and the person is told.
  update platform.entity_types et set
    data_class = 'confidential', default_list_scope = 'mine',
    data_class_reason = 'V-33 §6: an UNGUARDED organization-role read lane on a table with no '
      'visibility column. This is one person''s own work product — confidential: the organization '
      'reaches it through the audited emergency door, never by an admin browsing.'
  where et.is_active and et.token in (
    'user_feedback','studio_run','studio_recording_chunks','sandbox_instance','app_instance',
    'derive_run','page_extraction_page_run','canvas_view','canvas_score','contact_submission');

  -- (i) the organization's own record, not a person's. The role lane is CORRECT here and stays;
  --     so does the platform-admin lane, because these are the queues our own repair patrol reads.
  update platform.entity_types et set
    data_class = 'organization', default_list_scope = 'organization',
    data_class_reason = 'V-33 §6 named this table, and the measurement is right that the '
      'organization-role lane is unguarded — but on THIS table that lane is correct: the row is the '
      'organization''s own operational record, not a person''s. Classified organization '
      'deliberately, so the class says so instead of the absence of a guard saying it.'
  where et.is_active and et.token in (
    'ops_issue_event','system_error','system_write_failure',
    'canvas_comment','canvas_like','canvas_comment_like','app_log');

  -- (j) the six remaining bespoke tokens that are NOT owner-only personal data.
  update platform.entity_types et set
    data_class = 'organization', default_list_scope = 'organization',
    data_class_reason = 'Bespoke (no generated std_select) but organization-shaped: a catalog, a '
      'scope or the organization record itself. Classified explicitly so the bespoke policy is a '
      'declared design rather than an unexplained absence (§3.9 step 4).'
  where et.is_active and et.token in ('context_item','organization','scope_type');
  update platform.entity_types et set
    data_class = 'public', default_list_scope = 'organization',
    data_class_reason = 'A UI surface catalog: it is shipped to every client, signed in or not.'
  where et.is_active and et.token = 'surface';
  update platform.entity_types et set
    data_class = 'confidential', default_list_scope = 'mine',
    data_class_reason = 'A person''s own document extraction job — confidential, door-reachable.'
  where et.is_active and et.token = 'page_extraction_job';

  -- ── assertions: the classification is COMPLETE and the load-bearing lists actually matched ──
  select count(*) into v_n from platform.entity_types
   where is_active and rls_variant not in ('component','ledger') and data_class is null;
  if v_n > 0 then
    raise exception 'dd137b1: % active entity/system/restricted/personal tokens are still '
      'unclassified — the rule cascade is not total and a later regeneration would refuse them', v_n;
  end if;
  select count(*) into v_n from platform.entity_types
   where is_active and rls_variant not in ('component','ledger') and default_list_scope is null;
  if v_n > 0 then
    raise exception 'dd137b1: % active tokens have no default_list_scope', v_n;
  end if;
  select count(*) into v_n from platform.entity_types
   where is_active and rls_variant in ('component','ledger')
     and (data_class is not null or default_list_scope is not null);
  if v_n > 0 then
    raise exception 'dd137b1: % component/ledger tokens carry a class — F-20: they inherit their '
      'parent''s (§3.3)', v_n;
  end if;
  select count(*) into v_n from platform.entity_types
   where is_active and token = any(v_bespoke_private) and data_class = 'private';
  if v_n <> 11 then
    raise exception 'dd137b1: only % of F-7''s ELEVEN bespoke owner-only tokens were classified '
      'private — chair R3 says they are classified BEFORE anything regenerates, so a token that '
      'has been renamed out from under this list must be found and named, not skipped', v_n;
  end if;
  select count(*) into v_n from platform.entity_types
   where is_active and data_class is not null and data_class_reason is null;
  if v_n > 0 then
    raise exception 'dd137b1: % tokens hold a class with no reason', v_n;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════ 5. THE ONE SOURCE — iam.class_lanes
--
-- §3.2, chair R1. Every lane decision the kernel and the mirror make is made HERE. They cannot
-- answer differently because there is only one answer.
create or replace function iam.class_lanes(p_token text)
returns platform.lane_set
language plpgsql
stable
security definer
set search_path to 'pg_catalog','platform','iam','public'
as $function$
declare
  v_class platform.data_class;
  v_variant text;
  v_found boolean;
  r platform.lane_set;
begin
  select et.data_class, et.rls_variant, true into v_class, v_variant, v_found
    from platform.entity_types et where et.token = p_token and et.is_active;

  -- 🚨 CHAIR R3, BOTH DIRECTIONS. `iam.apply_rls` REFUSES an unclassified token outright (it can
  -- refuse — nothing is denied a user by a generation that does not run). The KERNEL cannot refuse,
  -- because refusing at runtime is denying a person their own data, so it resolves unset to the
  -- STRICTEST class. Neither direction silently widens a live table.
  if not coalesce(v_found, false) then
    v_class := 'private';      -- unregistered token: strictest, and the caller says so
  elsif v_variant in ('component','ledger') then
    -- A component's access IS its parent's (db-rules §6d-1), so it has no class of its own and
    -- this function must not invent one. The caller resolves the parent.
    v_class := null;
  elsif v_class is null then
    v_class := 'private';
  end if;

  r.resolved_class := v_class;

  -- The §3.1 lane table, row for row. `organization` is the class whose lane set is exactly what an
  -- org-scoped entity table carries TODAY, which is why classifying a table `organization` changes
  -- nothing about it.
  r.owner_lane          := true;                                   -- every class
  r.owner_grant_lane    := true;                                   -- ordinary sharing, every class
  r.org_member_lane     := v_class in ('confidential','organization','public');
  r.org_role_lane       := v_class in ('organization','public');
  r.platform_admin_lane := v_class in ('organization','public');
  r.anon_lane           := v_class = 'public';
  r.share_link_lane     := v_class in ('organization','public');
  r.owner_rewrite_lane  := v_class in ('organization','public');
  r.emergency_door      := case v_class
                             when 'private'      then 'owner_plus_approver'
                             when 'confidential' then 'one_admin'
                             else 'none' end;

  -- A component/ledger token gets NULL lanes rather than a wrong answer: the caller must resolve
  -- the parent. Returning `private` here would silently strip a component of the parent lane it is
  -- supposed to inherit.
  if v_class is null then
    r.owner_lane := null; r.owner_grant_lane := null; r.org_member_lane := null;
    r.org_role_lane := null; r.platform_admin_lane := null; r.anon_lane := null;
    r.share_link_lane := null; r.owner_rewrite_lane := null; r.emergency_door := null;
  end if;

  return r;
end
$function$;

comment on function iam.class_lanes(text) is
  'DD-137b / VISIBILITY-BY-CLASS §3.2 (chair R1). THE ONE SOURCE: which access lanes exist for a '
  'token at all. The kernel (iam.has_access_for_base) and the mirror (iam.entity_read_expr) both '
  'read it, so generation-time truth and runtime truth cannot drift. An unset or unregistered '
  'token resolves to `private` — the kernel cannot refuse, so it fails toward privacy; '
  'iam.apply_rls refuses outright, which is the other direction of the same rule (chair R3). '
  'Component and ledger tokens get NULL lanes: their access IS their parent''s (db-rules §6d-1).';

revoke all on function iam.class_lanes(text) from public, anon;
grant execute on function iam.class_lanes(text) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════ 6. the list-scope reader
--
-- §3.3 item 4: the RPCs' live word is `orgs` and the registry value is `organization`. This maps one
-- to the other. We do not rename a live parameter vocabulary to make a new column prettier.
create or replace function platform.entity_default_list_scope(p_token text)
returns text
language sql
stable
security definer
set search_path to 'pg_catalog','platform'
as $function$
  -- A token with no scope of its own opens on `mine`: the narrower screen is the one that is never
  -- WRONG, only sometimes emptier than it should be, and it is one click away. It is never a wider
  -- screen, because a default that SHOWS more than it should is the leak this whole design closes.
  select coalesce(
    (select case when et.default_list_scope = 'organization' then 'orgs' else 'mine' end
       from platform.entity_types et where et.token = p_token and et.is_active),
    'mine');
$function$;

comment on function platform.entity_default_list_scope(text) is
  'DD-137b / §3.3. The registry''s default_list_scope in the list RPCs'' own vocabulary '
  '(organization -> orgs). Callers: the eleven %_list_scoped RPCs, as '
  'coalesce(p_scope, platform.entity_default_list_scope(''<token>'')) — a SQL parameter default '
  'cannot be dynamic, a coalesce can.';

revoke all on function platform.entity_default_list_scope(text) from public;
grant execute on function platform.entity_default_list_scope(text) to anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════ 7. §3.6 — organization overrides
--
-- The mechanism already exists and already carries default_visibility: platform.module_config
-- resolves COALESCE(org_override, registry_default). Three rows exist in org_module_config today
-- and none sets a visibility, so there is nothing to migrate.
alter table platform.org_module_config add column if not exists data_class platform.data_class;
alter table platform.org_module_config add column if not exists default_list_scope platform.list_scope;
alter table platform.org_module_config add column if not exists member_default_level public.permission_level;

comment on column platform.org_module_config.data_class is
  'DD-137b §3.6. An organization may TIGHTEN the platform''s class (public -> organization -> '
  'confidential -> private) and may never loosen it: an organization may promise its people MORE '
  'privacy than the platform does, never less. Enforced by platform._org_module_config_tighten_only. '
  'This is not a restriction on sharing — the class is a FLOOR, and ordinary grants open above it '
  'per item and per person (Rule 9''s union).';
comment on column platform.org_module_config.default_list_scope is
  'DD-137b §3.6. Pure preference, freely movable in either direction: it touches no access at all.';

create or replace function platform._org_module_config_tighten_only()
returns trigger
language plpgsql
as $function$
declare
  v_platform platform.data_class;
begin
  if new.data_class is null then return new; end if;
  select et.data_class into v_platform from platform.entity_types et where et.token = new.module_token;
  if v_platform is null then return new; end if;
  -- The enum is ordered private < confidential < organization < public, i.e. strictest first, so
  -- "tighten only" is literally "never greater than the platform's".
  if new.data_class > v_platform then
    raise exception using
      errcode = '42501',
      message = format('An organization may tighten a data class, never loosen it. The platform '
                       'classifies %s as %s; this override asks for %s, which is looser.',
                       new.module_token, v_platform, new.data_class),
      hint = 'Ordinary sharing opens above the class per item and per person — a grant, not a '
             'class change. If the organization needs the table to be organization-wide for '
             'everyone, that is a platform classification question.';
  end if;
  return new;
end
$function$;

drop trigger if exists _org_module_config_tighten_only on platform.org_module_config;
create trigger _org_module_config_tighten_only
  before insert or update on platform.org_module_config
  for each row execute function platform._org_module_config_tighten_only();

-- The set-wise tightening reader (§3.6): organizations whose override is STRICTER than the
-- platform's class for this token. Emitted as `organization_id not in (select ...)` by the
-- generator, never as a per-row SECURITY DEFINER call in a USING clause — db-rules §6d's rule,
-- because a per-row definer in a USING clause is the 8-second timeout, not a style preference.
create or replace function platform.orgs_tightening(p_token text)
returns setof uuid
language sql
stable
security definer
set search_path to 'pg_catalog','platform'
as $function$
  select o.organization_id
    from platform.org_module_config o
    join platform.entity_types et on et.token = o.module_token
   where o.module_token = p_token
     and o.data_class is not null
     and o.data_class < et.data_class;
$function$;

revoke all on function platform.orgs_tightening(text) from public, anon;
grant execute on function platform.orgs_tightening(text) to authenticated, service_role;

-- The resolver gains the three new flags (§3.6). DROP first: Postgres refuses to change the row
-- type of an existing set-returning function, and the two live references to `org_module_config`
-- (public.org_module_custom_value_add / _policy_set) are to the TABLE, not to this function — read
-- from pg_proc before dropping, not assumed.
drop function if exists platform.module_config(uuid, text);
create or replace function platform.module_config(p_org uuid, p_token text)
returns table(members_can_add boolean, needs_approval boolean, scopeable boolean, auto_ingest boolean,
              default_visibility platform.visibility, is_enabled boolean,
              data_class platform.data_class, default_list_scope platform.list_scope,
              member_default_level public.permission_level)
language sql
stable
as $function$
  SELECT COALESCE(o.members_can_add, e.default_members_can_add),
         COALESCE(o.needs_approval,  e.default_needs_approval),
         COALESCE(o.scopeable,       e.default_scopeable),
         COALESCE(o.auto_ingest,     e.default_auto_ingest),
         COALESCE(o.default_visibility, e.default_visibility),
         COALESCE(o.is_enabled, true),
         COALESCE(o.data_class, e.data_class),
         COALESCE(o.default_list_scope, e.default_list_scope),
         o.member_default_level
  FROM platform.entity_types e
  LEFT JOIN platform.org_module_config o ON o.module_token=e.token AND o.organization_id=p_org
  WHERE e.token=p_token;
$function$;

-- ═════════════════════════════════════════════════════════ 8. a table cannot be born unclassified
--
-- `platform.create_entity_table` inserts the registry row and then calls `iam.apply_rls`. Once
-- DD-137b3 makes apply_rls REFUSE an unset class, a create that did not classify would die at the
-- generation step with a confusing error about a table the caller had just asked for.
--
-- The classification therefore rides a BEFORE INSERT trigger on `platform.entity_types` rather than
-- a rewrite of a 140-line function this migration did not write — and it covers every insert path,
-- not only the provisioner. It fills a row that arrives unclassified and NEVER overrides a class the
-- caller stated: a deliberate class always wins over a derived one.
create or replace function platform._entity_types_classify_default()
returns trigger
language plpgsql
as $function$
begin
  if new.rls_variant in ('component','ledger') then
    -- A component's access IS its parent's (db-rules §6d-1); it holds no class of its own.
    new.data_class := null; new.default_list_scope := null; new.data_class_reason := null;
    return new;
  end if;
  if new.data_class is null then
    new.data_class := platform.derive_data_class(new.rls_variant, new.default_visibility::text);
    new.data_class_reason := coalesce(new.data_class_reason, format(
      'Born unclassified and derived by platform.derive_data_class from rls_variant=%s, '
      'default_visibility=%s. Reclassify deliberately if this table is not what its birth flags '
      'say it is — a derived class is a description, not a decision.',
      new.rls_variant, coalesce(new.default_visibility::text, 'unset')));
  end if;
  if new.default_list_scope is null then
    new.default_list_scope := platform.derive_list_scope(new.rls_variant, new.data_class);
  end if;
  return new;
end
$function$;

drop trigger if exists _entity_types_classify_default on platform.entity_types;
create trigger _entity_types_classify_default
  before insert on platform.entity_types
  for each row execute function platform._entity_types_classify_default();

-- ═════════════════════════════════════════════════════════ 9. the conformance gate re-derives
--
-- §3.2 interlock two. iam.verify_canonical gains four class checks. They are APPENDED to the
-- existing body immediately before its final END, so every other finding this function produces
-- keeps its exact current text and the 347-row FAIL baseline can be compared line for line.
do $$
declare v_src text; v_new text; v_marker text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'verify_canonical';
  if position('data_class_set' in v_src) > 0 then
    raise notice 'dd137b1: verify_canonical already carries the class checks';
  else
    v_marker := E'  check_name:=''sharing_token'';';
    if position(v_marker in v_src) = 0 then
      raise exception 'dd137b1: could not find the sharing_token check in iam.verify_canonical — '
        'the append point has moved and this patch must be re-derived rather than applied blind';
    end if;
    v_new := replace(v_src, v_marker,
      '-- ═══ DD-137b (VISIBILITY-BY-CLASS §3.2 interlock two) — THE CLASS IS RE-DERIVED HERE.' || E'\n' ||
      '  -- A declaration nothing checks is §1.3''s measured price: the registry said one thing and' || E'\n' ||
      '  -- the policies said another for as long as anyone cared to look.' || E'\n' ||
      '  DECLARE v_dc platform.data_class; v_ls platform.list_scope; v_lanes platform.lane_set;' || E'\n' ||
      '  BEGIN' || E'\n' ||
      '  SELECT et.data_class, et.default_list_scope INTO v_dc, v_ls' || E'\n' ||
      '    FROM platform.entity_types et WHERE et.token = p_token;' || E'\n' ||
      '  check_name:=''data_class_set'';' || E'\n' ||
      '  IF v_variant IN (''component'',''ledger'') THEN' || E'\n' ||
      '    status:=CASE WHEN v_dc IS NULL THEN ''PASS'' ELSE ''FAIL'' END;' || E'\n' ||
      '    detail:=CASE WHEN v_dc IS NULL THEN ''inherits its parent''''s class (§3.3, F-20)''' || E'\n' ||
      '                 ELSE ''a component/ledger may not hold a data_class — its access IS its parent''''s (db-rules §6d-1)'' END;' || E'\n' ||
      '  ELSIF v_dc IS NULL THEN status:=''FAIL'';' || E'\n' ||
      '    detail:=''data_class is unset. Unset is a REFUSAL, not a value (chair R3): iam.apply_rls will not generate for this token and iam.class_lanes resolves it to private.'';' || E'\n' ||
      '  ELSE status:=''PASS''; detail:=v_dc::text; END IF; RETURN NEXT;' || E'\n\n' ||
      '  check_name:=''data_class_derivations'';' || E'\n' ||
      '  IF v_variant = ''personal'' AND v_dc IS DISTINCT FROM ''private''::platform.data_class THEN' || E'\n' ||
      '    status:=''FAIL''; detail:=format(''§3.1 derivation one: rls_variant=personal emits no org, staff or sharing lane, so the class is private — the registry says %s'', v_dc);' || E'\n' ||
      '  ELSIF v_dc IN (''private'',''confidential'') AND NOT v_suppress_admin THEN' || E'\n' ||
      '    status:=''FAIL''; detail:=format(''§3.1 derivation two: a %s token suppresses the platform-admin lane — our own staff go through the door too. suppress_platform_admin_lane is false.'', v_dc);' || E'\n' ||
      '  ELSE status:=''PASS''; detail:=NULL; END IF; RETURN NEXT;' || E'\n\n' ||
      '  check_name:=''default_list_scope_set'';' || E'\n' ||
      '  IF v_variant IN (''component'',''ledger'') THEN' || E'\n' ||
      '    status:=CASE WHEN v_ls IS NULL THEN ''PASS'' ELSE ''FAIL'' END;' || E'\n' ||
      '    detail:=CASE WHEN v_ls IS NULL THEN ''a component has no owner column, so "mine" is not expressible (§3.3)'' ELSE ''component/ledger may not hold a default_list_scope'' END;' || E'\n' ||
      '  ELSIF v_ls IS NULL THEN status:=''FAIL''; detail:=''default_list_scope is unset — the screen has no declared landing place (§3.3)'';' || E'\n' ||
      '  ELSE status:=''PASS''; detail:=v_ls::text; END IF; RETURN NEXT;' || E'\n\n' ||
      '  check_name:=''class_lanes_match_policy'';' || E'\n' ||
      '  IF v_variant IN (''component'',''ledger'',''personal'') OR v_sel IS NULL THEN' || E'\n' ||
      '    status:=''SKIP''; detail:=''std_select is not built by the class-aware mirror on this variant'';' || E'\n' ||
      '  ELSE' || E'\n' ||
      '    v_lanes := iam.class_lanes(p_token);' || E'\n' ||
      '    IF NOT v_lanes.org_role_lane AND (v_sel LIKE ''%role = ANY (ARRAY[''''owner''''%'' OR v_sel LIKE ''%is_org_admin%'') THEN' || E'\n' ||
      '      status:=''FAIL''; detail:=format(''class %s emits NO organization-role read lane, but std_select carries one — re-run iam.apply_rls'', v_lanes.resolved_class);' || E'\n' ||
      '    ELSIF NOT v_lanes.platform_admin_lane AND (v_sel LIKE ''%is_platform_admin%'' OR v_sel LIKE ''%is_super_admin%'') THEN' || E'\n' ||
      '      status:=''FAIL''; detail:=format(''class %s closes the platform-admin lane, but std_select still carries a platform-staff arm — re-run iam.apply_rls'', v_lanes.resolved_class);' || E'\n' ||
      '    ELSIF NOT v_lanes.anon_lane AND ''pub_read''=ANY(COALESCE(v_polnames,''{}'')) AND v_variant<>''system'' AND NOT v_anon_component THEN' || E'\n' ||
      '      status:=''WARN''; detail:=format(''class %s emits no anonymous lane, but a pub_read policy exists'', v_lanes.resolved_class);' || E'\n' ||
      '    ELSE status:=''PASS''; detail:=v_lanes.resolved_class::text; END IF;' || E'\n' ||
      '  END IF; RETURN NEXT;' || E'\n' ||
      '  END;' || E'\n\n' ||
      v_marker);
    if v_new = v_src then
      raise exception 'dd137b1: the verify_canonical patch did not apply';
    end if;
    execute format(
      'create or replace function iam.verify_canonical(p_schema text, p_table text, p_token text, '
      'p_variant text default null) returns table(check_name text, status text, detail text) '
      'language plpgsql stable set search_path to ''pg_catalog'',''public'' as %L', v_new);
  end if;
end $$;

-- ═════════════════════════════════════════════════════════ 10. assertions — this file proved itself
do $$
declare v_n integer; r platform.lane_set;
begin
  -- the four classes exist and the eleven bespoke tokens are private
  select count(*) into v_n from platform.entity_types where is_active and data_class = 'private'
     and token in ('user_form_profile','user_preference','user_analysis_preference','access_request',
                   'wbx_guidance','industry_curator','invitation','membership',
                   'agent_surface_binding','processed_document','system_personal_org_failure');
  if v_n <> 11 then raise exception 'dd137b1: the eleven bespoke owner-only tokens are not private (%)' , v_n; end if;

  -- the lane set answers, and answers the §3.1 table
  r := iam.class_lanes('conversation');
  if r.resolved_class <> 'private' or r.org_role_lane or r.platform_admin_lane or r.anon_lane then
    raise exception 'dd137b1: class_lanes(conversation) does not match §3.1: %', r;
  end if;
  r := iam.class_lanes('__no_such_token_at_all__');
  if r.resolved_class <> 'private' then
    raise exception 'dd137b1: an unregistered token must resolve to the strictest class (chair R3)';
  end if;
  r := iam.class_lanes('message');   -- a component (chat.message)
  if r.resolved_class is not null or r.org_role_lane is not null then
    raise exception 'dd137b1: a component must get NULL lanes — its access IS its parent''s';
  end if;

  -- the list-scope reader speaks the RPCs' vocabulary
  if platform.entity_default_list_scope('content_ir_kind_instance') is null then
    raise exception 'dd137b1: entity_default_list_scope answered nothing';
  end if;
  if platform.entity_default_list_scope('__no_such_token_at_all__') <> 'mine' then
    raise exception 'dd137b1: an unknown token must land on the narrower screen, never the wider one';
  end if;

  -- a new registry row cannot be born unclassified
  if not exists (select 1 from pg_trigger where tgname = '_entity_types_classify_default'
                   and tgrelid = 'platform.entity_types'::regclass) then
    raise exception 'dd137b1: the birth-classification trigger is not on platform.entity_types';
  end if;

  -- the tighten-only trigger is armed
  if not exists (select 1 from pg_trigger where tgname = '_org_module_config_tighten_only'
                   and tgrelid = 'platform.org_module_config'::regclass) then
    raise exception 'dd137b1: the tighten-only trigger is not on platform.org_module_config';
  end if;

  -- the conformance gate re-derives
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='iam' and p.proname='verify_canonical' and p.prosrc like '%class_lanes_match_policy%';
  if v_n <> 1 then raise exception 'dd137b1: iam.verify_canonical does not re-derive the class'; end if;

  raise notice 'dd137b1: all assertions passed';
end $$;
