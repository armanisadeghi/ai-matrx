-- Pre-drop prep for tasks user_id/is_public: repoint vestigial graveyard RLS policies that
-- subquery workspace.tasks.user_id -> created_by (they were the only deps blocking the drop),
-- and stop the sharing registry from driving the about-to-drop is_public column.
ALTER POLICY task_asgn_select ON graveyard.ctx_task_assignments USING (
  (user_id = auth.uid()) OR (task_id IN ( SELECT tasks.id FROM workspace.tasks WHERE ((tasks.created_by = auth.uid()) OR (tasks.assignee_id = auth.uid()))))
  OR (task_id IN ( SELECT t.id FROM (workspace.tasks t JOIN graveyard.ctx_project_members pm ON ((pm.project_id = t.project_id))) WHERE (pm.user_id = auth.uid())))
);
ALTER POLICY task_assoc_select ON graveyard.ctx_task_associations USING (
  (task_id IN ( SELECT t.id FROM workspace.tasks t WHERE ((t.created_by = auth.uid()) OR ((t.organization_id IS NOT NULL) AND (t.organization_id IN ( SELECT om.organization_id FROM organization_members om WHERE (om.user_id = auth.uid())))))))
);
ALTER POLICY task_assoc_insert ON graveyard.ctx_task_associations WITH CHECK (
  (task_id IN ( SELECT t.id FROM workspace.tasks t WHERE ((t.created_by = auth.uid()) OR ((t.organization_id IS NOT NULL) AND (t.organization_id IN ( SELECT om.organization_id FROM organization_members om WHERE (om.user_id = auth.uid())))))))
);
ALTER POLICY task_assoc_delete ON graveyard.ctx_task_associations USING (
  (created_by = auth.uid()) OR (task_id IN ( SELECT t.id FROM workspace.tasks t WHERE ((t.created_by = auth.uid()) OR ((t.organization_id IS NOT NULL) AND (t.organization_id IN ( SELECT om.organization_id FROM organization_members om WHERE ((om.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role])))))))))
);
ALTER POLICY task_attach_select ON graveyard.ctx_task_attachments USING (
  (uploaded_by = auth.uid()) OR (task_id IN ( SELECT tasks.id FROM workspace.tasks WHERE ((tasks.created_by = auth.uid()) OR (tasks.assignee_id = auth.uid()))))
);
ALTER POLICY task_comments_read ON graveyard.ctx_task_comments USING (
  (user_id = auth.uid()) OR (task_id IN ( SELECT tasks.id FROM workspace.tasks WHERE ((tasks.created_by = auth.uid()) OR (tasks.assignee_id = auth.uid()))))
  OR (task_id IN ( SELECT t.id FROM (workspace.tasks t JOIN graveyard.ctx_project_members pm ON ((pm.project_id = t.project_id))) WHERE (pm.user_id = auth.uid())))
);
ALTER POLICY task_comments_insert ON graveyard.ctx_task_comments WITH CHECK (
  (user_id = auth.uid()) AND (task_id IN ( SELECT t.id FROM workspace.tasks t WHERE ((t.created_by = auth.uid()) OR (t.assignee_id = auth.uid())
    OR (t.project_id IN ( SELECT pm.project_id FROM graveyard.ctx_project_members pm WHERE (pm.user_id = auth.uid())))
    OR (t.project_id IN ( SELECT p.id FROM (workspace.projects p JOIN organization_members om ON ((om.organization_id = p.organization_id))) WHERE (om.user_id = auth.uid()))))))
);
UPDATE public.shareable_resource_registry
SET owner_column = 'created_by', is_public_column = NULL
WHERE resource_type = 'task';
