-- chair-step: lane FINISH-THE-SWITCH sublane FTS-3, ONE-HOME wave 4 SOAK (database): the final switch's machinery and the old doors leave production.
-- Drops 66 functions (40 public tombstone doors, final-switch machinery, six ramp doors, the test-copy read), removes the
-- final-switch gate from 10 walls, retires five seams, archives knob custom.data_home_shell, adds the press-history read door.
-- The code callers left matrx-frontend, aidream and matrx-local before this file. Inverse: migrations/inverse/onehome_soak_the_final_switch_machinery_and_old_doors_are_dropped_down.sql.
-- The switch-back trigger drop (4-LAST) is its own file: it takes ACCESS EXCLUSIVE on auth.* and runs only in the 01:00-04:00 PT window.
-- based-on: custom._field_write_door() 34aef623fa48276565cc030f5cd26059ab3d1579a97961b0c555d99d48ddc086
-- based-on: custom._record_rule_uses() f7f322a6ebf6be94389317dfe00c3ff37f7fe31af20b60d5849295275ee787ba
-- based-on: custom.assert_client_may_change(uuid, uuid, text, permission_level, text) 6976bb1bb47394294021f9caf0567bc94fc9686040e12491a467e040e3a7b3af
-- based-on: custom.assert_client_may_open(uuid, uuid, text, permission_level, text) 6a95285026132e93020169e2995d14b3a422cc73581676852702b7fd7e459d18
-- based-on: custom.assert_client_may_reach(uuid, text) 359d3503be6b2f2fa8f50526aad4be658add20924a41c29f93008525f1015b47
-- based-on: custom.assert_may_know_table(uuid, uuid, text) 5f76f911bd987e79f75178983a636badb097abbcd513ec6083580e4997f231da
-- based-on: custom.assert_store_door(uuid, text) 08343c95e859bf0e36b195625b36482484a9e8106fffda0d33b6b9f32655f401
-- based-on: iam._guard_governance_columns() 4c2fff426b1add30229647cbcd3ad0492831eca79623c80ef10dd3f46007b09f
-- based-on: iam._guard_private_grant_owner_only() f9936b5f9e5cef596eaa12ab6aab25f4f49cbd87d51351bdf0fe7a752941bdf9
-- based-on: platform._context_tag_copy_fence() 8c2dfa966ddebcf0bacc3cd4c4cf1813d29cc1e1baaa2cb2e4dcc33f5be30045
set local lock_timeout = '3s';
-- pg_get_functiondef prints public types unqualified (permission_level, field_data_type): resolve them here.
set local search_path = pg_catalog, public;
set local statement_timeout = '60s';

