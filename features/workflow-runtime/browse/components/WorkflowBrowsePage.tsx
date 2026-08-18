"use client";

// features/workflow-runtime/browse/components/WorkflowBrowsePage.tsx
//
// /workflows/all — the workflow catalog on the canonical entity-list shell.
// Everything workflow-specific lives in ../listConfig.tsx; this file is the
// config plus this page's slots.

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { workflowListConfig } from "../listConfig";

export function WorkflowBrowsePage() {
  return <EntityListPage config={workflowListConfig} />;
}
