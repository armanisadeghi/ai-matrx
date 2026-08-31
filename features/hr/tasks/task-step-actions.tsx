"use client";

/**
 * THE TASK INBOX ROW'S ACTIONS — ONE definition of what a right-clicked
 * `hr.workflow_step` row offers, shared by every surface that projects
 * `public.hr_wf_inbox` (`HrInboxRow`): `HrTaskTable` / `HrTaskInbox` (the
 * generic task inbox) and `LeaveQueueSurface` (§4.4's leave projection of the
 * same rows — see that file's header: "a projection, not a second queue").
 *
 * Only the universal door lives here — every inbox row, regardless of flow,
 * has exactly one: `deep_link`. Flow-specific decisions (approve / deny /
 * return / reassign) stay page-local `extraSections` on each host, because
 * §4.4 already says every action is `hr.wf_decide` called with THAT flow's
 * own dialogs; folding them into this shared module would mean threading
 * leave-shaped callbacks through a generic task-row builder used by flows
 * that are not leave. A future adopter with its own decision UI grows this
 * file the same way `pageMenuSection` grew onDismiss/onRestore: an optional
 * host-supplied callback, present only where it applies.
 *
 * 🚨 NO NEW READ OR WRITE PATH LIVES HERE. The one item opens `deep_link`,
 * which `hr._wf_display` / `hr_wf_inbox` already resolved.
 */

import { ExternalLink } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

export interface HrTaskStepMenuRow {
  stepId: string;
  /** The row's own name for itself — subject, title, or the flow key as a last resort. */
  label: string;
  deepLink: string;
}

/** There is no separate "task row" record — this IS the `hr.workflow_step` row. */
export function hrTaskStepEntityRef(
  row: HrTaskStepMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return { type: "hr_workflow_step", id: row.stepId, title: row.label };
}

export function hrTaskStepMenuSection(
  row: HrTaskStepMenuRow | null,
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "hr-task-open",
      label: "Open",
      icon: ExternalLink,
      href: row?.deepLink ?? "#",
      disabled: !row,
    },
  ];
  return { id: "hr-task-step", label: "This step", items };
}
