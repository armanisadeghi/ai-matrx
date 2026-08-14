"use client";

// features/crm/components/outreach-lists/AddToOutreachListDialog.tsx
//
// Enroll an EXPLICIT selection (the /crm list's checked rows) into an outreach list
// — pick an existing outreach list or create one inline. DNC-flagged records in
// the selection are surfaced (and skipped by default), never silently dialed
// later.

import { useEffect, useMemo, useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";
import { useCrmContext } from "../../hooks/useCrmContext";
import {
  addMembersByPartyIds,
  createOutreachList,
  fetchOutreachLists,
} from "../../outreach-lists/service";
import type { OutreachListWithCount } from "../../outreach-lists/types";
import { ListKindBadge, ListStatusBadge } from "./badges";
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
  const [lists, setLists] = useState<OutreachListWithCount[] | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [excludeDnc, setExcludeDnc] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !ctx) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchOutreachLists(ctx);
        if (cancelled) return;
        // Working outreach lists first; archived stay reachable but sink.
        const ranked = [...rows].sort((a, b) => {
          const rank = (s: string) =>
            s === "active" ? 0 : s === "draft" ? 1 : s === "paused" ? 2 : 3;
          return rank(a.status) - rank(b.status);
        });
        setLists(ranked);
        setChosenId((prev) => prev ?? ranked[0]?.id ?? null);
        if (ranked.length === 0) setCreating(true);
      } catch (e) {
        if (!cancelled)
          toast.error(
            e instanceof Error ? e.message : "Failed to load outreach lists",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ctx]);

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
      let list =
        lists?.find((c) => c.id === chosenId) ?? null;
      if (creating) {
        if (!newName.trim()) {
          toast.error("Name the new outreach list");
          return;
        }
        const orgId =
          selectedRows[0]?.organization_id ?? ctx.orgIds[0];
        if (!orgId) {
          toast.error("No organization resolved for the new outreach list");
          return;
        }
        list = {
          ...(await createOutreachList({
            name: newName,
            kind: "call",
            orgId,
          })),
          members: [],
        };
      }
      if (!list) {
        toast.error("Pick an outreach list first");
        return;
      }
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
          {!creating && (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {lists === null ? (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  Loading outreach lists…
                </div>
              ) : lists.length === 0 ? (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  No outreach lists yet — create the first one below.
                </div>
              ) : (
                lists.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChosenId(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                      chosenId === c.id
                        ? "border-primary/40 bg-accent"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {c.name}
                    </span>
                    <ListKindBadge kind={c.list_kind} />
                    <ListStatusBadge status={c.status} />
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {(c.members?.[0]?.count ?? 0).toLocaleString()} ·{" "}
                      {formatRelativeTime(c.updated_at)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {creating ? (
            <div className="space-y-1">
              <Label htmlFor="new-outreach-list-name" className="text-xs">
                New calling outreach list
              </Label>
              <Input
                id="new-outreach-list-name"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="Outreach list name"
                className="h-9 text-sm"
              />
              {lists !== null && lists.length > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => setCreating(false)}
                >
                  Pick an existing outreach list instead
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              New outreach list
            </button>
          )}

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
            disabled={saving || enrollIds.length === 0 || !ctx}
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
