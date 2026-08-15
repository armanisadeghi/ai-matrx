"use client";

// features/crm/components/outreach-lists/OutreachListCreateDialog.tsx
//
// Minimal create flow: name + kind + optional description. New outreach lists land
// in the active org (stamping only — access never depends on the active org).

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { createOutreachList } from "../../outreach-lists/service";
import type { OutreachListKind, OutreachListRow } from "../../outreach-lists/types";
import { LIST_KINDS } from "../../outreach-lists/types";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<OutreachListKind, string> = {
  call: "Calling",
  email: "Email",
  list: "List",
  mixed: "Mixed",
};

const KIND_HINTS: Record<OutreachListKind, string> = {
  call: "Power-dial members through the call queue.",
  email: "Personalized Lane B email, reviewed before it sends.",
  list: "A named audience with no channel yet.",
  mixed: "Calls and email combined.",
};

export function OutreachListCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (list: OutreachListRow) => void;
}) {
  const orgId = useAppSelector(selectEffectiveOrganizationId);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<OutreachListKind>("call");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the outreach list a name");
      return;
    }
    if (!orgId) {
      toast.error("No active organization resolved yet — try again in a moment");
      return;
    }
    setSaving(true);
    try {
      const created = await createOutreachList({
        name,
        kind,
        description: description || undefined,
        orgId,
      });
      setName("");
      setDescription("");
      onOpenChange(false);
      onCreated(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New outreach list</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="outreach-list-name" className="text-xs">
              Name
            </Label>
            <Input
              id="outreach-list-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="Q3 outreach — med device leads"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kind</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {LIST_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-left transition-colors",
                    kind === k
                      ? "border-primary/40 bg-accent"
                      : "border-border hover:bg-accent/50",
                  )}
                >
                  <div className="text-xs font-medium text-foreground">
                    {KIND_LABELS[k]}
                  </div>
                  <div className="text-[11px] leading-tight text-muted-foreground">
                    {KIND_HINTS[k]}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="outreach list-desc" className="text-xs">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="outreach list-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="min-h-0 text-sm"
              placeholder="Who this targets and what a win looks like"
            />
          </div>
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
          <Button size="sm" onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create outreach list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
