// features/agents/orchestras/components/OrchestraSettingsDialog.tsx
//
// Edit an Orchestra's identity (name, tagline, accent) and delete it. Writes through the
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
import {
  deleteOrchestra,
  saveOrchestraConfig,
} from "@/features/agents/redux/orchestras/thunks";
import { accentClasses } from "./accents";
import {
  DEFAULT_ORCHESTRA_ACCENT,
  DEFAULT_ORCHESTRA_DEPTH_BUDGET,
  DEFAULT_ORCHESTRA_MODE,
  ORCHESTRA_ACCENTS,
  ORCHESTRA_DEPTH_BUDGET_MAX,
  ORCHESTRA_DEPTH_BUDGET_MIN,
  ORCHESTRA_MODES,
  ORCHESTRA_MODE_META,
  type OrchestraAccent,
  type OrchestraMode,
} from "../constants";
import type { OrchestraConfig } from "../types";

export interface OrchestraSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conductorId: string;
  label: string | null;
  config: OrchestraConfig;
  conductorName: string;
  onDeleted: () => void;
}

function SettingsForm({
  onOpenChange,
  conductorId,
  label,
  config,
  conductorName,
  onDeleted,
}: Omit<OrchestraSettingsDialogProps, "open">) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState(label ?? "");
  const [tagline, setTagline] = useState(config.tagline ?? "");
  const [accent, setAccent] = useState<OrchestraAccent>(
    config.accent ?? DEFAULT_ORCHESTRA_ACCENT,
  );
  const [mode, setMode] = useState<OrchestraMode>(
    config.mode ?? DEFAULT_ORCHESTRA_MODE,
  );
  const [depthBudget, setDepthBudget] = useState<number | undefined>(
    config.depthBudget,
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await dispatch(
      saveOrchestraConfig({
        conductorId,
        label: name.trim() || null,
        config: {
          ...config,
          accent,
          mode,
          depthBudget,
          tagline: tagline.trim() || undefined,
        },
      }),
    );
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not save.");
      return;
    }
    toast.success("Orchestra updated.");
    onOpenChange(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this Orchestra?",
      description:
        "This removes the Orchestra and all its member links. The agents themselves are not deleted.",
      confirmLabel: "Delete Orchestra",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await dispatch(deleteOrchestra({ conductorId }));
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete the Orchestra.");
      return;
    }
    toast.success("Orchestra deleted.");
    onOpenChange(false);
    onDeleted();
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Defaults to "${conductorName}"`}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Tagline
          </label>
          <Input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="What does this Orchestra accomplish together?"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            How members run
          </label>
          <div className="space-y-1">
            {ORCHESTRA_MODES.map((m) => {
              const meta = ORCHESTRA_MODE_META[m];
              const selected = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={selected}
                  className={cn(
                    "w-full rounded-md border px-2.5 py-1.5 text-left transition-colors",
                    selected
                      ? "border-primary/50 bg-accent"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <span className="block text-xs font-medium text-foreground">
                    {meta.label}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {meta.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Delegation depth
          </label>
          <div className="flex items-center gap-1.5">
            {Array.from(
              {
                length:
                  ORCHESTRA_DEPTH_BUDGET_MAX - ORCHESTRA_DEPTH_BUDGET_MIN + 1,
              },
              (_, i) => ORCHESTRA_DEPTH_BUDGET_MIN + i,
            ).map((n) => {
              const selected =
                (depthBudget ?? DEFAULT_ORCHESTRA_DEPTH_BUDGET) === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDepthBudget(n)}
                  aria-pressed={selected}
                  className={cn(
                    "h-7 w-9 rounded-md border text-xs font-medium transition-colors",
                    selected
                      ? "border-primary/50 bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            How many levels deep members may bring in their own helpers.
            Standard is {DEFAULT_ORCHESTRA_DEPTH_BUDGET} — raise it only if
            members need helpers of their own; lower it to keep every answer
            first-hand.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Accent
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ORCHESTRA_ACCENTS.map((acc) => {
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
          <Trash2 className="h-4 w-4" /> Delete Orchestra
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

export function OrchestraSettingsDialog({
  open,
  onOpenChange,
  ...rest
}: OrchestraSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Orchestra settings</DialogTitle>
        </DialogHeader>
        {open && <SettingsForm onOpenChange={onOpenChange} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}