-- -----------------------------------------------------------------------------------------------------
-- 0. ADDITIVE (safe any time): the plain press-history read door that replaces the final-switch admin
--    screen. authenticated has no SELECT on platform.cutover_seam_press; this door reads it for platform
--    admins only (public.is_platform_admin(): admin lane + admin row), newest first.
-- -----------------------------------------------------------------------------------------------------
create or replace function platform.cutover_press_history(p_limit integer default 500)
returns table (
  id uuid, seam_key text, organization_id uuid, direction text, outcome text,
  refusal text, says text, pressed_by uuid, pressed_at timestamptz, note text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'Only a platform administrator, in the admin app, can read the switch press history.'
      using errcode = '42501';
  end if;
  return query
    select p.id, p.seam_key, p.organization_id, p.direction, p.outcome,
           p.refusal, p.says, p.pressed_by, p.pressed_at, p.note
      from platform.cutover_seam_press p
     order by p.pressed_at desc, p.id
     limit greatest(1, least(coalesce(p_limit, 500), 5000));
end;
$function$;
comment on function platform.cutover_press_history(integer) is
  'Platform-admin read of every switch press (platform.cutover_seam_press), newest first. Replaces the final-switch admin screen (ONE-HOME SOAK, 2026-10-03).';
-- The door is declared BEFORE the grant (ddl_guard §6d-4 revokes a client grant on an undeclared definer). PUBLIC's default
-- EXECUTE is cleared at birth by the ddl_guard; anon and service_role are checked after the apply.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('platform', 'cutover_press_history', 'p_limit integer', array['integer'::regtype]::oid[],
   'Platform-admin read of the switch press history. The body refuses (42501) unless public.is_platform_admin() (admin lane + admin row); it takes no entity id, so there is nothing per-record to check. Returns press rows only (no readiness/did payloads).',
   'ONE-HOME wave 4 SOAK db-soak.sql (2026-10-03)', true, false);
grant execute on function platform.cutover_press_history(integer) to authenticated;

-- -----------------------------------------------------------------------------------------------------
-- 1. THE FINAL-SWITCH GATE COMES OUT of the 10 walls that asked platform.final_switch_acting().
--    final_switch_acting() was TRUE only while final_switch_press/undo ran (they set app.final_switch_step
--    = 'on' transaction-locally); every other caller took the FALSE path. Each body below is production's
--    current body with only the gated branch (and its comment) removed, so each wall behaves exactly as it
--    does today when the marker is not set. custom._record_rule_uses: `v_me is not null and not
--    final_switch_acting()` becomes `v_me is not null` (same value when the marker is unset).
--    platform._context_tag_copy_fence is a CTX fence: it STAYS; only its gate is removed.
-- -----------------------------------------------------------------------------------------------------

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
$function$
;

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
    if v_me is not null then
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
$function$
;

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
$function$
;

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
$function$
;

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
end $function$
;

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
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION iam._guard_private_grant_owner_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'hr', 'public'
AS $function$
declare v_class text; t record; v_uid uuid := auth.uid();
begin
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
end $function$
;

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
$function$
;


-- -----------------------------------------------------------------------------------------------------
-- 2. FINAL-SWITCH MACHINERY (17 functions) and the press marker. Evidence for each: no function body that
--    stays calls it (comment-stripped prosrc scan, db-notes.md §2), no view/policy/trigger/default depends on
--    it (pg_depend empty), and no runtime code caller remains after the frontend SOAK patch.
--    KEPT (still called by staying CTX functions): _final_switch_undo_retired, _final_switch_platform_org,
--    _final_switch_last, _final_switch_is_on, _final_switch_holds_every_organization (trigger on the press
--    table), _final_switch_keeps_no_owner_lists_archived (trigger on a deprecated table), _cutover_carry_back,
--    _cutover_copy_resync, cutover_copy_differences, cutover_older_removal(s|_rows), cutover_tables_copied,
--    cutover_evaluation_carry, and every _cutover_seam_* / cutover_seam* function.
-- -----------------------------------------------------------------------------------------------------

-- the final switch press (pressed 2026-10-01 19:57Z). DB callers: none (only comments in the gated walls). Code: frontend final-switch admin screen deleted by the SOAK patch; named in old-system-unreachable/baseline.json (owned door) and knobDatabaseConsumers.generated.ts.
drop function platform.final_switch_press(text,jsonb);
-- the undo (retired 20:08Z). DB callers: none (cutover_seams only names the seam key string). Code: baseline.json (owned door), safety-net b_cutover_state.py (deleted by the patch).
drop function platform.final_switch_undo(text,boolean);
-- readiness report for the admin screen. DB callers: none. Code: final-switch screen (deleted by the patch).
drop function platform.final_switch_readiness();
-- the retire-undo press (done 20:08Z). DB callers: none. Code: final-switch screen (deleted).
drop function platform.final_switch_retire_undo(text);
-- state card for the admin screen + seamSwitches card. DB callers: none. Code: finalSwitch.ts / finalSwitchState.server.ts (deleted by the patch).
drop function platform.final_switch_state();
-- one-shot orphan pick-list adoption. DB callers: none. Code: campaign-tests/orphanchoices_*.py, safety-net b_cutover_state.py (old walk scripts).
drop function platform.final_switch_adopt_orphan_lists(uuid);
-- Copy again run recorder. DB callers: none. Code: none outside generated types (Copy again deleted 2026-10-03).
drop function platform.final_switch_copy_again_record(uuid,text,uuid,boolean,jsonb);
-- helper of final_switch_press/readiness/undo only (all dropped here).
drop function platform._final_switch_readiness();
-- helper of _final_switch_readiness only (dropped here).
drop function platform._final_switch_copy_again_state();
-- helper of _final_switch_readiness and adopt_orphan_lists only (dropped here).
drop function platform._final_switch_orphan_lists();
-- list of doors final_switch_press revoked; called by final_switch_press only (dropped here); safety-net plant b-old-door-stays-open.mjs renames it (suite deleted by the patch).
drop function platform._final_switch_old_write_doors();
-- helper of the five final_switch_* presses only (all dropped here).
drop function platform._final_switch_person_refusal();
-- press-row writer of final_switch_press/undo only (dropped here).
drop function platform._final_switch_record(text,text,text,text,jsonb,jsonb,text,uuid);
-- the press's scopes step; called by final_switch_press/undo only (dropped here). The scopes seam itself presses through cutover_seam_press_everyone, which stays.
drop function platform._final_switch_scopes(text,uuid,text,uuid[]);
-- helper of _final_switch_readiness/_final_switch_scopes/final_switch_press only (all dropped here).
drop function platform._final_switch_scopes_code();
-- sentence helper of final_switch_readiness/retire_undo/undo only (all dropped here).
drop function platform._final_switch_undo_retired_says(platform.cutover_seam_press);
-- Copy again carry rerun. DB: named only in comments (cutover_copy_differences line 223, _cutover_seam_readiness line 93) — no call. Code: none outside generated types.
drop function platform.cutover_carry_removals(uuid,uuid[]);
-- The press marker: TRUE only inside final_switch_press/undo (dropped above). Its 10 gates were removed in
-- section 1; after that no body calls it (prosrc scan). A marker nobody sets is still a door.
drop function platform.final_switch_acting();


-- -----------------------------------------------------------------------------------------------------
-- 3. THE RAMP DOORS (owner request): the unified-data ramp admin screen and /api/admin/unified-data-ramp
--    are deleted by the frontend SOAK patch. No function body calls any of these (prosrc scan). KEPT:
--    unified_data_store_on / _state / _set (lib/knobs/unifiedDataCampaign.ts and scripts still call them),
--    may_operate_unified_data_ramp (feature_knob_set calls it), assert_may_operate_unified_data_ramp
--    (unified_data_store_state/_set call it).
-- -----------------------------------------------------------------------------------------------------

-- platform.unified_data_ramp_exit(): only caller was the ramp admin route/screen (deleted by the patch); no DB caller.
drop function platform.unified_data_ramp_exit();
-- platform.unified_data_ramp_exit(uuid): only caller was the ramp admin route/screen (deleted by the patch); no DB caller.
drop function platform.unified_data_ramp_exit(uuid);
-- platform.unified_data_ramp_gate(text,uuid): only caller was the ramp admin route/screen (deleted by the patch); no DB caller.
drop function platform.unified_data_ramp_gate(text,uuid);
-- platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid): only caller was the ramp admin route/screen (deleted by the patch); no DB caller.
drop function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text,uuid);
-- platform.unified_data_ramp_set(text,uuid,boolean,uuid,text): only caller was the ramp admin route/screen (deleted by the patch); no DB caller.
drop function platform.unified_data_ramp_set(text,uuid,boolean,uuid,text);
-- platform.unified_data_ramp_state(uuid): only caller was the ramp admin route/screen (deleted by the patch); no DB caller.
drop function platform.unified_data_ramp_state(uuid);

