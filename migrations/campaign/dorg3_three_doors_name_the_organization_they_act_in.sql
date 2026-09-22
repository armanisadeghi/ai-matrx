-- lane: DEFAULT-ORG-3
-- additive: yes
-- supersedes: migrations/cmt_public_rpcs.sql
-- supersedes-function: public.cmt_add
-- supersedes-function: public.create_personal_organization
-- supersedes-function: public.creator_claim_handle
--
-- (ONE superseded path, three functions. `migrations/cmt_public_rpcs.sql` is the ledgered
--  file the allow-list pins for rule 7 and it is where public.cmt_add's substitution was
--  written. The other two functions predate this repository's migrations -- no file here
--  defines public.create_personal_organization at all -- so there is no second ledgered
--  file to name. They are declared here anyway because the header's THIRD clause is the one
--  that matters: the guard asks the LIVE CATALOGUE whether any overload of each named
--  function still carries the shape, and that clause cannot be talked into passing.)
--
-- A PERSON HAS NO DEFAULT ORGANIZATION. THE LAST THREE DOORS THAT ANSWERED
-- "WHICH ORGANIZATION?" WITH "THEIR OWN" STOP DOING IT.
--
-- The law (Arman, 2026-09-19; common-docs/policies/organization-is-the-container.md;
-- scripts/check-no-default-organization-sql.ts): a default organization is at most a
-- per-client DISPLAY preference. No read, no write, no route, no trigger and no billing
-- query may pick or substitute one -- not a cookie, not a preference, not the personal
-- organization. Satisfying a NOT NULL column is an argument for making the CALLER supply
-- the value, never for inventing one.
--
-- AUDIT-ORG (2026-09-22) left three live bodies carrying rule 7 -- the personal-organization
-- substitution -- and named them: public.cmt_add, public.create_personal_organization,
-- public.creator_claim_handle. This file answers all three, each from what the CALL already
-- knows rather than from who the caller is.
--
-- 1. public.cmt_add -- THE COMMENTED RECORD ANSWERS THE QUESTION.
--    Today: `if v_org is null then v_org := public.ensure_personal_organization(auth.uid())`
--    after a task-only lookup. So a comment filed on any entity type that is not a task,
--    without an explicit p_org_id, landed in the AUTHOR'S personal workspace -- a comment
--    thread on a record belonging to an organization, filed where that organization can
--    never read it (platform.comments is org-filtered by cmt_list). The record itself has
--    always known the answer: `platform.entity_types` maps every registered token to its
--    table, and 822 of those 1,025 tables carry `organization_id`. So the resolution
--    becomes generic instead of task-only, and where the record cannot answer, the call
--    must -- 23502 naming p_org_id, never a substitution.
--    It also CLOSES A HOLE the task-only check left open: for every org-scoped token, the
--    commented record must actually live in the organization the comment is filed in. The
--    old body enforced that for `task` and for nothing else, so a member of org A could
--    file a comment naming org A onto org B's party row.
--
-- 2. public.create_personal_organization -- AN ORPHANED SECOND SIGNUP DOOR.
--    🚨 CENSUS FINDING, measured on the main database 2026-09-22: this trigger function is
--    attached to NOTHING. `auth.users` carries four non-internal triggers --
--    on_auth_user_created (public._provision_new_user_personal_org),
--    on_auth_user_created_crm_party, on_auth_user_created_profile and
--    zzz_on_auth_user_created_prelaunch_plan -- and none of them is this. It is the
--    pre-campaign signup provisioner, left behind when `_provision_new_user_personal_org`
--    took over (that one routes through `iam.provision_signup_organization` behind
--    `custom/signup_provisioning_guard`). A dormant second door onto signup provisioning is
--    not a spare: it is the thing that gets re-attached by someone who reads its name and
--    believes it. Closing a class means removing the door.
--    It is REPLACED, not dropped -- a dropped function tells whoever re-attaches it only
--    that it does not exist. The new body raises, names the live trigger and names the
--    provisioner, so re-attaching it fails loudly at the first signup instead of quietly
--    running a second provisioning path.
--
-- 3. public.creator_claim_handle -- THE PROFILE ROW CARRIES ITS OWN ORGANIZATION, AND WHEN
--    IT DOES NOT, THE CALL NAMES ONE.
--    Today the self-heal arm substitutes when `users.profiles.organization_id` is absent.
--    `users.profiles.organization_id` is NOT NULL, so the absent case is a row that does
--    not exist yet -- a user whose signup provisioning failed (iam.system_personal_org_
--    failures). Carrying the existing row's organization is fine and unchanged: that is
--    carrying, not choosing. Inventing one for the missing row is the defect. A NEW
--    three-argument overload takes `p_organization_id` -- the organization the creator is
--    acting in, which the client already resolved through the active-organization ladder
--    (features/scopes/redux/selectors/active-context) -- and the two-argument signature is
--    REPLACED, not dropped: it delegates with NULL, so every caller that has a profile row
--    (the normal path, every signed-up user) is bit-for-bit unchanged, and only the broken-
--    signup case reaches the 23502 that names the argument to pass.
--
-- THE PRIMITIVES, BUILT IN THE SHARED LAYER (law 5): "which organization does this record
-- belong to?" is not a comments question. `platform.entity_is_org_scoped(token)` and
-- `platform.entity_organization_id(token, id)` answer it for EVERY registered entity type,
-- from the registry, so the next door that needs a record's organization has one place to
-- ask instead of a fourth hand-rolled lookup. Both are server-only.
--
-- 🚨 LEFT BEHIND, NAMED RATHER THAN SILENT -- THE CENSUS IS TWENTY-TWO, NOT THREE.
-- Re-running the guard's own rule shapes over every live body on the main database
-- (pg_get_functiondef, put through check-no-default-organization-sql's comment and literal
-- stripping) reports 22 functions, of which two are legitimate -- `iam.default_organization_id`
-- is the display-preference primitive itself and `iam._default_organization_is_a_membership`
-- is the constraint trigger that keeps the preference honest. After this file, seventeen
-- remain and they are NOT this lane's: public._provision_new_user_personal_org,
-- public._provision_new_user_profile, public.access_request_create,
-- public.setting_access_request_create, public.ctx_projects_add_creator_membership,
-- public.dm_get_or_create_direct_conversation, public.handle_new_dm_user,
-- public.fork_processed_document, public.fork_shared_conversation,
-- public.fork_shared_flashcard_set, public.fork_shared_quiz,
-- public.get_user_email_preferences, public.transfer_guest_data_to_user,
-- public.user_form_profile_append_to_array, public.user_form_profile_set_custom_field,
-- public.wsp_resolve_system_task, public.wsp_upsert_system_task. The BUILD-LOG row carries
-- the same list. Three of them (the two signup provisioners and handle_new_dm_user) are
-- CREATION sites rather than substitutions and need a different answer from the other
-- fourteen; none of them is decided here.
--
-- Inverse: migrations/inverse/dorg3_three_doors_name_the_organization_they_act_in.inverse.sql
-- Proof:   scripts/campaign-tests/dorg3_acting_organization_green.sql (green)
--          scripts/campaign-tests/dorg3_acting_organization_red.sql   (red twin)
--
-- based-on: public.cmt_add(text, uuid, text, uuid, uuid) b8ead30024a5474a4e0d3f51fc94055887f2000b8d2011737520a457e0fcb0fd
-- based-on: public.create_personal_organization() 7c8d675230e1bc522d938f7d0de10546a73b59fd1b0139368b2f68017a64db58
-- based-on: public.creator_claim_handle(text, text) 97bcd2139e0c1110cb1a4b0863d23a765e3bd853dcb6ae5cf9c776c65dbd7de9

