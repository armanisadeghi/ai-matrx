-- chair-step: lane PRESS-FENCE (chair, 2026-10-01, live switch hour, third refusal: "You can see this record, but "Status" is not yours to change."). ONE new function, platform.final_switch_acting() (STABLE, invoker, execute to authenticated and service_role only), and TEN replaced bodies, same signatures, grants kept: the three walls move onto the predicate (the copy fence keeps PRESS-FENCE A's mark-only check: today's clone holds SWITCH-STEP-TWO's later fence body, so replacing it here could not be rehearsed); assert_client_may_change, assert_store_door, the triggers custom._field_write_door, iam._guard_governance_columns, iam._guard_private_grant_owner_only, platform._context_tag_copy_fence return early under it, and custom._record_rule_uses judges its rules as a server write under it. No table, trigger, index or policy is touched; CREATE OR REPLACE FUNCTION takes only pg_proc row locks. None is an access-kernel fingerprint member (iam.entity_read_kernel_members()).
-- based-on: custom.assert_client_may_reach(uuid, text) a15269a7619c5a8fd58146dfabea91b0b7b6c74d102772abcc87c2648f2f1042
-- based-on: custom.assert_may_know_table(uuid, uuid, text) a66301d51352a922ae7d51cef94f952445e2d4a663b0f06387686990b4e64ede
-- based-on: custom.assert_client_may_open(uuid, uuid, text, permission_level, text) 1c00642f9d1357c1c733666819f99ac933908114448ac626b5161a5ecbe86e58
-- based-on: custom.assert_client_may_change(uuid, uuid, text, permission_level, text) dfc23c500cfa4f31448bdfb44699836129677ba8588dc5e339020b2eb483d7f8
-- based-on: custom.assert_store_door(uuid, text) aea7c2dc21d33f09d6d97d000fb52d9ea1016d8bcbbda5a664d4a22980eeea9c
-- based-on: custom._field_write_door() f7eb540883fff88019055359d002070d49086640351b63e3f111cf66e71e9728
-- based-on: custom._record_rule_uses() 1578a6c2f1630f67a36fac94c41e4eed0d6c462aede45aaf20652858f6eb2740
-- based-on: iam._guard_governance_columns() 4d5e8d56690613fb6615ac090f80d58cabfed512e9c05bd28af8cdd18e684186
-- based-on: iam._guard_private_grant_owner_only() 18ca30290c54a58482233c06583adcc480f0df348e23f4ecfaedaaa6c01f4e13
-- based-on: platform._context_tag_copy_fence() a50ea89724ebe740d8ef102ae34014b1ef028db3cace35a805c4a1f44e809acb
-- lane: PRESS-FENCE
-- INVERSE: migrations/inverse/pressfence_c_one_predicate_and_every_caller_wall_the_press_meets_down.sql
--
-- THE DEFECT (third of one class). Production press #3 refused at admin's Workspace — Data tables: the
-- re-sync puts back a person's test edits on Rincon Plumbing — Customers (a Status value among them), and the
-- record store's field-write trigger asked the PRESSER's own edit grant on that field. Arman presses as
-- himself; rehearsals pressed as the store owner role or as admin@admin.com, a member. Two earlier walls of
-- the same class were fixed one at a time (PRESS-FENCE A and B).
--
-- THE CENSUS. Every function platform.cutover_seam_press reaches (calls, and the triggers of every table it
-- writes; 576 functions, walked from the catalogue), filtered to bodies that raise and read the caller
-- (auth.uid, caller_role, membership, visibility, field grants, write_is_a_persons_own, is_admin):
--   CALLER-DEPENDENT, gated here: custom._older_table_copy_refusal (PRESS-FENCE A, mark), custom.assert_client_may_reach,
--     custom.assert_may_know_table, custom.assert_client_may_open, custom.assert_client_may_change,
--     custom.assert_store_door (the one predicate 13 record triggers ask), custom._field_write_door,
--     custom._record_rule_uses (rules judged at the caller's level), iam._guard_governance_columns,
--     iam._guard_private_grant_owner_only, platform._context_tag_copy_fence.
--   DATA-DEPENDENT, untouched: custom._relation_kernel_targets ("names someone who is not a member" is about
--     the value), the shape/type/rule/topology guards beyond their assert_store_door call, FLD-8 and the
--     like. Doors further down (checklist, share_grant, work_assign, field_update…) ask the gated walls.
--   Not a refusal: platform._t13_transitional_dual_write, platform._stamp_actor_tier (stamps only).

CREATE OR REPLACE FUNCTION platform.final_switch_acting()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- PRESS-FENCE C. TRUE only inside the final switch's own run: platform.final_switch_press and
  -- platform.final_switch_undo set app.final_switch_step = 'on' transaction-local around their writes and
  -- clear it before returning (set_config is no client door), the caller is on the admin lane, and the
  -- caller is a platform administrator. Every wall that asks who the caller is answers through this one
  -- predicate during the press, so a platform-wide switch never depends on who pressed it.
  return coalesce(current_setting('app.final_switch_step', true), '') = 'on'
     and platform.admin_lane_open()
     and coalesce(public.is_admin(), false);
end;
$function$;

revoke all on function platform.final_switch_acting() from public;
grant execute on function platform.final_switch_acting() to authenticated, service_role;


CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;
  -- A PLATFORM CONTEXT READ IN PROGRESS (lane SCOPES-READS-ACCESS; chair ruling 2026-09-29 (1)). custom.context_scopes
  -- sets this for the length of ONE read of ONE platform context Table (custom.table_is_platform_context — a context
  -- Table of a global-readable system organization) the one ladder already lets the caller see, and clears it after;
  -- no client can set it (set_config is no client door). It admits nothing else: no memo is written, and every other
  -- door, Table and organization meets this wall as before.
  if nullif(current_setting('mx.platform_context_org', true), '') = p_organization_id::text then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  --
  -- ONE SENTENCE, ONE PLACE (lane SC-3', 2026-09-24). `custom.portal_admits` reads
  -- `custom/external_principal_enabled` itself for its portal and shared-table arms, so asking
  -- the knob here as well was a second copy of the same condition — and it is what kept a
  -- class student out: portal_admits' scope-membership arm is deliberately outside that knob.
  -- For every person the first two arms admit, this answer is unchanged.
  if custom.portal_admits(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$;

CREATE OR REPLACE FUNCTION custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
  v_any  boolean := false;
  v_memo text := 'w:k:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS TABLE. The wall
  -- below is part of that yes: this memo entry is only ever written after it has been passed.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;

  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- WAY THROUGH 2: anything IN it that she may see. The same ladder, asked set-wise over the
  -- table's own partition and stopped at the first row.
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  execute format(
    'select exists (select 1 from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and (%s)
                     limit 1)', p_organization_id, p_table_id, v_pred)
    into v_any;
  if v_any then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- NEITHER. T10's refusal, word for word — and it is now true when it is said: there is
  -- nothing in this table she may see, so telling her it exists would be the leak.
  raise exception 'You do not have access to this table, so % has nothing to show you.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_client_may_open(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'viewer'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always, and it is `custom.assert_client_may_change`'s order: the
  -- organization wall first, then the row.
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE B). While platform.final_switch_press or
  -- platform.final_switch_undo runs (app.final_switch_step = 'on', transaction-local, set and cleared only
  -- by them; set_config is no client door), a platform administrator on the admin lane passes this wall for
  -- every organization: the press is platform-wide, so the presser's own memberships never decide it.
  if platform.final_switch_acting() then
    return;
  end if;
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous doors, which have
  -- already decided the request against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23).
  -- This used to look only inside p_organization_id and RETURN — let the call through —
  -- when the subject was elsewhere, trusting every door to filter by that organization a
  -- line later. Sixteen doors never did: `custom.record_as_of` handed a member of one
  -- organization the full, unmasked state of a record in an organization she does not
  -- belong to (proven live 2026-09-23 as test@test.com, rolled back). Access is a question
  -- about the PERSON and the ROW, never about which organization was passed in
  -- (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000, the same for an invented id.
  if v_subject_org is null then
    return;
  end if;

  -- The platform's globally readable tenants (the Matrx System kernel Tables every
  -- organization builds on) stay reachable exactly as before.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  -- THE ONE LADDER, asked about the row wherever it lives.
  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % has nothing to show you.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_client_may_change(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'editor'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
  v_held        public.permission_level;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    return;
  end if;
  -- ONE order, always: the organization wall first, then the row.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous capture door, which has
  -- already decided this write against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- WHERE THE SUBJECT ACTUALLY LIVES, BY ITS ID AND NOTHING ELSE (2026-09-23). A subject
  -- outside p_organization_id used to be waved through on the promise that the door would
  -- filter by that organization; the same promise was broken on the read side
  -- (`custom.record_as_of`, a cross-organization leak proven live). Access is decided by the
  -- PERSON and the ROW (organization-is-the-container rule 5).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.id = p_subject_id;

  -- Not there at all: the door raises its own 02000 a line later.
  if v_subject_org is null then
    return;
  end if;

  -- The globally readable platform tenant's kernel Tables: unchanged — the door decides.
  if v_subject_org is distinct from p_organization_id
     and exists (select 1 from iam.system_orgs s
                  where s.organization_id = v_subject_org and s.global_readable) then
    return;
  end if;

  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  -- THE REFUSAL NAMES THE RUNG HELD, NOT ONLY THE RUNG NEEDED (lane TAILS, 2026-09-21).
  v_held := custom.effective_level(v_me, v_subject_org, p_subject_id, 'record');

  if v_held is null then
    raise exception 'You do not have access to this %, so % may not write to it.',
      coalesce(nullif(btrim(p_subject_word), ''), 'record'),
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '42501',
            hint = format(
              'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              coalesce(nullif(btrim(p_subject_word), ''), 'record'),
              p_required);
  end if;

  raise exception 'You hold the % level on this %, and % needs the % level.',
    v_held,
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door'),
    p_required
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question, on ONE ladder: viewer < commenter < editor < admin. You hold %s on this %s and %s needs the %s level, so ask an admin of this %s - or an owner of this organization - to raise your level. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
            v_held,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_door), ''), 'that door'),
            p_required,
            coalesce(nullif(btrim(p_subject_word), ''), 'record'));