-- -----------------------------------------------------------------------------------------------------
-- 4. THE SWITCH-BACK RESTORE — moved to its own transaction at the END of this file (section 4-LAST): on this
--    platform a DROP TRIGGER requests ACCESS EXCLUSIVE on every auth.* table (measured on the clone, db-notes.md
--    §4), i.e. a sign-in lock, so it must not ride inside the main apply.
-- -----------------------------------------------------------------------------------------------------

-- -----------------------------------------------------------------------------------------------------
-- 5. TABLE COPY FENCES. custom._older_table_copy_refusal and custom._older_table_copy_verdict STAY: both are
--    inert (return null) and both are called on every custom.record write by the CTX trigger
--    custom._context_copy_fence (line 39, and through custom._copy_evaluation_note line 15). They go with the
--    context fence (CTX). Dropped here: the test-copy evaluation read (owner request) — no DB caller (only the
--    string list in platform._t13_allowlist), no runtime code caller (table page menu removed by the patch;
--    store.generated.ts lists it and is regenerated).
-- -----------------------------------------------------------------------------------------------------
drop function custom.table_copy_evaluation_state(uuid);

-- -----------------------------------------------------------------------------------------------------
-- 6. PUBLIC TOMBSTONE DOORS (40). Every body is exactly the refusal "The older tables moved to the archive
--    after the final switch…" (regex-verified whole-body match, db-notes.md §1). No pg_depend dependents. No
--    runtime code caller in matrx-frontend, aidream, matrx-local or matrx-extend (hits are guards, generated
--    types, comments and old walk scripts — db-notes.md §1). Function bodies that name them do so in strings
--    or comments only, except public.udt_validate_row, which public.udt_dataset_rows_validate_trigger calls —
--    a trigger that is DISABLED on deprecated.udt_dataset_rows and sits behind the enabled write refusal.
--    STAY: get_structured_list_for_selection (re-pointed to the store), list_udt_dataset_templates (CTX), and
--    every trigger function / helper still attached to a deprecated table (udt_log_row_version,
--    udt_dataset_rows_validate_trigger, inherit_table_security_on_insert, cascade_table_security_settings,
--    _d31_impl_*, get_user_list*, update_user_list, udt_validate_cell_rules, udt_cast_jsonb_value,
--    udt_dataset_row_versions_trim*) — graveyard drop decision.
-- -----------------------------------------------------------------------------------------------------

