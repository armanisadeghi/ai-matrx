-- migrate: skip: ABANDONED design — system_prompt_functionality_configs belongs to the never-adopted System Prompts V2 (see 00XX_system_prompts_database_v2.sql). Verified 2026-06-08: 0 code references, table absent in live DB. Do not apply.
-- Fix: Create the correct system_prompt_functionality_configs table
-- This table stores UI configuration for functionalities (labels, icons, categories)
-- while keeping the hardcoded SYSTEM_FUNCTIONALITIES for variable definitions

-- Drop the wrong table if it exists
DROP TABLE IF EXISTS system_prompt_functionalities CASCADE;

-- Create the correct table
CREATE TABLE IF NOT EXISTS system_prompt_functionality_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  functionality_id TEXT NOT NULL UNIQUE,          -- References SYSTEM_FUNCTIONALITIES (e.g., 'explain-text')
  category_id UUID NOT NULL REFERENCES system_prompt_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                             -- Display name (e.g., "Explain Text")
  description TEXT,                                -- User-facing description
  icon_name TEXT NOT NULL,                         -- Lucide icon name
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_functionality_configs_category 
  ON system_prompt_functionality_configs(category_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_functionality_configs_functionality 
  ON system_prompt_functionality_configs(functionality_id);

-- Comments
COMMENT ON TABLE system_prompt_functionality_configs IS 'UI configuration for system prompt functionalities (labels, icons, categories). Variable definitions remain in hardcoded SYSTEM_FUNCTIONALITIES.';
COMMENT ON COLUMN system_prompt_functionality_configs.functionality_id IS 'References hardcoded SYSTEM_FUNCTIONALITIES TypeScript constant';
COMMENT ON COLUMN system_prompt_functionality_configs.label IS 'User-facing display name';
COMMENT ON COLUMN system_prompt_functionality_configs.icon_name IS 'Lucide icon name (e.g., MessageSquare, Sparkles)';

-- Enable RLS
ALTER TABLE system_prompt_functionality_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read functionality configs
CREATE POLICY "Anyone can read functionality configs"
  ON system_prompt_functionality_configs
  FOR SELECT
  USING (true);

-- Policy: Only authenticated users can modify (for admin UI)
CREATE POLICY "Authenticated users can modify functionality configs"
  ON system_prompt_functionality_configs
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

