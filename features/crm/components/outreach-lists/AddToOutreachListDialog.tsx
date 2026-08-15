"use client";

// features/crm/components/outreach-lists/AddToOutreachListDialog.tsx
//
// Enroll an EXPLICIT selection (the /crm list's checked rows) into an outreach list
// — pick an existing outreach list or create one inline. DNC-flagged records in
// the selection are surfaced (and skipped by default), never silently dialed
// later.

import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrmContext } from "../../hooks/useCrmContext";
import { addMembersByPartyIds } from "../../outreach-lists/service";
import {
  OutreachListPickerFields,
  useOutreachListChoice,
} from "./OutreachListPicker";
import type { PartyListRow } from "../../types";

export function AddToOutreachListDialog({
  open,
  onOpenChange,
  /** The selected rows that are loaded (for DNC awareness) … */
  selectedRows,
  /** … and the full id set (selection can span pages). */
  selectedIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRows: PartyListRow[];
  selectedIds: string[];
  onDone: () => void;
}) {
  const ctx = useCrmContext();
  const choice = useOutreachListChoice(open);
  const [excludeDnc, setExcludeDnc] = useState(true);
  const [saving, setSaving] = useState(false);

  // DNC awareness is best-effort over the LOADED rows: selection can span
  // pages, and unloaded rows can't be inspected client-side. The dialer is
  // the enforcement layer either way — this is early honesty, not the gate.
  const dncIds = useMemo(
    () =>
      new Set(
        selectedRows.filter((r) => r.do_not_contact).map((r) => r.id),
      ),
    [selectedRows],
  );
  const enrollIds = useMemo(
    () =>
      excludeDnc ? selectedIds.filter((id) => !dncIds.has(id)) : selectedIds,
    [excludeDnc, selectedIds, dncIds],
  );

  const submit = async () => {
    if (!ctx) return;
    setSaving(true);
    try {
      const list = await choice.resolve({
        orgId: selectedRows[0]?.organization_id ?? ctx.orgIds[0],
        kind: "call",
      });
      const { added, skippedExisting } = await addMembersByPartyIds({
        list,
        partyIds: enrollIds,
      });
      onOpenChange(false);
      onDone();
      const skippedDnc = selectedIds.length - enrollIds.length;
      toast.success(
        `${added.toLocaleString()} added to ${list.name}` +
          (skippedExisting > 0
            ? ` · ${skippedExisting.toLocaleString()} already enrolled`
            : "") +
          (skippedDnc > 0 ? ` · ${skippedDnc.toLocaleString()} DNC skipped` : ""),
        { action: toastDoor("crm_outreach_list", list.id) },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add {selectedIds.length.toLocaleString()} record
            {selectedIds.length === 1 ? "" : "s"} to an outreach list
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <OutreachListPickerFields
            choice={choice}
            newListLabel="New calling outreach list"
            onSubmitKey={() => void submit()}
          />

          {dncIds.size > 0 && (
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={excludeDnc}
                onCheckedChange={(v) => setExcludeDnc(v === true)}
              />
              <span className="text-xs text-foreground">
                Skip {dncIds.size.toLocaleString()} do-not-contact record
                {dncIds.size === 1 ? "" : "s"} in this selection
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => void submit()}
            disabled={saving || enrollIds.length === 0 || !ctx || !choice.ready}
          >
            <Megaphone className="h-3.5 w-3.5" />
            {saving
              ? "Adding…"
              : `Add ${enrollIds.length.toLocaleString()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
