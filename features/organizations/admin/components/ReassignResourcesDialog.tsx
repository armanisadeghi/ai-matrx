"use client";

/**
 * Reassign a member's ORG-SCOPED resources to another member — also drives the
 * "remove member" flow (reassign-then-remove). Only resources owned within THIS org move;
 * the user's personal-org resources are never touched.
 */
import React, { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reassignMemberResources, removeMember } from "../service";
import type { OrgMemberResource } from "../types";

export interface ReassignCandidate {
  userId: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  mode: "reassign" | "remove";
  sourceUserId: string;
  sourceLabel: string;
  resources: OrgMemberResource[];
  candidates: ReassignCandidate[];
  onDone: () => void;
}

const NONE = "__none__";

export function ReassignResourcesDialog({
  open,
  onOpenChange,
  orgId,
  mode,
  sourceUserId,
  sourceLabel,
  resources,
  candidates,
  onDone,
}: Props) {
  const [target, setTarget] = useState<string>(mode === "remove" ? NONE : "");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    () => new Set(resources.map((r) => r.resourceType)),
  );
  const [busy, setBusy] = useState(false);

  const totalResources = resources.reduce((sum, r) => sum + r.count, 0);
  const hasTarget = target !== "" && target !== NONE;

  const toggleType = (t: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "remove") {
        const result = await removeMember(orgId, sourceUserId, hasTarget ? target : undefined);
        const moved = result.reassigned.reduce((s, r) => s + r.reassigned, 0);
        toast.success(
          hasTarget
            ? `Member removed; reassigned ${moved} resource${moved === 1 ? "" : "s"}.`
            : "Member removed.",
        );
      } else {
        const types =
          selectedTypes.size === resources.length ? undefined : Array.from(selectedTypes);
        const result = await reassignMemberResources(orgId, sourceUserId, target, types);
        const moved = result.reduce((s, r) => s + r.reassigned, 0);
        toast.success(`Reassigned ${moved} resource${moved === 1 ? "" : "s"}.`);
      }
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmDisabled =
    busy ||
    (mode === "reassign" && (!hasTarget || selectedTypes.size === 0)) ||
    candidates.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "remove" ? "Remove member" : "Reassign resources"}</DialogTitle>
          <DialogDescription>
            {mode === "remove" ? (
              <>
                Remove <span className="font-medium text-foreground">{sourceLabel}</span> from this
                organization. Optionally reassign their {totalResources} org-scoped resource
                {totalResources === 1 ? "" : "s"} to another member first.
              </>
            ) : (
              <>
                Move <span className="font-medium text-foreground">{sourceLabel}</span>&apos;s
                org-scoped resources to another member. Their personal resources are never affected.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              {mode === "remove" ? "Reassign to (optional)" : "Reassign to"}
            </label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder={candidates.length ? "Select a member" : "No other members"} />
              </SelectTrigger>
              <SelectContent>
                {mode === "remove" && <SelectItem value={NONE}>Don&apos;t reassign</SelectItem>}
                {candidates.map((c) => (
                  <SelectItem key={c.userId} value={c.userId}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This member owns no org-scoped resources.
            </p>
          ) : mode === "reassign" ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Resources to move</p>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {resources.map((r) => (
                  <label
                    key={r.resourceType}
                    className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm hover:bg-accent/50"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedTypes.has(r.resourceType)}
                        onChange={() => toggleType(r.resourceType)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      {r.displayLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.count}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border p-2 text-sm text-muted-foreground">
              {totalResources} resource{totalResources === 1 ? "" : "s"} across {resources.length}{" "}
              type{resources.length === 1 ? "" : "s"} will be reassigned (all).
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={confirmDisabled}
            variant={mode === "remove" ? "destructive" : "default"}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-2 h-4 w-4" />
            )}
            {mode === "remove" ? "Remove member" : "Reassign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