drop function public.add_column_to_user_table(uuid,text,text,text,integer,boolean,jsonb,jsonb);
drop function public.add_data_row_to_user_table(uuid,jsonb);
drop function public.append_rows_to_user_table(uuid,jsonb);
drop function public.create_new_user_table_dynamic(text,text,boolean,uuid,jsonb);
drop function public.create_user_list(character varying,text,uuid,boolean,boolean,boolean,jsonb,uuid);   -- was EXECUTE to authenticated
drop function public.create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb);
drop function public.delete_data_row_from_user_table(uuid);
drop function public.delete_user_table(uuid);
drop function public.export_user_table_as_csv(uuid,text,text);   -- was EXECUTE to authenticated
drop function public.export_user_table_as_csv(uuid);   -- was EXECUTE to authenticated
drop function public.get_full_table(jsonb);   -- was EXECUTE to authenticated
drop function public.get_table_cell(jsonb);   -- was EXECUTE to authenticated
drop function public.get_table_column(jsonb);   -- was EXECUTE to authenticated
drop function public.get_table_row(jsonb);   -- was EXECUTE to authenticated
drop function public.get_user_table_complete(uuid,text,text);   -- was EXECUTE to authenticated
drop function public.get_user_table_data_paginated(uuid,integer,integer,text,text,text);   -- was EXECUTE to authenticated
drop function public.get_user_table_data_paginated_v2(uuid,integer,integer,text,text,text);   -- was EXECUTE to authenticated
drop function public.get_user_tables();   -- was EXECUTE to authenticated
drop function public.list_table_columns(jsonb);   -- was EXECUTE to authenticated
drop function public.list_table_rows(jsonb,integer,integer,text,text);   -- was EXECUTE to authenticated
drop function public.udt_backfill_autonumber(uuid,uuid);
drop function public.udt_bulk_write(uuid,jsonb);
drop function public.udt_change_field_type(uuid,uuid,field_data_type,text);
drop function public.udt_column_facets(uuid,text,integer,text);   -- was EXECUTE to authenticated
drop function public.udt_delete_field(uuid,uuid);
drop function public.udt_list_example_tables();   -- was EXECUTE to authenticated
drop function public.udt_set_field_format(uuid,uuid,jsonb);
drop function public.udt_set_table_row_actions(uuid,jsonb);
drop function public.udt_set_table_row_label(uuid,jsonb);
drop function public.udt_set_table_style(uuid,text[],jsonb);
drop function public.udt_table_profile(uuid,integer);   -- was EXECUTE to authenticated
drop function public.udt_upsert_cell(uuid,uuid,text,jsonb);
drop function public.udt_upsert_row(uuid,uuid,jsonb);
drop function public.udt_validate_row(uuid,jsonb,jsonb);   -- was EXECUTE to authenticated
drop function public.update_data_row_in_user_table(uuid,jsonb);
drop function public.update_field_metadata(uuid,text,boolean,integer,jsonb);
drop function public.update_user_table_config(uuid,jsonb,jsonb);
drop function public.update_user_table_default_sort(uuid,text,text);
drop function public.update_user_table_metadata(uuid,text,text,boolean,boolean);
drop function public.update_user_table_row_ordering(uuid,boolean,jsonb,text);

