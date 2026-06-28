-- Migration: reg_tables_prep
-- Create reg schema, structural fixes before moving KG/suggestion tables

CREATE SCHEMA IF NOT EXISTS reg;

-- kg_suggestion_ack has composite PK (user_id, suggestion_id) with no id column
-- Add id uuid so entity RLS variant can reference it
ALTER TABLE public.kg_suggestion_ack
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

-- Backfill created_by from user_id where service-role writes left it null
UPDATE public.kg_alerts SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.kg_suggestion_ack SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.kg_value_matches SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.ner_canonicalizer_shadow SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.kg_sweep_queue SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.kg_sweep_run SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.scope_suggestions SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.scope_association_suggestions SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.scope_item_value_suggestions SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.context_item_suggestions SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Drop legacy set_updated_at triggers (double-fires with canonical _touch_row)
DROP TRIGGER IF EXISTS set_updated_at ON public.kg_alerts;
DROP TRIGGER IF EXISTS set_updated_at ON public.kg_suggestion_ack;
DROP TRIGGER IF EXISTS set_updated_at ON public.kg_value_matches;
DROP TRIGGER IF EXISTS set_updated_at ON public.ner_canonicalizer_shadow;
DROP TRIGGER IF EXISTS set_updated_at ON public.kg_sweep_queue;
DROP TRIGGER IF EXISTS set_updated_at ON public.kg_sweep_run;
DROP TRIGGER IF EXISTS set_updated_at ON public.scope_suggestions;
DROP TRIGGER IF EXISTS set_updated_at ON public.scope_association_suggestions;
DROP TRIGGER IF EXISTS set_updated_at ON public.scope_item_value_suggestions;
DROP TRIGGER IF EXISTS set_updated_at ON public.context_item_suggestions;

-- kg_sweep_state: drop non-canonical touch trigger; ledger variant doesn't need _touch_row
DROP TRIGGER IF EXISTS trg_kg_sweep_state_touch ON public.kg_sweep_state;

-- Add visibility to entity tables (needed for zero-WARN; private default is correct)
ALTER TABLE public.kg_alerts ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.kg_value_matches ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.scope_suggestions ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.scope_association_suggestions ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.scope_item_value_suggestions ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.context_item_suggestions ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.ner_canonicalizer_shadow ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.kg_suggestion_ack ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.kg_sweep_queue ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.kg_sweep_run ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
