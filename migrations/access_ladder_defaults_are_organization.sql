-- based-on: platform.derive_data_class(text, text) 4e13b2c93d122fda7b3f57fa1ea7ac2e537b6b9022dce5189dc243c9b5a728f1
-- based-on: iam.class_lanes(text) 5de91cffe7172b7381a8d74c4b6532bec18e9edc407314958cb986d92faf5606
-- based-on: iam.verify_canonical(text, text, text, text) f67fec7e42468598bf7a825a44051b7df8ba992342682b057aab85c511216267
-- based-on: iam._discovery_class_selftest_once() 43d3ee8f040b4c8261c4f5fd8ded925663b3944380d531102c82363e0aa24085
-- lane: access-ladder T-4
-- lock: platform
-- chair-step: the REVOKEs close the new approval doors, the approval ledger and the probe marker to every client role (approving Confidential or Private is Arman's alone); the one DELETE is the probe marker removing its own row at COMMIT. Nothing existing is narrowed.
--
-- EVERY DEFAULT IS ORGANIZATION. TIGHTENING A TABLE NEEDS ARMAN'S OWN WORDS.
-- (The access ladder, common-docs/policies/access-ladder.md — Arman, 2026-09-26.)
--
-- 1. platform.derive_data_class: a table with no default visibility, or a `personal` default
--    visibility, is Organization (it was Private / Confidential). The owner-only variants keep
--    describing themselves (`personal` -> private, `restricted` -> confidential) because those
--    variants can only be reached through the approval door below. A ledger is derived like any
--    other table instead of being left unclassified.
-- 2. iam.class_lanes: an unregistered token, an unclassified token and a component with no
--    classified parent resolve to Organization (they resolved to Private).
-- 3. A BEFORE INSERT OR UPDATE trigger on platform.entity_types refuses, with the reason, the
--    law's path and the exact approval function, any row that ENTERS Confidential or Private —
--    by data_class or by rls_variant personal/restricted. Moving toward Public, and any update
--    that leaves a table's class and variant where they are, is untouched.
-- 4. Two approval functions, owner/service only, that take Arman's verbatim words and the date,
--    write them to platform.class_approval_by_arman, and then make the change.
-- 5. platform.strict_class_probe_that_can_never_commit — the self-tests' door: a probe may take a
--    strict class inside a transaction, and a deferred constraint trigger refuses the COMMIT if
--    the probe token is still strict at the end. A probe can never land.
-- 6. platform.defaults_that_lock_people_out() — the guard. Zero rows or it failed.
--
-- Existing Private/Confidential tables are NOT moved here (T-7/T-8 decide them).

-- ── 1. derive_data_class ────────────────────────────────────────────────────────────────────
create or replace function platform.derive_data_class(p_variant text, p_visibility text)
 returns platform.data_class
 language sql
 immutable
as $function$
  -- THE ACCESS LADDER (common-docs/policies/access-ladder.md): every table starts at
  -- Organization. Nothing here resolves "unknown" to Confidential or Private.
  select case
    -- A component holds no class; its access is its parent's (db-rules §6d-1).
    when p_variant = 'component' then null
    -- The two owner-only variants describe themselves. Neither is reachable without Arman's
    -- recorded approval (platform._entity_types_strict_class_needs_arman).
    when p_variant = 'personal' then 'private'::platform.data_class
    when p_variant = 'restricted' then 'confidential'::platform.data_class
    when p_visibility = 'public' then 'public'::platform.data_class
    -- Everything else — no default visibility, `personal`, `internal`, `link`, a reference
    -- catalogue, a ledger — is Organization.
    else 'organization'::platform.data_class
  end;
$function$;

-- ── 2. class_lanes ──────────────────────────────────────────────────────────────────────────
create or replace function iam.class_lanes(p_token text)
 returns platform.lane_set
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'platform', 'iam', 'public'
as $function$
declare
  v_class platform.data_class;
  v_variant text;
  v_found boolean;
  v_anon_optin boolean;
  r platform.lane_set;
begin
  select et.data_class, et.rls_variant, true, coalesce(et.client_anonymous_public_read, false) into v_class, v_variant, v_found, v_anon_optin
    from platform.entity_types et where et.token = p_token and et.is_active;

  -- 🚨 THE ACCESS LADDER (common-docs/policies/access-ladder.md, Arman 2026-09-26): every table
  -- starts at Organization, and locking a person out of their organization's work is a bug,
  -- never caution. An unregistered token, an unclassified token and a component whose parents
  -- carry no class all resolve to `organization`. `iam.apply_rls` still refuses to GENERATE for
  -- an unclassified token; this is the runtime answer, and it is never Confidential or Private.
  if not coalesce(v_found, false) then
    v_class := 'organization';                  -- unregistered token: the default level
  elsif v_variant = 'component' then
    -- 🚨 A COMPONENT'S LANES ARE ITS PARENT'S (db-rules §6d-1), AND THE STRICTEST PARENT WINS.
    -- Walk the composition edges upward. A component under two parents gets the tighter of the two,
    -- because access is a union and the CLASS is a floor: the looser parent's own lanes still admit
    -- whoever they always admitted, through that parent's own policy. Depth is bounded because a
    -- cycle in the registry must not be able to hang every policy evaluation on the platform.
    with recursive up as (
      select p_token as tok, 0 as depth
      union all
      select er.parent_type, u.depth + 1
        from up u
        join platform.entity_types cet on cet.token = u.tok and cet.is_active
                                      and cet.rls_variant = 'component'
        join platform.entity_relationships er on er.child_type = u.tok and er.kind = 'composition'
       where u.depth < 12
    )
    select min(et.data_class) into v_class
      from up u join platform.entity_types et on et.token = u.tok and et.is_active
     where u.depth > 0 and et.data_class is not null;
    -- A component with no classified parent is a registry defect (db-rules §6d-1 requires one).
    -- It resolves to the default level, Organization.
    v_class := coalesce(v_class, 'organization');
  else
    v_class := coalesce(v_class, 'organization');
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
  -- 🚨 THE OPT-IN ANONYMOUS LANE (chair ruling 2026-09-22, DD-249 / R12). `public` is still
  -- the one class whose lane set includes anon BY DEFAULT. What changed is that a row marked
  -- `visibility = 'public'` IS an anonymous read lane by definition -- that is what the word
  -- means to the person who set it -- so a table serving such rows on an `organization` class
  -- can DECLARE the lane instead of being reclassified, emptied, or kept off the canonical
  -- route. It is per table, it is explicit, it defaults false, and it is asked HERE because
  -- this is the one place the lane is decided: iam.apply_rls's R12 guard, the pub_read
  -- emitter in iam._apply_rls_unchecked, and iam.verify_canonical's class_lanes_match_policy
  -- all read this answer, so teaching it once teaches all three and they cannot disagree.
  -- The lane still admits ONLY public, non-deleted rows: the emitter's predicate is
  -- unchanged, and it is gated on the table having a `visibility` column at all.
  r.anon_lane           := v_class = 'public' or coalesce(v_anon_optin, false);
  -- ARMAN, 2026-09-23 (amends VISIBILITY-BY-CLASS §3.4): an owner may share ANY row they own by
  -- link, whatever its class — "the user can do whatever they want with their data; our
  -- permissions already cover that." The link is owner-issued (public.create_share_link refuses
  -- anybody who is not the row's owner), so this lane is open on every class.
  r.share_link_lane     := true;
  r.owner_rewrite_lane  := v_class in ('organization','public');
  r.emergency_door      := case v_class
                             when 'private'      then 'owner_plus_approver'
                             when 'confidential' then 'one_admin'
                             else 'none' end;
  return r;
end
$function$;

-- ── 3. the approval ledger and the probe marker ─────────────────────────────────────────────
create table platform.class_approval_by_arman (
  id                   bigint generated always as identity primary key,
  token                text not null check (btrim(token) <> ''),
  level                platform.data_class not null check (level in ('private','confidential')),
  arman_words          text not null check (length(btrim(arman_words)) >= 40),
  approved_on          date not null,
  recorded_by_session  text not null default session_user,
  recorded_by_role     text,
  recorded_by_user     uuid,
  application_name     text,
  txid                 xid8 not null default pg_current_xact_id(),
  recorded_at          timestamptz not null default now()
);
comment on table platform.class_approval_by_arman is
  'Every table moved INTO Confidential or Private, with Arman''s verbatim approval words, the date he gave them and who recorded them. Written only by platform.set_table_confidential_arman_explicitly_approved / platform.set_table_private_arman_explicitly_approved. Append-only. Law: common-docs/policies/access-ladder.md.';
create index class_approval_by_arman_token_txid on platform.class_approval_by_arman (token, txid);
alter table platform.class_approval_by_arman enable row level security;
revoke all on platform.class_approval_by_arman from public, anon, authenticated, service_role;
grant select on platform.class_approval_by_arman to authenticated, service_role;
-- platform_admin_read is created by the admin_read_follows_rls event trigger the moment RLS is on.

create or replace function platform._class_approval_by_arman_is_append_only()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'platform.class_approval_by_arman is append-only: an approval Arman gave is history and is never edited or deleted.'
    using errcode = '42501';
end
$function$;
create trigger class_approval_by_arman_append_only
  before update or delete on platform.class_approval_by_arman
  for each row execute function platform._class_approval_by_arman_is_append_only();

create table platform.strict_class_probe (
  id        bigint generated always as identity primary key,
  token     text not null,
  level     platform.data_class not null check (level in ('private','confidential')),
  txid      xid8 not null default pg_current_xact_id()
);
comment on table platform.strict_class_probe is
  'Self-test probes only. A row lets one token take a strict class inside ONE transaction; a deferred constraint trigger refuses the COMMIT while that token is still Confidential or Private, and deletes the row when it is not. Never a way to make a real table strict — that is platform.set_table_*_arman_explicitly_approved.';
alter table platform.strict_class_probe enable row level security;
revoke all on platform.strict_class_probe from public, anon, authenticated, service_role;

create or replace function platform._strict_class_probe_never_commits()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
begin
  if exists (select 1 from platform.entity_types et
              where et.token = new.token and et.is_active
                and (et.data_class in ('private','confidential')
                     or et.rls_variant in ('personal','restricted'))) then
    raise exception 'Refused at COMMIT: probe token % is still Confidential or Private. platform.strict_class_probe_that_can_never_commit is for self-tests that roll back or tear their probe down; a real table becomes Confidential or Private only with Arman''s recorded approval — platform.set_table_confidential_arman_explicitly_approved / platform.set_table_private_arman_explicitly_approved (common-docs/policies/access-ladder.md).',
      new.token using errcode = '42501';
  end if;
  delete from platform.strict_class_probe where id = new.id;
  return null;
end
$function$;
create constraint trigger strict_class_probe_never_commits
  after insert on platform.strict_class_probe
  deferrable initially deferred
  for each row execute function platform._strict_class_probe_never_commits();

-- ── 4. the refusal (one pure function the trigger and the guard both ask) ───────────────────
create or replace function platform.strict_class_refusal(
  p_token text, p_is_insert boolean,
  p_old_class platform.data_class, p_new_class platform.data_class,
  p_old_variant text, p_new_variant text)
 returns text
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_class_enters boolean;
  v_variant_enters boolean;
  v_level platform.data_class;
  v_word text;
  v_fn text;
begin
  -- A reference catalogue's own CHECK refuses a strict class in its own words; a component holds
  -- no class at all. Neither is a tightening this door decides.
  v_class_enters := p_new_class in ('private','confidential')
                    and coalesce(p_new_variant, '') not in ('reference','component')
                    and (p_is_insert or p_new_class is distinct from p_old_class);
  v_variant_enters := p_new_variant in ('personal','restricted')
                      and (p_is_insert or p_new_variant is distinct from p_old_variant);
  if not (v_class_enters or v_variant_enters) then
    return null;
  end if;

  v_level := case when v_class_enters then p_new_class
                  when p_new_variant = 'personal' then 'private'::platform.data_class
                  else null end;

  if exists (select 1 from platform.class_approval_by_arman a
              where a.token = p_token and a.txid = pg_current_xact_id()
                and (v_level is null or a.level = v_level))
     or exists (select 1 from platform.strict_class_probe p
              where p.token = p_token and p.txid = pg_current_xact_id()
                and (v_level is null or p.level = v_level)) then
    return null;
  end if;

  v_word := case coalesce(v_level, 'confidential'::platform.data_class)
              when 'private' then 'Private' else 'Confidential' end;
  v_fn := case coalesce(v_level, 'confidential'::platform.data_class)
            when 'private' then 'platform.set_table_private_arman_explicitly_approved'
            else 'platform.set_table_confidential_arman_explicitly_approved' end;
  return format(
    'Refused: %s would become %s%s. Every table is Organization by default, and Confidential or '
    'Private locks people out of their own organization''s work, so only Arman approves it — '
    '"it seemed safer" is never a reason. The law: common-docs/policies/access-ladder.md. If Arman '
    'approved this table in his own words, record them and make the change with '
    '%s(p_token => %L, p_arman_words => ''<his exact words>'', p_approved_on => ''<the date he said them>''). '
    'Moving a table toward Public never needs approval.',
    p_token, v_word,
    case when v_variant_enters then format(' (rls_variant %s)', p_new_variant) else '' end,
    v_fn, p_token);
end
$function$;
revoke all on function platform.strict_class_refusal(text, boolean, platform.data_class, platform.data_class, text, text) from public, anon, authenticated;

create or replace function platform._entity_types_strict_class_needs_arman()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_msg text;
begin
  if tg_op = 'INSERT' then
    v_msg := platform.strict_class_refusal(new.token, true, null, new.data_class, null, new.rls_variant);
  else
    v_msg := platform.strict_class_refusal(new.token, false, old.data_class, new.data_class,
                                           old.rls_variant, new.rls_variant);
  end if;
  if v_msg is not null then
    raise exception '%', v_msg using errcode = '42501';
  end if;
  return new;
end
$function$;
-- Fires after _entity_types_classify_default (BEFORE triggers run in name order), so an INSERT
-- is judged on the class it was actually born with.
create trigger _entity_types_strict_class_needs_arman
  before insert or update on platform.entity_types
  for each row execute function platform._entity_types_strict_class_needs_arman();

-- ── 5. the two approval doors and the probe door ────────────────────────────────────────────
create or replace function platform._record_arman_class_approval(
  p_token text, p_level platform.data_class, p_arman_words text, p_approved_on date)
 returns bigint
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_id bigint;
  v_words text := btrim(coalesce(p_arman_words, ''));
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'An approval names the table it approves: p_token is empty.' using errcode = '22023';
  end if;
  if length(v_words) < 40 or array_length(regexp_split_to_array(v_words, '\s+'), 1) < 8 then
    raise exception 'Refused: p_arman_words must be Arman''s own words approving % as %, verbatim — at least 40 characters and 8 words. A paraphrase, a ticket number or "approved" is not his approval (common-docs/policies/access-ladder.md).',
      p_token, initcap(p_level::text) using errcode = '22023';
  end if;
  if p_approved_on is null or p_approved_on > current_date then
    raise exception 'Refused: p_approved_on must be the date Arman gave this approval, and it cannot be in the future (got %).',
      p_approved_on using errcode = '22023';
  end if;
  insert into platform.class_approval_by_arman
    (token, level, arman_words, approved_on, recorded_by_role, recorded_by_user, application_name)
  values
    (btrim(p_token), p_level, v_words, p_approved_on,
     nullif(auth.role(), ''),
     auth.uid(),
     nullif(current_setting('application_name', true), ''))
  returning id into v_id;
  return v_id;
end
$function$;
revoke all on function platform._record_arman_class_approval(text, platform.data_class, text, date) from public, anon, authenticated, service_role;

create or replace function platform._set_table_strict_class(
  p_token text, p_level platform.data_class, p_arman_words text, p_approved_on date,
  p_rls_variant text, p_set_class_now boolean)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_id bigint;
  v_et record;
begin
  v_id := platform._record_arman_class_approval(p_token, p_level, p_arman_words, p_approved_on);
  if not coalesce(p_set_class_now, true) then
    -- The approval stands for the rest of THIS transaction: move rls_variant, retrofit, then set
    -- data_class yourself, in that order (the regeneration trigger fires on the class change).
    return jsonb_build_object('token', p_token, 'level', p_level, 'approval_id', v_id,
                              'class_set', false,
                              'next', 'in this same transaction: move rls_variant, retrofit, then set data_class');
  end if;

  select et.token, et.rls_variant, et.data_class, et.is_active into v_et
    from platform.entity_types et where et.token = p_token;
  if not found or not v_et.is_active then
    raise exception 'platform.entity_types has no active token %. Register the table first, or pass p_set_class_now => false and set its class in this transaction.', p_token
      using errcode = '22023';
  end if;
  if coalesce(p_rls_variant, v_et.rls_variant) in ('component','reference') then
    raise exception '% is a % — %', p_token, coalesce(p_rls_variant, v_et.rls_variant),
      case when coalesce(p_rls_variant, v_et.rls_variant) = 'component'
           then 'it holds no class; its access is its parent''s (db-rules §6d-1). Approve the parent.'
           else 'a reference catalogue is read by every signed-in member and is never Confidential or Private.' end
      using errcode = '22023';
  end if;

  -- Variant and class move in ONE statement: the personal variant's CHECK requires the private
  -- class on the same row, and the class-change trigger regenerates the policies from the
  -- variant the row carries after this statement.
  update platform.entity_types
     set rls_variant = coalesce(p_rls_variant, rls_variant),
         data_class = p_level,
         suppress_platform_admin_lane = true,
         data_class_reason = format('Arman approved %s on %s: "%s" (platform.class_approval_by_arman #%s)',
                                    initcap(p_level::text), p_approved_on, btrim(p_arman_words), v_id)
   where token = p_token;

  return jsonb_build_object('token', p_token, 'level', p_level, 'approval_id', v_id,
                            'class_set', true, 'from', v_et.data_class,
                            'rls_variant', coalesce(p_rls_variant, v_et.rls_variant));
end
$function$;
revoke all on function platform._set_table_strict_class(text, platform.data_class, text, date, text, boolean) from public, anon, authenticated, service_role;

create or replace function platform.set_table_confidential_arman_explicitly_approved(
  p_token text, p_arman_words text, p_approved_on date,
  p_rls_variant text default null, p_set_class_now boolean default true)
 returns jsonb
 language sql
 security definer
 set search_path to 'pg_catalog'
as $function$
  select platform._set_table_strict_class(p_token, 'confidential'::platform.data_class,
                                          p_arman_words, p_approved_on, p_rls_variant, p_set_class_now);
$function$;
comment on function platform.set_table_confidential_arman_explicitly_approved(text, text, date, text, boolean) is
  'The ONLY way a table becomes Confidential. p_arman_words = Arman''s verbatim approval (>= 40 chars, 8 words); p_approved_on = the date he gave it. Records both in platform.class_approval_by_arman, then sets the class (and p_rls_variant when given) in one statement, which regenerates the policies. p_set_class_now => false records the approval only, for a caller that must move rls_variant and retrofit before setting the class in the same transaction. Law: common-docs/policies/access-ladder.md.';

create or replace function platform.set_table_private_arman_explicitly_approved(
  p_token text, p_arman_words text, p_approved_on date,
  p_rls_variant text default null, p_set_class_now boolean default true)
 returns jsonb
 language sql
 security definer
 set search_path to 'pg_catalog'
as $function$
  select platform._set_table_strict_class(p_token, 'private'::platform.data_class,
                                          p_arman_words, p_approved_on, p_rls_variant, p_set_class_now);
$function$;
comment on function platform.set_table_private_arman_explicitly_approved(text, text, date, text, boolean) is
  'The ONLY way a table becomes Private. p_arman_words = Arman''s verbatim approval (>= 40 chars, 8 words); p_approved_on = the date he gave it. Records both in platform.class_approval_by_arman, then sets the class (and p_rls_variant when given) in one statement, which regenerates the policies. p_set_class_now => false records the approval only, for a caller that must move rls_variant and retrofit before setting the class in the same transaction. Law: common-docs/policies/access-ladder.md.';

-- The two approval doors are SECURITY DEFINER (service_role holds only SELECT on the registry),
-- so each declares its access decision in data: no client ever calls them.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', f.fn,
       pg_get_function_identity_arguments(format('platform.%s(text,text,date,text,boolean)', f.fn)::regprocedure),
       array['text','text','date','text','boolean']::regtype[]::oid[],
       format('The ONLY path by which a table becomes %s (common-docs/policies/access-ladder.md). p_token names a platform.entity_types token and is checked against the registry (active, not a component, not a reference catalogue); p_arman_words must be Arman''s verbatim approval, at least 40 characters and 8 words, else 22023; p_approved_on must be a date not in the future, else 22023; p_rls_variant NULL keeps the variant; p_set_class_now false records the approval only. Every call writes platform.class_approval_by_arman.', f.lvl),
       'access_ladder_defaults_are_organization.sql',
       'server_only: Arman''s approval is recorded by the owning engineering session over the owner connection, or by aidream with the service role; no browser, signed in or not, ever calls it, and anon/authenticated hold no EXECUTE.',
       false, false
  from (values ('set_table_confidential_arman_explicitly_approved', 'Confidential'),
               ('set_table_private_arman_explicitly_approved', 'Private')) f(fn, lvl);

revoke all on function platform.set_table_confidential_arman_explicitly_approved(text, text, date, text, boolean) from public, anon, authenticated;
revoke all on function platform.set_table_private_arman_explicitly_approved(text, text, date, text, boolean) from public, anon, authenticated;
grant execute on function platform.set_table_confidential_arman_explicitly_approved(text, text, date, text, boolean) to service_role;
grant execute on function platform.set_table_private_arman_explicitly_approved(text, text, date, text, boolean) to service_role;

create or replace function platform.strict_class_probe_that_can_never_commit(
  p_token text, p_level platform.data_class)
 returns void
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
begin
  if p_level not in ('private','confidential') then
    raise exception 'A probe door is only for a strict level; % needs no door.', p_level using errcode = '22023';
  end if;
  insert into platform.strict_class_probe (token, level) values (p_token, p_level);
end
$function$;
comment on function platform.strict_class_probe_that_can_never_commit(text, platform.data_class) is
  'Self-tests only. Lets p_token take p_level inside THIS transaction; the COMMIT is refused while the token is still Confidential or Private. Never a way to make a real table strict.';
revoke all on function platform.strict_class_probe_that_can_never_commit(text, platform.data_class) from public, anon, authenticated, service_role;

-- ── 6. the guard ────────────────────────────────────────────────────────────────────────────
create or replace function platform.defaults_that_lock_people_out()
 returns table(check_name text, detail text)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_variant text;
  v_vis text;
  v_class platform.data_class;
  v_msg text;
  v_role text;
  v_fn text;
begin
  -- A. Every default derivation lands on Organization or Public. The owner-only variants
  --    (personal, restricted) are excluded because they are reachable only through approval,
  --    and a component holds no class.
  foreach v_variant in array array['entity','system','ledger','reference'] loop
    foreach v_vis in array array['__unset__','personal','internal','link','public'] loop
      v_class := platform.derive_data_class(v_variant, nullif(v_vis, '__unset__'));
      if v_class is null or v_class in ('private','confidential') then
        check_name := 'derive_data_class';
        detail := format('rls_variant=%s, default_visibility=%s derives %s — a default must be Organization (or Public for a public default).',
                         v_variant, replace(v_vis, '__unset__', 'unset'), coalesce(v_class::text, 'nothing'));
        return next;
      end if;
    end loop;
  end loop;

  -- B. The runtime resolver's fallbacks.
  v_class := (iam.class_lanes('__no_such_token_access_ladder_guard__')).resolved_class;
  if v_class is distinct from 'organization' then
    check_name := 'class_lanes_unregistered';
    detail := format('iam.class_lanes resolves an unregistered token to %s; the default is organization.', v_class);
    return next;
  end if;
  return query
    select 'class_lanes_unclassified'::text,
           format('%s (rls_variant %s) has no class of its own or from a parent and iam.class_lanes resolves it to %s; the default is organization.',
                  et.token, et.rls_variant, (iam.class_lanes(et.token)).resolved_class)
      from platform.entity_types et
     where et.is_active and et.rls_variant <> 'reference'
       and (et.data_class is null)
       and (iam.class_lanes(et.token)).resolved_class in ('private','confidential')
       and not exists (
         with recursive up as (
           select et.token as tok, 0 as depth
           union all
           select er.parent_type, u.depth + 1
             from up u
             join platform.entity_types cet on cet.token = u.tok and cet.is_active and cet.rls_variant = 'component'
             join platform.entity_relationships er on er.child_type = u.tok and er.kind = 'composition'
            where u.depth < 12)
         select 1 from up u join platform.entity_types p on p.token = u.tok and p.is_active
          where u.depth > 0 and p.data_class is not null);

  -- C. The refusal still refuses, in its own words, and still lets the approved and loosening
  --    paths through.
  v_msg := platform.strict_class_refusal('__guard_probe__', false, 'organization', 'confidential', 'entity', 'entity');
  if v_msg is null or v_msg not like '%common-docs/policies/access-ladder.md%'
     or v_msg not like '%platform.set_table_confidential_arman_explicitly_approved%' then
    check_name := 'refusal_confidential';
    detail := format('platform.strict_class_refusal no longer refuses Organization -> Confidential with the law and the approval function (answered %s).', coalesce(v_msg, 'NULL'));
    return next;
  end if;
  v_msg := platform.strict_class_refusal('__guard_probe__', true, null, 'private', null, 'entity');
  if v_msg is null or v_msg not like '%platform.set_table_private_arman_explicitly_approved%' then
    check_name := 'refusal_private_insert';
    detail := 'platform.strict_class_refusal no longer refuses a table born Private.';
    return next;
  end if;
  v_msg := platform.strict_class_refusal('__guard_probe__', false, 'organization', 'organization', 'entity', 'personal');
  if v_msg is null then
    check_name := 'refusal_variant';
    detail := 'platform.strict_class_refusal no longer refuses moving rls_variant to personal.';
    return next;
  end if;
  if platform.strict_class_refusal('__guard_probe__', false, 'confidential', 'organization', 'restricted', 'entity') is not null
     or platform.strict_class_refusal('__guard_probe__', false, 'private', 'private', 'personal', 'personal') is not null then
    check_name := 'refusal_overreach';
    detail := 'platform.strict_class_refusal refuses a loosening or an unchanged class — moving toward Public and regenerating an existing table must always work.';
    return next;
  end if;

  -- D. The trigger that asks it is present and enabled.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'platform.entity_types'::regclass
                    and t.tgname = '_entity_types_strict_class_needs_arman'
                    and t.tgenabled <> 'D'
                    and t.tgfoid = 'platform._entity_types_strict_class_needs_arman()'::regprocedure) then
    check_name := 'gate_trigger';
    detail := 'platform.entity_types has no enabled _entity_types_strict_class_needs_arman trigger — nothing refuses a table entering Confidential or Private.';
    return next;
  end if;

  -- E. No client can reach an approval, probe or ledger write.
  foreach v_role in array array['anon','authenticated'] loop
    foreach v_fn in array array[
      'platform.set_table_confidential_arman_explicitly_approved(text,text,date,text,boolean)',
      'platform.set_table_private_arman_explicitly_approved(text,text,date,text,boolean)',
      'platform.strict_class_probe_that_can_never_commit(text,platform.data_class)',
      'platform._set_table_strict_class(text,platform.data_class,text,date,text,boolean)',
      'platform._record_arman_class_approval(text,platform.data_class,text,date)'] loop
      if has_function_privilege(v_role, v_fn, 'execute') then
        check_name := 'client_can_approve';
        detail := format('%s can execute %s — approving Confidential or Private is Arman''s alone.', v_role, v_fn);
        return next;
      end if;
    end loop;
    if has_table_privilege(v_role, 'platform.class_approval_by_arman', 'insert,update,delete')
       or has_table_privilege(v_role, 'platform.strict_class_probe', 'insert,update,delete') then
      check_name := 'client_can_write_ledger';
      detail := format('%s can write the approval ledger or the probe marker.', v_role);
      return next;
    end if;
  end loop;
  if has_table_privilege('service_role', 'platform.class_approval_by_arman', 'insert,update,delete')
     or has_table_privilege('service_role', 'platform.strict_class_probe', 'insert,update,delete')
     or has_function_privilege('service_role', 'platform.strict_class_probe_that_can_never_commit(text,platform.data_class)', 'execute') then
    check_name := 'service_can_forge';
    detail := 'service_role can write the approval ledger or open the probe door directly; it may only call the two approval functions.';
    return next;
  end if;
  return;
