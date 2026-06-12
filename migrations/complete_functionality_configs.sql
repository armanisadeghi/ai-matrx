-- migrate: skip: ABANDONED design — depends on system_prompt_functionality_configs from the never-adopted System Prompts V2 (see 00XX_system_prompts_database_v2.sql). Verified 2026-06-08: 0 code references, table absent in live DB. Do not apply.
-- =========================== DONE - NO ERRORS ==========================



-- =====================================================
-- COMPLETE MIGRATION: Add ALL functionality data to database
-- This eliminates the need for hardcoded SYSTEM_FUNCTIONALITIES
-- =====================================================

-- Add missing columns to system_prompt_functionality_configs
ALTER TABLE system_prompt_functionality_configs
  ADD COLUMN IF NOT EXISTS required_variables TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS optional_variables TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS placement_types TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS examples TEXT[] DEFAULT '{}';

-- Add comments
COMMENT ON COLUMN system_prompt_functionality_configs.required_variables IS 'Variables that MUST be present in the prompt (e.g., [content_to_explain, text, current_code])';
COMMENT ON COLUMN system_prompt_functionality_configs.optional_variables IS 'Variables that are optional (may have defaults in prompt)';
COMMENT ON COLUMN system_prompt_functionality_configs.placement_types IS 'Where this functionality can appear (context-menu, card, button, modal, link, action)';
COMMENT ON COLUMN system_prompt_functionality_configs.examples IS 'Example use cases for this functionality';

-- Update table comment
COMMENT ON TABLE system_prompt_functionality_configs IS 'Complete functionality definitions with variables, placement types, and UI config. Replaces hardcoded SYSTEM_FUNCTIONALITIES.';

-- Update existing records with the full data from hardcoded definitions
-- (This data should match what's in types/system-prompt-functionalities.ts)

-- TEXT OPERATIONS
UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['content_to_explain'],
  optional_variables = ARRAY['context'],
  placement_types = ARRAY['context-menu', 'button', 'modal'],
  examples = ARRAY['Explain selection', 'What is this?', 'Clarify concept']
WHERE functionality_id = 'explain-text';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['current_text'],
  optional_variables = ARRAY['user_feedback', 'context'],
  placement_types = ARRAY['context-menu', 'button', 'modal'],
  examples = ARRAY['Update selection', 'Update text with feedback']
WHERE functionality_id = 'update-text';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text'],
  optional_variables = ARRAY['style'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Summarize selection', 'Quick summary', 'TLDR']
WHERE functionality_id = 'summarize-text';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text'],
  optional_variables = ARRAY['target_language', 'source_language'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Translate to Spanish', 'Translate to French']
WHERE functionality_id = 'translate-text';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text_to_translate'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Translate to Persian']
WHERE functionality_id = 'translate-to-persian';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Improve selection', 'Make it better', 'Enhance writing']
WHERE functionality_id = 'improve-writing';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Key points', 'Main ideas', 'Bullet summary']
WHERE functionality_id = 'extract-key-points';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text'],
  optional_variables = ARRAY['length', 'style'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Expand on this', 'Add more detail', 'Elaborate']
WHERE functionality_id = 'expand-text';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Simplify selection', 'Make it clearer', 'Use simple words']
WHERE functionality_id = 'simplify-text';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text'],
  optional_variables = ARRAY['tone'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Make it formal', 'Adjust tone']
WHERE functionality_id = 'change-tone';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Grammar check', 'Fix spelling']
WHERE functionality_id = 'grammar-check';

-- CODE OPERATIONS
UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['current_code'],
  optional_variables = ARRAY['language', 'framework'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Find bugs', 'Suggest improvements', 'Explain code']
WHERE functionality_id = 'analyze-code';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['current_code'],
  optional_variables = ARRAY['error_message'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Fix bugs', 'Correct errors', 'Debug code']
WHERE functionality_id = 'fix-code';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['current_code'],
  optional_variables = ARRAY['language'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Clean up code', 'Optimize', 'Improve structure']
WHERE functionality_id = 'refactor-code';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['current_code'],
  optional_variables = ARRAY['language'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Add comments', 'Explain code']
WHERE functionality_id = 'add-comments';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['code_context', 'language'],
  optional_variables = ARRAY['framework'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Generate tests', 'Create test cases']
WHERE functionality_id = 'generate-tests';

-- CONTENT GENERATION
UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['title', 'description', 'context'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['card'],
  examples = ARRAY['Vocabulary term cards', 'Concept explainers']
WHERE functionality_id = 'content-expander-card';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['topic'],
  optional_variables = ARRAY['tone', 'length', 'style', 'audience'],
  placement_types = ARRAY['button', 'modal', 'card'],
  examples = ARRAY['Write article', 'Create post', 'Generate description']
WHERE functionality_id = 'generate-content';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['topic_or_data'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Make flashcards', 'Study cards']
WHERE functionality_id = 'create-flashcards';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['topic_or_data'],
  optional_variables = ARRAY['difficulty', 'question_count'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Make quiz', 'Test questions']
WHERE functionality_id = 'create-quiz';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['outline_data'],
  optional_variables = ARRAY['detail_level'],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Create outline', 'Structure content']
WHERE functionality_id = 'create-outline';

-- UTILITIES
UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['query'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Search for this', 'Look up', 'Find information']
WHERE functionality_id = 'search-web';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['topic'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button', 'modal'],
  examples = ARRAY['Brainstorm', 'Ideas for...', 'Suggestions']
WHERE functionality_id = 'get-ideas';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['content'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Check facts', 'Verify information']
WHERE functionality_id = 'fact-check';

UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY['text', 'format'],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'button'],
  examples = ARRAY['Convert to markdown', 'Format as table']
WHERE functionality_id = 'format-content';

-- CUSTOM
UPDATE system_prompt_functionality_configs 
SET 
  required_variables = ARRAY[]::text[],
  optional_variables = ARRAY[]::text[],
  placement_types = ARRAY['context-menu', 'card', 'button', 'modal', 'link', 'action'],
  examples = ARRAY['Experimental features', 'One-off actions', 'Special use cases']
WHERE functionality_id = 'custom';

-- Create indexes for the new array columns
CREATE INDEX IF NOT EXISTS idx_functionality_configs_placement 
  ON system_prompt_functionality_configs USING GIN(placement_types);

