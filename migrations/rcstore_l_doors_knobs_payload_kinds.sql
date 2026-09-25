-- RC-A1 completion (STORE-DESIGN §3.4, §3.5, §3.11, §3.14, §3.18; verification
-- common-docs/projects/rich-content-unification/evidence/verify-RC-A1-A3.md items F3 and 7):
--
--   1. The per-type knobs the database now READS — default_visibility, identity_key, listed,
--      local_sync, editor_mode (21 types each) — and the globals large_body_chars,
--      autosave_version_keep_days, edited_answer_visible_to_model (default true).
--   2. A new document with no visibility gets its TYPE's default visibility (never a refusal):
--      the column loses its generator default and content._document_guard_data_class fills it
--      from default_visibility.<type> before any class rule runs.
--   3. The doors of §3.5/§3.11/§3.14, all reading through the caller's RLS unless noted:
--        content.type_settings(type, organization)        every per-type knob, resolved
--        content.document_get(id, include_body)           lazy body above large_body_chars
--        content.find_document(organization, type, key)   by the type's identity_key
--        content.local_sync_changes(since, limit)         the desktop pull (local_sync types)
--        content.version_list / version_get / version_diff
--        content.search_documents(...)                    ranked FTS + title trigram, scope,
--                                                          archive filter, listed knob
--        content.read_published(id) / read_published_by_slug(org, type, slug)
--                                                          DEFINER: the published version to a
--                                                          signed-out reader only when public
--        content.thin_autosave_versions(dry_run)          DEFINER, server-only; not scheduled
--   4. Edge payload kinds text_anchor (v2), text_anchor_set, render_binding — schemas are the
--      published content_ir kinds from aidream/kinds/content_anchors.py, byte-for-byte.
--
-- based-on: content._document_guard_data_class() 8f114684c30cc561bf2db686b73175b084e52e6c5c21f3b9b763e640476d10e0

set local lock_timeout = '5s';

-- ============================================================================================
-- 1. Knobs
-- ============================================================================================
insert into platform.feature_knob (feature, key, value, default_value, value_type, allowed_values, label, description,
                                   set_by, overridable_by, override_direction, taxonomy_node_id)
