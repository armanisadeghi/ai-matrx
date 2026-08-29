-- commerce_label_pool — the DB half of the commerce QR label system.
-- APPLIED LIVE 2026-08-29 via Supabase MCP against Matrx Main (brsgrqvjdzwihsvnfqkf)
-- as migration `commerce_label_pool_tables`. This file is the RECORD, not the mechanism.
--
-- Closes the census gaps of the commerce QR system:
--   (a) per-org identifier uniqueness (precheck 2026-08-29: ZERO duplicate live
--       (org, kind, value) rows existed before the unique index landed);
--   (b) an unassigned printed code is now representable (commerce.label_code,
--       state 'available', intake_asset_id NULL);
--   (c) reverse lookup — label_code_org_value_uq + the live-identifier unique
--       index make scan → asset resolution one indexed read each;
--   (e) commerce.label_batch is the print-run record.
--
-- Both tables provisioned via platform.create_entity_table (never hand DDL);
-- both passed iam.canonical_certify_ok inside the same migration (the DO block
-- below RAISES otherwise). RLS is applied by the provisioner (iam.apply_rls
-- path); label_code is a component of label_batch — access defers to the batch.

SELECT platform.create_entity_table(
  p_schema  => 'commerce',
  p_table   => 'label_batch',
  p_token   => 'commerce_label_batch',
  p_label   => 'Label Batch',
  p_fields  => ARRAY[
    'template_id text NOT NULL',              -- lib/label-print registry id (or ''custom'')
    'requested_count integer NOT NULL',
    'code_prefix text',                       -- optional human prefix on minted codes
    'purpose text',                           -- why this run exists (free note)
    'state text NOT NULL DEFAULT ''open''',   -- open | printed | exhausted | void
    'printed_at timestamptz',
    'CONSTRAINT label_batch_count_chk CHECK (requested_count > 0)',
    'CONSTRAINT label_batch_state_chk CHECK (state IN
       (''open'',''printed'',''exhausted'',''void''))'
  ],
  p_variant     => 'entity',
  p_versioned   => false,
  p_soft_delete => true,
  p_visibility  => 'personal',
  p_category    => false,
  p_listed      => true,
  p_org_default => false,
  p_gin_jsonb   => false
);

SELECT platform.create_entity_table(
  p_schema  => 'commerce',
  p_table   => 'label_code',
  p_token   => 'commerce_label_code',
  p_label   => 'Label Code',
  p_fields  => ARRAY[
    'label_batch_id uuid NOT NULL REFERENCES commerce.label_batch(id) ON DELETE CASCADE',
    'value text NOT NULL',                    -- the opaque printed code
    'state text NOT NULL DEFAULT ''available''',  -- available | assigned | void
    'assigned_at timestamptz',
    -- Assignment linkage: stamped when a scan (or UI action) claims the code.
    'intake_asset_id uuid REFERENCES commerce.intake_asset(id) ON DELETE SET NULL',
    'asset_identifier_id uuid REFERENCES commerce.asset_identifier(id) ON DELETE SET NULL',
    'void_reason text',
    'CONSTRAINT label_code_state_chk CHECK (state IN
       (''available'',''assigned'',''void''))',
    'CONSTRAINT label_code_assigned_chk CHECK
       (state <> ''assigned'' OR (assigned_at IS NOT NULL AND intake_asset_id IS NOT NULL))'
  ],
  p_variant     => 'component',
  p_parents     => ARRAY['commerce_label_batch:label_batch_id'],
  p_versioned   => false,
  p_soft_delete => false,
  p_visibility  => 'none',
  p_category    => false,
  p_listed      => false,
  p_org_default => false,
  p_gin_jsonb   => false
);

-- THE LOAD-BEARING UNIQUENESS FIX (census gap a): one live identifier value
-- per (org, kind). Precheck 2026-08-29: zero duplicate live rows existed.
CREATE UNIQUE INDEX IF NOT EXISTS asset_identifier_org_kind_value_live_uq
  ON commerce.asset_identifier (organization_id, identifier_kind, value)
  WHERE replaced_at IS NULL;

-- One code value per org, across all batches (also the reverse-lookup path).
CREATE UNIQUE INDEX IF NOT EXISTS label_code_org_value_uq
  ON commerce.label_code (organization_id, value);

-- Availability queries (pick next available code in a batch; batch counters).
CREATE INDEX IF NOT EXISTS label_code_batch_state_idx
  ON commerce.label_code (label_batch_id, state);

DO $verify$
BEGIN
  IF NOT iam.canonical_certify_ok('commerce','label_batch','commerce_label_batch') THEN
    RAISE EXCEPTION 'commerce.label_batch failed canonical certification';
  END IF;
  IF NOT iam.canonical_certify_ok('commerce','label_code','commerce_label_code') THEN
    RAISE EXCEPTION 'commerce.label_code failed canonical certification';
  END IF;
END
$verify$;