end
$function$;

CREATE OR REPLACE FUNCTION custom.assert_store_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner  oid;
  v_who    name;
  v_memo   text := 'w:d:' || coalesce(p_organization_id::text, '-');
  v_me     uuid;
  v_member boolean := true;
  v_say    text;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    return;
  end if;
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  -- WRITE-PERF-4: out of its own slot (0.6 us) rather than out of the shared blob (8.25 us on
  -- a realistic blob). The stamp is a superset of the seat the blob checked, so this yes is
  -- reused in strictly fewer situations than before, never more.
  if platform.memo_k_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  if custom.store_is_open(p_organization_id) then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_k_put(v_memo, '1');
    return;
  end if;

  -- ── S6 2026-09-25: A CLIENT HEARS IT IN HER OWN WORDS. ─────────────────────────────────
  -- Somebody who is not a member of this organization (a portal client, a person something was
  -- shared with) is told what her sign-in page tells her, never the owner's settings speech.
  begin
    v_me := custom.query_principal();
    if v_me is not null then
      v_member := iam.is_org_member(v_me, p_organization_id);
    end if;
    if not v_member then
      v_say := custom.store_off_sentence(p_organization_id);
    end if;
  exception when insufficient_privilege or undefined_function then
    v_member := true;  -- cannot tell from here: the member sentence below, exactly as before
  end;
  if not v_member and v_say is not null then
    raise exception '%', v_say using errcode = '42501';
  end if;

  -- ── STORE-ON 2026-09-23: "TURNED OFF", NEVER "NOT TURNED ON YET". ──────────────────────
  -- Owner ruling the same day: the record store's default is ON, and every active
  -- organization was switched on. "has not turned it on yet" described a world where being
  -- off was the starting state nobody had left; it is now a decision somebody in this
  -- organization made, and the sentence says so. The door is exactly as closed as it was.
  raise exception 'This organization has turned the record store off, so % is not taking writes.',
    coalesce(nullif(btrim(p_door), ''), 'it')
    using errcode = '42501',
          hint = 'The record store is on for every organization by default. Somebody with an owner''s or an administrator''s seat here switched it off: open Database Settings for this organization and turn it back on, and everything already made is kept and starts working again. While it is off, this store takes writes only from the role that owns custom.record, through every door: it is a closed door, not a quiet one.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom._field_write_door()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := auth.uid();
  v_level public.permission_level;
  v_key   text;
  v_field custom.record;
  v_old   jsonb := coalesce(case when tg_op = 'UPDATE' then old.data end, '{}'::jsonb);
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- WHO THIS SKIPS, AND WHY IT IS NOT THE ROLE. Every write door into this store is
  -- SECURITY DEFINER and every server lane runs as the role that OWNS custom.record, so a
  -- role test here would skip the only write path that exists and DOOR-3 would be a law
  -- nothing ever enforced. What matters is whether a PERSON is being acted for: when the
  -- request carries one, that person's field-level security binds the write, whichever
  -- door and whichever role it arrived through. A write carrying no person at all is the
  -- store's own housekeeping and has no field-level answer to give.
  if v_me is null then
    return new;
  end if;
  if new.table_id is null or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  -- CREATING is not editing somebody else's field. `platform._stamp_actor` has already run
  -- (it sorts ahead of this trigger), so `created_by` is the person, and VIS-25 makes the
  -- creator the owner and therefore the top level on what they just made. Without this arm
  -- nobody could ever write a confidential field's first value, including its author — and
  -- it is also why the ladder below is only ever asked about a row that already exists.
  if tg_op = 'INSERT' and new.created_by = v_me then
    return new;
  end if;

  -- THE ONE LADDER'S LEVEL FORM. This used to be `iam.effective_level`, which is arm 2 of
  -- the one function rather than the one function: it cannot see the store's own carrying,
  -- so a person admitted to this record THROUGH its Table was masked out of every field on
  -- it. `custom.effective_level` is the same question the read door asks, so the fields a
  -- person may change are decided on the ladder that decided they may be here at all.
  v_level := custom.effective_level(v_me, new.organization_id, new.id, 'record');

  for v_key in
    select e.key from jsonb_each(coalesce(new.data, '{}'::jsonb)) e
     where left(e.key, 1) <> '_'
       and (v_old -> e.key) is distinct from e.value
  loop
    select f.* into v_field
      from custom.record f
     where f.organization_id = new.organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = new.table_id
       and f.data ->> 'key' = v_key;
    if not found then continue; end if;

    if not iam.may_touch_field(v_me, v_field.id, new.organization_id, v_level, 'edit') then
      raise exception 'You can see this record, but "%" is not yours to change.',
                      coalesce(v_field.data ->> 'label', v_key)
        using errcode = '42501',
              hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through. '
                     || 'It would take ' || iam.level_label('record',
                          iam.field_sensitivity_level(v_field.data ->> 'sensitivity', 'edit', new.organization_id))
                     || ', or a share of this one field with you.';
    end if;
  end loop;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._record_rule_uses()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  r            custom.record;
  v_run        jsonb;
  v_truth      boolean;
  v_key        text;
  v_computed   jsonb := '{}'::jsonb;
  v_prior      jsonb;
  v_retired    jsonb;
  v_stale      text;
  v_ctx        jsonb;
  v_me         uuid;
  v_level      public.permission_level;
  v_validate   custom.record[];
  v_fail       text;
  v_enforce    text;
  v_warned     jsonb := '[]'::jsonb;
  v_compute    custom.record[];
