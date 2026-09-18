-- dd221_the_write_goes_through_the_keys_own_door
-- DD-221 — ONE PICKER, AND THE WRITE GOES THROUGH THE KEY'S OWN DOOR.
--
-- ═══ THE FACT THIS FILE ANSWERS (measured live 2026-09-14, rolled back) ═══
-- DD-203 mounted THE per-rung exceptions picker on `/hr/settings/*`, and made
-- it write through `platform.knob_override_set` because that is the picker's
-- one door. On an `hr.` key that door is the WRONG door, and two things follow
-- that nobody chose. With the real person `20149d3f-6572-4263-b43c-7e52f0e42058`
-- — an HR admin in Write Target Sandbox (`hr.capability(identity.write)` = true)
-- who is `role='member'`, not an org owner or admin — on
-- `hr.employees.adjusted_service_date_rule`, pay group "Bootstrap Proof Weekly":
--
--   knob_override_set(pay_group) → {"ok": false, "reason": "forbidden",
--                                   "detail": "Organization configuration is owner/admin only."}
--   hr_knob_set(pay_group)       → {"ok": true, "origin": "pay_group_override",
--                                   "audit_id": "d1a962b0-…"}   ← and that row is
--                                   really in `hr.access_audit` (counted: 1)
--
-- and, as an org OWNER on the same `hr.` key:
--
--   knob_override_set(pay_group) → {"ok": true, "origin": "pay_group_override"}
--                                   hr.access_audit rows for the organization:
--                                   1842 before, 1842 after — DELTA 0.
--
-- So one setting had two doors that disagreed about BOTH halves of authority:
-- the person HR says may configure HR was refused, the person HR never asked
-- about was admitted, and the admitted write left no trace in the audit trail
-- HR keeps of exactly this. That is not a UI preference; it is a capability
-- narrowed and an audit trail holed, silently, by which RPC a component happened
-- to import.
--
-- ═══ THE RULING (the chair, DD-221) ═══════════════════════════════════════
-- AUTHORITY BELONGS TO THE KEY. One picker — `KnobRungOverrides`, unchanged and
-- never copied — and the write goes through the door the KEY's own namespace
-- declares. So this file adds the missing thing: a place where that declaration
-- lives, and a door that answers it.
--
-- ═══ WHAT THIS FILE DOES ══════════════════════════════════════════════════
-- 1. `platform.knob_write_door` — the registry. One row per feature namespace:
--    the set door, the removal door, and WHICH authority decides. The row whose
--    prefix is `''` is the default, so every namespace has an answer and nothing
--    falls through to a guess. Provisioned by `platform.create_entity_table`
--    (variant `system`), so its RLS is GENERATED, never hand-written (§6d).
-- 2. `platform.knob_write_door_for(key, organization)` — the READ door. It
--    answers, for one key: which door writes it, which door removes it, and —
--    when an organization is named — whether THIS caller may write through it
--    right now, computed by the same predicates the real gates use. The screen
--    asks it instead of guessing from `org_role`, which is how an org admin with
--    no HR standing came to be offered an HR exception.
-- 3. `platform.knob_override_set` REFUSES a key whose namespace declares another
--    door, with a sentence naming that door. A DOOR DOES ONE THING: it does not
--    silently forward to `hr_knob_set` — a forward would make the caller's own
--    gate and audit depend on which name they typed, which is the defect.
-- 4. `public.hr_knob_clear` — the removal counterpart, which already existed for
--    every rung under the same HR gate — now names the scope row in its audit
--    row exactly as `hr_knob_set` does. A removal is a write.
--
-- ═══ WHAT THIS FILE DELIBERATELY DOES NOT DO ══════════════════════════════
-- It does not widen `platform.knob_override_set`'s own owner/admin gate, and it
-- does not teach `hr_knob_set` a new rung. Both doors keep exactly the authority
-- they had; the only thing that changes is WHICH ONE a key is written through,
-- and that is now declared rather than inherited from an import statement.
--
-- ═══ BLAST RADIUS, MEASURED BEFORE WRITING ════════════════════════════════
-- Callers of `platform.knob_override_set` anywhere: this repo's
-- `lib/scoped-config/service.ts`, two aidream provenance tests (`records.*`
-- keys), and ZERO in-database callers (`pg_proc` scan). `hr.*` keys offer only
-- `organization`, `employer_profile`, `pay_group`, `location` — no `user` rung —
-- and the live override store holds exactly one `hr.*` row, at the organization
-- rung, written by a 2026-08-29 migration. So refusing `hr.` at this door takes
-- nothing away from anything that was working.

