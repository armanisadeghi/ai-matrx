-- agent_change_impact_02_fallback_survives_pin_advance.sql
-- I3a — THE FALLBACK MUST SURVIVE A PIN ADVANCE (Agent Change Impact campaign,
-- common-docs/projects/agent-change-impact/REGISTER.md, ruling R11).
--
-- THE DEFECT
-- ----------
-- `mandate.definition.fallback_mandate_key` names the job a mandate falls to when its own holder
-- cannot answer. `mandate.clear_mandate_fallback_on_default_change` is a
--   BEFORE UPDATE OF (default_holder_type, default_holder_id, default_holder_version_id)
-- trigger that nulls it whenever the TRIPLE differs from OLD. A version-only advance of the SAME
-- agent — pin moves from version N to version N+1 — changes the third element, so the fallback
-- dies, silently, on a write nobody thinks of as a holder change.
--
-- THE FIX IS THE TRIGGER, NOT THE WRITER. A writer that re-sets the same fallback in the same
-- statement cannot win: this trigger is BEFORE, so it overwrites `new.fallback_mandate_key` AFTER
-- the writer set it. There is no application-side defence anywhere — not in aidream's
-- `set_default_holder`, not in a client PATCH, not in an RPC. R11 is explicit that the writer
-- needs no change, and none is made here.
--
-- WHAT THE CONDITION SHOULD HAVE BEEN
-- -----------------------------------
-- The trigger means: you changed WHICH holder answers, so the fallback you chose for the old one
-- is void. That is holder IDENTITY — `(default_holder_type, default_holder_id)`. Bumping the same
-- agent's version is not a holder change; the same agent still answers, and the fallback chosen
-- for it is still the right fallback. `default_holder_version_id` leaves the comparison. The
-- trigger's FIRING columns are deliberately unchanged: it must still be REACHED by a version-only
-- write so that it can decide (and now decide "no"), and narrowing `UPDATE OF` would make the
-- decision invisible instead of correct.
--
-- LATENT, NOT HISTORIC — measured on this database 2026-09-12
-- ----------------------------------------------------------
--   mandates carrying a fallback ....... 32
--   mandates carrying a pin ............ 189
--   carrying BOTH ...................... 0   (the two sets are DISJOINT)
--   fallback-loss events in row history  0
-- So nothing has been destroyed yet. It fires the FIRST time anyone pins a mandate that has a
-- fallback — which is exactly what I3 (batch pin advance) exists to do, at scale, in one call.
-- I3 must not ship on top of this.
--
-- DELIBERATELY LEFT ALONE: `agent.clear_mandate_fallback_on_default_change()`, the sibling
-- function on `graveyard.mandate` (columns default_agent_id / default_agent_version_id /
-- use_latest, metadata->'fallback'). Same shape, same bug, dead table — it is named here so the
-- next reader knows it was seen and not missed. Fixing it would be changing a graveyard row's
-- behaviour for no live reader.
--
-- PROVEN RED THEN GREEN on the live database, 2026-09-12, by
-- `pnpm check:mandate-fallback-pin` (scripts/check-mandate-fallback-pin.ts), which builds the
-- condition that production cannot show: a disposable mandate owned by admin@admin.com, with a
-- fallback set and a pin on version N of one agent, advanced to version N+1 of the SAME agent,
-- inside a transaction it rolls back. Before this file: `fallback_survives_version_only_advance`
-- FAILED (v1 -> v30 of "Quick Test Agent", fallback nulled). After: five of five green.
--
-- Idempotent. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The narrowed condition.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function mandate.clear_mandate_fallback_on_default_change()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Holder IDENTITY only. `default_holder_version_id` is NOT part of this comparison: advancing
  -- the pin of the same agent does not change who answers, so the fallback chosen for that agent
  -- stays chosen. (R11, Agent Change Impact.) `is distinct from` over a row() so a NULL holder id
  -- on either side still counts as a change — removing the holder IS a holder change.
  if new.fallback_mandate_key is not null
     and row(new.default_holder_type, new.default_holder_id)
       is distinct from
       row(old.default_holder_type, old.default_holder_id)
  then
    new.fallback_mandate_key := null;
  end if;
  return new;
