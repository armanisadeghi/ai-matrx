-- migrate: skip: ABANDONED design — the DB-driven system-prompt hierarchy (system_prompt_categories / system_prompt_functionalities / system_prompts_with_hierarchy) was never adopted. Verified 2026-06-08: 0 code references, none of these objects exist in the live DB, and the live lib/services/system-prompts-service.ts uses the flat system_prompts table instead. Do not apply.
-- =====================================================
-- System Prompts Database V2: Visual Hierarchy & Database-Driven Functionalities
-- =====================================================
-- Purpose: Transform hardcoded system into database-driven architecture
-- matching the Content Blocks pattern with visual hierarchy, icons, and colors
-- =====================================================

-- =====================================================
-- 1. CREATE CATEGORIES TABLE
-- =====================================================
-- Visual organization for System Prompts (matches content_block_categories pattern)

CREATE TABLE IF NOT EXISTS system_prompt_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  icon_name TEXT NOT NULL,           -- Lucide icon name
  color TEXT NOT NULL,                -- Tailwind text color class
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_prompt_categories_active 
  ON system_prompt_categories(is_active, sort_order);

COMMENT ON TABLE system_prompt_categories IS 'Visual organization for System Prompts with icons and colors';
COMMENT ON COLUMN system_prompt_categories.category_id IS 'Unique identifier (e.g., text-operations, code-tools)';
COMMENT ON COLUMN system_prompt_categories.icon_name IS 'Lucide icon name (e.g., FileText, Code, Sparkles)';
COMMENT ON COLUMN system_prompt_categories.color IS 'Tailwind color class (e.g., text-blue-600, text-purple-600)';

-- =====================================================
-- 2. CREATE FUNCTIONALITIES TABLE
-- =====================================================
-- Move hardcoded SYSTEM_FUNCTIONALITIES to database