-- A shared, busy database: the DDL lock guard bounds a bare CREATE TABLE to 2 s,
-- and a peer lane sitting idle-in-transaction on the catalog is enough to lose
-- that race (measured twice while rehearsing this file). An explicit bound is
-- what the guard asks for; it bounds WAITING, never holding.
SET lock_timeout = '30s';

-- ─────────────────────────────────────────────────────────────────────────
-- 1. The registry
-- ─────────────────────────────────────────────────────────────────────────
SELECT platform.create_entity_table(
  'platform', 'knob_write_door', 'knob_write_door', 'Knob write door',
  ARRAY[
    -- '' is the default row; a longer prefix wins (longest-prefix match).
    'feature_prefix text NOT NULL',
    'set_door text NOT NULL',
    'clear_door text NOT NULL',
    'authority_kind text NOT NULL',
    'reason text NOT NULL'
  ],
  'system',            -- p_variant
  false,               -- p_versioned
  false,               -- p_soft_delete
  'internal',          -- p_visibility
  false,               -- p_category
  false,               -- p_listed
  false,               -- p_org_default (explicit organization_id in every writer)
  false,               -- p_gin_jsonb
  p_data_class => 'organization'::platform.data_class,
  p_default_list_scope => 'organization'::platform.list_scope);

COMMENT ON TABLE platform.knob_write_door IS
  'DD-221 — which door writes a settings key, declared per feature namespace. One row per prefix; the '''' row is the default. Read through platform.knob_write_door_for(key, organization).';

ALTER TABLE platform.knob_write_door
  ADD CONSTRAINT knob_write_door_authority_kind_check
  CHECK (authority_kind IN ('org_steward', 'hr_settings_gate'));

-- One declaration per namespace: two rows that disagree is the defect this file
-- closes, wearing a different hat.
CREATE UNIQUE INDEX knob_write_door_feature_prefix_key
  ON platform.knob_write_door (feature_prefix);

INSERT INTO platform.knob_write_door
  (organization_id, feature_prefix, set_door, clear_door, authority_kind, reason)
VALUES
  ('39c38960-d30c-4840-b0c1-c9960de95582', '',
   'platform.knob_override_set', 'platform.knob_override_set', 'org_steward',
   'The platform default. A key whose namespace declares nothing else is organization configuration: owner/admin decide it, and platform.knob_override_set is the one door. Its removal is the same door with a null value, which deletes the row.'),
  ('39c38960-d30c-4840-b0c1-c9960de95582', 'hr.',
   'public.hr_knob_set', 'public.hr_knob_clear', 'hr_settings_gate',
   'HR settings are HR''s. hr._l1_settings_gate admits HR-admin standing (hr.capability identity.write) as well as an org owner/admin, and every write files an hr.access_audit row through hr._l1_write_audit. Written through platform.knob_override_set instead, the same exception refused the HR admin and left the audit trail empty (DD-221, measured 2026-09-14).');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. The read door — which door, and may I use it
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.knob_write_door_for(
  p_key text,
  p_organization_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'platform', 'public', 'hr', 'pg_temp'
AS $function$
-- THE ONE PLACE A SURFACE ASKS "which door writes this key, and may I use it".
--
-- Two answers, never one: a screen that knows the door but not the authority
-- either draws a control the door will refuse (a lying control) or hides one the
-- person is entitled to (the DD-221 defect, from the other side). `may_write` is
-- computed with the SAME predicates the real gates use — never re-stated, never
-- guessed from `org_role`.
--
-- It is STABLE and it writes nothing: `hr._l1_settings_gate` files a denial row
-- in `hr.access_audit` when it refuses, and asking "may I" is not knocking.
declare
  v_row platform.knob_write_door;
  v_uid uuid := auth.uid();
  v_may boolean;
  v_detail text;
begin
  if p_key is null or position('.' in p_key) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_key',
      'detail', 'A settings key is written <feature>.<key>, for example hr.employees.adjusted_service_date_rule.');
  end if;

  -- Longest declared prefix wins; the '' row is the default and matches everything.
  select d.* into v_row
    from platform.knob_write_door d
   where p_key like d.feature_prefix || '%'
   order by length(d.feature_prefix) desc
   limit 1;

  if v_row.feature_prefix is null then
    -- Only reachable if the default row was deleted. Say so; never invent a door.
    return jsonb_build_object('ok', false, 'reason', 'no_door_declared',
      'detail', format('No write door is declared for %s, and the default row is missing from platform.knob_write_door, so there is nothing to write it through.', p_key));
  end if;

  if p_organization_id is null then
    v_may := null;
    v_detail := 'No organization was named, so no authority was decided.';
  elsif v_uid is null then
    v_may := false;
    v_detail := 'Nobody is signed in.';
  elsif v_row.authority_kind = 'hr_settings_gate' then
    -- hr._l1_settings_gate's own two admissions, in its own order (DD-206).
    if hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id) then
      v_may := true;
      v_detail := 'You hold HR admin standing in this organization.';
    elsif coalesce(hr._l1_org_role(v_uid, p_organization_id, false) in ('owner', 'admin'), false) then
      v_may := true;
      v_detail := 'You are an owner or admin of this organization.';
    else
      v_may := false;
      v_detail := 'HR settings are HR-admin only.';
    end if;
  elsif v_row.authority_kind = 'org_steward' then
    -- platform.knob_override_set's own test, for every rung but `user`.
    if public.is_admin() then
      v_may := true;
      v_detail := 'You are a platform admin.';
    elsif exists (select 1 from iam.organization_member m
                   where m.organization_id = p_organization_id
                     and m.user_id = v_uid
                     and m.role in ('owner', 'admin')) then
      v_may := true;
      v_detail := 'You are an owner or admin of this organization.';
    else
      v_may := false;
      v_detail := 'Organization configuration is owner/admin only.';
    end if;
  else
    raise exception 'knob_write_door_for: % declares authority_kind %, which this door does not know how to ask', v_row.feature_prefix, v_row.authority_kind
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ok', true,
    'key', p_key,
    'feature_prefix', v_row.feature_prefix,
    'set_door', v_row.set_door,
    'clear_door', v_row.clear_door,
    'authority_kind', v_row.authority_kind,
    'reason', v_row.reason,
    'may_write', v_may,
    'authority_detail', v_detail);
end;
$function$;

COMMENT ON FUNCTION platform.knob_write_door_for(text, uuid) IS
  'DD-221 — which door writes this settings key, and whether this caller may use it. The surface asks; it never guesses.';

-- §6d-4: the door row is declared BEFORE the GRANT, or the DB-wide guard revokes
-- the client EXECUTE inside the GRANT itself.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   gate_predicate, anonymous_callers, signed_in_callers)
VALUES
  ('platform', 'knob_write_door_for', 'p_key text, p_organization_id uuid', 'DD-221',
   'Answers which door writes one settings key and whether the caller may write through it, so the exceptions picker calls the key''s own door and offers the add control exactly when that door''s authority holds. Reads a platform declaration table and two STABLE authority predicates; writes nothing.',
   'auth.uid()', false, true);

GRANT EXECUTE ON FUNCTION platform.knob_write_door_for(text, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. The default door refuses a key that is not its own
-- ─────────────────────────────────────────────────────────────────────────
-- based-on: platform.knob_override_set(text, text, text, uuid, uuid, jsonb, text) beb67d6e7d9c3a1646a014dccad8f740d98d32bb9ad134fd29b979dfce086998
CREATE OR REPLACE FUNCTION platform.knob_override_set(p_feature text, p_key text, p_scope_kind text, p_scope_id uuid, p_organization_id uuid, p_value jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_door jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- 🚨 DD-221 — A DOOR DOES ONE THING. This is the door for keys whose namespace
  -- declares it, and it REFUSES the rest by name rather than forwarding them:
  -- a forward would mean the gate you passed and the audit row you left depended
  -- on which function name the caller happened to import, which is exactly how
  -- an HR admin came to be refused their own pay-group exception while an org
  -- admin with no HR standing wrote one that `hr.access_audit` never saw.
  v_door := platform.knob_write_door_for(p_feature || '.' || p_key);
  if (v_door ->> 'ok')::boolean and (v_door ->> 'set_door') is distinct from 'platform.knob_override_set' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_door',
      'set_door', v_door ->> 'set_door',
      'clear_door', v_door ->> 'clear_door',
      'detail', format(
        '%s.%s is written through %s, not through this door — that is where its own permission gate and its own audit trail live. Use %s to set a value and %s to remove one.',
        p_feature, p_key, v_door ->> 'set_door', v_door ->> 'set_door', v_door ->> 'clear_door'));
  end if;

  v_is_admin := public.is_admin();

  if p_scope_kind = 'user' then
    if p_scope_id is distinct from v_uid and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'forbidden',
        'detail', 'A user-scope override can only be set for yourself.');
    end if;
    if not exists (select 1 from iam.organization_member m
                    where m.organization_id = p_organization_id
                      and m.user_id = p_scope_id) and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'forbidden',
        'detail', 'Not a member of that organization.');
    end if;
  else
    if not v_is_admin and not exists (
        select 1 from iam.organization_member m
         where m.organization_id = p_organization_id
           and m.user_id = v_uid and m.role in ('owner','admin')) then
      return jsonb_build_object('ok', false, 'reason', 'forbidden',
        'detail', 'Organization configuration is owner/admin only.');
    end if;
  end if;

  return platform._knob_override_write(
    p_feature, p_key, p_scope_kind, p_scope_id, p_organization_id,
    p_value, p_note, v_uid);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. A removal is a write: HR's removal names the row it cleared
-- ─────────────────────────────────────────────────────────────────────────
-- `hr_knob_clear` already existed for every rung `hr_knob_set` accepts, behind
-- the same `hr._l1_settings_gate`, filing through the same `hr._l1_write_audit`.
-- The one asymmetry: it passed NULL target ids, so the audit row for "the pay
-- group stopped having its own value" did not say WHICH pay group, while the row
-- for setting it did. Same shape as `hr_knob_set` now.
-- based-on: public.hr_knob_clear(uuid, text, text, text, uuid) a130dd06d29c88a7569d75474381397b685a0f56a5280582f86fc47ced6ee585
CREATE OR REPLACE FUNCTION public.hr_knob_clear(p_organization_id uuid, p_feature text, p_key text, p_scope_kind text DEFAULT 'organization'::text, p_scope_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'platform'
AS $function$
declare v_gate jsonb; v_scope_id uuid; v_result jsonb;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_knob', 'update');
  if v_gate is not null then return v_gate; end if;

  if p_scope_kind not in ('organization','employer_profile','pay_group','location') then
    raise exception 'hr_knob_clear: % is not a scope rung', p_scope_kind using errcode = '22023';
  end if;
  v_scope_id := case when p_scope_kind = 'organization' then p_organization_id else p_scope_id end;

  -- RECORDED DECISION 21 semantics live in the shared body: null REMOVES the key.
  v_result := platform._knob_override_write(
    p_feature, p_key, p_scope_kind, v_scope_id, p_organization_id,
    null, null, auth.uid());
  if not (v_result ->> 'ok')::boolean then
    if (v_result ->> 'reason') = 'scope_not_in_organization' then
      return jsonb_build_object('ok', false, 'reason', 'scope_not_in_employer');
    end if;
    return v_result;
  end if;

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'scope_kind', p_scope_kind, 'scope_id', p_scope_id,
    'effective_value', v_result -> 'effective_value',
    'origin', 'platform_default', 'key_removed', true,
    -- DD-221: the removal names the row it cleared, exactly as hr_knob_set names
    -- the row it set. An audit trail that records "something was cleared" is not
    -- the same trail.
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'clear',
      case when p_scope_kind = 'organization' then null else ARRAY[v_scope_id] end,
      null, 'settings'));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Self-proof — this file's own claims, on the real doors, in this transaction
-- ─────────────────────────────────────────────────────────────────────────
DO $$
declare
  v_org uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';   -- Write Target Sandbox
  v_pg  uuid := '8d369ca1-aff6-43a2-8b2f-8f611a02b3f1';   -- pay group "Bootstrap Proof Weekly"
  v_hr  uuid := '20149d3f-6572-4263-b43c-7e52f0e42058';   -- HR admin, role='member'
  v_owner uuid := '87a6e699-3622-4869-8843-d0867456c0dd'; -- admin@admin.com, owner
  v_key text := 'hr.employees.adjusted_service_date_rule';
  a jsonb; b jsonb; c jsonb; d jsonb;
  v_aud int; v_rows int;
begin
  if exists (select 1 from platform.knob_override
              where feature = 'hr.employees' and key = 'adjusted_service_date_rule') then
    raise exception 'dd221 self-proof refuses to start: % already holds an override', v_key;
  end if;

  -- §6d-4: the door row goes in BEFORE the GRANT, and the guard revokes a client
  -- EXECUTE on every CREATE of a SECURITY DEFINER function. So the grant either
  -- stuck or the screen calls a door it gets 403 from — assert it, never assume.
  if not has_function_privilege('authenticated', 'platform.knob_write_door_for(text,uuid)', 'EXECUTE') then
    raise exception 'dd221 assertion — authenticated cannot EXECUTE knob_write_door_for; the §6d-4 guard took the grant back';
  end if;
  if has_function_privilege('anon', 'platform.knob_write_door_for(text,uuid)', 'EXECUTE') then
    raise exception 'dd221 assertion — anon holds EXECUTE on knob_write_door_for; this door is signed-in only';
  end if;

  -- (a) the declaration answers, and it answers the AUTHORITY too
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_hr, 'role', 'authenticated')::text, true);
  a := platform.knob_write_door_for(v_key, v_org);
  if (a ->> 'set_door') is distinct from 'public.hr_knob_set'
     or (a ->> 'clear_door') is distinct from 'public.hr_knob_clear'
     or not (a ->> 'may_write')::boolean then
    raise exception 'dd221 assertion — the HR admin was not offered HR''s own door: %', a::text;
  end if;
  if (platform.knob_write_door_for('records.confirmation.confirm_on_human_edit', v_org) ->> 'set_door')
       is distinct from 'platform.knob_override_set' then
    raise exception 'dd221 assertion — a non-hr key lost its default door';
  end if;

  -- (b) the default door refuses the hr. key BY NAME, for anyone
  b := platform.knob_override_set('hr.employees', 'adjusted_service_date_rule', 'pay_group', v_pg, v_org, '"always_carry"'::jsonb, null);
  if (b ->> 'reason') is distinct from 'wrong_door'
     or (b ->> 'detail') not like '%public.hr_knob_set%' then
    raise exception 'dd221 assertion — knob_override_set did not name the right door: %', b::text;
  end if;

  -- (c) HR's own door admits the HR admin, at the pay-group rung, with HR's audit
  c := public.hr_knob_set(v_org, 'hr.employees', 'adjusted_service_date_rule', '"always_carry"'::jsonb, 'pay_group', v_pg);
  if not (c ->> 'ok')::boolean then
    raise exception 'dd221 assertion — hr_knob_set refused the HR admin: %', c::text;
  end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_aud from hr.access_audit where id = (c ->> 'audit_id')::uuid;
  if v_aud <> 1 then
    raise exception 'dd221 assertion — the HR set wrote no hr.access_audit row (%)', v_aud;
  end if;

  -- (d) the removal is HR's too, under the same gate, naming the row it cleared
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_hr, 'role', 'authenticated')::text, true);
  d := public.hr_knob_clear(v_org, 'hr.employees', 'adjusted_service_date_rule', 'pay_group', v_pg);
  if not (d ->> 'ok')::boolean or not (d ->> 'key_removed')::boolean then
    raise exception 'dd221 assertion — hr_knob_clear refused the HR admin: %', d::text;
  end if;
  perform set_config('role', 'postgres', true);
  select count(*) into v_aud from hr.access_audit
    where id = (d ->> 'audit_id')::uuid and v_pg = any (target_ids);
  if v_aud <> 1 then
    raise exception 'dd221 assertion — the HR removal did not name the pay group in its audit row (%)', v_aud;
  end if;

  -- (e) an org owner with no HR standing is told the same thing at the same door
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  if (platform.knob_override_set('hr.employees', 'adjusted_service_date_rule', 'pay_group', v_pg, v_org, '"never_carry"'::jsonb, null) ->> 'reason')
       is distinct from 'wrong_door' then
    raise exception 'dd221 assertion — the org owner still wrote an hr. key through the wrong door';
  end if;

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_rows from platform.knob_override
   where feature = 'hr.employees' and key = 'adjusted_service_date_rule';
  if v_rows <> 0 then
    raise exception 'dd221 self-proof left % override row(s) behind', v_rows;
  end if;

  raise notice 'dd221: the declaration answers, the default door refuses an hr. key by name, HR''s own door sets and removes it under HR''s gate with HR''s audit — 0 rows left.';
end $$;
