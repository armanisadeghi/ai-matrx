-- ext_18a_custom_record_edge_label_null.sql
-- HRB-010 / C6 -- 🚨 DEFECT FOUND BY THE TIER-2 SUITE (assertion C4b).
-- platform.enforce_known_association matches a declared type with
-- `(r.label IS NULL OR r.label = NEW.label)`, so a NON-NULL label on the declared row means
-- "this type accepts ONLY edges carrying exactly that label" -- and every ordinary
-- role-carrying, label-less custom-record link was refused. The prose moves to `notes`,
-- where it belonged.
--
-- NOTE for anyone editing platform.association_types: every write fires
-- trg_association_types_reachability, a STATEMENT-level trigger that runs a FULL
-- platform.rebuild_reachability(). Batch writes into ONE statement -- eleven separate
-- statements timed this migration out on the first attempt.
UPDATE platform.association_types
   SET label = NULL,
       notes = 'RD-1: a custom relationship is NEVER an access grant. container_side=none is the platform expression of no conveyance; conveys_max is NOT NULL and inert while container_side=none. The label is deliberately NULL: platform.enforce_known_association reads a NON-NULL label as "accepts only edges carrying exactly this label".'
 WHERE source_type = 'custom_record' AND target_type = 'custom_record';