end
$function$;
comment on function platform.defaults_that_lock_people_out() is
  'The access-ladder guard: every default is Organization, entering Confidential/Private is refused unless Arman''s words are recorded, and no client can forge an approval. Zero rows = pass. Run by matrx-frontend pnpm check:defaults-are-organization.';
revoke all on function platform.defaults_that_lock_people_out() from public, anon, authenticated;

-- ── 7. the rest of the census: every place that still resolved "unknown" to private ─────────
do $migration$
declare
  v_src text; v_new text;
begin
  -- iam.verify_canonical: its data_class_set explanation named the old fallback.
  v_src := pg_get_functiondef('iam.verify_canonical(text,text,text,text)'::regprocedure);
  v_new := replace(v_src,
    'iam.apply_rls will not generate for this token and iam.class_lanes resolves it to private.',
    'iam.apply_rls will not generate for this token, and iam.class_lanes resolves it to organization, the level every table starts at (common-docs/policies/access-ladder.md).');
  if v_new = v_src then raise exception 'verify_canonical: anchor text not found — the live body moved; re-read it'; end if;
  execute v_new;

  -- iam._discovery_class_selftest_once: its probe takes private and confidential on purpose,
  -- so it opens the probe door (which refuses any COMMIT that keeps the probe strict).
  v_src := pg_get_functiondef('iam._discovery_class_selftest_once()'::regprocedure);
  v_new := replace(v_src,
    E'  update platform.entity_types\n     set data_class_reason = ''DD-189 self-test probe;',
    E'  -- The probe takes private and confidential below on purpose; the access ladder refuses that\n'
    || E'  -- on every table without Arman''s recorded words, so the probe opens the door that can\n'
    || E'  -- never commit (the teardown below removes the token before any COMMIT).\n'
    || E'  perform platform.strict_class_probe_that_can_never_commit(v_token, ''private'');\n'
    || E'  perform platform.strict_class_probe_that_can_never_commit(v_token, ''confidential'');\n'
    || E'  update platform.entity_types\n     set data_class_reason = ''DD-189 self-test probe;');
  if v_new = v_src then raise exception '_discovery_class_selftest_once: anchor text not found'; end if;
  execute v_new;
end
$migration$;
