"use client";

// features/unified-data/actions/TableAutomationsDialog.tsx — lane FEATURE-MAP.
//
// AUTOMATIONS ON A TABLE, reachable from the table's ⋯ menu ("Built on it" → Automations). The panel is
// the one Spaces' databases already carry (rule list, on/off, runs, editor); this is only its door on the
// table page, which had none. Mounted inside the table's `RecordsMount`, so the records client is bound.

import { useFields } from "@ai-matrx/records/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AutomationsPanel } from "@/features/spaces/data/Automations";

export function TableAutomationsDialog({
  tableId,
  organizationId,
  open,
  onOpenChange,
}: {
  tableId: string;
  organizationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fields = useFields(tableId).data ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogTitle>Automations</DialogTitle>
        <AutomationsPanel tableId={tableId} organizationId={organizationId} fields={fields} />
      </DialogContent>
    </Dialog>
  );
}
