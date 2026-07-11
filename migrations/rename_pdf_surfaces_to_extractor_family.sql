-- Rename PDF surface family + register Analysis Studio / Scanner.
-- Idempotent. FKs on agent.agent_surface, agent.shortcut, tool.*,
-- ui.ui_surface_value, etc. are ON UPDATE CASCADE.
--
-- Applied live 2026-07-10 via Supabase MCP (project txzxabzwovsujtloxrus).

-- 1) Drop empty inactive stub so the name is free.
DELETE FROM ui.ui_surface
WHERE name = 'matrx-user/pdf-extractor'
  AND is_active = false
  AND NOT EXISTS (
    SELECT 1 FROM ui.ui_surface_value v
    WHERE v.surface_name = 'matrx-user/pdf-extractor'
  );

-- 2) pdf-widgets → pdf-extractor
UPDATE ui.ui_surface
SET
  name = 'matrx-user/pdf-extractor',
  description = 'PDF Extractor studio (/tools/pdf-extractor) — one-shot agent runs on a loaded PDF with a 4-way scope picker (full doc / current page / page range / browser selection). Parent of matrx-user/extractor-chunker.',
  url_pattern = '/tools/pdf-extractor',
  is_active = true,
  sort_order = 304,
  updated_at = now()
WHERE name = 'matrx-user/pdf-widgets';

-- 3) content-extractor → extractor-chunker (child of pdf-extractor)
UPDATE ui.ui_surface
SET
  name = 'matrx-user/extractor-chunker',
  parent_surface_name = 'matrx-user/pdf-extractor',
  description = 'Chunked AI extraction Jobs on the PDF Extractor (Chunked Runs tab). Superset of pdf-extractor values plus per-chunk clean_text / raw_text / pdf_page / chunk identity.',
  url_pattern = '/tools/pdf-extractor',
  is_active = true,
  sort_order = 305,
  updated_at = now()
WHERE name = 'matrx-user/content-extractor';

-- 4) Sibling product surfaces
INSERT INTO ui.ui_surface (
  name, client_name, description, parent_surface_name, url_pattern,
  is_active, sort_order, supports_dictionary
) VALUES
  (
    'matrx-user/analysis-studio',
    'matrx-user',
    'PDF Analysis Studio (/files/f/[id]/studio) — pages, detectors, annotations, redaction. Agents act on the open file/page.',
    'matrx-user/pdf-extractor',
    '/files/f',
    true,
    306,
    false
  ),
  (
    'matrx-user/scanner',
    'matrx-user',
    'Phone/desktop document scanner (/tools/scanner) — capture or import pages into a PDF, then hand off to the extractor pipeline.',
    'matrx-user/pdf-extractor',
    '/tools/scanner',
    true,
    307,
    false
  )
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  parent_surface_name = EXCLUDED.parent_surface_name,
  url_pattern = EXCLUDED.url_pattern,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 5) Seed values for the new surfaces (mirrors manifests; ON CONFLICT upsert)
INSERT INTO ui.ui_surface_value (
  surface_name, name, label, description, value_type,
  always_available, typical_char_count, sort_order
) VALUES
('matrx-user/analysis-studio','selection','Current selection','Text the user has highlighted in the studio. Empty when nothing is selected.','string',false,200,100),
('matrx-user/analysis-studio','text_before','Text before selection','Text immediately preceding the selection. Empty when unused.','string',false,500,110),
('matrx-user/analysis-studio','text_after','Text after selection','Text immediately following the selection. Empty when unused.','string',false,500,120),
('matrx-user/analysis-studio','file_id','File ID','UUID of the cld_files row open in Analysis Studio. Empty when opened without a cloud file.','string',false,36,300),
('matrx-user/analysis-studio','processed_document_id','Processed document ID','UUID of the processed_documents row linked to this file. Empty when no derivative exists yet.','string',false,36,310),
('matrx-user/analysis-studio','filename','Document filename','Display name of the open PDF. Empty when no document is loaded.','string',false,80,320),
('matrx-user/analysis-studio','current_page','Current page number','1-indexed page the user is viewing in the studio. Zero when unknown.','number',false,4,400),
('matrx-user/analysis-studio','total_pages','Total pages','Total page count of the open PDF. Zero when unknown or unloaded.','number',false,5,410),
('matrx-user/analysis-studio','current_page_text','Current page text','Extracted text of the page currently in view. Empty when text is unavailable.','string',false,2000,420),
('matrx-user/analysis-studio','full_document_text','Full document text','Joined extracted text for the whole document when available. Can be large.','string',false,12000,430),
('matrx-user/analysis-studio','content','Full document (alias)','Alias of full_document_text for generic agents. Prefer full_document_text.','string',false,12000,9110),
('matrx-user/analysis-studio','context','Free-form context','Loose escape hatch. Prefer named values.','object',false,1000,9999),
('matrx-user/scanner','selection','Current selection','Baseline selection. Empty on scanner unless a text region is selected.','string',false,200,100),
('matrx-user/scanner','text_before','Text before selection','Baseline. Unused on scanner.','string',false,500,110),
('matrx-user/scanner','text_after','Text after selection','Baseline. Unused on scanner.','string',false,500,120),
('matrx-user/scanner','content','Primary content','Baseline primary content. Prefer named scanner values.','string',false,5000,200),
('matrx-user/scanner','scan_title','Scan title','User-editable title of the scan session. Empty before the user names it.','string',false,80,300),
('matrx-user/scanner','scan_page_count','Scan page count','Number of pages currently in the scan review list. Zero when empty.','number',true,4,310),
('matrx-user/scanner','file_id','Saved file ID','UUID of the cloud file created after save. Empty until the scan is saved.','string',false,36,320),
('matrx-user/scanner','processed_document_id','Processed document ID','UUID of the processed-document derivative after pipeline handoff. Empty until processing completes.','string',false,36,330),
('matrx-user/scanner','filename','Output filename','Filename of the saved PDF (often derived from scan_title). Empty before save.','string',false,80,340),
('matrx-user/scanner','context','Free-form context','Loose escape hatch. Prefer named values.','object',false,1000,9999)
ON CONFLICT (surface_name, name) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  always_available = EXCLUDED.always_available,
  typical_char_count = EXCLUDED.typical_char_count,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
