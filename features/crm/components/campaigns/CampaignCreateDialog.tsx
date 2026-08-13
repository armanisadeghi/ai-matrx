"use client";

// features/crm/components/campaigns/CampaignCreateDialog.tsx
//
// Minimal create flow: name + kind + optional description. New campaigns land
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
import { createCampaign } from "../../campaigns/service";
import type { CampaignKind, CampaignRow } from "../../campaigns/types";
import { CAMPAIGN_KINDS } from "../../campaigns/types";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<CampaignKind, string> = {
  call: "Calling",
  email: "Email",
  list: "List",
  mixed: "Mixed",
};

const KIND_HINTS: Record<CampaignKind, string> = {
  call: "Power-dial members through the call queue.",
  email: "Cold email (sending ships in a later wave).",
  list: "A named audience with no channel yet.",
  mixed: "Calls and email combined.",
};

export function CampaignCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (campaign: CampaignRow) => void;
}) {
  const orgId = useAppSelector(selectEffectiveOrganizationId);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CampaignKind>("call");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the campaign a name");
      return;
    }
    if (!orgId) {
      toast.error("No active organization resolved yet — try again in a moment");
      return;
    }
    setSaving(true);
    try {
      const created = await createCampaign({
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
          <DialogTitle>New campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="campaign-name" className="text-xs">
              Name
            </Label>
            <Input
              id="campaign-name"
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
              {CAMPAIGN_KINDS.map((k) => (
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
            <Label htmlFor="campaign-desc" className="text-xs">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="campaign-desc"
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
            {saving ? "Creating…" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
