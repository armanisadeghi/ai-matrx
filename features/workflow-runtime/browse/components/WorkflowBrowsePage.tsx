"use client";

// features/workflow-runtime/browse/components/WorkflowBrowsePage.tsx
//
// THE workflows list — the ONE component behind both `/workflows/all` and
// `/administration/automation/workflows` (System Workflows), exactly as
// AgentBrowsePage is behind `/agents/all` and the admin System Agents page.
// Everything workflow-specific lives in ../listConfig.tsx; this file is the
// config plus where the page opens.

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { workflowListConfig } from "../listConfig";
import { WORKFLOW_LIST_SCOPES } from "../types";

/**
 * WHICH ROUTE is rendering this list — a plain word, because both callers are
 * server components and a function cannot cross that boundary.
 * `"system-admin"` is the admin System Workflows page: it manages the
 * platform's own workflows ONLY — the System scope with no scope tabs (the
 * admin seat never acts as itself; Arman, 2026-09-26).
 */
export type WorkflowBrowseVariant = "user" | "system-admin";

export function WorkflowBrowsePage({
  variant = "user",
}: {
  variant?: WorkflowBrowseVariant;
}) {
  const systemAdmin = variant === "system-admin";
  return (
    <EntityListPage
      config={workflowListConfig}
      scopes={systemAdmin ? ["system"] : WORKFLOW_LIST_SCOPES}
      scopeTabs={!systemAdmin}
      defaultScope={systemAdmin ? { kind: "system" } : undefined}
      clearsShellHeader={!systemAdmin}
    />
  );
}
