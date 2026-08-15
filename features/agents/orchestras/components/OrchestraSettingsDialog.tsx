// features/agents/agent-sets/components/SetSettingsDialog.tsx
//
// Edit a set's identity (name, tagline, accent) and delete it. Writes through the
// same association-backed thunks the rest of the feature uses. The editable form
// is a child mounted only while open, so its useState seeds from props on each
// open — no setState-in-effect re-seed.

"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch } from "@/lib/redux/hooks";
import { deleteAgentSet, saveSetConfig } from "@/features/agents/redux/agent-sets/thunks";
import { accentClasses } from "./accents";
import { DEFAULT_SET_ACCENT, SET_ACCENTS, type SetAccent } from "../constants";
import type { AgentSetConfig } from "../types";

export interface SetSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orchestratorId: string;
  label: string | null;
  config: AgentSetConfig;
  orchestratorName: string;
  onDeleted: () => void;
}

function SettingsForm({
  onOpenChange,
  orchestratorId,
  label,
  config,
  orchestratorName,
  onDeleted,
}: Omit<SetSettingsDialogProps, "open">) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState(label ?? "");
  const [tagline, setTagline] = useState(config.tagline ?? "");
  const [accent, setAccent] = useState<SetAccent>(config.accent ?? DEFAULT_SET_ACCENT);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await dispatch(
      saveSetConfig({
        orchestratorId,
        label: name.trim() || null,
        config: { ...config, accent, tagline: tagline.trim() || undefined },
      }),
    );
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save.");
      return;
    }
    toast.success("Set updated.");
    onOpenChange(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this set?",
      description:
        "This removes the set and all its member links. The agents themselves are not deleted.",
      confirmLabel: "Delete set",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await dispatch(deleteAgentSet({ orchestratorId }));
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete the set.");
      return;
    }
    toast.success("Set deleted.");
    onOpenChange(false);
    onDeleted();
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Defaults to "${orchestratorName}"`}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Tagline</label>
          <Input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="What does this set accomplish together?"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Accent</label>
          <div className="flex flex-wrap gap-1.5">
            {SET_ACCENTS.map((acc) => {
              const ac = accentClasses(acc);
              return (
                <button
                  key={acc}
                  type="button"
                  aria-label={acc}
                  onClick={() => setAccent(acc)}
                  className={cn(
                    "h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                    ac.dot,
                    accent === acc ? "ring-foreground/40" : "ring-transparent",
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Delete set
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

export function SetSettingsDialog({ open, onOpenChange, ...rest }: SetSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set settings</DialogTitle>
        </DialogHeader>
        {open && <SettingsForm onOpenChange={onOpenChange} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}
