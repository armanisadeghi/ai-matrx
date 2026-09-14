-- dd201_the_settling_clock_is_an_arming_column
-- (DD-201. ONE trigger function replaced; no DDL on any table, no policy, grant or row change.)
--
-- ═══ WHAT THE REGISTER ROW SAID, AND WHAT IS ACTUALLY TRUE ════════════════════════════════════
-- DD-201 was filed as "`platform.enforce_retention_policy_settling` refuses an UPDATE that changes
-- no destruction-arming column … setting a label, description, basis, review_due or taxonomy node
-- on an armed, settled policy raises 22023". **That is not what the live trigger does, and it has
-- not been since it was written on 2026-08-26.** It already compares OLD against NEW on a named
-- list and returns NEW untouched when nothing on that list moved.
--
-- Measured live 2026-09-13, one column at a time, each update rolled back, against the armed and
-- settled policy 5669cafa-3e8b-499c-bdd8-989bd13d54fa (`enabled`, `mode=purge`, no legal hold,
-- `effective_from` in the past):
--
--   ACCEPTED   label · description · basis · review_due · metadata · visibility · taxonomy_node_id
--   REFUSED    scope · entity_token · organization_id · user_id · user_predicate · trigger_kind ·
--   (22023)    mode · retention_days · archive_tier · priority
--
-- So the editorial half of the filing was already true, and B-83's batch 9 did not meet an
-- over-broad guard: it was setting `organization_id` on 116 armed policies, and `organization_id`
-- is on the list on purpose — it decides WHOSE data a live destruction policy destroys.
--
-- ═══ THE DEFECT THAT IS REAL, AND IT POINTS THE OTHER WAY ═════════════════════════════════════
-- `effective_from` — the settling clock itself, the one value this whole guard exists to protect —
-- was NOT on the list. The RAISE only ever ran when some OTHER column changed, so an update that
-- touched the date and nothing else sailed through. Proven live, rolled back, before this file:
--
--   a cloned armed `purge` policy inserted with effective_from = now() + 30 days (settling
--   satisfied at INSERT), then
--     update … set effective_from = now() + interval '1 minute'  → ACCEPTED
--     update … set effective_from = now() - interval '1 day'     → ACCEPTED
--
-- Twenty-four hours of settling, removed by an UPDATE the guard never looked at. That is the exact
-- outcome the guard was built to make impossible, reached through its own blind spot.
--
-- ═══ THE FIX ══════════════════════════════════════════════════════════════════════════════════
-- One line: `OLD.effective_from IS DISTINCT FROM NEW.effective_from` joins the comparison. Nothing
-- is removed. Pushing the date FURTHER out still passes — the check on the next line compares the
-- new value against now() + the settling interval, and a later date satisfies it — so the only
-- update this newly refuses is one that pulls a live destruction policy's start date inside the
-- settling window. The editorial columns stay editorial and stay accepted.
--
-- 🚨 WHY THE ADDRESSING COLUMNS ARE NOT REMOVED. A proposal reached this lane to invert the list
-- so that only `scope`, `mode`, `retention_days`, `warn_days`, `enabled`, `legal_hold`,
-- `effective_from` and `trigger_kind` arm, and everything else passes. That would drop
-- `organization_id`, `entity_token`, `user_id`, `user_predicate`, `taxonomy_node_id`,
-- `archive_tier` and `priority` out of the guard — and an armed, settled purge policy could then
-- be re-pointed from one organization to another, or from one entity token to another, with no
-- settling window at all. Re-addressing a live destruction policy is arming it; the column name is
-- the only thing that differs. It would also add `warn_days`, which decides when a warning is sent
-- and never what is destroyed — the trigger's own comment has called it editorial since the day it
-- was written. The guard is therefore made STRICTER by exactly one column and weakened by none.
--
-- The function's `SECURITY DEFINER` / `search_path = ''` attributes are carried over verbatim.
-- §6d-4 governs client EXECUTE grants on definer functions and event-trigger functions; this is a
-- row trigger with no client grant, and changing its security mode is not this file's business.
--
-- ═══ THE FORCING TEST ═════════════════════════════════════════════════════════════════════════
-- The block at the end proves, against this live database, that the new limb is RED and that every
-- old verdict is unchanged, and it leaves no row behind. It raises — aborting this migration — if
-- any limb does not move. It includes B-83's batch-9 assertion verbatim: after a non-arming update,
-- every arming column on every live policy is byte-identical to a snapshot taken before it.

set local lock_timeout = '4s';

CREATE OR REPLACE FUNCTION platform.enforce_retention_policy_settling()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_interval interval;
  v_min      timestamptz;
  v_changed  boolean;
