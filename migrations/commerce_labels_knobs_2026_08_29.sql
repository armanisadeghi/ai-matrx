-- commerce_labels_knobs — the commerce.labels knob family (limits-are-knobs).
-- APPLIED LIVE 2026-08-29 via Supabase MCP against Matrx Main (brsgrqvjdzwihsvnfqkf)
-- as migration `commerce_labels_knobs`. This file is the RECORD, not the mechanism.
--
-- Seed follows the 0410/0547 on-conflict shape (a human's chosen value and
-- cleared review date are never overwritten by a re-run). overridable_by is
-- curated in DEDICATED statements below — never in the seed's on-conflict —
-- and each curation only fires while the column is still '{}' so a later
-- human curation is never clobbered (feature-knobs doctrine).
--
-- Agent-set values under blind approval: chosen by the commerce-QR build agent
-- 2026-08-29; Arman has NOT reviewed these numbers. Review due 2026-10-15.

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due)
VALUES
  ('commerce.labels', 'default_template', '"avery-5163"', '"avery-5163"', 'enum', null, null, null,
   '["avery-5160","avery-5163","avery-5164","avery-22806","avery-22807"]',
   'Default label template',
   'The lib/label-print template preselected on the create-batch form and single-label prints. Avery 5163 (2in x 4in, 10-up) is the proven clothing-trial warehouse layout.',
   'agent', 'PRINT-PACKAGE-DESIGN Decision 3: 5163 is the prior 2x5 layout preserved as a template; roomiest QR for scuffed warehouse scans.', date '2026-10-15'),

  ('commerce.labels', 'qr_ec_level', '"M"', '"M"', 'enum', null, null, null,
   '["L","M","Q"]',
   'QR error-correction level',
   'Error correction burned into printed QR codes. M is the warehouse default; L only suits huge clean codes; Q costs density.',
   'agent', 'PRINT-PACKAGE-DESIGN build recommendation: default ECC M, not L — warehouse labels get handled, scuffed, part-occluded.', date '2026-10-15'),

  ('commerce.labels', 'max_batch_size', '1000', '1000', 'integer', 'codes', 1, 10000, null,
   'Max codes per label batch',
   'Ceiling on codes minted in one label batch. Bounds a single mint''s insert payload and one print run''s sheet count.',
   'agent', '1000 codes = 100 sheets of 10-up 5163 stock, a full box; larger runs should be deliberate multiple batches.', date '2026-10-15')
ON CONFLICT (feature, key) DO UPDATE
  SET default_value  = excluded.default_value,
      value_type     = excluded.value_type,
      unit           = excluded.unit,
      min_value      = excluded.min_value,
      max_value      = excluded.max_value,
      allowed_values = excluded.allowed_values,
      label          = excluded.label,
      description    = excluded.description,
      basis          = excluded.basis,
      value      = CASE WHEN platform.feature_knob.set_by = 'human'
                        THEN platform.feature_knob.value ELSE excluded.value END,
      review_due = CASE WHEN platform.feature_knob.set_by = 'human'
                        THEN platform.feature_knob.review_due ELSE excluded.review_due END,
      updated_at = now();

-- Curation (dedicated statements, one-time): default_template is org+user
-- (a personal default template is genuinely appropriate for whoever prints);
-- qr_ec_level and max_batch_size are org policy.
UPDATE platform.feature_knob
   SET overridable_by = '{organization,user}'::text[]
 WHERE feature = 'commerce.labels' AND key = 'default_template'
   AND overridable_by = '{}';

UPDATE platform.feature_knob
   SET overridable_by = '{organization}'::text[]
 WHERE feature = 'commerce.labels' AND key IN ('qr_ec_level','max_batch_size')
   AND overridable_by = '{}';