-- -----------------------------------------------------------------------------------------------------
-- 6b. THE DOOR ROWS OF THE DROPPED FUNCTIONS (39). platform.client_callable_door is the declaration of who may
--     call a definer; a row over a dropped function is an orphaned promise and the COMMIT check
--     (platform._provision_shape_settled, kind door_orphaned) refuses the transaction while it stands. The
--     row goes with its function. Full row images are in db-soak-inverse.sql.
-- -----------------------------------------------------------------------------------------------------
delete from platform.client_callable_door
 where id in (
  'ac06e092-7644-4d46-b8c4-ee6ffb701678',  -- custom.table_copy_evaluation_state(p_table_id uuid)
  '541d9ff5-5eef-46ab-aa31-a2093e9cfbe4',  -- platform.final_switch_press(p_note text, p_copy_again jsonb)
  '2c91f029-c085-4d9b-9d77-4dfcc2f07399',  -- platform.final_switch_readiness()
  'df9bae77-a1bf-4bc0-a621-5d4df59ca25f',  -- platform.final_switch_retire_undo(p_note text)
  '96d2abd4-8107-4e17-a1d3-84d051b24626',  -- platform.final_switch_state()
  'a2338b0b-5459-4709-ad6b-ce7fa4ec73e5',  -- platform.final_switch_undo(p_note text, p_accept_not_carried boolean)
  '8ebcbec0-8152-495f-93a5-f9319ece31ad',  -- platform.unified_data_ramp_exit()
  'dcf06c7f-2970-486c-bbc8-2372c51bcaba',  -- platform.unified_data_ramp_exit(p_organization_id uuid)
  '0af16b84-5e97-4df5-b248-50c499b6d973',  -- platform.unified_data_ramp_gate(p_consumer text, p_organization_id uuid)
  '1721dc50-3b37-4e5c-8d29-79ad3586b765',  -- platform.unified_data_ramp_set(p_consumer text, p_organization_id uuid, p_on boolean, p_user_id uuid, p_note text)
  '69947f9d-5b46-42d4-84b0-1f0e48243ae2',  -- platform.unified_data_ramp_set(p_consumer text, p_organization_id uuid, p_on boolean, p_user_id uuid, p_note text, p_acting_user_id uuid)
  '748546a3-bb9b-47f7-aa63-3f044949f814',  -- platform.unified_data_ramp_state(p_organization_id uuid)
  '849b3a75-4241-4537-a1a1-ea9440ee25ae',  -- public.add_column_to_user_table(p_table_id uuid, p_field_name text, p_display_name text, p_data_type text, p_field_order integer, p_is_required boolean, p_default_value jsonb, p_validation_rules jsonb)
  '9436e11d-8856-43f0-8679-8f6886be5810',  -- public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb)
  '23b9925e-a5ec-46e0-bbe7-90c0df07e502',  -- public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb)
  '01e5e56b-fea3-436f-8d4e-d9866c0f3bbc',  -- public.create_new_user_table_dynamic(p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_initial_fields jsonb)
  '19a9b4bf-7cc0-490e-b42f-5cdf3dbd1ed4',  -- public.create_user_list(p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean, p_public_read boolean, p_items jsonb, p_organization_id uuid)
  'c9e4f413-6e48-4f03-82a6-a8bd73054b06',  -- public.create_user_table_with_fields(p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_project_id uuid, p_task_id uuid, p_fields jsonb)
  '32ec13b1-cd00-4287-a895-58e69c3e7c94',  -- public.delete_data_row_from_user_table(p_row_id uuid)
  'd43b266f-3889-46f7-a692-aeffe87fdddf',  -- public.delete_user_table(p_table_id uuid)
  '99ca2e75-210f-40f8-9067-1c7a061f3c70',  -- public.get_user_table_complete(p_table_id uuid, p_sort_field text, p_sort_direction text)
  '00ad3cdb-7852-4267-a9f1-e2cbedcf4a39',  -- public.get_user_tables()
  'd0c6cf46-aecc-4b73-99c2-11ff9d0a4859',  -- public.udt_backfill_autonumber(p_table_id uuid, p_field_id uuid)
  '9972be28-efe3-40d2-83e4-62661c25dc46',  -- public.udt_bulk_write(p_table_id uuid, p_operations jsonb)
  'b9e51448-6ff7-4ba2-85d7-c9208a898093',  -- public.udt_change_field_type(p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text)
  'f8c083e2-4c38-48bd-a058-7f33c25f555b',  -- public.udt_delete_field(p_table_id uuid, p_field_id uuid)
  'c3572d76-0491-469a-90fd-2279ea707b0a',  -- public.udt_list_example_tables()
  '1dedfc67-46ff-49bb-aa5d-912e8c9398ce',  -- public.udt_set_field_format(p_table_id uuid, p_field_id uuid, p_format jsonb)
  '09d7518e-b140-42c7-9542-c703d0b48eec',  -- public.udt_set_table_row_actions(p_table_id uuid, p_row_actions jsonb)
  'fdb3848b-b846-4fe9-9add-7fc845936de0',  -- public.udt_set_table_row_label(p_table_id uuid, p_row_label jsonb)
  '5367fd9a-08d6-4083-99f3-df4753ff8aea',  -- public.udt_set_table_style(p_table_id uuid, p_path text[], p_value jsonb)
  'c61389c4-a4b6-4143-ac54-4117cbfd4a41',  -- public.udt_upsert_cell(p_table_id uuid, p_row_id uuid, p_field_name text, p_value jsonb)
  '42ac1e94-d4bd-48c4-b3f6-362ade03c124',  -- public.udt_upsert_row(p_table_id uuid, p_row_id uuid, p_data jsonb)
  'a7c7c938-2033-4e02-b408-b4c63f022272',  -- public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb)
  'f51c06aa-d0bd-4039-83a9-e11ebe9080d9',  -- public.update_field_metadata(p_field_id uuid, p_display_name text, p_is_required boolean, p_field_order integer, p_validation_rules jsonb)
  'b7802ac5-cfbd-4b70-9653-d0d45c2be5fd',  -- public.update_user_table_config(p_table_id uuid, p_table_updates jsonb, p_field_updates jsonb)
  'aa9a8ff4-5883-4751-9d1d-a2f9f663cb07',  -- public.update_user_table_default_sort(p_table_id uuid, p_sort_field text, p_sort_direction text)
  '27130a1d-d4b4-4cf0-a849-46d05eab0e7f',  -- public.update_user_table_metadata(p_table_id uuid, p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean)
  '213c0b4b-1ee5-4845-8bb2-80a192d6b142'   -- public.update_user_table_row_ordering(p_table_id uuid, p_enabled boolean, p_order jsonb, p_label_field text)
 );