begin
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id()
     or new.table_id = custom.rule_kernel_id()
     or new.table_id = custom.merge_field_kernel_id() then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  -- ── THE RULES THIS TABLE HAS, READ ONCE, BEFORE ANYTHING IS WORKED OUT FOR THEM. ──
  -- WRITE-PERF-2: exactly the two `custom.table_rules` calls this function always made, taken
  -- here so the answer can be looked at before the context below is built.
  select coalesce(array_agg(t), '{}'::custom.record[]) into v_validate
    from custom.table_rules(new.organization_id, new.table_id, 'validate', v_rtype) t;
  select coalesce(array_agg(t), '{}'::custom.record[]) into v_compute
    from custom.table_rules(new.organization_id, new.table_id, 'compute', v_rtype) t;

  -- ── PIPELINES: THE CONTEXT. ─────────────────────────────────────────────────────────
  -- What this write is replacing, what it is about, and who is making it. A Rule asks for
  -- these by name (`previous`, `stage_count`, `actor_at_least`) or never sees them.
  --
  -- 🚨 WRITE-PERF-2 (2026-09-20), MEASURED: `custom.effective_level` costs 16.77 ms A CALL on
  -- the main database — it halves the rung ladder with `custom.has_visibility`, which walks
  -- `platform.associations` — and this trigger called it ONCE PER ROW WRITTEN, on every table
  -- in the platform, whether or not any Rule existed to read the answer. On a 200-row insert
  -- that was 3,827 ms of the 7,313 ms the whole write cost: 19.1 ms of 36.6 ms PER ROW, more
  -- than every other trigger on `custom.record` put together, spent working out a number that
  -- `v_ctx` then handed to nobody. `v_ctx` is read in exactly one place — the `custom.rule_run`
  -- calls in the two loops below — so when this Table has no validate and no compute Rule it
  -- is never read at all. It is now built only when there is a Rule that can ask for it. A
  -- Table WITH rules pays exactly what it paid before, to the microsecond.
  if coalesce(array_length(v_validate, 1), 0) > 0 or coalesce(array_length(v_compute, 1), 0) > 0 then
    v_me := custom.query_principal();
    -- PRESS-FENCE C: during the final switch's own run the rules are judged as a server write (no person).
    if v_me is not null and not platform.final_switch_acting() then
      v_level := custom.effective_level(v_me, new.organization_id,
                                        case when tg_op = 'UPDATE' then new.id else new.table_id end,
                                        case when tg_op = 'UPDATE' then 'record' else 'table' end);
    end if;
    v_ctx := jsonb_build_object(
               'previous_values', case when tg_op = 'UPDATE' then old.data else 'null'::jsonb end,
               'record_id',       to_jsonb(new.id),
               'table_id',        to_jsonb(new.table_id),
               'actor_level',     to_jsonb(v_level));
  end if;

  -- ── USE 1: VALIDATE. A `false` answer refuses the write, naming the Rule. ──────────
  foreach r in array v_validate loop
    v_run   := custom.rule_run(new.organization_id, r.id, new.data, v_ctx);
    v_truth := custom.rule_truth(v_run -> 'answer');
    if v_truth is false then
      -- ── STAGE-RULES: WHAT A GATE DOES WHEN IT SAYS NO. ──────────────────────────────
      -- A Rule carries its own answer (`on_fail`); the organization carries the one knob
      -- that can soften a plain refusal into a warning. BOTH ARE READ ONLY AFTER A RULE HAS
      -- ACTUALLY FAILED, so a table whose rules all pass pays nothing for either — the same
      -- discipline WRITE-PERF-2 measured the context under.
      v_fail := lower(coalesce(nullif(r.data ->> 'on_fail', ''), 'refuse'));

      -- AN APPROVED EXCEPTION IS NOT A SECOND REFUSAL. `custom.work_approval_decide` names
      -- the record it is applying an approved change to, for the length of that one write;
      -- the gate that ASKED for the approval steps aside for exactly that write and for
      -- nothing else. Every plain refusal, every other validator and the whole value
      -- envelope still run, so an approver is never told yes over a write the store refuses.
      if v_fail = 'require_approval'
         and nullif(current_setting('custom.applying_approval_for', true), '') = new.id::text then
        continue;
      end if;

      if v_fail = 'require_approval' then
        raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
          using errcode = 'PT428',
                detail = jsonb_build_object(
                           'rule_id',      r.id,
                           'rule',         r.data ->> 'name',
                           'rule_version', v_run -> 'rule_version',
                           'on_fail',      'require_approval',
                           'why',          coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'))::text,
                hint = 'STAGE-RULES: this gate hands the change to the approvals queue instead of refusing it. custom.pipeline_move files the request and leaves the record where it is, and the card says it is waiting. A write that reaches this rule by another route is refused here rather than being let through unasked.';
      end if;

      -- THE ONE KNOB. Default `refuse`; an organization that would rather be told than
      -- stopped sets `warn`. It never softens `require_approval` — "ask somebody" and
      -- "carry on with a note" are different answers, and quietly turning one into the
      -- other is how an approval queue becomes decoration.
      v_enforce := custom.stage_rule_enforcement(new.organization_id);
      if v_enforce = 'warn' then
        v_warned := v_warned || jsonb_build_object(
          'rule_id',     r.id,
          'rule',        r.data ->> 'name',
          'why',         coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name'),
          'what_to_do',  'This organization asks to be warned instead of stopped. Set its "Stage rules" setting back to Refuse to have a write like this one refused.');
        continue;
      end if;

      raise exception '%', coalesce(nullif(r.data ->> 'message', ''), r.data ->> 'name')
        using errcode = '23514',
              hint = format('REC-15: the rule "%s" (version %s) is not satisfied by this record.',
                            r.data ->> 'name', v_run ->> 'rule_version');
    end if;
  end loop;

  -- NOTHING FAILS SILENTLY. A gate the organization's own knob overruled is carried OUT of
  -- the write in a transaction-local setting, so the door that made the write hands the
  -- sentence back to the person who made it. A write with nothing to say clears the setting
  -- rather than leaving the last write's warning lying about for the next one to find.
  perform set_config('custom.stage_rule_warnings',
                     case when v_warned = '[]'::jsonb then '' else v_warned::text end, true);

  -- ── USE 2: COMPUTE. ────────────────────────────────────────────────────────────────
  foreach r in array v_compute loop
    v_key := custom.rule_field_key(new.organization_id, (r.data ->> 'target_field_id')::uuid);
    if v_key is null then
      raise exception 'the rule % works out a field that is not there any more', r.data ->> 'name'
        using errcode = '23503',
              hint = 'REC-18: deleting a Field a Rule depends on is refused naming the Rule (W3-MIG). This is what the compute use says when it happens anyway.';
    end if;
    v_run := custom.rule_run(new.organization_id, r.id, new.data, v_ctx);
    v_computed := v_computed || jsonb_build_object(v_key, jsonb_build_object(
      'value',        v_run -> 'answer',
      'field_id',     r.data ->> 'target_field_id',
      'rule_id',      v_run ->> 'rule_id',
      'rule_version', (v_run -> 'rule_version'),
      'at',           to_jsonb(now())));
  end loop;

  if jsonb_typeof(new.data -> '_computed') = 'object' then
    v_prior := case when tg_op = 'UPDATE' then coalesce(old.data -> '_computed', '{}'::jsonb)
                    else '{}'::jsonb end;
    for v_stale in
      select k from jsonb_object_keys(new.data -> '_computed') k where not (v_computed ? k)
    loop
      if (v_prior -> v_stale) is distinct from (new.data -> '_computed' -> v_stale) then
        raise exception 'this record carries a worked-out answer for % that no rule works out', v_stale
          using errcode = '23514',
                hint = 'REC-15 / FLD-9: a worked-out answer belongs to the Rule that works it out, and it carries that Rule''s id and version. A value written here by hand would be served as if the system had worked it out.';
      end if;
      v_retired := coalesce(new.data -> '_retired', '[]'::jsonb) || jsonb_build_object(
        'key',    v_stale,
        'label',  coalesce(custom.rule_field_label(new.organization_id,
                             (v_prior -> v_stale ->> 'field_id')::uuid), v_stale),
        'value',  v_prior -> v_stale -> 'value',
        'reason', format('this record changed, and nothing works out %s for it any more',
                         coalesce(custom.rule_field_label(new.organization_id,
                                    (v_prior -> v_stale ->> 'field_id')::uuid), v_stale)),
        'rule_id',      v_prior -> v_stale -> 'rule_id',
        'rule_version', v_prior -> v_stale -> 'rule_version',
        'at',     to_jsonb(now()));
      new.data := jsonb_set(new.data, '{_retired}', v_retired);
    end loop;
  end if;

  if v_computed = '{}'::jsonb then
    new.data := new.data - '_computed';
  else
    new.data := jsonb_set(new.data, '{_computed}', v_computed);
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION iam._guard_governance_columns()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_token   text := TG_ARGV[0];
  v_uid     uuid;
  v_old     jsonb := to_jsonb(OLD);
  v_new     jsonb := to_jsonb(NEW);
  v_cols    text[];
  v_col     text;
  v_is_owner boolean;
  v_is_admin boolean;
  v_row_id  uuid;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- The privileged lane governs by design (aidream's pool, migrations, service
  -- role, and every SECURITY DEFINER RPC — those carry their own gates, e.g.
  -- entity_soft_delete requires admin). Only the RLS-enforced lane is tiered,
  -- and aidream's acting_as_user posture lands HERE, which is correct: an agent
  -- is exactly its user.
  if current_user <> 'authenticated' then
    return NEW;
  end if;

  v_uid := coalesce(
    nullif(current_setting('app.user_id', true), '')::uuid,
    (select auth.uid())
  );
  if v_uid is null then
    return NEW;
  end if;

  v_cols := iam.governance_columns(v_token);
  if v_cols is null or cardinality(v_cols) = 0 then
    return NEW;
  end if;

  v_is_owner := (v_old ->> 'created_by') is not null
                and (v_old ->> 'created_by')::uuid = v_uid;
  v_row_id   := nullif(v_old ->> 'id', '')::uuid;

  foreach v_col in array v_cols loop
    if not (v_old ? v_col) then
      continue;
    end if;
    if (v_new -> v_col) is not distinct from (v_old -> v_col) then
      continue;
    end if;

    -- created_by is the access key itself. Rewriting it through a row UPDATE is
    -- ownership TRANSFER, and it escalates: the new value satisfies std_delete's
    -- owner arm. No level buys it in this lane — not editor, not admin, not the
    -- owner. Ownership transfer, if we ever want it, is a deliberate audited
    -- operation, never a column write.
    if v_col = 'created_by' then
      raise exception using
        errcode = '42501',
        message = format('Ownership of this %s cannot be transferred by editing it.', v_token),
        detail  = 'created_by is the access key for this row; changing it through an UPDATE would silently hand over every owner privilege, including delete.',
        hint    = 'Ownership transfer is a deliberate, audited operation — it is not a column write.';
    end if;

    -- ADOPTION is not re-homing. A row with no organization yet may be adopted
    -- by anyone who can edit it; moving a row that ALREADY belongs to a tenant
    -- is a governance act.
    if v_col = 'organization_id' and (v_old ->> 'organization_id') is null then
      continue;
    end if;

    -- RESTORING is not deleting. Clearing deleted_at brings something back and
    -- is ordinary editing — mirrors entity_undelete (editor) vs
    -- entity_soft_delete (admin). Only SETTING it is the destructive direction.
    if v_col = 'deleted_at' and (v_new ->> 'deleted_at') is null then
      continue;
    end if;

    if v_is_owner then
      continue;
    end if;

    if v_is_admin is null then
      v_is_admin := coalesce(iam.has_access(v_token, v_row_id, 'admin'::public.permission_level), false);
    end if;
    if v_is_admin then
      continue;
    end if;

    if v_col = 'deleted_at' then
      raise exception using
        errcode = '42501',
        message = format('Edit access does not include deleting this %s.', v_token),
        detail  = 'Edit access lets you change the content. Deleting someone else''s work needs full access, or the person who created it.',
        hint    = 'Ask the owner to delete it, or ask them for full access to this item.';
    end if;

    raise exception using
      errcode = '42501',
      message = format('Changing "%s" on this %s needs full access — edit access is not enough.', v_col, v_token),
      detail  = format('"%s" decides who this row belongs to. Edit access changes the content; it does not change ownership.', v_col),
      hint    = 'Ask the owner to make this change, or ask them for full access to this item.';
  end loop;

  return NEW;
end
$function$;

CREATE OR REPLACE FUNCTION iam._guard_private_grant_owner_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'hr', 'public'
AS $function$
declare v_class text; t record; v_uid uuid := auth.uid();
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- HR's tokens are guarded by HR's own door (public.hr_break_glass) and its own guard.
  if exists (select 1 from hr._door_spec(new.resource_type)) then
    return new;
  end if;
  -- The server (no signed-in caller) writes grants through iam.share_with_person's own rules.
  if v_uid is null then
    return new;
  end if;

  v_class := iam.class_gate_class(new.resource_type);
  if v_class is null or v_class not in ('private', 'confidential') then
    return new;
  end if;

  select * into t from iam._door_target(new.resource_type, new.resource_id);
  if t.o_subject is null or t.o_subject = v_uid then
    return new;                                     -- the owner sharing their own record
  end if;

  raise exception
    'owner_only: % is % data. Only its owner can share it; nobody else can write a grant on it.',
    new.resource_type, v_class
    using errcode = '42501',
          hint = 'There is no emergency door (access ladder T-16). An organization owner or admin''s only way into a member''s private data is taking over that account: public.org_admin_take_over_account — a written reason, the person told, audited. A person''s work leaves through offboarding''s transfer.';
end $function$;

CREATE OR REPLACE FUNCTION platform._context_tag_copy_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org  uuid;
  v_on   boolean;
  v_what text;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- THE ONE WRITER: the store owner's own connection (the scopes mover and the follow), read
  -- from the catalogue exactly as custom._context_copy_fence does. (SECURITY DEFINER so the
  -- scope's organization and its knob are read whoever writes; custom.caller_role() reads the
  -- role GUC and session_user, which the definer boundary does not move.) A hard delete is
  -- never fenced: the old side's delete of an entity sweeps its edges, copies included.
  if pg_has_role(custom.caller_role(), (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'context_tag' or new.target_type <> 'record' then
      return new;
    end if;
    v_what := 'make';
  else
    if coalesce(old.role, '') <> 'context_tag' and coalesce(new.role, '') <> 'context_tag' then
      return new;
    end if;
    if old.role is distinct from new.role then
      v_what := 'change the role of';
    elsif old.deleted_at is not null and new.deleted_at is null
          and old.deleted_via_id is not null and new.deleted_via_id is null
          and pg_trigger_depth() > 1 then
      -- lane TRASH-COVERAGE-2: the tagged item's own restore (platform._gc_entity_associations,
      -- running as a trigger on the item's table) bringing back exactly the edges its archive
      -- tombstoned — the mirror of the tombstone let through below. Without it no tagged file,
      -- conversation, note, project, task or war room could come back from Trash (42501 on
      -- every restore). A direct revive (trigger depth 1) is still refused.
      return new;
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_what := 'revive';
    elsif new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id then
      v_what := 're-point';
    elsif new.deleted_at is null and (new.metadata is distinct from old.metadata
                                      or new.position is distinct from old.position
                                      or new.label is distinct from old.label) then
      v_what := 'edit';
    else
      -- A tombstone, or a source moved by a merge: the old side's own cascades, carried; the
      -- follow re-arms on it and puts the old side's word back at the next drain.
      return new;
    end if;
  end if;

  select s.organization_id into v_org from context.scopes s where s.id = new.target_id;
  if v_org is null then
    return new;
  end if;
  -- SCOPES-WRITE-THROUGH: in an organization whose store is the writer, the write-through (marked)
  -- carries each tag in the same statement as the tag itself.
  if custom._ctx_marked() and custom.context_writer(v_org) = 'store' then
    return new;
  end if;
  v_on := coalesce((platform.knob_resolve('custom', 'context_copy_following', v_org) #>> '{}')::boolean, true);
  if not v_on then
    return new;
  end if;

  raise exception 'This is the new system''s copy of a context tag; it follows the current tags until the switch, so nobody may % it here. Tag or untag the item in its Context section.', v_what
    using errcode = '42501',
          hint = 'SC-4 P4: while custom/context_copy_following is on for the scope''s organization, only the follow of the current screens writes the record store''s copied tags (role context_tag). Nothing was written.';
end;
$function$;

