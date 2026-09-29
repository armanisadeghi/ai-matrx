"use client";

// features/crm/pitch-advisories/ActivateOutreachListDialog.tsx
//
// THE ONE DOOR that starts or resumes an outreach list. Activating starts the cadence —
// every member gets the first step — so it is a send of the whole list, and the pitch
// advisory for that list shows first, every time, from every surface (the list board's
// "Activate", the detail page's "Start outreach list" / "Resume", and whatever comes next).
// The confirm button is always live: the warnings inform, they never gate
// (validation-offers-never-blocks). Guard:
// `__tests__/every-activation-shows-the-advisory.test.ts`.

import { toast } from "@/lib/toast";
import { activateOutreachList } from "@/features/crm/outreach-lists/service";
import type { OutreachListRow } from "@/features/crm/outreach-lists/types";
import { PitchAdvisoryConfirmDialog } from "./PitchAdvisoryConfirmDialog";

export function ActivateOutreachListDialog({
  list,
  onOpenChange,
  onActivated,
}: {
  /** The list to activate; the dialog is open while this is non-null. */
  list: OutreachListRow | null;
  onOpenChange: (open: boolean) => void;
  onActivated: (list: OutreachListRow) => void;
}) {
  if (!list) return null;
  const resuming = list.status === "paused";
  const confirmLabel = resuming ? "Resume" : "Start outreach";
  return (
    <PitchAdvisoryConfirmDialog
      open
      onOpenChange={onOpenChange}
      organizationId={list.organization_id}
      request={{
        surface: "list_send",
        outreach_list_id: list.id,
        attachment_count: 0,
        is_exclusive: false,
      }}
      title={resuming ? `Resume ${list.name}?` : `Start ${list.name}?`}
      description={
        resuming
          ? "Resuming restarts the cadence where each member left off. Here is what your PR settings say about this list."
          : "Starting begins the cadence: every member gets the first step. Here is what your PR settings say about this list."
      }
      confirmLabel={confirmLabel}
      entityType="crm_outreach_list"
      entityId={list.id}
      onConfirm={async () => {
        try {
          await activateOutreachList(list);
          onActivated(list);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not start the outreach list");
        }
      }}
    />
  );
}
