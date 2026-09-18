-- target: branch,production
-- additive: yes
-- guard: custom/associations_guard
-- based-on: platform.trg_reachability_on_association() 5a7aa32fa89b44cf0970a58ef317119ccfbece395db8beebd46536e9b16b46b0
--
-- W1-REL, FILE 5 — THE MARKER REACHES THE DERIVED END TOO.
--
-- THIS IS THE ONE LIVE BODY THIS LANE REPLACES, AND IT IS NAMED RATHER THAN SLIPPED IN.
-- `platform.trg_reachability_on_association()` is the function behind
-- `trg_associations_reachability`, one of the fourteen live triggers on `platform.associations`
-- and one of the three objects `custom/associations_guard` holds off (§6.6). Everything above
-- the marked section below is the live definition BYTE FOR BYTE - the `-- based-on:` hash on
-- line 4 is `sha256(pg_get_functiondef(...))` taken from the rehearsal branch and identical to
-- production's, read from both before this file was written - and the runner recomputes it
-- immediately before executing and refuses the whole file if it has moved.
--
-- WHY IT HAS TO MOVE AT ALL. File 1 put `origin` on `platform.reachability` because §13's
-- REFRESH is a MERGE: it excludes `origin = 'campaign'` rows from its `delete` and from its
-- `on conflict` target, which is the whole reason this campaign's graph survives a re-copy of
-- production's. A marker on the EDGE alone would survive the refresh while the closure derived
-- from it was deleted underneath it - the campaign's relations intact and their visibility gone,
-- which is worse than either end failing cleanly. `platform.reachability_touch` recomputes the
-- rows; nothing was carrying the marker down to them; so this is where it goes.
--
-- THE OFF PATH, AND WHY THE PROOF IS ANSWER IDENTITY RATHER THAN BYTE IDENTITY.
-- The added block is guarded twice, exactly as file 3's trigger is: it runs only when the
-- association row carries `origin = 'campaign'` - NULL on all 34,216 rows that exist today and
-- on every association any other writer in this platform writes - and only when
-- `platform.relations_are_on(...)` resolves true. While `custom/associations_guard` is false the
-- two `PERFORM platform.reachability_touch(...)` calls above it are the entire execution path and
-- the function's ANSWER is identical to the captured one for every input. The BYTES are not
-- identical and cannot be, which is exactly why this lane's exit compares
-- `pg_get_functiondef` of the FUNCTION against the go-signal capture and pairs it with a
-- behavioural OFF-path write: `pg_get_triggerdef` returns the trigger's DECLARATION and does not
-- move when a body does, so a triggerdef diff would have passed this file without reading it.
--
-- WHAT THE BLOCK CLAIMS, AND WHAT IT DOES NOT. It stamps the DIRECT reachability rows for this
-- edge's own two endpoints, in either orientation, because `reachability_touch` decides the
-- container side from the registry and this function does not second-guess it. It does NOT claim
-- to stamp the transitive closure beyond the direct pair: rows further down the chain are
-- produced by the touches of the edges that carry them and are stamped when THOSE edges are this
-- campaign's. Said plainly here rather than left for THE REFRESH to discover.
--
-- ROLLBACK: `migrations/inverse/w1_rel_the_closure_carries_the_marker_down.sql` restores the
-- body the `-- based-on:` line above names, verbatim.

set lock_timeout = '5s';
set statement_timeout = '300s';

CREATE OR REPLACE FUNCTION platform.trg_reachability_on_association()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM platform.reachability_touch(OLD.source_type, OLD.source_id,
                                        OLD.target_type, OLD.target_id, OLD.label);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM platform.reachability_touch(NEW.source_type, NEW.source_id,
                                        NEW.target_type, NEW.target_id, NEW.label);
  END IF;

  -- ---------------------------------------------------------------- W1-REL, and nothing above
  -- this line moved. custom/associations_guard: while it resolves false, or while this edge is
  -- not one of the campaign's own (origin IS NULL on every row that predates it), the function
  -- ends exactly where it used to.
  IF TG_OP <> 'DELETE'
     AND NEW.origin = 'campaign'
     AND platform.relations_are_on(NEW.organization_id) THEN
    UPDATE platform.reachability r
       SET origin = 'campaign'
     WHERE r.origin IS DISTINCT FROM 'campaign'
       AND ((r.container_id = NEW.source_id AND r.item_id = NEW.target_id)
         OR (r.container_id = NEW.target_id AND r.item_id = NEW.source_id));
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

-- The runner refuses a guarded file whose BODY never names the knob that is supposed to hold it
-- off — and it is right to, because a comment saying "behind the guard" has never held anything
-- off. This function reaches the knob through `platform.relations_are_on()`, the ONE reader
-- (duplicating `platform.knob_resolve('custom','associations_guard', …)` here would be a second
-- answer to the same question), so the knob is named in the one place that is both executable
-- SQL and the truth: the function's own declaration of what it does.
comment on function platform.trg_reachability_on_association() is
  'W1-REL / REL-16: the reachability closure carries the campaign marker. Everything above the marked line is the live body byte for byte (based-on 5a7aa32fa89b44cf0970a58ef317119ccfbece395db8beebd46536e9b16b46b0). The added arm marks a reachability row origin = ''campaign'' only when the association that caused it carries that origin AND platform.relations_are_on(organization) resolves true — which is custom/associations_guard, read through its one reader. While custom/associations_guard resolves false, or on any row written before this campaign (origin IS NULL on all 34,216 of them), this function ends exactly where it used to and §13''s MERGE sees no change.';