select 'content.document', k.key, k.value::jsonb, k.value::jsonb, k.value_type, k.allowed::jsonb, k.label, k.description,
       'agent', array['organization'], 'any', '6a7d9cc6-a1cc-4e4d-b238-70bad1725321'::uuid
  from (values
  ('default_visibility.note', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: note', 'The visibility a new note gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.note', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: note', 'Which column identifies a note inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.note', 'true', 'boolean', null, 'Listed: note', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.note', 'true', 'boolean', null, 'Local file sync: note', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.note', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: note', 'The editor a note opens in: visual, source, read_only or univer.'),
  ('default_visibility.study_guide', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: study guide', 'The visibility a new study guide gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.study_guide', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: study guide', 'Which column identifies a study guide inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.study_guide', 'true', 'boolean', null, 'Listed: study guide', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.study_guide', 'true', 'boolean', null, 'Local file sync: study guide', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.study_guide', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: study guide', 'The editor a study guide opens in: visual, source, read_only or univer.'),
  ('default_visibility.annotation', '"personal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: annotation', 'The visibility a new annotation gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.annotation', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: annotation', 'Which column identifies a annotation inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.annotation', 'false', 'boolean', null, 'Listed: annotation', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.annotation', 'false', 'boolean', null, 'Local file sync: annotation', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.annotation', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: annotation', 'The editor a annotation opens in: visual, source, read_only or univer.'),
  ('default_visibility.working_document', '"personal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: working document', 'The visibility a new working document gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.working_document', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: working document', 'Which column identifies a working document inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.working_document', 'true', 'boolean', null, 'Listed: working document', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.working_document', 'false', 'boolean', null, 'Local file sync: working document', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.working_document', '"source"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: working document', 'The editor a working document opens in: visual, source, read_only or univer.'),
  ('default_visibility.scratch', '"personal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: scratch', 'The visibility a new scratch gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.scratch', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: scratch', 'Which column identifies a scratch inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.scratch', 'true', 'boolean', null, 'Listed: scratch', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.scratch', 'false', 'boolean', null, 'Local file sync: scratch', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.scratch', '"source"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: scratch', 'The editor a scratch opens in: visual, source, read_only or univer.'),
  ('default_visibility.transcript_document', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: transcript document', 'The visibility a new transcript document gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.transcript_document', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: transcript document', 'Which column identifies a transcript document inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.transcript_document', 'true', 'boolean', null, 'Listed: transcript document', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.transcript_document', 'false', 'boolean', null, 'Local file sync: transcript document', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.transcript_document', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: transcript document', 'The editor a transcript document opens in: visual, source, read_only or univer.'),
  ('default_visibility.interview_document', '"personal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: interview document', 'The visibility a new interview document gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.interview_document', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: interview document', 'Which column identifies a interview document inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.interview_document', 'true', 'boolean', null, 'Listed: interview document', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.interview_document', 'false', 'boolean', null, 'Local file sync: interview document', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.interview_document', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: interview document', 'The editor a interview document opens in: visual, source, read_only or univer.'),
  ('default_visibility.blog', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: blog', 'The visibility a new blog gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.blog', '"slug"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: blog', 'Which column identifies a blog inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.blog', 'true', 'boolean', null, 'Listed: blog', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.blog', 'false', 'boolean', null, 'Local file sync: blog', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.blog', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: blog', 'The editor a blog opens in: visual, source, read_only or univer.'),
  ('default_visibility.show_notes', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: show notes', 'The visibility a new show notes gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.show_notes', '"slug"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: show notes', 'Which column identifies a show notes inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.show_notes', 'true', 'boolean', null, 'Listed: show notes', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.show_notes', 'false', 'boolean', null, 'Local file sync: show notes', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.show_notes', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: show notes', 'The editor a show notes opens in: visual, source, read_only or univer.'),
  ('default_visibility.learn_article', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: learn article', 'The visibility a new learn article gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.learn_article', '"slug"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: learn article', 'Which column identifies a learn article inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.learn_article', 'true', 'boolean', null, 'Listed: learn article', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.learn_article', 'false', 'boolean', null, 'Local file sync: learn article', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.learn_article', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: learn article', 'The editor a learn article opens in: visual, source, read_only or univer.'),
  ('default_visibility.web_page', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: web page', 'The visibility a new web page gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.web_page', '"slug"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: web page', 'Which column identifies a web page inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.web_page', 'true', 'boolean', null, 'Listed: web page', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.web_page', 'false', 'boolean', null, 'Local file sync: web page', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.web_page', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: web page', 'The editor a web page opens in: visual, source, read_only or univer.'),
  ('default_visibility.podcast_script', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: podcast script', 'The visibility a new podcast script gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.podcast_script', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: podcast script', 'Which column identifies a podcast script inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.podcast_script', 'true', 'boolean', null, 'Listed: podcast script', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.podcast_script', 'false', 'boolean', null, 'Local file sync: podcast script', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.podcast_script', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: podcast script', 'The editor a podcast script opens in: visual, source, read_only or univer.'),
  ('default_visibility.message_template', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: message template', 'The visibility a new message template gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.message_template', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: message template', 'Which column identifies a message template inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.message_template', 'true', 'boolean', null, 'Listed: message template', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.message_template', 'false', 'boolean', null, 'Local file sync: message template', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.message_template', '"source"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: message template', 'The editor a message template opens in: visual, source, read_only or univer.'),
  ('default_visibility.content_block', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: content block', 'The visibility a new content block gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.content_block', '"slug"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: content block', 'Which column identifies a content block inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.content_block', 'true', 'boolean', null, 'Listed: content block', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.content_block', 'false', 'boolean', null, 'Local file sync: content block', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.content_block', '"source"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: content block', 'The editor a content block opens in: visual, source, read_only or univer.'),
  ('default_visibility.document_template', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: document template', 'The visibility a new document template gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.document_template', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: document template', 'Which column identifies a document template inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.document_template', 'true', 'boolean', null, 'Listed: document template', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.document_template', 'false', 'boolean', null, 'Local file sync: document template', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.document_template', '"source"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: document template', 'The editor a document template opens in: visual, source, read_only or univer.'),
  ('default_visibility.skill', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: skill', 'The visibility a new skill gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.skill', '"slug"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: skill', 'Which column identifies a skill inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.skill', 'true', 'boolean', null, 'Listed: skill', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.skill', 'false', 'boolean', null, 'Local file sync: skill', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.skill', '"source"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: skill', 'The editor a skill opens in: visual, source, read_only or univer.'),
  ('default_visibility.research_synthesis', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: research synthesis', 'The visibility a new research synthesis gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.research_synthesis', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: research synthesis', 'Which column identifies a research synthesis inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.research_synthesis', 'true', 'boolean', null, 'Listed: research synthesis', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.research_synthesis', 'false', 'boolean', null, 'Local file sync: research synthesis', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.research_synthesis', '"visual"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: research synthesis', 'The editor a research synthesis opens in: visual, source, read_only or univer.'),
  ('default_visibility.rendered_document', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: rendered document', 'The visibility a new rendered document gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.rendered_document', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: rendered document', 'Which column identifies a rendered document inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.rendered_document', 'true', 'boolean', null, 'Listed: rendered document', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.rendered_document', 'false', 'boolean', null, 'Local file sync: rendered document', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.rendered_document', '"read_only"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: rendered document', 'The editor a rendered document opens in: visual, source, read_only or univer.'),
  ('default_visibility.repo_doc', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: repo doc', 'The visibility a new repo doc gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.repo_doc', '"source_uri"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: repo doc', 'Which column identifies a repo doc inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.repo_doc', 'true', 'boolean', null, 'Listed: repo doc', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.repo_doc', 'false', 'boolean', null, 'Local file sync: repo doc', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.repo_doc', '"source"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: repo doc', 'The editor a repo doc opens in: visual, source, read_only or univer.'),
  ('default_visibility.univer', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: univer', 'The visibility a new univer gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.univer', '"none"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: univer', 'Which column identifies a univer inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.univer', 'true', 'boolean', null, 'Listed: univer', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.univer', 'false', 'boolean', null, 'Local file sync: univer', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.univer', '"univer"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: univer', 'The editor a univer opens in: visual, source, read_only or univer.'),
  ('default_visibility.sample', '"internal"', 'enum', '["personal", "internal", "link", "public"]', 'Default visibility: sample', 'The visibility a new sample gets when the writer names none. A private-class type is always personal.'),
  ('identity_key.sample', '"slug"', 'enum', '["slug", "source_uri", "none"]', 'Identity key: sample', 'Which column identifies a sample inside its organization for content.find_document: slug, source_uri, or none (open it by id).'),
  ('listed.sample', 'true', 'boolean', null, 'Listed: sample', 'Off keeps this type out of content.search_documents and every general list unless the caller names the type.'),
  ('local_sync.sample', 'false', 'boolean', null, 'Local file sync: sample', 'On offers this type to the desktop file sync through content.local_sync_changes.'),
  ('editor_mode.sample', '"source"', 'enum', '["visual", "source", "read_only", "univer"]', 'Editor: sample', 'The editor a sample opens in: visual, source, read_only or univer.')
  ) as k(key, value, value_type, allowed, label, description)
on conflict (feature, key) do nothing;

insert into platform.feature_knob (feature, key, value, default_value, value_type, min_value, unit, label, description,
                                   set_by, overridable_by, override_direction, taxonomy_node_id)
values
  ('content.document', 'large_body_chars', '500000'::jsonb, '500000'::jsonb, 'integer', 1000, 'characters',
   'Lazy-load bodies above', 'content.document_get omits the body of a document longer than this unless the caller asks for it; lists never carry bodies.',
   'agent', array['organization'], 'any', '6a7d9cc6-a1cc-4e4d-b238-70bad1725321'::uuid),
  ('content.document', 'autosave_version_keep_days', '30'::jsonb, '30'::jsonb, 'integer', 1, 'days',
   'Keep every autosave version for', 'content.thin_autosave_versions thins unlabeled, unpublished, unpinned autosave versions older than this to one per day; a version an anchor, a lifecycle row or a render pins is never thinned.',
   'agent', array['organization'], 'raise_only', '6a7d9cc6-a1cc-4e4d-b238-70bad1725321'::uuid)
on conflict (feature, key) do nothing;

insert into platform.feature_knob (feature, key, value, default_value, value_type, label, description,
                                   set_by, overridable_by, override_direction, taxonomy_node_id)
values
  ('content.document', 'edited_answer_visible_to_model', 'true'::jsonb, 'true'::jsonb, 'boolean',
   'The model sees edited answers', 'When a person edits an assistant answer in place, the conversation''s next turns send the edited text to the model (on) or the original (off).',
   'agent', array['organization', 'user'], 'any', '6a7d9cc6-a1cc-4e4d-b238-70bad1725321'::uuid)
on conflict (feature, key) do nothing;

-- ============================================================================================
-- 2. Edge payload kinds (schemas = the published content_ir kinds)
-- ============================================================================================
insert into platform.edge_payload_kind (kind, version, description, json_schema, source_type, target_type)
values
  ('text_anchor', 2,
   'Precise passage identity (W3C TextQuote + TextPosition): a Unicode code-point range into one content_version of the target, the exact quote, bounded prefix/suffix context and an optional block hint. Any source and target type; for a document target the database checks it against that version''s text.',
   $ta${"$defs": {"TextAnchorBlock": {"additionalProperties": false, "description": "Optional stable block hint: which block of the body held the passage, and its hash.", "properties": {"__kind": {"default": "", "description": "The registered kind this payload is an instance of, when it is one.", "title": "Kind", "type": "string"}, "hash": {"description": "Hash of that block's text at the captured version.", "maxLength": 128, "minLength": 1, "title": "Hash", "type": "string"}, "index": {"description": "Zero-based index of the block (paragraph, list item, heading) in the body.", "minimum": 0, "title": "Index", "type": "integer"}}, "required": ["index", "hash"], "title": "TextAnchorBlock", "type": "object"}}, "additionalProperties": false, "description": "One passage of one content version, in Unicode code points.", "properties": {"__kind": {"const": "text_anchor", "default": "text_anchor", "description": "The registered kind this payload is an instance of.", "title": "Kind", "type": "string"}, "block": {"anyOf": [{"$ref": "#/$defs/TextAnchorBlock"}, {"type": "null"}], "default": null, "description": "Optional block hint for disambiguation."}, "content_version": {"description": "The document content_version the offsets were captured against.", "minimum": 1, "title": "Content Version", "type": "integer"}, "end": {"description": "Code-point offset just past the passage (end > start).", "minimum": 1, "title": "End", "type": "integer"}, "exact": {"description": "The selected text, exactly; its code-point length is end - start.", "maxLength": 20000, "minLength": 1, "title": "Exact", "type": "string"}, "prefix": {"default": "", "description": "Up to 64 code points of text immediately before the passage.", "maxLength": 64, "title": "Prefix", "type": "string"}, "start": {"description": "Code-point offset where the passage begins.", "minimum": 0, "title": "Start", "type": "integer"}, "suffix": {"default": "", "description": "Up to 64 code points of text immediately after the passage.", "maxLength": 64, "title": "Suffix", "type": "string"}}, "required": ["content_version", "start", "end", "exact"], "title": "TextAnchor", "type": "object"}$ta$::jsonb, null, null),
  ('text_anchor_set', 1,
   'Several passages of one target on ONE edge (associations are unique on source, target and role). A single text_anchor onto an edge that already holds a different passage is merged into a set; sending a set replaces the passages explicitly.',
   $tas${"$defs": {"TextAnchor": {"additionalProperties": false, "description": "One passage of one content version, in Unicode code points.", "properties": {"__kind": {"const": "text_anchor", "default": "text_anchor", "description": "The registered kind this payload is an instance of.", "title": "Kind", "type": "string"}, "block": {"anyOf": [{"$ref": "#/$defs/TextAnchorBlock"}, {"type": "null"}], "default": null, "description": "Optional block hint for disambiguation."}, "content_version": {"description": "The document content_version the offsets were captured against.", "minimum": 1, "title": "Content Version", "type": "integer"}, "end": {"description": "Code-point offset just past the passage (end > start).", "minimum": 1, "title": "End", "type": "integer"}, "exact": {"description": "The selected text, exactly; its code-point length is end - start.", "maxLength": 20000, "minLength": 1, "title": "Exact", "type": "string"}, "prefix": {"default": "", "description": "Up to 64 code points of text immediately before the passage.", "maxLength": 64, "title": "Prefix", "type": "string"}, "start": {"description": "Code-point offset where the passage begins.", "minimum": 0, "title": "Start", "type": "integer"}, "suffix": {"default": "", "description": "Up to 64 code points of text immediately after the passage.", "maxLength": 64, "title": "Suffix", "type": "string"}}, "required": ["content_version", "start", "end", "exact"], "title": "TextAnchor", "type": "object"}, "TextAnchorBlock": {"additionalProperties": false, "description": "Optional stable block hint: which block of the body held the passage, and its hash.", "properties": {"__kind": {"default": "", "description": "The registered kind this payload is an instance of, when it is one.", "title": "Kind", "type": "string"}, "hash": {"description": "Hash of that block's text at the captured version.", "maxLength": 128, "minLength": 1, "title": "Hash", "type": "string"}, "index": {"description": "Zero-based index of the block (paragraph, list item, heading) in the body.", "minimum": 0, "title": "Index", "type": "integer"}}, "required": ["index", "hash"], "title": "TextAnchorBlock", "type": "object"}}, "additionalProperties": false, "description": "Several passages of one target carried by ONE edge.\n\n``platform.associations`` is unique on (source, target, role), so one annotation, card or note\nhas ONE edge per target and role. When a second, different passage arrives for the same edge,\nthe database never lets it silently replace the first: a single ``text_anchor`` onto an edge\nthat already holds another passage is MERGED into a ``text_anchor_set``; sending a whole set\nis the explicit way to replace or remove passages (reanchoring, detaching one highlight).", "properties": {"__kind": {"const": "text_anchor_set", "default": "text_anchor_set", "description": "The registered kind this payload is an instance of.", "title": "Kind", "type": "string"}, "anchors": {"description": "The passages, each a full text_anchor.", "items": {"$ref": "#/$defs/TextAnchor"}, "maxItems": 500, "minItems": 1, "title": "Anchors", "type": "array"}}, "required": ["anchors"], "title": "TextAnchorSet", "type": "object"}$tas$::jsonb, null, null),
  ('render_binding', 1,
   'The rendered_from edge of a sealed rendered_document: the template''s content_version the render used (pinned: never thinned) and the variable values that filled it.',
   $rb${"additionalProperties": false, "description": "What a sealed ``rendered_document`` was made from: the ``rendered_from`` edge payload.\n\nPins the template's ``content_version`` so version thinning never removes it and the render\ncan always be traced to the exact template text, plus the variable values that filled it.", "properties": {"__kind": {"const": "render_binding", "default": "render_binding", "description": "The registered kind this payload is an instance of.", "title": "Kind", "type": "string"}, "rendered_at": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": null, "description": "ISO-8601 time of the render.", "title": "Rendered At"}, "template_content_version": {"description": "The template document's content_version the render used.", "minimum": 1, "title": "Template Content Version", "type": "integer"}, "variables": {"additionalProperties": {"type": "string"}, "description": "Merge-field name -> the value that filled it.", "properties": {"__kind": {"description": "The registered kind this payload is an instance of, when it is one.", "type": "string"}}, "title": "Variables", "type": "object"}}, "required": ["template_content_version"], "title": "RenderBinding", "type": "object"}$rb$::jsonb, 'document', 'document')
on conflict (kind) do update
   set version = excluded.version, description = excluded.description, json_schema = excluded.json_schema,
       source_type = excluded.source_type, target_type = excluded.target_type;

-- ============================================================================================
-- 3. The type's default visibility, never a refusal (F3)
-- ============================================================================================
alter table content.document alter column visibility drop default;

create or replace function content._document_guard_data_class()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_slug     text;
  v_platform platform.data_class;
  v_resolved platform.data_class;
  v_floor    platform.data_class;
begin
  select c.slug into v_slug from platform.categories c where c.id = new.document_type_id;
  if v_slug is null then
    return new;   -- the type guard refuses this row with its own sentence
  end if;

  -- A writer that names no visibility gets the type's default (knob default_visibility.<type>).
  if tg_op = 'INSERT' and new.visibility is null then
    new.visibility := (platform.knob_resolve('content.document', 'default_visibility.' || v_slug,
                                             new.organization_id, auth.uid()) #>> '{}')::platform.visibility;
  end if;

  if content._capture_bypassed() then
    return new;
  end if;
  select (k.value #>> '{}')::platform.data_class into v_platform
    from platform.feature_knob k
   where k.feature = 'content.document' and k.key = 'data_class.' || v_slug;
  if v_platform is null then
    raise exception using
      errcode = '55000',
      message = format('Document type %s has no class floor (knob content.document / data_class.%s is not seeded).', v_slug, v_slug),
      hint = 'Seed the knob in platform.feature_knob; a missing floor is never defaulted.';
  end if;
  v_resolved := (platform.knob_resolve('content.document', 'data_class.' || v_slug, new.organization_id, auth.uid()) #>> '{}')::platform.data_class;
  v_floor := least(v_platform, coalesce(v_resolved, v_platform));   -- enum order: private < confidential < organization < public

  if tg_op = 'INSERT' and new.data_class is null then
    new.data_class := v_floor;
  end if;
  if new.data_class > v_floor then
    raise exception using
      errcode = '42501',
      message = format('A %s may not be classed %s: its floor is %s.', v_slug, new.data_class, v_floor),
      hint = format('Use %s or stricter.', v_floor);
  end if;
  if tg_op = 'UPDATE' and new.data_class is distinct from old.data_class
     and auth.uid() is not null
     and old.created_by is distinct from auth.uid()
     and not iam.has_access('document', new.id, 'admin') then
    raise exception using
      errcode = '42501',
      message = 'Only the owner of a document (or an admin on it) can change its data class.',
      hint = 'Ask the owner to change it.';
  end if;
  if new.data_class = 'private' and new.visibility <> 'personal' then
    raise exception using
      errcode = '23514',
      message = format('A private-class %s can only be personal (visibility is %s).', v_slug, new.visibility),
      hint = 'Send visibility = ''personal'' (or none: the type default applies), or lower the class (not below its floor) before sharing.';
  end if;
  if new.visibility = 'public' and new.data_class not in ('organization', 'public') then
    raise exception using
      errcode = '23514',
      message = format('A %s-class document cannot be public.', new.data_class),
      hint = 'Lower the class to organization (if its floor allows) before making it public.';
  end if;
  return new;
end;
$fn$;

-- ============================================================================================
-- 4. Per-type settings, resolved (the one read every client makes before it opens a type)
-- ============================================================================================
create or replace function content.type_settings(p_type_slug text, p_organization_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v   jsonb := jsonb_build_object('type', p_type_slug);
  k   text;
  v_platform platform.data_class;
  v_resolved platform.data_class;
begin
  if not exists (select 1 from platform.categories c
                  where c.dimension = 'document_type'
                    and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and c.slug = p_type_slug and c.deleted_at is null
                    and not coalesce((c.metadata ->> 'group')::boolean, false)) then
    raise exception using errcode = '22023',
      message = format('%s is not a document type.', coalesce(p_type_slug, 'NULL')),
      hint = 'Pick a slug from platform.categories where dimension = ''document_type''.';
  end if;
  foreach k in array array['listed', 'capture', 'auto_ingest', 'default_visibility', 'identity_key', 'local_sync', 'editor_mode'] loop
    v := v || jsonb_build_object(k, platform.knob_resolve('content.document', k || '.' || p_type_slug, p_organization_id, auth.uid()));
  end loop;
  select (f.value #>> '{}')::platform.data_class into v_platform
    from platform.feature_knob f where f.feature = 'content.document' and f.key = 'data_class.' || p_type_slug;
  v_resolved := (platform.knob_resolve('content.document', 'data_class.' || p_type_slug, p_organization_id, auth.uid()) #>> '{}')::platform.data_class;
  v := v || jsonb_build_object('data_class_floor', least(v_platform, coalesce(v_resolved, v_platform)));
  foreach k in array array['large_body_chars', 'autosave_version_keep_days', 'edited_answer_visible_to_model', 'max_inline_data_uri_bytes'] loop
    v := v || jsonb_build_object(k, platform.knob_resolve('content.document', k, p_organization_id, auth.uid()));
  end loop;
  return v;
end;
$fn$;
comment on function content.type_settings(text, uuid) is
  'Every content.document knob for one type, resolved for an organization and the caller (per-type: listed, capture, auto_ingest, default_visibility, identity_key, local_sync, editor_mode, data_class_floor; globals: large_body_chars, autosave_version_keep_days, edited_answer_visible_to_model, max_inline_data_uri_bytes).';

-- ============================================================================================
-- 5. Reads
-- ============================================================================================
create or replace function content.document_get(p_document_id uuid, p_include_body boolean default null)
returns table (
  id uuid, organization_id uuid, type_slug text, title text, summary text, icon text, format text,
  body text, body_omitted boolean, char_count integer, word_count integer, preview text, content_hash text,
  content_version integer, version integer, visibility platform.visibility, data_class platform.data_class,
  folder_id uuid, archived_at timestamptz, sealed_at timestamptz, published_content_version integer,
  created_by uuid, updated_at timestamptz)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  with d as (
    select d.*, c.slug as type_slug,
           coalesce(p_include_body,
                    d.char_count <= (platform.knob_resolve('content.document', 'large_body_chars', d.organization_id, auth.uid()) #>> '{}')::integer) as with_body
      from content.document d
      join platform.categories c on c.id = d.document_type_id
     where d.id = p_document_id)
  select d.id, d.organization_id, d.type_slug, d.title, d.summary, d.icon, d.format,
         case when d.with_body then d.body end, not d.with_body, d.char_count, d.word_count, d.preview, d.content_hash,
         d.content_version, d.version, d.visibility, d.data_class, d.folder_id, d.archived_at, d.sealed_at,
         d.published_content_version, d.created_by, d.updated_at
    from d
$fn$;
comment on function content.document_get(uuid, boolean) is
  'One document through the caller''s RLS. The body is omitted (body_omitted = true) above the large_body_chars knob unless p_include_body is true; p_include_body false always omits it.';

create or replace function content.find_document(p_organization_id uuid, p_type_slug text, p_key text)
returns uuid
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_type uuid;
  v_key  text;
  v_id   uuid;
begin
  select c.id into v_type from platform.categories c
   where c.dimension = 'document_type' and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and c.slug = p_type_slug and c.deleted_at is null;
  if v_type is null then
    raise exception using errcode = '22023', message = format('%s is not a document type.', coalesce(p_type_slug, 'NULL')),
      hint = 'Pick a slug from platform.categories where dimension = ''document_type''.';
  end if;
  v_key := platform.knob_resolve('content.document', 'identity_key.' || p_type_slug, p_organization_id, auth.uid()) #>> '{}';
  if v_key = 'slug' then
    select d.id into v_id from content.document d
     where d.organization_id = p_organization_id and d.document_type_id = v_type and d.slug = p_key and d.deleted_at is null;
  elsif v_key = 'source_uri' then
    select d.id into v_id from content.document d
     where d.organization_id = p_organization_id and d.document_type_id = v_type and d.source_uri = p_key and d.deleted_at is null;
  else
    raise exception using errcode = '22023',
      message = format('A %s has no identity key; it is found by its id.', p_type_slug),
      hint = 'Open it with content.document_get(id).';
  end if;
  return v_id;
end;
$fn$;
comment on function content.find_document(uuid, text, text) is
  'The document of a type identified by its identity key (knob identity_key.<type>: slug or source_uri) inside one organization, through the caller''s RLS; NULL when none is visible.';

create or replace function content.local_sync_changes(p_since timestamptz default null, p_limit integer default 1000)
returns table (
  id uuid, organization_id uuid, type_slug text, title text, file_path text, content_hash text,
  version integer, content_version integer, last_device_id text, updated_at timestamptz)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select d.id, d.organization_id, c.slug, d.title, d.file_path, d.content_hash, d.version, d.content_version,
         d.last_device_id, d.updated_at
    from content.document d
    join platform.categories c on c.id = d.document_type_id
   where d.created_by = auth.uid()
     and d.deleted_at is null
     and (p_since is null or d.updated_at > p_since)
     and (platform.knob_resolve('content.document', 'local_sync.' || c.slug, d.organization_id, auth.uid()) #>> '{}')::boolean
   order by d.updated_at, d.id
   limit greatest(1, least(coalesce(p_limit, 1000), 5000))
$fn$;
comment on function content.local_sync_changes(timestamptz, integer) is
  'The desktop file-sync pull: the caller''s own live documents of types whose local_sync knob is on, changed after p_since, oldest first (page with the last updated_at). Trashed documents are not returned (RLS hides them); the desktop reconciles deletions by id.';

create or replace function content.version_list(p_document_id uuid, p_limit integer default 100, p_before integer default null)
returns table (
  content_version integer, change_kind text, title text, origin text, actor_id uuid, actor_tier text,
  label text, note text, has_body boolean, body_content_version integer, is_published boolean, created_at timestamptz)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select v.content_version, v.change_kind, v.title, v.origin, v.actor_id, v.actor_tier, v.label, v.note,
         v.body is not null, v.body_content_version,
         v.content_version is not distinct from d.published_content_version, v.created_at
    from content.document_version v
    join content.document d on d.id = v.document_id
   where v.document_id = p_document_id
     and (p_before is null or v.content_version < p_before)
   order by v.content_version desc
   limit greatest(1, least(coalesce(p_limit, 100), 1000))
$fn$;
comment on function content.version_list(uuid, integer, integer) is
  'A document''s versions, newest first, without bodies, through the caller''s RLS (viewer on the document). Page with p_before = the last content_version returned.';

create or replace function content.version_get(p_document_id uuid, p_content_version integer)
returns table (
  content_version integer, change_kind text, title text, summary text, format text, body text,
  body_content_version integer, content_hash text, payload_hash text, origin text, actor_id uuid,
  label text, note text, created_at timestamptz)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select v.content_version, v.change_kind, v.title, v.summary, v.format,
         coalesce(v.body, (select b.body from content.document_version b
                            where b.document_id = v.document_id and b.content_version = v.body_content_version)),
         v.body_content_version, v.content_hash, v.payload_hash, v.origin, v.actor_id, v.label, v.note, v.created_at
    from content.document_version v
   where v.document_id = p_document_id and v.content_version = p_content_version
$fn$;
comment on function content.version_get(uuid, integer) is
  'One version with the body that was current at it (a lifecycle or governance version returns the body of its body_content_version), through the caller''s RLS.';

create or replace function content.version_diff(p_document_id uuid, p_from integer, p_to integer)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  a record;
  b record;
  la text[];
  lb text[];
  n_a integer;
  n_b integer;
  pre integer := 0;
  suf integer := 0;
begin
  select * into a from content.version_get(p_document_id, p_from);
  select * into b from content.version_get(p_document_id, p_to);
  if a.content_version is null or b.content_version is null then
    raise exception using errcode = '22023',
      message = format('Version %s or %s of this document does not exist or you cannot read it.', p_from, p_to),
      hint = 'List the versions with content.version_list(document_id).';
  end if;
  la := string_to_array(coalesce(a.body, ''), E'\n');
  lb := string_to_array(coalesce(b.body, ''), E'\n');
  n_a := coalesce(array_length(la, 1), 0);
  n_b := coalesce(array_length(lb, 1), 0);
  while pre < n_a and pre < n_b and la[pre + 1] = lb[pre + 1] loop
    pre := pre + 1;
  end loop;
  while suf < n_a - pre and suf < n_b - pre and la[n_a - suf] = lb[n_b - suf] loop
    suf := suf + 1;
  end loop;
  return jsonb_build_object(
    'document_id', p_document_id, 'from', p_from, 'to', p_to,
    'identical', coalesce(a.body, '') = coalesce(b.body, '') and a.title is not distinct from b.title
                 and a.summary is not distinct from b.summary and a.format is not distinct from b.format,
    'title', jsonb_build_object('from', a.title, 'to', b.title),
    'summary', jsonb_build_object('from', a.summary, 'to', b.summary),
    'format', jsonb_build_object('from', a.format, 'to', b.format),
    'hunk', case when pre = n_a and pre = n_b then null else jsonb_build_object(
      'unchanged_before', pre, 'unchanged_after', suf,
      'removed', to_jsonb(coalesce(la[pre + 1 : n_a - suf], '{}'::text[])),
      'added', to_jsonb(coalesce(lb[pre + 1 : n_b - suf], '{}'::text[]))) end);
end;
$fn$;
comment on function content.version_diff(uuid, integer, integer) is
  'Line diff of two versions of one document, through the caller''s RLS: the common lines before and after, and the one changed block between them (removed lines, added lines), plus title/summary/format from and to.';

create or replace function content._search_args_ok(p_scope text, p_organization_id uuid, p_archive text)
returns boolean
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
begin
  if p_scope not in ('mine', 'organization') then
    raise exception using errcode = '22023', message = format('Unknown search scope %s.', coalesce(p_scope, 'NULL')),
      hint = 'Use mine (the default) or organization.';
  end if;
  if p_scope = 'organization' and p_organization_id is null then
    raise exception using errcode = '22023', message = 'An organization-scoped search names its organization.',
      hint = 'Pass p_organization_id, or search mine.';
  end if;
  if p_archive not in ('hide', 'all', 'only') then
    raise exception using errcode = '22023', message = format('Unknown archive filter %s.', coalesce(p_archive, 'NULL')),
      hint = 'Use hide (the default), all or only.';
  end if;
  return true;
end;
$fn$;

create or replace function content.search_documents(
  p_query text,
  p_scope text default 'mine',
  p_organization_id uuid default null,
  p_type_slugs text[] default null,
  p_archive text default 'hide',
  p_limit integer default 25,
  p_offset integer default 0)
returns table (
  id uuid, organization_id uuid, type_slug text, title text, summary text, preview text,
  archived_at timestamptz, updated_at timestamptz, rank real, headline text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  with q as (
    select websearch_to_tsquery('english'::regconfig, coalesce(p_query, '')) as tsq,
           content._search_args_ok(p_scope, p_organization_id, p_archive) as ok),
  hits as (
    select d.*, c.slug as type_slug,
           ts_rank_cd(content.document_search_vector(d.title, d.summary, d.body), q.tsq)
             + public.similarity(d.title, coalesce(p_query, '')) as rank,
           q.tsq
      from q, content.document d
      join platform.categories c on c.id = d.document_type_id
     where q.ok
       and d.deleted_at is null
       and (content.document_search_vector(d.title, d.summary, d.body) @@ q.tsq
            or d.title operator(public.%) coalesce(p_query, ''))
       and (case p_scope when 'mine' then d.created_by = auth.uid()
                         else d.organization_id = p_organization_id end)
       and (case p_archive when 'hide' then d.archived_at is null
                           when 'only' then d.archived_at is not null
                           else true end)
       and ((p_type_slugs is not null and c.slug = any (p_type_slugs))
            or (p_type_slugs is null
                and (platform.knob_resolve('content.document', 'listed.' || c.slug, d.organization_id, auth.uid()) #>> '{}')::boolean)))
  select h.id, h.organization_id, h.type_slug, h.title, h.summary, h.preview, h.archived_at, h.updated_at, h.rank,
         ts_headline('english'::regconfig, left(h.body, 20000), h.tsq,
                     'MaxFragments=1, MaxWords=30, MinWords=10, StartSel=<<, StopSel=>>')
    from hits h
   order by h.rank desc, h.updated_at desc, h.id
   limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0))
$fn$;
comment on function content.search_documents(text, text, uuid, text[], text, integer, integer) is
  'Ranked search over the caller''s readable documents (RLS is the ceiling): full text over title (A), summary (B) and the first 200,000 characters of body (C) using the document_fts index, plus title trigram similarity. Scope mine (default) or organization; archive hide (default) / all / only; types whose listed knob is off appear only when named in p_type_slugs. Returns body-less rows with a highlighted fragment.';

-- ============================================================================================
-- 6. The published version, for signed-out readers too (§3.11)
-- ============================================================================================
create or replace function content.read_published(p_document_id uuid)
returns table (
  document_id uuid, organization_id uuid, type_slug text, title text, summary text, format text,
  body text, content_version integer, published_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  d record;
begin
  select x.id, x.organization_id, x.visibility, x.published_content_version, x.published_at, c.slug
    into d
    from content.document x
    join platform.categories c on c.id = x.document_type_id
   where x.id = p_document_id and x.deleted_at is null and x.published_content_version is not null;
  -- Published AND (public, or the signed-in caller may read it). Anything else answers nothing,
  -- the same nothing as a document that does not exist.
  if d.id is null
     or not (d.visibility = 'public'
             or (auth.uid() is not null and iam.has_access('document', d.id, 'viewer'))) then
    return;
  end if;
  return query
    select d.id, d.organization_id, d.slug, v.title, v.summary, v.format,
           coalesce(v.body, (select b.body from content.document_version b
                              where b.document_id = v.document_id and b.content_version = v.body_content_version)),
           v.content_version, d.published_at
      from content.document_version v
     where v.document_id = d.id and v.content_version = d.published_content_version;
end;
$fn$;
comment on function content.read_published(uuid) is
  'The PUBLISHED version of a document (not the working copy): to anyone when the document is public, to a signed-in reader who may view it otherwise; nothing at all for anything else. The one read path for public web pages (§3.11).';

create or replace function content.read_published_by_slug(p_organization_id uuid, p_type_slug text, p_slug text)
returns table (
  document_id uuid, organization_id uuid, type_slug text, title text, summary text, format text,
  body text, content_version integer, published_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_id uuid;
  v_vis platform.visibility;
begin
  select x.id, x.visibility into v_id, v_vis
    from content.document x
    join platform.categories c on c.id = x.document_type_id
   where x.organization_id = p_organization_id and c.slug = p_type_slug and x.slug = p_slug
     and x.deleted_at is null and x.published_content_version is not null;
  if v_id is null
     or not (v_vis = 'public' or (auth.uid() is not null and iam.has_access('document', v_id, 'viewer'))) then
    return;
  end if;
  return query select * from content.read_published(v_id);
end;
$fn$;
comment on function content.read_published_by_slug(uuid, text, text) is
  'content.read_published addressed the way a public page URL addresses it: organization + document type + slug.';

-- ============================================================================================
-- 7. Autosave thinning (§3.5) — a function, NOT a schedule (schedules are Arman's to approve)
-- ============================================================================================
create or replace function content.thin_autosave_versions(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_candidates uuid[];
  v_deleted integer := 0;
begin
  with eligible as (
    select v.id, v.document_id, v.content_version, v.created_at,
           row_number() over (partition by v.document_id, date_trunc('day', v.created_at)
                              order by v.content_version desc) as day_rank
      from content.document_version v
      join content.document d on d.id = v.document_id
     where v.origin = 'autosave'
       and v.label is null
       and v.content_version is distinct from d.published_content_version
       and v.content_version < d.content_version
       and v.created_at < now() - make_interval(days => (platform.knob_resolve('content.document', 'autosave_version_keep_days', d.organization_id, null) #>> '{}')::integer)
       and not exists (select 1 from content.document_version l
                        where l.document_id = v.document_id and l.body_content_version = v.content_version
                          and l.content_version <> v.content_version)
       and not exists (select 1 from platform.associations a
                        where a.target_type = 'document' and a.target_id = v.document_id and a.deleted_at is null
                          and ((a.payload_kind = 'text_anchor' and (a.payload ->> 'content_version')::integer = v.content_version)
                               or (a.payload_kind = 'text_anchor_set' and exists (
                                     select 1 from jsonb_array_elements(a.payload -> 'anchors') e
                                      where (e ->> 'content_version')::integer = v.content_version))
                               or (a.payload_kind = 'render_binding' and (a.payload ->> 'template_content_version')::integer = v.content_version)))
       and not exists (select 1 from platform.comments cm
                        where cm.entity_type = 'document' and cm.entity_id = v.document_id and cm.deleted_at is null
                          and cm.anchor ->> '__kind' = 'text_anchor'
                          and (cm.anchor ->> 'content_version')::integer = v.content_version))
  select coalesce(array_agg(e.id), '{}') into v_candidates from eligible e where e.day_rank > 1;

  if not p_dry_run and cardinality(v_candidates) > 0 then
    delete from content.univer_payload u
     using content.document_version v
     where v.id = any (v_candidates) and u.document_id = v.document_id and u.content_version = v.content_version;
    delete from content.document_version v where v.id = any (v_candidates);
    get diagnostics v_deleted = row_count;
  end if;
  return jsonb_build_object('dry_run', p_dry_run, 'eligible', cardinality(v_candidates), 'deleted', v_deleted);
end;
$fn$;
comment on function content.thin_autosave_versions(boolean) is
  'Thins autosave versions older than the autosave_version_keep_days knob to the newest one per document per day. Never thins a labeled, published, current, body-holding (a lifecycle row points at it), anchored (text_anchor / text_anchor_set / comment anchor) or render-pinned version. Dry run by default. Server-only; not scheduled.';

-- ============================================================================================
-- 8. Doors (before grants) and grants
-- ============================================================================================
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers, anonymous_purpose, non_client_lane)
select 'content', p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       case p.proname
         when 'read_published' then
           'p_document_id: the document must be published and live; it is returned when its visibility is public, or when the signed-in caller holds viewer (iam.has_access). Every other id, NULL included, returns no rows: nonexistent and forbidden read the same.'
         when 'read_published_by_slug' then
           'p_organization_id only narrows the slug lookup (organization + type + slug); access is decided on the document found exactly as content.read_published decides it. Nothing found or not readable returns no rows.'
         else
           'Takes no entity id. Server lane only: deletes eligible autosave versions across every document.'
       end,
       'rcstore_l_doors_knobs_payload_kinds',
       p.proname <> 'thin_autosave_versions',
       p.proname in ('read_published', 'read_published_by_slug'),
       case when p.proname in ('read_published', 'read_published_by_slug') then
         'Public web pages render published articles, show notes and templates for signed-out visitors (STORE-DESIGN §3.11); only the published version of a public document is returned.' end,
       case when p.proname = 'thin_autosave_versions' then
         'server_only: the platform version-thinning job (not yet scheduled; schedules are approved by Arman by name and interval). No client ever thins another person''s history.' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'content'
   and p.proname in ('read_published', 'read_published_by_slug', 'thin_autosave_versions')
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'content' and d.function_name = p.proname
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant usage on schema content to anon;
grant execute on function content.read_published(uuid) to anon, authenticated, service_role;
grant execute on function content.read_published_by_slug(uuid, text, text) to anon, authenticated, service_role;
grant execute on function content.type_settings(text, uuid) to authenticated, service_role;
grant execute on function content.document_get(uuid, boolean) to authenticated, service_role;
grant execute on function content.find_document(uuid, text, text) to authenticated, service_role;
grant execute on function content.local_sync_changes(timestamptz, integer) to authenticated, service_role;
grant execute on function content.version_list(uuid, integer, integer) to authenticated, service_role;
grant execute on function content.version_get(uuid, integer) to authenticated, service_role;
grant execute on function content.version_diff(uuid, integer, integer) to authenticated, service_role;
grant execute on function content._search_args_ok(text, uuid, text) to authenticated, service_role;
grant execute on function content.search_documents(text, text, uuid, text[], text, integer, integer) to authenticated, service_role;
grant execute on function content.thin_autosave_versions(boolean) to service_role;

-- done gate: the store still certifies, and the default visibility lands.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s.%s %s: %s', x.s, x.t, x.status, x.detail), '; ')
    into v_bad
    from (select 'content' s, 'document' t, c.* from iam.canonical_certify('content', 'document', 'document') c) x
   where x.status <> 'INFO';
  if v_bad is not null then
    raise exception 'content.document no longer certifies: %', v_bad;
  end if;
  if (select count(*) from platform.feature_knob where feature = 'content.document') < 21 * 8 + 4 then
    raise exception 'content.document knobs are incomplete';
  end if;
end $$;
