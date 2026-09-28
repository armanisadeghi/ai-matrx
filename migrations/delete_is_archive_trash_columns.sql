-- chair-step: the DROP CONSTRAINT/INDEX lines swap rag.data_stores name/short-code uniqueness to partial on deleted_at IS NULL (DD-121); no table, column or row is dropped
-- Delete means archive (Arman, 2026-09-27): "delete MUST MEAN ARCHIVE regardless
-- of what it's called". These nine tables had delete buttons that destroyed rows
-- because they had no Trash column. Adding deleted_at is a positive add
-- (db-rules §8 THE POSITIVE-ADD RULE): no existing row or read changes.
-- Removing a parent removes its parts through platform.soft_delete_edge (§8a).

alter table rag.data_stores                   add column if not exists deleted_at timestamptz;
alter table tool.binding                      add column if not exists deleted_at timestamptz;
alter table docproc.page_extraction_runs      add column if not exists deleted_at timestamptz;
alter table docproc.page_extraction_results   add column if not exists deleted_at timestamptz;
alter table transcripts.studio_raw_segments     add column if not exists deleted_at timestamptz;
alter table transcripts.studio_cleaned_segments add column if not exists deleted_at timestamptz;
alter table transcripts.studio_concept_items    add column if not exists deleted_at timestamptz;
alter table transcripts.studio_module_segments  add column if not exists deleted_at timestamptz;
alter table ui.ui_surface                     add column if not exists deleted_at timestamptz;

-- A store in Trash stops holding its name and short code (DD-121).
alter table rag.data_stores drop constraint if exists data_stores_org_name_unique;
drop index if exists rag.data_stores_org_name_unique;
create unique index data_stores_org_name_unique
  on rag.data_stores (organization_id, name) where deleted_at is null;
alter table rag.data_stores drop constraint if exists data_stores_org_short_code_unique;
drop index if exists rag.data_stores_org_short_code_unique;
create unique index data_stores_org_short_code_unique
  on rag.data_stores (organization_id, short_code) where deleted_at is null;

-- Parts follow their parent into Trash and back out of it.
select platform.declare_soft_delete_edge('rag','data_stores','rag','data_store_members','data_store_id','cascade',
  'A membership row is part of its data store', 'delete-is-archive 2026-09-27', 'data store');
select platform.declare_soft_delete_edge('tool','definition','tool','binding','tool_id','cascade',
  'A binding places this tool on an executor; it is part of the tool', 'delete-is-archive 2026-09-27', 'tool');
select platform.declare_soft_delete_edge('tool','executor','tool','binding','executor_name','cascade',
  'A binding is part of its executor''s tool list', 'delete-is-archive 2026-09-27', 'executor', 'name');
select platform.declare_soft_delete_edge('docproc','page_extraction_jobs','docproc','page_extraction_runs','job_id','cascade',
  'A run belongs to its extraction template', 'delete-is-archive 2026-09-27', 'extraction template');
select platform.declare_soft_delete_edge('docproc','page_extraction_jobs','docproc','page_extraction_results','job_id','cascade',
  'A result belongs to its extraction template', 'delete-is-archive 2026-09-27', 'extraction template');
select platform.declare_soft_delete_edge('docproc','page_extraction_runs','docproc','page_extraction_results','run_id','cascade',
  'A result is produced by and part of its run', 'delete-is-archive 2026-09-27', 'extraction run');
select platform.declare_soft_delete_edge('docproc','page_extraction_runs','docproc','page_extraction_page_runs','run_id','cascade',
  'A page run is part of its run', 'delete-is-archive 2026-09-27', 'extraction run');
select platform.declare_soft_delete_edge('docproc','page_extraction_runs','rag','kg_chunks','extraction_run_id','keep',
  'A knowledge chunk outlives the run that produced it (FK is ON DELETE SET NULL)', 'delete-is-archive 2026-09-27', 'extraction run');
select platform.declare_soft_delete_edge('docproc','page_extraction_results','rag','kg_chunks','extraction_result_id','keep',
  'A knowledge chunk outlives the result that produced it (FK is ON DELETE SET NULL)', 'delete-is-archive 2026-09-27', 'extraction result');
select platform.declare_soft_delete_edge('transcripts','studio_sessions','transcripts','studio_raw_segments','session_id','cascade',
  'Raw transcript text is part of its studio session', 'delete-is-archive 2026-09-27', 'studio session');
select platform.declare_soft_delete_edge('transcripts','studio_sessions','transcripts','studio_cleaned_segments','session_id','cascade',
  'Cleaned text is part of its studio session', 'delete-is-archive 2026-09-27', 'studio session');
select platform.declare_soft_delete_edge('transcripts','studio_sessions','transcripts','studio_concept_items','session_id','cascade',
  'A concept item is part of its studio session', 'delete-is-archive 2026-09-27', 'studio session');
select platform.declare_soft_delete_edge('transcripts','studio_sessions','transcripts','studio_module_segments','session_id','cascade',
  'A module segment is part of its studio session', 'delete-is-archive 2026-09-27', 'studio session');
select platform.declare_soft_delete_edge('transcripts','studio_recording_segments','transcripts','studio_raw_segments','recording_segment_id','cascade',
  'Deleting a recording card throws away its transcript text with it', 'delete-is-archive 2026-09-27', 'recording');
select platform.declare_soft_delete_edge('transcripts','studio_recording_segments','transcripts','studio_cleaned_segments','recording_segment_id','cascade',
  'Cleaned text of a recording is part of that recording', 'delete-is-archive 2026-09-27', 'recording');
select platform.declare_soft_delete_edge('transcripts','studio_runs','transcripts','studio_cleaned_segments','run_id','keep',
  'A run is an audit record; its output outlives it (FK is ON DELETE SET NULL)', 'delete-is-archive 2026-09-27', 'studio run');
select platform.declare_soft_delete_edge('transcripts','studio_runs','transcripts','studio_concept_items','run_id','keep',
  'A run is an audit record; its output outlives it (FK is ON DELETE SET NULL)', 'delete-is-archive 2026-09-27', 'studio run');
select platform.declare_soft_delete_edge('transcripts','studio_runs','transcripts','studio_module_segments','run_id','keep',
  'A run is an audit record; its output outlives it (FK is ON DELETE SET NULL)', 'delete-is-archive 2026-09-27', 'studio run');
select platform.declare_soft_delete_edge('ui','ui_surface','ui','ui_surface_config','surface_name','cascade',
  'Configuration of a surface is part of that surface', 'delete-is-archive 2026-09-27', 'surface', 'name');
select platform.declare_soft_delete_edge('ui','ui_surface','ui','ui_surface_item_type','surface_name','cascade',
  'Item types declared by a surface are part of that surface', 'delete-is-archive 2026-09-27', 'surface', 'name');
select platform.declare_soft_delete_edge('ui','ui_surface','tool','surface_defaults','surface_name','cascade',
  'Default tools of a surface are part of that surface', 'delete-is-archive 2026-09-27', 'surface', 'name');
select platform.declare_soft_delete_edge('ui','ui_surface','agent','shortcut','surface_name','keep',
  'A shortcut is its own record; it only points at a surface (FK is ON DELETE SET NULL)', 'delete-is-archive 2026-09-27', 'surface', 'name');
select platform.declare_soft_delete_edge('ui','ui_surface','tool','ui','surface_name','keep',
  'A tool UI is its own record registered against a surface', 'delete-is-archive 2026-09-27', 'surface', 'name');