-- -----------------------------------------------------------------------------------------------------
-- 7. RETIRE THE SWITCH'S OWN SEAMS. platform.cutover_seam.retired_at is how a retired seam is represented:
--    cutover_seams() lists only retired_at is null; cutover_seam_press / _press_everyone / _cutover_seam_readiness /
--    cutover_census_record / cutover_seam_measure_record answer 'unknown_switch' / refuse for a retired seam.
--    The press rows (platform.cutover_seam_press) and measure rows are NOT touched — they are the audit.
-- -----------------------------------------------------------------------------------------------------
update platform.cutover_seam
   set retired_at = now()
 where seam_key in ('final_switch', 'final_switch_copy_again', 'final_switch_undo', 'older_tables', 'data_screen')
   and retired_at is null;

-- -----------------------------------------------------------------------------------------------------
-- 8. KNOB: custom.data_home_shell is archived (the registry's own retire mechanism — archived_at / reason /
--    by, as platform.knob_archive writes them; knob_archive itself refuses a non-admin session, and this file
--    runs as the database owner). Evidence: no function or view reads it (knob_live_readers' pair/dotted
--    pattern over pg_proc: none); no override rows; frontend code removed it (comments only remain);
--    aidream records store.generated.ts lists it and is regenerated.
--    NOT here: data_tables.older_tables_moved — custom.store_is_open reads it (it is what keeps the store open
--    for every organization that moved) and platform._cutover_seam_apply names it. It retires with
--    store_is_open (section 9). The sharing-registry rows dataset / structured_list and their 10 grants stay
--    (owner ruling: live tokens; db-notes.md §8).
-- -----------------------------------------------------------------------------------------------------
update platform.feature_knob
   set archived_at     = now(),
       archived_reason = 'The old data hub and the ?home= switch were removed after the final switch (ONE-HOME SOAK, 2026-10-03); /data-v2 has one home and nothing reads this knob.',
       archived_by     = 'lane ONE-HOME wave 4 SOAK (database)',
       updated_at      = now()
 where feature = 'custom' and key = 'data_home_shell' and archived_at is null;

