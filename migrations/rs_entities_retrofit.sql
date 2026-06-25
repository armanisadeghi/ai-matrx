-- rs_entities_retrofit.sql
-- DB changeover, Wave 3 — ADDITIVE base-retrofit (Step 1 only) for the rs_* (Research) Base-1 entities.
-- Applied 2026-06-24 via the validated registry-driven routine platform.retrofit_entity(...).
--
-- ADDITIVE / non-breaking. For each table the routine: adds the standard columns
-- (organization_id if absent, created_by, updated_by, updated_at, version — reusing any
-- existing version/updated_at anchor), drops the legacy *_updated_at trigger BEFORE the
-- backfill, backfills created_by from the owner column (where one pre-existed), backfills
-- organization_id (PERSONAL = owner's personal org with system-org fallback for ownerless
-- rows; PARENT = copied from the parent row's organization_id), attaches the shared
-- platform._touch_row + platform._stamp_actor triggers, and self-verifies 0 null-org
-- (the whole call rolls back on failure).
--
-- CLASSIFICATION of all 12 public.rs_* BASE tables (rs_source_keywords is a VIEW, excluded):
--   Base-1 entity (root)   : rs_topic     -> personal (owner created_by; FK -> auth.users)
--   Base-1 entity          : rs_template  -> personal (owner created_by; all 5 rows are
--                                            ownerless system templates -> system-org fallback)
--   Base-1 entity (child)  : rs_source, rs_content, rs_document, rs_keyword, rs_media,
--                            rs_analysis, rs_synthesis, rs_tag
--                            -> parent: org denormalized from rs_topic via topic_id
--   Base-2 join (SKIPPED, not entity-retrofitted in Step 1; later apply_rls(...,'join') pass):
--                            rs_keyword_source (keyword_id+source_id),
--                            rs_source_tag (source_id+tag_id)
--   Base-3 log/event/queue : NONE in rs_*.
--
-- ORDERING: rs_topic is retrofitted FIRST so the 8 children can copy its organization_id.
--
-- OWNER / COLLISION notes:
--   * rs_topic.created_by and rs_template.created_by are both already uuid (FK -> auth.users):
--     NO created_by->created_by_kind rename was needed on any rs_* table.
--   * The 8 child tables had NO pre-existing owner/actor column (only topic_id), so their new
--     created_by uuid column is left NULL = system/unattributed actor (valid per the standard,
--     decision #9). org — which gates RLS — is 100% populated on every table.
--   * rs_topic legacy BEFORE-UPDATE trigger `set_updated_at` -> dropped + replaced by _touch_row.
--     Other rs_* tables had no legacy *_updated_at trigger.
--
-- BUSINESS triggers intentionally LEFT IN PLACE (not legacy updated_at triggers):
--   * rs_topic._mirror_proj  (AFTER I/U/D -> platform._mirror_fk_to_assoc('rs_topic','project_id','project'))
--   * rs_keyword.rs_keyword_assign_position_trg (BEFORE INSERT -> rs_keyword_assign_position())
--
-- LITTER LEFT ALONE (per task scope): rs_topic.project_id (FK -> ctx_projects) is NOT dropped here.
--
-- DEFERRED to separate, gated steps (NOT in this migration):
--   * org-first RLS flip (iam.apply_rls(...,'entity') + drop legacy policies)
--   * history capture (platform._version_capture)
--   * organization_id NOT NULL
--   * DROP project_id litter on rs_topic (drop _mirror_proj first, after consumer repoint + PITR).
--
-- Idempotent / re-runnable: the routine is add-column-if-not-exists, drop-trigger-if-exists,
-- and backfills only NULLs, so re-applying the OK calls below is a no-op.

-- == APPLIED ==

-- ROOT FIRST.
-- rs_topic (13 rows): owner=created_by, legacy trigger set_updated_at.
-- Result: retrofit_entity(rs_topic) OK — orgcol=organization_id strategy=personal null_org=0
select platform.retrofit_entity('rs_topic', 'research_topic', 'personal', 'created_by', null, null, 'set_updated_at');

-- rs_template (5 rows, all ownerless system templates -> system-org fallback): owner=created_by.
-- Result: retrofit_entity(rs_template) OK — orgcol=organization_id strategy=personal null_org=0
select platform.retrofit_entity('rs_template', 'research_template', 'personal', 'created_by', null, null, null);

-- CHILDREN (org denormalized from rs_topic via topic_id).
-- Result (each): retrofit_entity(<t>) OK — orgcol=organization_id strategy=parent null_org=0
select platform.retrofit_entity('rs_source',    'research_source',    'parent', 'created_by', 'rs_topic', 'topic_id', null);
select platform.retrofit_entity('rs_content',   'research_content',   'parent', 'created_by', 'rs_topic', 'topic_id', null);
select platform.retrofit_entity('rs_document',  'research_document',  'parent', 'created_by', 'rs_topic', 'topic_id', null);
select platform.retrofit_entity('rs_keyword',   'research_keyword',   'parent', 'created_by', 'rs_topic', 'topic_id', null);
select platform.retrofit_entity('rs_media',     'research_media',     'parent', 'created_by', 'rs_topic', 'topic_id', null);
select platform.retrofit_entity('rs_analysis',  'research_analysis',  'parent', 'created_by', 'rs_topic', 'topic_id', null);
select platform.retrofit_entity('rs_synthesis', 'research_synthesis', 'parent', 'created_by', 'rs_topic', 'topic_id', null);
select platform.retrofit_entity('rs_tag',       'research_tag',       'parent', 'created_by', 'rs_topic', 'topic_id', null);
