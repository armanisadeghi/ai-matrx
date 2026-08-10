-- WIDGET_TOOLS_SEED.sql
-- ============================================================================
-- Seeds the 10 canonical widget_* tools into tool.definition and binds them
-- to the matrx-ai-core executor through tool.binding.
--
-- These tools power the Widget Handle system: when a widget registers a
-- WidgetHandle via useWidgetHandle(), the launch-path derives the subset of
-- these tool names whose corresponding handle method is implemented and sends
-- them as `client_tools` on the request. The server delegates the tool call
-- back via `tool_delegated`, the client routes it to the widget's method,
-- and POSTs the result to /ai/conversations/{id}/tool_results.
--
-- Naming: `widget_*` prefix denotes client-delegation SURFACE, not the subject
-- being acted upon. `widget_text_patch` patches text via a widget; it does not
-- patch a widget record. (Contrast with `note_patch` which patches a note row.)
--
-- Shared conventions across all 10 rows:
--   semver       = '1.0.0'
--   source_kind  = 'native'
--   is_active    = true
--   annotations  = [{type:"destructiveHint",value:true},{type:"idempotentHint",value:false}]
--   tags         include 'widget-capable' (always) + action-specific tags
--
-- Per-tool categories vary (text vs productivity). Runtime ownership is the
-- matrx-ai-core binding; tool.definition has no code-location/source_app field.
-- ============================================================================

BEGIN;

INSERT INTO tool.definition (
  name, category, description, parameters, output_schema,
  annotations, tags, semver, source_kind, is_active
) VALUES
-- 1. widget_text_replace
('widget_text_replace', 'text',
 'Replace the widget''s currently-selected text with new text. Used when an agent rewrites, translates, or otherwise transforms a user''s selection inline.',
 '{"text":{"type":"string","required":true,"description":"The replacement text to insert in place of the current selection."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','text','replace','write'],
 '1.0.0', 'native', true),

-- 2. widget_text_insert_before
('widget_text_insert_before', 'text',
 'Insert text immediately before the widget''s current selection without removing the selection.',
 '{"text":{"type":"string","required":true,"description":"The text to insert before the current selection."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','text','insert','write'],
 '1.0.0', 'native', true),

-- 3. widget_text_insert_after
('widget_text_insert_after', 'text',
 'Insert text immediately after the widget''s current selection without removing the selection.',
 '{"text":{"type":"string","required":true,"description":"The text to insert after the current selection."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','text','insert','write'],
 '1.0.0', 'native', true),

-- 4. widget_text_prepend
('widget_text_prepend', 'text',
 'Prepend text to the start of the widget''s full content (not relative to a selection).',
 '{"text":{"type":"string","required":true,"description":"The text to prepend to the start of the widget''s content."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','text','prepend','write'],
 '1.0.0', 'native', true),

-- 5. widget_text_append
('widget_text_append', 'text',
 'Append text to the end of the widget''s full content (not relative to a selection).',
 '{"text":{"type":"string","required":true,"description":"The text to append to the end of the widget''s content."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','text','append','write'],
 '1.0.0', 'native', true),

-- 6. widget_text_patch (mirrors note_patch fuzzy-match semantics)
('widget_text_patch', 'text',
 'Find-and-replace a verbatim excerpt inside the widget''s content. Uses fuzzy matching (exact -> whitespace-normalized -> blank-lines-stripped -> lenient) like note_patch. Returns which pass matched.',
 '{"search_text":{"type":"string","required":true,"description":"Verbatim excerpt from the widget content to locate."},"replacement_text":{"type":"string","required":true,"description":"Text to replace the matched excerpt with."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"},"matched_at_pass":{"type":"string","description":"Which fuzzy pass matched: exact, whitespace_normalized, blank_lines_stripped, or lenient."}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','text','patch','write'],
 '1.0.0', 'native', true),

-- 7. widget_update_field
('widget_update_field', 'productivity',
 'Update a single named field on the widget''s underlying record. The widget decides which record this applies to (a note, a flashcard, a form field, etc.).',
 '{"field":{"type":"string","required":true,"description":"Name of the field to update."},"value":{"required":true,"description":"New value for the field. Type depends on the field."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','update','field','write'],
 '1.0.0', 'native', true),

-- 8. widget_update_record
('widget_update_record', 'productivity',
 'Patch multiple fields on the widget''s underlying record in one call.',
 '{"patch":{"type":"object","required":true,"description":"Key-value object of fields to update on the underlying record."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','update','record','write'],
 '1.0.0', 'native', true),

-- 9. widget_attach_media
('widget_attach_media', 'productivity',
 'Attach a media asset (image, video, audio) to the widget. The widget decides where to place it.',
 '{"url":{"type":"string","required":true,"description":"Absolute URL of the media asset."},"mimeType":{"type":"string","required":true,"description":"MIME type (image/png, video/mp4, audio/mpeg, etc.)."},"title":{"type":"string","description":"Optional title for the media."},"alt":{"type":"string","description":"Optional alt text for accessibility."},"position":{"type":"string","enum":["before","after","inline","end"],"description":"Optional placement hint; widget decides the default."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','media','attach','write'],
 '1.0.0', 'native', true),

-- 10. widget_create_artifact
('widget_create_artifact', 'productivity',
 'Create a new structured artifact owned by the widget (flashcard, note, code block, task, etc.). The widget''s host decides what kinds of artifacts it accepts.',
 '{"kind":{"type":"string","required":true,"description":"The artifact kind (flashcard, note, task, code_block, etc.)."},"data":{"type":"object","required":true,"description":"Kind-specific payload. Shape depends on the artifact type."}}'::jsonb,
 '{"type":"object","properties":{"ok":{"type":"boolean"},"applied":{"type":"string"},"reason":{"type":"string","enum":["unsupported","failed","not_found"]},"message":{"type":"string"}},"required":["ok"]}'::jsonb,
 '[{"type":"destructiveHint","value":true},{"type":"idempotentHint","value":false}]'::jsonb,
 ARRAY['widget-capable','artifact','create','write'],
 '1.0.0', 'native', true);

INSERT INTO tool.binding (tool_id, executor_name, is_active)
SELECT id, 'matrx-ai-core', true
FROM tool.definition
WHERE name IN (
  'widget_text_replace',
  'widget_text_insert_before',
  'widget_text_insert_after',
  'widget_text_prepend',
  'widget_text_append',
  'widget_text_patch',
  'widget_update_field',
  'widget_update_record',
  'widget_attach_media',
  'widget_create_artifact'
)
ON CONFLICT (tool_id, executor_name) DO UPDATE
SET is_active = EXCLUDED.is_active,
    updated_at = now();

COMMIT;

-- Verification
-- SELECT name, category, tags FROM tool.definition
-- WHERE 'widget-capable' = ANY(tags) ORDER BY name;