end;
$function$;

comment on function mandate.clear_mandate_fallback_on_default_change() is
  'Clears mandate.definition.fallback_mandate_key when the DEFAULT HOLDER IDENTITY changes — '
  'default_holder_type + default_holder_id. A fallback is chosen for a specific holder, so a '
  'different holder (or none) voids it. Advancing default_holder_version_id to another version of '
  'the SAME agent is NOT a holder change and leaves the fallback alone: the trigger is BEFORE, so '
  'no writer can put the value back in the same statement, and comparing the version used to '
  'destroy the fallback on every pin advance (R11, Agent Change Impact, 2026-09-12). '
  'Guard: pnpm check:mandate-fallback-pin.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Assertions — this file proves what it claims, on real rows, and keeps none.
--
-- The probe writes a real mandate.definition row through every real trigger on that table and
-- then throws it away: the inner block raises a sentinel, which rolls the SUBTRANSACTION back.
-- plpgsql variables are memory, not rows, so the three verdicts survive the rollback while
-- nothing the probe wrote does — no row, no platform._version_capture history, no associations.
-- ─────────────────────────────────────────────────────────────────────────────
do $verify$
declare
  v_def         text;
  v_trg         text;
  v_org         uuid;
  v_admin       uuid;
  v_agent       uuid;
  v_other       uuid;
  v_ver_lo      uuid;
  v_ver_hi      uuid;
  v_fb          text;
  v_key         text := 'guardrail.fallback_pin_migration_probe';
  v_after_adv   text;
  v_after_move  text;
  v_after_clear text;
