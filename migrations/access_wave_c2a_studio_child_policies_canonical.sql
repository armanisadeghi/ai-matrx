-- C2a: repoint the 8 transcripts.studio_* child tables' 32 policies off the legacy
-- public.check_resource_access onto the canonical component shape
-- iam.has_access('studio_session', session_id, level) — identical to what
-- iam.apply_rls generates for components, and consistent with the parent
-- studio_sessions table's canonical std_* policies. Parent is private+org for all
-- 522 live sessions and already gates via has_access, so the legacy org-member
-- reach on children was unreachable dead access; no user-visible change.
-- Also fixes the token: policies used 'studio_sessions' (plural) which matches no
-- registry token, so explicit share grants NEVER applied to children — now they do.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['studio_cleaned_segments','studio_concept_items','studio_module_segments','studio_raw_segments','studio_recording_segments','studio_runs','studio_session_settings','studio_documents'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON transcripts.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON transcripts.%I', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON transcripts.%I', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON transcripts.%I', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON transcripts.%I FOR SELECT TO authenticated USING (iam.has_access(''studio_session'', session_id, ''viewer''))', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON transcripts.%I FOR INSERT TO authenticated WITH CHECK (iam.has_access(''studio_session'', session_id, ''editor''))', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON transcripts.%I FOR UPDATE TO authenticated USING (iam.has_access(''studio_session'', session_id, ''editor'')) WITH CHECK (iam.has_access(''studio_session'', session_id, ''editor''))', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON transcripts.%I FOR DELETE TO authenticated USING (iam.has_access(''studio_session'', session_id, ''admin''))', t||'_delete', t);
  END LOOP;
END $$;