CREATE TABLE IF NOT EXISTS system_prompt_functionalities (
  id TEXT PRIMARY KEY,                                        -- e.g., 'explain-text', 'fix-code'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES system_prompt_categories(category_id) ON DELETE CASCADE,
  icon_name TEXT,                                             -- Optional: specific icon for this functionality
  required_variables TEXT[] DEFAULT '{}',
  optional_variables TEXT[] DEFAULT '{}',
  default_placement_types TEXT[] DEFAULT '{}',                -- ['context-menu', 'card', 'button']
  examples TEXT[],
  metadata JSONB DEFAULT '{}',                                -- Flexible field for future extensions
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_prompt_functionalities_category 
  ON system_prompt_functionalities(category_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_system_prompt_functionalities_placement 
  ON system_prompt_functionalities USING GIN(default_placement_types);

COMMENT ON TABLE system_prompt_functionalities IS 'Database-driven functionality definitions (moved from hardcoded TypeScript)';
COMMENT ON COLUMN system_prompt_functionalities.required_variables IS 'Variables that MUST be present (e.g., [content_to_explain, text, current_code])';
COMMENT ON COLUMN system_prompt_functionalities.optional_variables IS 'Variables that are optional (may have defaults in prompt)';
COMMENT ON COLUMN system_prompt_functionalities.default_placement_types IS 'Where this functionality typically appears';

-- =====================================================
-- 3. UPDATE SYSTEM_PROMPTS TABLE
-- =====================================================
-- Add foreign key constraint to link to functionalities table

DO $$
BEGIN
  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_system_prompts_functionality'
  ) THEN
    ALTER TABLE system_prompts
      ADD CONSTRAINT fk_system_prompts_functionality
      FOREIGN KEY (functionality_id)
      REFERENCES system_prompt_functionalities(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Optional: Drop redundant category column (if it exists)
-- The category is now determined by functionality -> category relationship
-- Uncomment if you want to remove redundancy:
-- ALTER TABLE system_prompts DROP COLUMN IF EXISTS category CASCADE;

COMMENT ON COLUMN system_prompts.functionality_id IS 'References system_prompt_functionalities(id) - defines variables and behavior';

-- =====================================================
-- 4. SEED CATEGORIES
-- =====================================================

INSERT INTO system_prompt_categories (category_id, label, description, icon_name, color, sort_order, is_active) VALUES
  ('text-operations', 'Text Operations', 'Tools for manipulating and analyzing text', 'FileText', 'text-blue-600', 0, true),
  ('code-tools', 'Code Tools', 'Tools for code analysis, fixing, and refactoring', 'Code', 'text-purple-600', 1, true),
  ('content-generation', 'Content Generation', 'Generate new content, flashcards, quizzes', 'Sparkles', 'text-green-600', 2, true),
  ('utilities', 'Utilities', 'Search, research, and miscellaneous tools', 'Zap', 'text-yellow-600', 3, true)
ON CONFLICT (category_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- =====================================================
-- 5. MIGRATE HARDCODED FUNCTIONALITIES TO DATABASE
-- =====================================================
-- Convert existing SYSTEM_FUNCTIONALITIES TypeScript constant to database records

-- TEXT OPERATIONS
INSERT INTO system_prompt_functionalities (id, name, description, category_id, icon_name, required_variables, optional_variables, default_placement_types, examples, sort_order, is_active) VALUES
  ('explain-text', 'Explain Text', 'Explain selected text or concept in simple terms', 'text-operations', 'HelpCircle', ARRAY['content_to_explain'], ARRAY['context'], ARRAY['context-menu', 'button', 'modal'], ARRAY['Explain selection', 'What is this?', 'Clarify concept'], 0, true),
  ('update-text', 'Update Text', 'Update selected text based on user feedback', 'text-operations', 'RefreshCw', ARRAY['current_text'], ARRAY['user_feedback', 'context'], ARRAY['context-menu', 'button', 'modal'], ARRAY['Update selection', 'Update text with feedback'], 1, true),
  ('summarize-text', 'Summarize Text', 'Create a concise summary of text', 'text-operations', 'FileDown', ARRAY['text'], ARRAY['style'], ARRAY['context-menu', 'button'], ARRAY['Summarize selection', 'Quick summary', 'TLDR'], 2, true),
  ('translate-text', 'Translate Text', 'Translate selected or provided text to another language', 'text-operations', 'Globe', ARRAY['text'], ARRAY['target_language', 'source_language'], ARRAY['context-menu', 'button'], ARRAY['Translate to Spanish', 'Translate to French'], 3, true),
  ('translate-to-persian', 'Translate to Persian', 'Translate selected or provided text to Persian', 'text-operations', 'Globe', ARRAY['text_to_translate'], ARRAY[], ARRAY['context-menu', 'button'], ARRAY['Translate to Persian'], 4, true),
  ('improve-writing', 'Improve Writing', 'Improve the quality and clarity of writing', 'text-operations', 'Pen', ARRAY['text'], ARRAY[], ARRAY['context-menu', 'button'], ARRAY['Improve selection', 'Make it better', 'Enhance writing'], 5, true),
  ('extract-key-points', 'Extract Key Points', 'Extract the main points from text', 'text-operations', 'List', ARRAY['text'], ARRAY[], ARRAY['context-menu', 'button'], ARRAY['Key points', 'Main ideas', 'Bullet summary'], 6, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category_id = EXCLUDED.category_id,
  icon_name = EXCLUDED.icon_name,
  required_variables = EXCLUDED.required_variables,
  optional_variables = EXCLUDED.optional_variables,
  default_placement_types = EXCLUDED.default_placement_types,
  examples = EXCLUDED.examples,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- CODE TOOLS
INSERT INTO system_prompt_functionalities (id, name, description, category_id, icon_name, required_variables, optional_variables, default_placement_types, examples, sort_order, is_active) VALUES
  ('analyze-code', 'Analyze Code', 'Analyze code for improvements, bugs, or explanations', 'code-tools', 'Search', ARRAY['current_code'], ARRAY['language', 'framework'], ARRAY['context-menu', 'button'], ARRAY['Find bugs', 'Suggest improvements', 'Explain code'], 0, true),
  ('fix-code', 'Fix Code', 'Fix issues in code', 'code-tools', 'Wrench', ARRAY['current_code'], ARRAY['error_message'], ARRAY['context-menu', 'button'], ARRAY['Fix bugs', 'Correct errors', 'Debug code'], 1, true),
  ('refactor-code', 'Refactor Code', 'Refactor code for better quality', 'code-tools', 'Package', ARRAY['current_code'], ARRAY['language'], ARRAY['context-menu', 'button'], ARRAY['Clean up code', 'Optimize', 'Improve structure'], 2, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category_id = EXCLUDED.category_id,
  icon_name = EXCLUDED.icon_name,
  required_variables = EXCLUDED.required_variables,
  optional_variables = EXCLUDED.optional_variables,
  default_placement_types = EXCLUDED.default_placement_types,
  examples = EXCLUDED.examples,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- CONTENT GENERATION
INSERT INTO system_prompt_functionalities (id, name, description, category_id, icon_name, required_variables, optional_variables, default_placement_types, examples, sort_order, is_active) VALUES
  ('content-expander-card', 'Content Expander Card', 'Cards that expand on educational content with title, description, and full context', 'content-generation', 'BookOpen', ARRAY['title', 'description', 'context'], ARRAY[], ARRAY['card'], ARRAY['Vocabulary term cards', 'Concept explainers', 'Historical figure details'], 0, true),
  ('generate-content', 'Generate Content', 'Generate new content based on a topic', 'content-generation', 'Sparkles', ARRAY['topic'], ARRAY['tone', 'length', 'style', 'audience'], ARRAY['button', 'modal', 'card'], ARRAY['Write article', 'Create post', 'Generate description'], 1, true),
  ('create-flashcards', 'Create Flashcards', 'Generate flashcards from content', 'content-generation', 'Layers', ARRAY['topic_or_data'], ARRAY[], ARRAY['context-menu', 'button'], ARRAY['Make flashcards', 'Study cards'], 2, true),
  ('create-quiz', 'Create Quiz', 'Generate quiz questions from content', 'content-generation', 'ClipboardCheck', ARRAY['topic_or_data'], ARRAY['difficulty', 'question_count'], ARRAY['context-menu', 'button'], ARRAY['Make quiz', 'Test questions'], 3, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category_id = EXCLUDED.category_id,
  icon_name = EXCLUDED.icon_name,
  required_variables = EXCLUDED.required_variables,
  optional_variables = EXCLUDED.optional_variables,
  default_placement_types = EXCLUDED.default_placement_types,
  examples = EXCLUDED.examples,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- UTILITIES
INSERT INTO system_prompt_functionalities (id, name, description, category_id, icon_name, required_variables, optional_variables, default_placement_types, examples, sort_order, is_active) VALUES
  ('search-web', 'Search Web', 'Search the web for information', 'utilities', 'Search', ARRAY['query'], ARRAY[], ARRAY['context-menu', 'button'], ARRAY['Search for this', 'Look up', 'Find information'], 0, true),
  ('get-ideas', 'Get Ideas', 'Generate ideas related to a topic', 'utilities', 'Lightbulb', ARRAY['topic'], ARRAY[], ARRAY['context-menu', 'button', 'modal'], ARRAY['Brainstorm', 'Ideas for...', 'Suggestions'], 1, true),
  ('custom', 'Custom', 'Custom functionality with flexible variable requirements', 'utilities', 'Settings', ARRAY[], ARRAY[], ARRAY['context-menu', 'card', 'button', 'modal', 'link', 'action'], ARRAY['Experimental features', 'One-off actions', 'Special use cases'], 999, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category_id = EXCLUDED.category_id,
  icon_name = EXCLUDED.icon_name,
  required_variables = EXCLUDED.required_variables,
  optional_variables = EXCLUDED.optional_variables,
  default_placement_types = EXCLUDED.default_placement_types,
  examples = EXCLUDED.examples,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- =====================================================
-- 6. CREATE HELPER VIEWS
-- =====================================================

-- View: System Prompts with full hierarchy (categories + functionalities)
CREATE OR REPLACE VIEW system_prompts_with_hierarchy AS
SELECT 
  sp.*,
  spf.name AS functionality_name,
  spf.description AS functionality_description,
  spf.category_id AS functionality_category_id,
  spf.icon_name AS functionality_icon,
  spf.required_variables,
  spf.optional_variables,
  spc.label AS category_label,
  spc.icon_name AS category_icon,
  spc.color AS category_color,
  spc.sort_order AS category_sort_order
FROM system_prompts sp
LEFT JOIN system_prompt_functionalities spf ON sp.functionality_id = spf.id
LEFT JOIN system_prompt_categories spc ON spf.category_id = spc.category_id
WHERE sp.is_active = true AND spf.is_active = true AND spc.is_active = true;

COMMENT ON VIEW system_prompts_with_hierarchy IS 'System prompts with full category and functionality metadata for easy querying';

-- =====================================================
-- 7. UPDATE EXISTING SYSTEM_PROMPTS (IF ANY)
-- =====================================================
-- Ensure all existing system_prompts have valid functionality_id

DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  -- Count system_prompts with invalid functionality_id
  SELECT COUNT(*) INTO invalid_count
  FROM system_prompts
  WHERE functionality_id IS NOT NULL
    AND functionality_id NOT IN (SELECT id FROM system_prompt_functionalities);

  IF invalid_count > 0 THEN
    RAISE WARNING 'Found % system_prompts with invalid functionality_id. Setting to NULL.', invalid_count;
    
    UPDATE system_prompts
    SET functionality_id = NULL
    WHERE functionality_id NOT IN (SELECT id FROM system_prompt_functionalities);
  END IF;
END $$;

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================
-- Adjust based on your auth setup

DO $$
BEGIN
  -- Grant permissions if authenticated role exists
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON system_prompt_categories TO authenticated;
    GRANT SELECT ON system_prompt_functionalities TO authenticated;
    GRANT SELECT ON system_prompts_with_hierarchy TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON system_prompts TO authenticated;
  END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Summary
DO $$
DECLARE
  cat_count INTEGER;
  func_count INTEGER;
  prompt_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO cat_count FROM system_prompt_categories WHERE is_active = true;
  SELECT COUNT(*) INTO func_count FROM system_prompt_functionalities WHERE is_active = true;
  SELECT COUNT(*) INTO prompt_count FROM system_prompts WHERE is_active = true;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'System Prompts Database V2 Migration Complete!';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Categories created: %', cat_count;
  RAISE NOTICE 'Functionalities migrated: %', func_count;
  RAISE NOTICE 'Active system prompts: %', prompt_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Update TypeScript code to use database hooks';
  RAISE NOTICE '2. Create DynamicAIToolsSection component';
  RAISE NOTICE '3. Update UnifiedContextMenu rendering';
  RAISE NOTICE '4. Test visual hierarchy in context menus';
  RAISE NOTICE '5. Build admin UI for managing categories/functionalities';
  RAISE NOTICE '================================================';
END $$;