begin
  -- (a) The live body is the narrowed one, and the version column is out of the comparison.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'mandate' and p.proname = 'clear_mandate_fallback_on_default_change';
  if v_def is null then
    raise exception 'agent_change_impact_02: mandate.clear_mandate_fallback_on_default_change() is missing.';
  end if;
  -- The comparison itself, not the prose around it: the body still EXPLAINS why the version is
  -- excluded, so a bare `~ 'default_holder_version_id'` would match its own comment.
  if v_def ~ 'row\(new\.default_holder_type,\s*new\.default_holder_id,\s*new\.default_holder_version_id\)' then
    raise exception
      'agent_change_impact_02: the live comparison is still the TRIPLE; the narrowing did not take.';
  end if;
  if v_def !~ 'row\(new\.default_holder_type,\s*new\.default_holder_id\)' then
    raise exception
      'agent_change_impact_02: the live body does not compare holder identity '
      '(new.default_holder_type, new.default_holder_id).';
  end if;

  -- (b) The trigger still FIRES on a version-only write. Narrowing `UPDATE OF` would hide the
  --     decision instead of making it; the firing columns are part of the contract.
  select pg_get_triggerdef(t.oid) into v_trg
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and n.nspname = 'mandate' and c.relname = 'definition'
     and t.tgname = 'clear_mandate_fallback_on_default_change';
  if v_trg is null
     or v_trg !~ 'BEFORE UPDATE OF default_holder_type, default_holder_id, default_holder_version_id'
     or v_trg !~ 'FOR EACH ROW'
  then
    raise exception
      'agent_change_impact_02: the trigger shape changed — expected BEFORE UPDATE OF the three '
      'holder columns FOR EACH ROW, found %.', coalesce(v_trg, '(no trigger)');
  end if;

  -- (c) The fixture, resolved from live rows.
  select id into v_admin from auth.users where email = 'admin@admin.com' limit 1;
  if v_admin is null then
    raise exception 'agent_change_impact_02: no auth.users row for admin@admin.com to own the probe.';
  end if;

  select id into v_org from iam.organizations
   where created_by = v_admin
   order by (name = 'admin''s Workspace') desc, created_at asc
   limit 1;
  if v_org is null then
    raise exception 'agent_change_impact_02: admin@admin.com owns no organization to home the probe in.';
  end if;

  select v.agent_id,
         (array_agg(v.id order by v.version_number asc))[1],
         (array_agg(v.id order by v.version_number desc))[1]
    into v_agent, v_ver_lo, v_ver_hi
    from agent.definition_version v
    join agent.definition a on a.id = v.agent_id
   where v.deleted_at is null and a.deleted_at is null and a.created_by = v_admin
   group by v.agent_id
  having count(*) >= 2
   order by count(*) desc
   limit 1;
  if v_agent is null then
    raise exception 'agent_change_impact_02: admin@admin.com owns no agent with two versions to advance between.';
  end if;

  select id into v_other from agent.definition
   where created_by = v_admin and deleted_at is null and id <> v_agent
   order by created_at asc limit 1;
  if v_other is null then
    raise exception 'agent_change_impact_02: admin@admin.com owns no second agent to move the holder to.';
  end if;

  select mandate_key into v_fb from mandate.definition
   where deleted_at is null order by mandate_key limit 1;

  -- (d) The probe. `is_enabled = false` keeps mandate.guard_definition_holder's runnability
  --     containment out of the way — a different invariant, tested elsewhere, and a probe is not
  --     entitled to point a real organization's floor at an agent its members may not hold.
  begin
    insert into mandate.definition
      (mandate_key, label, goal, origin, organization_id, created_by, updated_by,
       is_enabled, visibility, default_holder_type, default_holder_id,
       default_holder_version_id, fallback_mandate_key, metadata)
    values
      (v_key, 'Fallback pin migration probe',
       'Prove that advancing a pin does not destroy a fallback.', 'user',
       v_org, v_admin, v_admin, false, 'personal'::platform.visibility, 'agent', v_agent,
       v_ver_lo, v_fb, jsonb_build_object('probe', 'agent_change_impact_02'));

    -- 1. A version-only advance of the SAME agent.
    update mandate.definition set default_holder_version_id = v_ver_hi where mandate_key = v_key;
    select fallback_mandate_key into v_after_adv from mandate.definition where mandate_key = v_key;

    -- Re-arm with a write that touches NONE of the three trigger columns, so the trigger does not
    -- fire. Without this a failed step 1 would leave the fallback already null and steps 2 and 3
    -- would report "cleared" without the trigger doing anything — a false green.
    update mandate.definition set fallback_mandate_key = v_fb where mandate_key = v_key;

    -- 2. A DIFFERENT holder: the fallback must die.
    update mandate.definition
       set default_holder_id = v_other, default_holder_version_id = null
     where mandate_key = v_key;
    select fallback_mandate_key into v_after_move from mandate.definition where mandate_key = v_key;

    update mandate.definition set fallback_mandate_key = v_fb where mandate_key = v_key;

    -- 3. No holder at all is also a holder change.
    update mandate.definition
       set default_holder_id = null, default_holder_version_id = null
     where mandate_key = v_key;
    select fallback_mandate_key into v_after_clear from mandate.definition where mandate_key = v_key;

    raise exception 'AGENT_CHANGE_IMPACT_02_PROBE_ROLLBACK' using errcode = 'P0001';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'AGENT_CHANGE_IMPACT_02_PROBE_ROLLBACK' then
        raise;
      end if;
  end;

  if v_after_adv is distinct from v_fb then
    raise exception
      'agent_change_impact_02: a version-only pin advance of the SAME agent still destroyed the '
      'fallback (was %, became %). The narrowing is not in effect.', v_fb, coalesce(v_after_adv, 'NULL');
  end if;
  if v_after_move is not null then
    raise exception
      'agent_change_impact_02: the holder changed to a different agent and the fallback survived '
      'as %. The trigger has stopped doing its real job.', v_after_move;
  end if;
  if v_after_clear is not null then
    raise exception
      'agent_change_impact_02: the holder was removed entirely and the fallback survived as %. '
      'An identity comparison that ignores NULL is not an identity comparison.', v_after_clear;
  end if;

  -- (e) The probe left nothing behind.
  if exists (select 1 from mandate.definition where mandate_key = v_key) then
    raise exception 'agent_change_impact_02: the probe row % survived its own rollback.', v_key;
  end if;
end;
$verify$;
