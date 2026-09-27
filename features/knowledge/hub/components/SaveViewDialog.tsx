"use client";

/**
 * "Save view" (⌥V, Linear) and "Rename view". Create asks for a name, whether
 * to share it with the organization, whether to pin it to the sidebar, and
 * whether to be notified of new matches — that last choice is stored now and
 * says plainly that the notifications themselves are coming soon.
 */

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Input, Switch } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getComingSoon } from "@/lib/coming-soon/registry";

export const SAVED_VIEW_ALERTS_ID = "knowledge.saved-view-alerts";

export interface SaveViewValues {
  name: string;
  shared: boolean;
  pinned: boolean;
  notify: boolean;
}

interface SaveViewDialogProps {
  open: boolean;
  mode: "create" | "rename";
  initialName: string;
  /** The organization a new view is saved in (and shared with), by name. */
  organizationName: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SaveViewValues) => Promise<void>;
}

export function SaveViewDialog({
  open,
  mode,
  initialName,
  organizationName,
  onOpenChange,
  onSubmit,
}: SaveViewDialogProps) {
  const [name, setName] = useState(initialName);
  const [shared, setShared] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alerts = getComingSoon(SAVED_VIEW_ALERTS_ID);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setShared(false);
    setPinned(true);
    setNotify(false);
    setError(null);
  }, [open, initialName]);

  const submit = async () => {
    if (!name.trim()) {
      setError("Give this view a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), shared, pinned, notify });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The view could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Save view" : "Rename view"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Saves the current search, filters and layout so you can come back to them in one click."
              : "The new name shows everywhere this view appears."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="hub-view-name">Name</Label>
            <Input
              id="hub-view-name"
              autoFocus
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grant research this month"
            />
          </div>
          {mode === "create" ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="hub-view-shared">Share with {organizationName ?? "your organization"}</Label>
                  <p className="text-xs text-muted-foreground">
                    Everyone in the organization sees this view. Each person still sees only what they can open.
                  </p>
                </div>
                <Switch id="hub-view-shared" checked={shared} onCheckedChange={setShared} />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="hub-view-pinned">Pin to sidebar</Label>
                  <p className="text-xs text-muted-foreground">Shows in your sidebar with a live count.</p>
                </div>
                <Switch id="hub-view-pinned" checked={pinned} onCheckedChange={setPinned} />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="hub-view-notify" className="inline-flex items-center gap-1.5">
                    <BellRing className="h-3.5 w-3.5" /> {alerts?.label ?? "Notify me when new items match"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Coming soon: {alerts?.promise ?? "notifications for new matches."} Your choice is saved with the
                    view now, so it starts working the day notifications ship.
                  </p>
                </div>
                <Switch id="hub-view-notify" checked={notify} onCheckedChange={setNotify} />
              </div>
            </>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : mode === "create" ? "Save view" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
