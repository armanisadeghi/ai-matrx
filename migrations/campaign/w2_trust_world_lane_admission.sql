-- target: branch,production
-- additive: yes
-- guard: custom/world_publish_enabled
--
-- W2-TRUST — VIS-N-7, the world lane's admission and trust layer.
-- Unified data campaign v5, 2026-09-18.
--
-- THE LAW: publishing to the world lane requires NAMESPACING and PUBLISHER VERIFICATION,
-- enforced at publish time, and the refusal names which of the two failed. The pre-listing
-- malware scan with quarantine, and report-and-takedown ranking, are DEFERRED (D-15) — so the
-- publish path announces that gap by name, with its remedy, on every single admission, rather
-- than letting anybody read a listing and believe something was scanned.
--
-- RULING (rules 23/28), recorded before the first object: the two admission CHECKS are not
-- switchable. A gate on who may put things in front of the open internet that a knob can turn
-- off is not a gate. What the knob custom/world_publish_enabled holds OFF is the world LANE
-- itself: while it resolves false, iam.publish_to_world refuses every publish and says so —
-- which is exactly the answer the platform gave before this campaign, because nothing has ever
-- been published. Turning it on does not relax a check; it opens the path the checks stand in
-- front of. Cost if wrong: one boolean.
--
-- Shape note: the three tables below are MACHINERY tables, not entity-shaped ones — they carry
-- created_at/updated_at and nothing else from the entity column set, exactly as iam.content_lane
-- does, so platform._provision_shape_guard's lane (d) does not fire and no entity token is
-- minted. A token minted from a lane reds pnpm check:entity-types and halts the frontend release
-- train for every unrelated lane, which is why W2-ACCESS left iam.content_lane's own token to
-- the lane that owns the vocabulary.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description, set_by, basis)
values
  ('custom', 'world_publish_enabled', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'The world lane accepts publishes',
   'While false, iam.publish_to_world refuses every publish by name — the answer the platform '
   'gave before this campaign. It does not switch off namespacing or publisher verification; '
   'those are checks, not features, and are never optional (VIS-N-7).',
   'agent', 'Unified data campaign, W2-TRUST, 2026-09-18.')