-- -----------------------------------------------------------------------------------------------------
-- 9. LATER — NOT IN THIS APPLY. Kept commented so the order is visible.
--
-- 9a. custom.store_is_open(uuid): 60 function bodies call it (iam.has_access_for_base, iam.entity_read_expr,
--     custom.assert_store_door, the booking/form/portal doors, history.*, platform.unified_data_store_on …) and
--     code still calls it (matrx-extend src/lib/records/store.ts + tools/handlers/records.ts; aidream records
--     client/doors/ports + matrx_records gateway/tool; matrx-local records_sync; frontend
--     lib/knobs/unifiedDataCampaign.register.ts and unified_data_store_on via unifiedDataCampaign.ts). Collapse
--     every caller to "open" first, then:
--       -- drop function custom.store_is_open(uuid);   -- only after the 60 bodies are rebased (each CREATE OR
--       --                                                REPLACE from its then-current production body)
-- 9b. data_tables.older_tables_moved — after 9a (store_is_open reads it; archiving or deleting it earlier
--     would close the store for every organization whose only "open" is this knob):
--       -- update platform.feature_knob set archived_at = now(), archived_reason = '…', archived_by = '…'
--       --  where feature = 'data_tables' and key = 'older_tables_moved' and archived_at is null;
--     (21 organization overrides exist; they stay as history.)
-- 9c. workbench.udt_dataset_unarchive / udt_structured_list_unarchive — after _cutover_seam_apply loses its
--     older_tables branch (CTX rebase).
-- 9d. custom._older_table_copy_refusal / _older_table_copy_verdict (+ custom._copy_evaluation_note) — with the
--     context fence custom._context_copy_fence (CTX).
-- -----------------------------------------------------------------------------------------------------


