// record-view: none — the admin list of the platform's own workflows
import { WorkflowBrowsePage } from "@/features/workflow-runtime/browse/components/WorkflowBrowsePage";

export const metadata = { title: "System Workflows | Admin" };

/**
 * /administration/automation/workflows — the platform's own workflows
 * (built-in and feature-made), mirroring the admin System Agents page.
 *
 * This is THE canonical workflows list (`features/workflow-runtime/browse`)
 * opened on the `system` scope with no scope tabs: a management page shows the
 * platform's records only, never Mine / My Orgs (admin seat rule, 2026-09-26).
 * The page top is the list template itself (EntityListPage); the admin shell's
 * own header names the page from the admin navigation.
 */
export default function AdminSystemWorkflowsListPage() {
  return <WorkflowBrowsePage variant="system-admin" />;
}