on conflict (feature, key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 3. VIS-N-7 — the world lane's admission layer.
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Shape note: these three are MACHINERY tables, not entity-shaped ones — they carry
-- created_at/updated_at and nothing else from the entity column set, exactly as iam.content_lane
-- does, so platform._provision_shape_guard's lane (d) does not fire and no entity token is
-- minted. A token minted from a lane halts the frontend release train for everybody
-- (pnpm check:entity-types), which is why W2-ACCESS left iam.content_lane's own token to the
-- lane that owns the vocabulary.

create table if not exists iam.world_namespace (
  organization_id  uuid primary key references iam.organizations(id) on delete cascade,
  namespace        text not null unique
                   check (namespace ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  claimed_by       uuid,
  claimed_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table iam.world_namespace is
  'VIS-N-7: an organization publishes to the world under ONE namespace it claimed, and every '
  'public URL is namespaced by it. Unclaimed means unpublishable — a name nobody owns cannot be '
  'impersonated, which is the whole point of namespacing.';

create function iam.reserved_namespace()
returns table (namespace text, reason text)
language sql
immutable
as $function$
  select * from (values
    ('admin',     'the platform' || chr(39) || 's own surfaces'),
    ('api',       'the platform' || chr(39) || 's own surfaces'),
    ('app',       'the platform' || chr(39) || 's own surfaces'),
    ('auth',      'the platform' || chr(39) || 's own surfaces'),
    ('matrx',     'ours'),
    ('aimatrx',   'ours'),
    ('official',  'it implies we vouch for it'),
    ('verified',  'it implies we vouch for it'),
    ('support',   'it implies we answer for it'),
    ('security',  'it implies we answer for it'),
    ('system',    'it reads as a platform lane'),
    ('community', 'it reads as a platform lane'),
    ('world',     'it reads as a platform lane')
  ) as r(namespace, reason);
$function$;

comment on function iam.reserved_namespace() is
  'VIS-N-7: names nobody may publish under, because each of them would read as if the thing came '
  'from us. A function rather than a table, so the list can only change in a migration.';

create table if not exists iam.publisher_verification (
  organization_id  uuid primary key references iam.organizations(id) on delete cascade,
  verified         boolean not null default false,
  method           text check (method in ('domain', 'payment_instrument', 'manual_review')),
  evidence         text,
  verified_at      timestamptz,
  verified_by      uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint verified_says_how check (not verified or (method is not null and verified_at is not null))
);

comment on table iam.publisher_verification is
  'VIS-N-7: who is allowed to put things in front of the open internet under our domain. '
  'GitHub verified publishers, 2021; Salesforce AgentExchange review; the GPT Store''s 2024 spam '
  'cycle is the counterexample. A row that says verified must say how and when.';

create table if not exists iam.world_publish_admission (
  id               uuid primary key default gen_random_uuid(),
  resource_type    text not null,
  resource_id      uuid not null,
  organization_id  uuid not null,
  namespace        text not null,
  published_by     uuid,
  published_at     timestamptz not null default now(),
  verification_method text,
  -- DEFERRED (D-15). Recorded as a state on every single admission so that no screen, export or
  -- agent can read this row and believe a scan happened.
  scan_state       text not null default 'not_performed'
                   check (scan_state in ('not_performed')),
  scan_remedy      text not null,
  ranking_state    text not null default 'not_built'
                   check (ranking_state in ('not_built')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists world_publish_admission_resource_idx
  on iam.world_publish_admission (resource_type, resource_id);
create index if not exists world_publish_admission_org_idx
  on iam.world_publish_admission (organization_id);

comment on table iam.world_publish_admission is
  'VIS-N-7: one row per admission to the world lane, naming the namespace it went out under and '
  'the verification that let it. scan_state and ranking_state are DEFERRED (D-15) and are '
  'recorded as such on every row — the enum has exactly one value each, so nothing can ever '
  'write a row here that claims a scan was performed.';

create function iam.world_publish_gap_notice()
returns text
language sql
immutable
as $function$
  select 'Nothing here has been scanned. We check who you are and the name you publish under, '
      || 'and nothing else: we do not yet scan what you publish for malware or secrets before it '
      || 'is listed, and there is no report-and-takedown ranking. Until we build both, treat '
      || 'anything published here the way you would treat a file from a stranger. '
      || '(Deferred item D-15; the trigger to build it is the first publish by anyone outside '
      || 'our own organizations.)';
$function$;

comment on function iam.world_publish_gap_notice() is
  'VIS-N-7 / D-15: the sentence the publish path says out loud. It exists as a function so the '
  'screen, the API and the audit row cannot drift into three different admissions of the same '
  'gap — or into none.';

create function iam.world_publish_admit(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_ns       text;
  v_verified boolean;
  v_method   text;
  v_fail     text[] := array[]::text[];
  v_why      text[] := array[]::text[];
begin
  select n.namespace into v_ns
    from iam.world_namespace n where n.organization_id = p_organization_id;
  if v_ns is null then
    v_fail := v_fail || 'namespacing'::text;
    v_why  := v_why  || ('This organization has not claimed a namespace, so there is no name for '
                         'the thing to be published under. Claim one with '
                         'iam.claim_world_namespace(organization, name).')::text;
  end if;

  select v.verified, v.method into v_verified, v_method
    from iam.publisher_verification v where v.organization_id = p_organization_id;
  if not coalesce(v_verified, false) then
    v_fail := v_fail || 'publisher verification'::text;
    v_why  := v_why  || ('This organization is not a verified publisher. Somebody has to stand '
                         'behind what goes out on the open internet under our domain.')::text;
  end if;

  return jsonb_build_object(
    'admitted', cardinality(v_fail) = 0,
    'failed',   to_jsonb(v_fail),
    'reasons',  to_jsonb(v_why),
    'namespace', v_ns,
    'verification_method', v_method,
    'scan_state', 'not_performed',
    'ranking_state', 'not_built',
    'notice', iam.world_publish_gap_notice());
end $function$;

comment on function iam.world_publish_admit(uuid) is
  'VIS-N-7: the two admission checks, answered together so a caller learns BOTH things it has to '
  'fix rather than one per round trip. The refusal names which of the two failed, by name.';

create function iam.claim_world_namespace(p_organization_id uuid, p_namespace text)
returns iam.world_namespace
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_row   iam.world_namespace;
  v_name  text := lower(btrim(coalesce(p_namespace, '')));
begin
  if v_actor is null then
    raise exception 'Nobody is signed in, so no namespace can be claimed.' using errcode = '42501';
  end if;
  if not iam.has_org_admin(p_organization_id) then
    raise exception 'Only an owner or admin of this organization can claim the name it publishes under.'
      using errcode = '42501';
  end if;
  if v_name !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'A namespace is 3 to 40 characters, lower-case letters, digits and hyphens, starting and ending with a letter or digit. "%" is not.', p_namespace
      using errcode = '22023';
  end if;
  if exists (select 1 from iam.reserved_namespace() r where r.namespace = v_name) then
    raise exception 'The name "%" is reserved: %.', v_name,
      (select r.reason from iam.reserved_namespace() r where r.namespace = v_name)
      using errcode = '23514',
            hint = 'Pick a name that does not read as if it came from us.';
  end if;
  if exists (select 1 from iam.world_namespace n
              where n.namespace = v_name and n.organization_id <> p_organization_id) then
    raise exception 'The name "%" is already taken by another organization.', v_name
      using errcode = '23505';
  end if;

  insert into iam.world_namespace as w (organization_id, namespace, claimed_by)
  values (p_organization_id, v_name, v_actor)
  on conflict (organization_id) do update
     set namespace = excluded.namespace, claimed_by = excluded.claimed_by,
         claimed_at = now(), updated_at = now()
  returning w.* into v_row;
  return v_row;
end $function$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 4. The publish path itself: admission enforced, the gap announced.
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- based-on: iam.publish_to_world(text, uuid, uuid, boolean) 37ef6acc43551af7cc17842143ba08d37dda153a322dcd0321a69fae474076cc
create or replace function iam.publish_to_world(p_resource_type text, p_resource_id uuid, p_organization_id uuid, p_discoverable boolean default false)
returns iam.content_lane
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_row   iam.content_lane;
  v_adm   jsonb;
  v_on    boolean;
begin
  if v_actor is null then
    raise exception 'Nobody is signed in, so nothing can be published.'
      using errcode = '42501';
  end if;
  if iam.effective_level(v_actor, p_resource_type, p_resource_id, p_organization_id)
       < iam.top_content_level() then
    raise exception 'Putting something out in the world is an %.',
                    iam.level_label('record', iam.top_content_level())
      using errcode = '42501',
            hint = 'VIS-N-5: the world lane is entered by an explicit act, by somebody who holds the top level on the thing.';
  end if;

  -- W2-TRUST, VIS-N-7. The lane is closed until somebody opens it, and it is opened for the
  -- platform, not per publish.
  v_on := coalesce(
    (platform.knob_resolve('custom', 'world_publish_enabled', p_organization_id, v_actor))
      #>> '{}', 'false')::boolean;
  if not v_on then
    raise exception 'The world lane is not open yet, so nothing can be published to it.'
      using errcode = '42501',
            hint = 'custom/world_publish_enabled resolves false. This is the answer the platform has always given; turning it on is a switch-checklist step, not a lane''s.';
  end if;

  -- W2-TRUST, VIS-N-7. Namespacing and publisher verification, at publish time, with the
  -- refusal naming which of the two failed. These are NOT switchable.
  v_adm := iam.world_publish_admit(p_organization_id);
  if not (v_adm ->> 'admitted')::boolean then
    raise exception 'This cannot go out in the world yet: % failed. %',
      array_to_string(array(select jsonb_array_elements_text(v_adm -> 'failed')), ' and '),
      array_to_string(array(select jsonb_array_elements_text(v_adm -> 'reasons')), ' ')
      using errcode = '42501', hint = iam.world_publish_gap_notice();
  end if;

  insert into iam.content_lane as c
        (resource_type, resource_id, organization_id, lane, discoverable, unlisted)
  values (p_resource_type, p_resource_id, p_organization_id, 'mine', false, true)
  on conflict (resource_type, resource_id) do nothing;

  update iam.content_lane c
     set lane = 'world',
         discoverable = p_discoverable,
         unlisted = not p_discoverable,
         entered_world_at = now(),
         entered_world_by = v_actor
   where c.resource_type = p_resource_type and c.resource_id = p_resource_id
  returning c.* into v_row;

  -- Every admission says, in its own row, that nothing was scanned (D-15).
  insert into iam.world_publish_admission
    (resource_type, resource_id, organization_id, namespace, published_by,
     verification_method, scan_remedy)
  values (p_resource_type, p_resource_id, p_organization_id, v_adm ->> 'namespace', v_actor,
          v_adm ->> 'verification_method', iam.world_publish_gap_notice());

  raise notice '%', iam.world_publish_gap_notice();

  return v_row;
end $function$;

create function iam.world_publish_announcement(p_resource_type text, p_resource_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select jsonb_build_object(
              'namespace', a.namespace,
              'published_at', a.published_at,
              'verification_method', a.verification_method,
              'scan_state', a.scan_state,
              'ranking_state', a.ranking_state,
              'notice', a.scan_remedy)
       from iam.world_publish_admission a
      where a.resource_type = p_resource_type and a.resource_id = p_resource_id
        -- The access decision, taken BEFORE existence so a foreign id and an invented one
        -- answer identically: a thing in the WORLD lane is public by construction and its
        -- admission facts are public with it; anything else is described only to somebody
        -- Visibility already lets read it.
        and (iam.lane_of(p_resource_type, p_resource_id) = 'world'
             or iam.has_access(p_resource_type, p_resource_id, 'viewer'::public.permission_level))
      order by a.published_at desc limit 1),
    jsonb_build_object('published', false,
                       'notice', 'This has not been published to the world lane.'));
$function$;

comment on function iam.world_publish_announcement(text, uuid) is
  'VIS-N-7 / D-15: what a listing screen must say beside anything in the world lane. It reads '
  'the admission row rather than a constant, so a published thing can never be shown without '
  'its own no-scan admission attached.';


-- ── The door register. Every SECURITY DEFINER function above has to say IN DATA who may call it
-- and what each entity-id argument is checked against. identity_args is rendered by
-- iam.door_identity_args, which renders it exactly the way the shape guard renders it.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'iam', 'world_publish_admit',
       iam.door_identity_args('iam.world_publish_admit(uuid)'::regprocedure),
       array['uuid'::regtype]::oid[],
       'p_organization_id is the organization being judged; it is NOT checked against the '
       'caller, because this function makes no access decision at all — it answers whether that '
       'organization has claimed a namespace and been verified as a publisher. Null yields '
       'admitted=false naming both failures. It is the check iam.publish_to_world runs, and '
       'iam.publish_to_world does the access check (top content level on the thing) before it.',
       'w2_trust_world_lane_admission.sql',
       'server_only: it takes an organization id it does not check against the caller, so on its '
       'own it would tell any signed-in person whether any organization is a verified publisher. '
       'The one caller is iam.publish_to_world, which has already established the caller holds '
       'the top level on the thing being published.',
       false, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'world_publish_admit');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'iam', 'claim_world_namespace',
       iam.door_identity_args('iam.claim_world_namespace(uuid,text)'::regprocedure),
       array['uuid'::regtype, 'text'::regtype]::oid[],
       'p_organization_id is the organization claiming the name and IS checked against the '
       'caller: iam.has_org_admin(p_organization_id) must be true, so only an owner or admin of '
       'that organization can claim what it publishes under; null fails that check and is '
       'refused with 42501. p_namespace is the name: 3 to 40 characters, lower-case letters, '
       'digits and hyphens, refused with 22023 otherwise, refused with 23514 when it is one of '
       'iam.reserved_namespace(), and refused with 23505 when another organization holds it.',
       'w2_trust_world_lane_admission.sql',
       true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'claim_world_namespace');

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'iam', 'world_publish_announcement',
       iam.door_identity_args('iam.world_publish_announcement(text,uuid)'::regprocedure),
       array['text'::regtype, 'uuid'::regtype]::oid[],
       'p_resource_type and p_resource_id name a thing that is already in the WORLD lane, so '
       'every fact this returns — the namespace it went out under, when, which verification '
       'admitted it, and that nothing was scanned — is public by construction; there is nothing '
       'here to check a caller against once it is out there. The body decides access before '
       'existence all the same: it answers only when iam.lane_of says WORLD, or when '
       'iam.has_access(p_resource_type, p_resource_id, viewer) is true — so a foreign id and an '
       'invented one give the same published=false sentence, never an error and never a hint '
       'that the row exists.',
       'w2_trust_world_lane_admission.sql',
       true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'iam' and d.function_name = 'world_publish_announcement');