BEGIN
  -- A row that cannot destroy anything needs no settling. This is the exemption that
  -- makes the guard safe to live with: you can always make the platform safer instantly.
  IF NOT NEW.enabled OR NEW.mode = 'never' OR NEW.legal_hold THEN
    RETURN NEW;
  END IF;

  -- Which fields decide WHAT gets destroyed, WHOSE data it is, and WHEN it starts.
  -- Everything absent from this list (label, description, basis, review_due, updated_by,
  -- updated_at, warn_days, metadata, visibility, custody_selector) is editorial and must never
  -- re-arm the clock — otherwise fixing a typo in a description would silently postpone a
  -- legitimate policy by a day. Measured live 2026-09-13, one column at a time in a rolled-back
  -- transaction: every editorial column above is ACCEPTED today on an armed, settled policy, and
  -- only the addressing/arming columns below are refused. The addressing columns
  -- (`organization_id`, `entity_token`, `user_id`, `user_predicate`, `taxonomy_node_id`) belong
  -- here and are deliberately NOT removed: they decide whose rows a live destruction policy
  -- destroys, so re-pointing a settled policy at another tenant with no settling window is the
  -- same act as arming it, wearing a different column name.
  IF TG_OP = 'UPDATE' THEN
    v_changed := (
         OLD.scope            IS DISTINCT FROM NEW.scope
      OR OLD.entity_token     IS DISTINCT FROM NEW.entity_token
      OR OLD.taxonomy_node_id IS DISTINCT FROM NEW.taxonomy_node_id
      OR OLD.organization_id  IS DISTINCT FROM NEW.organization_id
      OR OLD.user_id          IS DISTINCT FROM NEW.user_id
      OR OLD.user_predicate   IS DISTINCT FROM NEW.user_predicate
      OR OLD.trigger_kind     IS DISTINCT FROM NEW.trigger_kind
      OR OLD.mode             IS DISTINCT FROM NEW.mode
      OR OLD.retention_days   IS DISTINCT FROM NEW.retention_days
      OR OLD.archive_tier     IS DISTINCT FROM NEW.archive_tier
      OR OLD.legal_hold       IS DISTINCT FROM NEW.legal_hold
      OR OLD.priority         IS DISTINCT FROM NEW.priority
      OR OLD.enabled          IS DISTINCT FROM NEW.enabled
      -- 🚨 DD-201 (2026-09-13). `effective_from` IS the settling clock, and until this line it was
      -- the ONE column this guard never watched: an armed purge policy dated thirty days out could
      -- be re-dated to one minute from now — or into the past — by an update that changed nothing
      -- else, because `v_changed` stayed false and the RAISE below was never reached. Proven live
      -- in a rolled-back transaction before the fix: both of those updates were ACCEPTED. Watching
      -- it costs nothing legitimate — pushing the date further out still satisfies the check on the
      -- very next line, because the new value is further from now than the settling interval.
      OR OLD.effective_from   IS DISTINCT FROM NEW.effective_from
    );
  ELSE
    v_changed := true;   -- every INSERT of a destructive policy settles
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  v_interval := platform.retention_settling_interval();
  v_min      := now() + v_interval;

  IF NEW.effective_from < v_min THEN
    RAISE EXCEPTION
      'retention policy settling: this change arms destruction (scope=%, mode=%, retention_days=%), so effective_from must be at least % from now — you gave %, which is % too early. Set effective_from = now() + interval ''%'' (or make the row safe instead: enabled=false, mode=''never'', or legal_hold=true, all of which apply instantly).',
      NEW.scope, NEW.mode, NEW.retention_days, v_interval, NEW.effective_from,
      (v_min - NEW.effective_from), v_interval
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END $function$
;

-- ═══ THE FORCING TEST ══════════════════════════════════════════════════════════════════════════
do $dd201_forcing$
declare
  v_live   uuid;
  v_clone  uuid := gen_random_uuid();
  src      platform.retention_policy%rowtype;
  v_snap   jsonb;
  v_after  jsonb;

