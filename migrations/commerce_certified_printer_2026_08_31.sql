-- commerce_certified_printer — the printer certification record.
-- APPLIED LIVE 2026-08-31 via Supabase MCP against Matrx Main (brsgrqvjdzwihsvnfqkf)
-- as migration `commerce_certified_printer`. This file is the RECORD, not the mechanism.
--
-- WHY: the platform ships officially-supported printer recommendations
-- (Brother QL-810W, DYMO LW550, Zebra ZD410 — ruled 2026-08-29). This table is
-- how an admin certifies ANY OTHER printer against a specific label stock: the
-- guided wizard at /commerce/labels/printers/certify prints the
-- @ai-matrx/print calibration page, asks four plain-language physical checks,
-- and writes the verdict here. One row = one (printer, stock) pair.
--
-- Provisioned via platform.create_entity_table (never hand DDL); RLS applied by
-- the provisioner (iam.apply_rls path); certified in-migration (the DO block
-- RAISES otherwise — it returned true live on 2026-08-31).

SELECT platform.create_entity_table(
  p_schema  => 'commerce',
  p_table   => 'certified_printer',
  p_token   => 'commerce_certified_printer',
  p_label   => 'Certified Printer',
  p_fields  => ARRAY[
    'printer_make text NOT NULL',              -- e.g. ''Brother''
    'printer_model text NOT NULL',             -- e.g. ''QL-810W''
    'connection_note text',                    -- how it is attached / driver notes
    'template_id text NOT NULL',               -- @ai-matrx/print label template id (or ''custom'')
    'status text NOT NULL DEFAULT ''needs_recheck''',
    'certified_by uuid REFERENCES auth.users(id)',
    'certified_at timestamptz',
    'result_notes jsonb NOT NULL DEFAULT ''{}''::jsonb',  -- the per-check answers
    'CONSTRAINT certified_printer_status_chk CHECK (status IN
       (''certified'',''failed'',''needs_recheck''))',
    'CONSTRAINT certified_printer_certified_chk CHECK
       (status <> ''certified'' OR (certified_at IS NOT NULL AND certified_by IS NOT NULL))'
  ],
  p_variant     => 'entity',
  p_versioned   => false,
  p_soft_delete => true,
  p_visibility  => 'internal',
  p_category    => false,
  p_listed      => true,
  p_org_default => false,
  p_gin_jsonb   => false
);

-- One certification row per (org, make, model, stock) while live — a re-check
-- updates the existing row rather than stacking duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS certified_printer_org_model_template_live_uq
  ON commerce.certified_printer (organization_id, printer_make, printer_model, template_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS certified_printer_org_status_idx
  ON commerce.certified_printer (organization_id, status);

DO $verify$
BEGIN
  IF NOT iam.canonical_certify_ok('commerce','certified_printer','commerce_certified_printer') THEN
    RAISE EXCEPTION 'commerce.certified_printer failed canonical certification';
  END IF;
END
$verify$;
