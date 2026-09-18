-- dd201b_the_custody_selector_addresses_what_is_destroyed
-- (DD-201 residue, found by verifier V-65. ONE trigger function replaced; no DDL on any table,
--  no policy, grant or row change. Sub-step of dd201_the_settling_clock_is_an_arming_column.sql.)
--
-- ═══ THE DEFECT, MEASURED LIVE 2026-09-14 ══════════════════════════════════════════════════════
-- DD-201 added `effective_from` to the settling guard's arming comparison and left the rest of the
-- list alone. V-65 then walked the whole column set and found one more that ADDRESSES ROWS and was
-- not on it: `custody_selector`.
--
-- Its own column comment says what it does:
--
--   "Optional exact selector for externally adopted files. The central file-custody adapter
--    matches immutable files.files.metadata.external_object_custody source_kind and
--    retention_policy before acting; it is never a path glob or arbitrary JSON predicate."
--
-- and `platform.lifecycle_file_custody_selector` reads it to hand that adapter the single enabled
-- entity/file selector. So it decides WHICH adopted files a policy acts on, exactly as
-- `entity_token` decides which entity's rows it acts on — and `entity_token` has been refused on a
-- settled policy since the guard was written.
--
-- Proven live before this file, in a rolled-back transaction, on the REAL armed and settled policy
-- `d7e1cedf-d812-4cdc-ba7c-510e85d84c0e` (`scope=entity`, `entity_token=file`, `mode=purge`,
-- `enabled`, no legal hold, `effective_from` in the past):
--
--   update ... set custody_selector =
--     '{"source_kind":"b93_probe_other_source","retention_policy":"b93_probe_other_policy"}'
--   → ACCEPTED, replacing {"source_kind":"meet_room_recording","retention_policy":"meet_recordings_30d"}
--
--   update ... set entity_token = 'note'   → REFUSED 22023
--   update ... set archive_tier = <other>  → REFUSED 22023
--
-- One statement re-points a live purge policy at a different set of externally adopted files, with
-- no settling window, while the column beside it that does the same job is refused. That is
-- DD-201's own class, one line short.
--
-- B-93 met this column and never got a verdict from it: its probe wrote `{"y":2}` into
-- `custody_selector` on a `runtime_operation_stream` policy and got `23514` from
-- `retention_policy_custody_selector_shape`, which admits the column only when
-- `scope='entity' AND entity_token='file'` and only in `{source_kind, retention_policy}` shape.
-- A probe that a CHECK rejects before the trigger runs has measured the CHECK, not the trigger.
--
-- ═══ THE FIX ═══════════════════════════════════════════════════════════════════════════════════
-- One line: `OLD.custody_selector IS DISTINCT FROM NEW.custody_selector` joins the comparison.
-- Nothing is removed. A policy that carries no selector (`NULL` on both sides) is untouched by it.
--
-- ═══ `archive_tier` STAYS ══════════════════════════════════════════════════════════════════════
-- V-65 also found the list is one column BROADER than its own comment claims: `archive_tier`
-- ({instant, deep}) is read only by `platform.lifecycle_archive_candidates`, which passes it
-- through as the storage tier an ARCHIVED copy lands in — inert under `mode='purge'`, and under
-- `mode='archive'` nothing is destroyed at all. It is kept, and the reason is written into the
-- function body: "inert under today's two readers" is not "never decides destruction". A guard one
-- column too strict costs a 24 h wait on a tier change; a guard one column too loose is the defect
-- this file exists to close. Removing it would need a proof of the negative that nobody has.
--
-- ═══ THE FORCING TEST ══════════════════════════════════════════════════════════════════════════
-- The block at the end carries every limb DD-201 shipped plus the new one, and proves them against
-- this live database. It raises — aborting this migration — if any limb does not move, and leaves
-- no row behind. The new limb is RED against the function as it stands right now: run
-- unchanged against the pre-this-file body it fails with "RED 0 did not fire ... ACCEPTED it".

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
  -- updated_at, warn_days, metadata, visibility) is editorial and must never
  -- re-arm the clock — otherwise fixing a typo in a description would silently postpone a
  -- legitimate policy by a day. Measured live 2026-09-13, one column at a time in a rolled-back
  -- transaction: every editorial column above is ACCEPTED today on an armed, settled policy, and
  -- only the addressing/arming columns below are refused. The addressing columns
  -- (`organization_id`, `entity_token`, `user_id`, `user_predicate`, `taxonomy_node_id`) belong
  -- here and are deliberately NOT removed: they decide whose rows a live destruction policy
  -- destroys, so re-pointing a settled policy at another tenant with no settling window is the
  -- same act as arming it, wearing a different column name.
  --
  -- `archive_tier` STAYS, and it is the one entry that is stricter than it strictly needs to be.
  -- V-65 is right that it is read only by platform.lifecycle_archive_candidates, which passes it
  -- through as the storage tier an ARCHIVED copy lands in — under mode='purge' it is inert, and
  -- under mode='archive' nothing is destroyed. But "inert under today's two readers" is not the
  -- same as "never decides destruction": a deep-tier archive is a different retrievability promise
  -- to the person whose data it is, the tier travels with the row into whatever the adapter does
  -- next, and nobody has proved a future mode cannot key on it. A guard that is one column too
  -- strict costs a 24 h wait on a tier change; a guard one column too loose is what this residue
  -- is. It stays until someone can prove the negative, and it is named here so the next reader
  -- knows it was considered and kept on purpose, not by inertia.
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
      -- 🚨 DD-201 RESIDUE (2026-09-14, found by V-65). `custody_selector` ADDRESSES ROWS. Its own
      -- column comment: "Optional exact selector for externally adopted files. The central
      -- file-custody adapter matches immutable files.files.metadata.external_object_custody
      -- source_kind and retention_policy before acting", and platform.lifecycle_file_custody_selector
      -- hands it to that adapter as the single enabled entity/file selector. Changing it alone
      -- re-points a live, settled, armed purge policy at a DIFFERENT set of adopted files —
      -- the same act as changing entity_token, which has always been refused. Proven live before
      -- this line, rolled back, on the armed and settled file policy
      -- d7e1cedf-d812-4cdc-ba7c-510e85d84c0e: swapping {meet_room_recording, meet_recordings_30d}
      -- for another source_kind/retention_policy pair was ACCEPTED with no settling window.
      OR OLD.custody_selector IS DISTINCT FROM NEW.custody_selector
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
do $dd201b_forcing$
declare
  v_live   uuid;
  v_cust   uuid;
  v_cust_old jsonb;
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
    raise exception 'DD-201b forcing test cannot run: no armed, settled retention policy on this database to prove the guard against';
  end if;

  -- ── B-83's BATCH-9 ASSERTION, VERBATIM: snapshot every arming column on every row ───────────
  select jsonb_agg(jsonb_build_array(p.id, p.scope, p.entity_token, p.organization_id, p.user_id,
                                     p.user_predicate, p.trigger_kind, p.mode, p.retention_days,
                                     p.archive_tier, p.legal_hold, p.priority, p.enabled,
                                     p.effective_from, p.custody_selector) order by p.id)
    into v_snap from platform.retention_policy p;

  -- ── RED 0 (THE LIMB THIS FILE ADDS): the custody selector re-points a settled policy ───────
  -- A live armed+settled file policy carrying a selector is the honest target; if this database
  -- ever has none, the test does NOT skip — it says so and fails, because a forcing limb that
  -- quietly stands down is not a forcing limb.
  select p.id, p.custody_selector into v_cust, v_cust_old
    from platform.retention_policy p
   where p.enabled and p.mode <> 'never' and not p.legal_hold and p.effective_from < now()
     and p.custody_selector is not null
   order by p.id limit 1;
  if v_cust is null then
    raise exception 'DD-201b forcing test cannot run: no armed, settled retention policy carrying a custody_selector exists on this database, so the limb this file adds cannot be proven. Do not ship this without proving it.';
  end if;
  begin
    update platform.retention_policy
       set custody_selector = jsonb_build_object('source_kind', 'dd201b_probe_source',
                                                 'retention_policy', 'dd201b_probe_policy')
     where id = v_cust;
    raise exception 'DD-201b forcing test RED 0 did not fire: custody_selector on the armed, settled file policy % was changed from % to a different source_kind/retention_policy pair and the settling guard ACCEPTED it — a live purge policy was re-pointed at a different set of externally adopted files with no settling window', v_cust, v_cust_old;
  exception when sqlstate '22023' then null;
  end;

  -- ── RED 1 (THE NEW LIMB): the settling clock pulled inside the window ───────────────────────
  begin
    update platform.retention_policy set effective_from = now() + interval '1 minute' where id = v_live;
    raise exception 'DD-201b forcing test RED 1 did not fire: effective_from was pulled to one minute from now on an armed, settled destruction policy and the settling guard ACCEPTED it';
  exception when sqlstate '22023' then null;
  end;
  begin
    update platform.retention_policy set effective_from = now() - interval '1 day' where id = v_live;
    raise exception 'DD-201b forcing test RED 1b did not fire: effective_from was moved into the past on an armed, settled destruction policy and the settling guard ACCEPTED it';
  exception when sqlstate '22023' then null;
  end;

  -- ── RED 2: an arming change on a settled policy is STILL refused ────────────────────────────
  begin
    update platform.retention_policy set retention_days = coalesce(retention_days,1) + 1 where id = v_live;
    raise exception 'DD-201b forcing test RED 2 did not fire: retention_days changed on an armed, settled policy and the settling guard ACCEPTED it';
  exception when sqlstate '22023' then null;
  end;

  -- ── RED 3: an ADDRESSING change on a settled policy is STILL refused ────────────────────────
  begin
    update platform.retention_policy
       set organization_id = (select o.id from iam.organizations o
                               where o.id <> platform.retention_policy.organization_id limit 1)
     where id = v_live;
    raise exception 'DD-201b forcing test RED 3 did not fire: organization_id changed on an armed, settled policy and the settling guard ACCEPTED it — a live destruction policy was re-pointed at another organization with no settling window';
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
    raise exception 'DD-201b forcing test RED 4 did not fire: a policy dated 40 days out was re-dated to one minute from now and the settling guard ACCEPTED it';
  exception when sqlstate '22023' then null;
  end;

  -- an arming change is fine while the date is still far out — that is the design, not a hole
  update platform.retention_policy set retention_days = coalesce(retention_days,1) + 1 where id = v_clone;

  delete from platform.retention_policy where id = v_clone;

  -- ── B-83's ASSERTION, CHECKED: every arming column byte-identical on every row ──────────────
  select jsonb_agg(jsonb_build_array(p.id, p.scope, p.entity_token, p.organization_id, p.user_id,
                                     p.user_predicate, p.trigger_kind, p.mode, p.retention_days,
                                     p.archive_tier, p.legal_hold, p.priority, p.enabled,
                                     p.effective_from, p.custody_selector) order by p.id)
    into v_after from platform.retention_policy p;
  if v_after is distinct from v_snap then
    raise exception 'DD-201b forcing test failed B-83''s batch-9 assertion: an arming column moved on a live retention policy during this test';
  end if;

  if exists (select 1 from platform.retention_policy where id = v_clone) then
    raise exception 'DD-201b forcing test failed to remove its clone';
  end if;

  raise notice 'DD-201b forcing test: 5 RED limbs fired (custody selector re-pointed, clock pulled in, clock moved to the past, arming change on a settled policy, addressing change on a settled policy), editorial and push-further-out updates accepted, every arming column on every live row byte-identical, clone removed.';
end
$dd201b_forcing$;