begin
  -- the live armed, SETTLED policy this file's census was measured against
  select p.id into v_live from platform.retention_policy p
   where p.enabled and p.mode <> 'never' and not p.legal_hold and p.effective_from < now()
   order by p.id limit 1;
  if v_live is null then
    raise exception 'DD-201 forcing test cannot run: no armed, settled retention policy on this database to prove the guard against';
  end if;

  -- ── B-83's BATCH-9 ASSERTION, VERBATIM: snapshot every arming column on every row ───────────
  select jsonb_agg(jsonb_build_array(p.id, p.scope, p.entity_token, p.organization_id, p.user_id,
                                     p.user_predicate, p.trigger_kind, p.mode, p.retention_days,
                                     p.archive_tier, p.legal_hold, p.priority, p.enabled,
                                     p.effective_from) order by p.id)
    into v_snap from platform.retention_policy p;

  -- ── RED 1 (THE NEW LIMB): the settling clock pulled inside the window ───────────────────────
  begin
    update platform.retention_policy set effective_from = now() + interval '1 minute' where id = v_live;
    raise exception 'DD-201 forcing test RED 1 did not fire: effective_from was pulled to one minute from now on an armed, settled destruction policy and the settling guard ACCEPTED it';
  exception when sqlstate '22023' then null;
  end;
  begin
    update platform.retention_policy set effective_from = now() - interval '1 day' where id = v_live;
    raise exception 'DD-201 forcing test RED 1b did not fire: effective_from was moved into the past on an armed, settled destruction policy and the settling guard ACCEPTED it';
  exception when sqlstate '22023' then null;
  end;

  -- ── RED 2: an arming change on a settled policy is STILL refused ────────────────────────────
  begin
    update platform.retention_policy set retention_days = coalesce(retention_days,1) + 1 where id = v_live;
    raise exception 'DD-201 forcing test RED 2 did not fire: retention_days changed on an armed, settled policy and the settling guard ACCEPTED it';
  exception when sqlstate '22023' then null;
  end;

  -- ── RED 3: an ADDRESSING change on a settled policy is STILL refused ────────────────────────
  begin
    update platform.retention_policy
       set organization_id = (select o.id from iam.organizations o
                               where o.id <> platform.retention_policy.organization_id limit 1)
     where id = v_live;
    raise exception 'DD-201 forcing test RED 3 did not fire: organization_id changed on an armed, settled policy and the settling guard ACCEPTED it — a live destruction policy was re-pointed at another organization with no settling window';
  exception when sqlstate '22023' then null;
  end;

  -- ── GREEN 1: editorial columns still pass, one at a time, on the LIVE settled policy ────────
  -- Each is immediately restored; the arming-column snapshot at the end proves nothing else moved.
  update platform.retention_policy set description = coalesce(description,'') || ' [dd201]' where id = v_live;
  update platform.retention_policy set description = nullif(replace(coalesce(description,''), ' [dd201]', ''),'') where id = v_live;
  update platform.retention_policy set label = label || ' [dd201]' where id = v_live;
  update platform.retention_policy set label = replace(label, ' [dd201]', '') where id = v_live;
  update platform.retention_policy set review_due = review_due where id = v_live;

  -- ── GREEN 2: on a clone dated well out, the date may still be pushed FURTHER out ────────────
  select * into src from platform.retention_policy where id = v_live;
  src.id := v_clone;
  src.label := 'DD-201 forcing probe';
  src.priority := 32760;
  src.effective_from := now() + interval '30 days';
  insert into platform.retention_policy values (src.*);

  update platform.retention_policy set effective_from = now() + interval '40 days' where id = v_clone;

  begin
    update platform.retention_policy set effective_from = now() + interval '1 minute' where id = v_clone;
    raise exception 'DD-201 forcing test RED 4 did not fire: a policy dated 40 days out was re-dated to one minute from now and the settling guard ACCEPTED it';
  exception when sqlstate '22023' then null;
  end;

  -- an arming change is fine while the date is still far out — that is the design, not a hole
  update platform.retention_policy set retention_days = coalesce(retention_days,1) + 1 where id = v_clone;

  delete from platform.retention_policy where id = v_clone;

  -- ── B-83's ASSERTION, CHECKED: every arming column byte-identical on every row ──────────────
  select jsonb_agg(jsonb_build_array(p.id, p.scope, p.entity_token, p.organization_id, p.user_id,
                                     p.user_predicate, p.trigger_kind, p.mode, p.retention_days,
                                     p.archive_tier, p.legal_hold, p.priority, p.enabled,
                                     p.effective_from) order by p.id)
    into v_after from platform.retention_policy p;
  if v_after is distinct from v_snap then
    raise exception 'DD-201 forcing test failed B-83''s batch-9 assertion: an arming column moved on a live retention policy during this test';
  end if;

  if exists (select 1 from platform.retention_policy where id = v_clone) then
    raise exception 'DD-201 forcing test failed to remove its clone';
  end if;

  raise notice 'DD-201 forcing test: 4 RED limbs fired (clock pulled in, clock moved to the past, arming change on a settled policy, addressing change on a settled policy), editorial and push-further-out updates accepted, every arming column on every live row byte-identical, clone removed.';
end
$dd201_forcing$;
