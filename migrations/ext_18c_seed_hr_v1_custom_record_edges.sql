-- ext_18c_seed_hr_v1_custom_record_edges.sql
-- HRB-010 / C6 -- the HR v1 custom-record edges, seeded in ONE statement so the
-- statement-level reachability rebuild runs once rather than ten times.
INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
SELECT s, t, NULL, 'none', 'viewer', true,
       'RD-1 custom-record edge (HR v1 seed). container_side=none in both directions: a custom relationship is never an access grant. label is NULL so the type accepts any role-carrying edge.'
  FROM (
    SELECT 'custom_record'::text AS s, x AS t FROM unnest(ARRAY['hr_employee','hr_position_assignment','hr_candidate','hr_requisition','hr_training_assignment']) x
    UNION ALL
    SELECT x, 'custom_record'::text FROM unnest(ARRAY['hr_employee','hr_position_assignment','hr_candidate','hr_requisition','hr_training_assignment']) x
  ) e
 WHERE EXISTS (SELECT 1 FROM platform.entity_types et WHERE et.token = e.t AND et.is_active)
   AND EXISTS (SELECT 1 FROM platform.entity_types et WHERE et.token = e.s AND et.is_active)
ON CONFLICT (source_type, target_type) DO NOTHING;

DO $assert$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM platform.association_types
   WHERE (source_type='custom_record' OR target_type='custom_record');
  IF n <> 11 THEN
    RAISE EXCEPTION 'ext_18c: expected 11 custom_record edge types (self + 5 tokens x 2 directions), found %', n;
  END IF;

  SELECT count(*) INTO n FROM platform.association_types
   WHERE (source_type='custom_record' OR target_type='custom_record')
     AND (container_side <> 'none' OR label IS NOT NULL);
  IF n > 0 THEN
    RAISE EXCEPTION 'ext_18c: % custom_record edge type(s) convey access or pin a label', n;
  END IF;
END $assert$;