set local lock_timeout = '2s';

-- ---------------------------------------------------------------------------
-- 1. THE SHARED PRIMITIVE: A RECORD'S OWN ORGANIZATION, FROM THE REGISTRY.
-- ---------------------------------------------------------------------------
create or replace function platform.entity_is_org_scoped(p_token text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
      from platform.entity_types et
      join information_schema.columns c_org
        on c_org.table_schema = et.schema_name
       and c_org.table_name  = et.table_name
       and c_org.column_name = 'organization_id'
      join information_schema.columns c_id
        on c_id.table_schema = et.schema_name
       and c_id.table_name  = et.table_name
       and c_id.column_name = 'id'
     where et.token = p_token
       and et.is_active);
$function$;

comment on function platform.entity_is_org_scoped(text) is
  'DEFAULT-ORG-3 2026-09-22: true when this registered entity type keeps its rows in a table that carries both `id` and `organization_id`, so platform.entity_organization_id can answer for it. A door that gets false here must be told the organization by its caller -- it may never pick one.';

create or replace function platform.entity_organization_id(p_token text, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_schema text;
  v_table  text;
  v_org    uuid;
begin
  if p_token is null or p_id is null then
    return null;
  end if;

  -- The registry decides which table is read. The token is looked UP, never
  -- interpolated from what a caller typed, and the identifiers come back from
  -- platform.entity_types rather than from the argument -- so format(%I) is
  -- quoting a catalogue value, not user input.
  select et.schema_name, et.table_name
    into v_schema, v_table
    from platform.entity_types et
    join information_schema.columns c_org
      on c_org.table_schema = et.schema_name
     and c_org.table_name  = et.table_name
     and c_org.column_name = 'organization_id'
    join information_schema.columns c_id
      on c_id.table_schema = et.schema_name
     and c_id.table_name  = et.table_name
     and c_id.column_name = 'id'
   where et.token = p_token
     and et.is_active;

  if v_schema is null then
    return null;
  end if;

  execute format('select t.organization_id from %I.%I t where t.id = $1', v_schema, v_table)
     into v_org
    using p_id;

  return v_org;
end
$function$;

comment on function platform.entity_organization_id(text, uuid) is
  'DEFAULT-ORG-3 2026-09-22: the organization a registered record BELONGS TO, read from the record itself via platform.entity_types. This is the answer to "which organization does this work land in?" for any door acting on a known record -- the record carries an organization, a person does not. NULL means the type is not org-scoped or the row does not exist; NULL is never an invitation to substitute one, it is a refusal the caller must turn into a 23502.';

-- ---------------------------------------------------------------------------
-- 2. public.cmt_add -- THE COMMENTED RECORD NAMES THE ORGANIZATION.
-- ---------------------------------------------------------------------------
create or replace function public.cmt_add(
  p_entity_type text, p_entity_id uuid, p_body text,
  p_parent_id uuid default null::uuid, p_org_id uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := p_org_id;
  v_scoped boolean;
  v_entity_org uuid;
  v_named boolean := p_org_id is not null;
  v_id uuid;
begin
  -- The record answers first, for EVERY registered type -- not only `task`.
  v_scoped := platform.entity_is_org_scoped(p_entity_type);
  if v_scoped then
    v_entity_org := platform.entity_organization_id(p_entity_type, p_entity_id);
  end if;

  if v_org is null then
    v_org := v_entity_org;
  end if;

  -- No organization from the caller and none from the record: REFUSE. The author's own
  -- workspace is not an answer to "where does this comment belong" -- it is a place the
  -- record's organization can never read.
  if v_org is null then
    raise exception 'cmt_add: nothing named the organization this comment belongs to. The record (%/%) did not answer -- either its entity type is not organization-scoped or the row does not exist. Remedy: pass p_org_id, the organization you are acting in.',
      p_entity_type, p_entity_id
      using errcode = '23502';
  end if;

  if not iam.has_org_access(v_org) then
    -- The organization is echoed only when the CALLER named it. Echoing one this function
    -- resolved from a record would turn a refusal into an oracle over other tenants' ids.
    if v_named then
      raise exception 'cmt_add: no org access (org=%, %/%)', v_org, p_entity_type, p_entity_id
        using errcode = '42501';
    end if;
    raise exception 'cmt_add: no org access (%/%)', p_entity_type, p_entity_id
      using errcode = '42501';
  end if;

  -- THE ENTITY AND THE PARENT ARE ARGUMENTS TOO (0850), and the entity check is now
  -- GENERIC. Proven live before 0850: the non-member test account filed a comment under
  -- another organization's task, and a reply under another organization's comment, while an
  -- invented parent id answered with a foreign-key error -- an existence oracle over every
  -- comment id. 0850 closed that for `task`. It stayed open for every other entity type,
  -- because the old body only knew how to look a task up: a member of one organization
  -- could name their own organization and file a comment onto any other organization's
  -- record. The record must live in the organization the comment is filed in.
  if v_scoped and v_entity_org is distinct from v_org then
    raise exception 'cmt_add: entity not found in this organization' using errcode = '22023';
  end if;
  if p_parent_id is not null and not exists (
       select 1 from platform.comments parent
        where parent.id = p_parent_id and parent.deleted_at is null
          and parent.entity_type = p_entity_type and parent.entity_id = p_entity_id
          and parent.organization_id = v_org) then
    raise exception 'cmt_add: parent comment not found' using errcode = '22023';
  end if;

  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, created_by, updated_by)
  values (v_org, p_entity_type, p_entity_id, p_parent_id, p_body, (select auth.uid()), (select auth.uid()))
  returning id into v_id;
  return v_id;
end $function$;

comment on function public.cmt_add(text, uuid, text, uuid, uuid) is
  'DEFAULT-ORG-3 2026-09-22: a comment belongs to the organization THE COMMENTED RECORD belongs to, read from platform.entity_types for any registered type (p_org_id overrides and must agree). It is never the author''s own workspace: a comment filed there is a comment the record''s organization can never read. Where neither the caller nor the record names an organization, this refuses with 23502 rather than inventing one.';

-- ---------------------------------------------------------------------------
-- 3. public.create_personal_organization -- THE ORPHANED SIGNUP DOOR, CLOSED LOUDLY.
-- ---------------------------------------------------------------------------
create or replace function public.create_personal_organization()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Attached to nothing on 2026-09-22 (auth.users carries on_auth_user_created,
  -- on_auth_user_created_crm_party, on_auth_user_created_profile and
  -- zzz_on_auth_user_created_prelaunch_plan -- none of them this). Replaced rather than
  -- dropped so that re-attaching it fails at the first signup, naming the live door,
  -- instead of quietly running a second provisioning path beside it.
  raise exception 'create_personal_organization: this is the retired signup provisioner and it is attached to nothing. Signup provisioning runs from the trigger on_auth_user_created on auth.users, through public._provision_new_user_personal_org, which routes to iam.provision_signup_organization behind the knob custom/signup_provisioning_guard. Remedy: attach nothing to this; change _provision_new_user_personal_org instead.'
    using errcode = '23502';
end;
$function$;

comment on function public.create_personal_organization() is
  'DEFAULT-ORG-3 2026-09-22: RETIRED, kept loud rather than dropped. It was the pre-campaign signup trigger and is attached to nothing; it answered "which organization?" for a new user by creating one, which is right at signup and wrong as a second dormant door. The live path is on_auth_user_created -> public._provision_new_user_personal_org -> iam.provision_signup_organization.';

-- ---------------------------------------------------------------------------
-- 4. public.creator_claim_handle -- THE PROFILE CARRIES ITS ORGANIZATION; THE CALL
--    NAMES ONE WHEN THERE IS NO PROFILE YET.
-- ---------------------------------------------------------------------------
create or replace function public.creator_claim_handle(
  p_handle text, p_display_name text default null::text, p_organization_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'users'
as $function$
declare
  v_uid uuid := auth.uid();
  v_handle text := public.creator_normalize_handle(p_handle);
  v_taken uuid;
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.id into v_taken
  from users.profiles p
  where lower(p.creator_handle) = v_handle and p.deleted_at is null and p.id <> v_uid
  limit 1;
  if v_taken is not null then
    raise exception 'That handle is already taken' using errcode = '23505';
  end if;

  -- CARRYING, NOT CHOOSING. The profile row already has an organization (the column is NOT
  -- NULL), stamped at signup by public._provision_new_user_profile. Reading it is carrying
  -- an organization somebody already set.
  select organization_id into v_org from users.profiles where id = v_uid;

  if v_org is null then
    -- No profile row: signup provisioning failed for this user (see
    -- iam.system_personal_org_failures). The old body invented one here. The call names it
    -- instead -- the organization the creator is acting in, which the client already has.
    v_org := p_organization_id;
    if v_org is null then
      raise exception 'creator_claim_handle: you have no profile row yet, so nothing carries the organization this creator profile belongs to. Remedy: call public.creator_claim_handle(p_handle, p_display_name, p_organization_id) and pass the organization you are acting in.'
        using errcode = '23502';
    end if;
    if not iam.has_org_access(v_org) then
      raise exception 'creator_claim_handle: no org access (org=%)', v_org using errcode = '42501';
    end if;
  end if;

  insert into users.profiles (id, organization_id, display_name, creator_handle)
  values (v_uid, v_org, coalesce(nullif(btrim(p_display_name), ''), 'Creator'), v_handle)
  on conflict (id) do update set
    creator_handle = v_handle,
    display_name = coalesce(nullif(btrim(p_display_name), ''), users.profiles.display_name),
    updated_at = now();

  return public.creator_get_mine();
end;
$function$;

comment on function public.creator_claim_handle(text, text, uuid) is
  'DEFAULT-ORG-3 2026-09-22: claims a creator handle. The profile row''s OWN organization is carried when the row exists (the normal path for every signed-up user); p_organization_id -- the organization the creator is acting in -- is used only when signup provisioning failed and there is no row yet, and its absence is a 23502 rather than a substituted personal workspace.';

-- The two-argument signature: REPLACED, not dropped. It delegates, so every existing caller
-- with a profile row behaves exactly as before; only the broken-signup case reaches the
-- 23502 that names the argument to pass.
create or replace function public.creator_claim_handle(p_handle text, p_display_name text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'users'
as $function$
begin
  return public.creator_claim_handle(p_handle, p_display_name, null::uuid);
end;
$function$;

comment on function public.creator_claim_handle(text, text) is
  'DEFAULT-ORG-3 2026-09-22: kept for existing callers; delegates to the three-argument overload with no acting organization. It works unchanged for every user who has a profile row, and raises 23502 naming the three-argument signature for the broken-signup case the old body answered by inventing a workspace.';

-- ---------------------------------------------------------------------------
-- 5. THE ACCESS DECISION, IN DATA.
-- ---------------------------------------------------------------------------
insert into platform.client_callable_door (
  schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
  non_client_lane, signed_in_callers, anonymous_callers)
values (
  'platform', 'entity_is_org_scoped', 'p_token text',
  array['text'::regtype]::oid[],
  'Registry lookup only: does this entity type keep its rows somewhere that carries an organization? Reads platform.entity_types and information_schema. Server-only because no client needs it and a client that had it could enumerate the registry.',
  'migrations/campaign/dorg3_three_doors_name_the_organization_they_act_in.sql',
  'server_only: called from inside SECURITY DEFINER doors that must decide whether a record can answer for its own organization (public.cmt_add today).',
  false, false),
(
  'platform', 'entity_organization_id', 'p_token text, p_id uuid',
  array['text'::regtype, 'uuid'::regtype]::oid[],
  'Reads one column of one row of a registered table as the definer, so it bypasses RLS: given an entity id it answers which organization owns it. NEVER client-callable -- a direct caller could use it as an oracle mapping any record id to its tenant. Every caller is a door that checks iam.has_org_access on the answer before doing anything with it.',
  'migrations/campaign/dorg3_three_doors_name_the_organization_they_act_in.sql',
  'server_only: called from inside SECURITY DEFINER doors that need the organization a record belongs to (public.cmt_add today).',
  false, false),
(
  'public', 'creator_claim_handle', 'p_handle text, p_display_name text, p_organization_id uuid',
  array['text'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
  'The creator-handle claim, with the acting organization as an argument. Signed-in callers only; auth.uid() is the subject and p_organization_id is checked with iam.has_org_access before it is used, and only when the caller has no profile row yet.',
  'migrations/campaign/dorg3_three_doors_name_the_organization_they_act_in.sql',
  null,
  true, false)
on conflict (schema_name, function_name, identity_argtypes) do update set
  identity_args = excluded.identity_args,
  reason = excluded.reason,
  declared_by = excluded.declared_by,
  non_client_lane = excluded.non_client_lane,
  signed_in_callers = excluded.signed_in_callers,
  anonymous_callers = excluded.anonymous_callers;
