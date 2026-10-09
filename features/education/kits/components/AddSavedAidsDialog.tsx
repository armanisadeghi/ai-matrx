"use client";

// features/education/kits/components/AddSavedAidsDialog.tsx
//
// The kit page's own "Add saved aids" action: THE saved-aid picker in a dialog
// (a bottom sheet on phones), offering only aids not already in the kit. It runs
// the same write as the surface's add_kit_members target (`createManualKit`
// with the membership fingerprint), then the kit page re-reads.

import { useState, type ReactNode } from "react";
import { Button } from "@ai-matrx/design-system";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ErrorNotice } from "@ai-matrx/design-system";
import { describeFailure } from "@/lib/failure/transport";
import { toast } from "@/lib/toast";
import type { EducationLibraryRow } from "@/features/education/library/types";
import {
  createManualKit,
  kitArtifactKey,
  kitMembershipFingerprint,
  type ManualKitSourceType,
  type StudyKit,
} from "../kitService";
import { SavedAidPicker, savedAidKey } from "./SavedAidPicker";

export function AddSavedAidsDialog({
  kit,
  trigger,
  onAdded,
}: {
  kit: StudyKit;
  trigger: ReactNode;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<EducationLibraryRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An aid already in the kit is never offered again.
  const inKit = new Set(kit.artifacts.map((artifact) => kitArtifactKey(artifact)));

  const toggle = (row: EducationLibraryRow) => setSelected((current) =>
    current.some((item) => savedAidKey(item) === savedAidKey(row))
      ? current.filter((item) => savedAidKey(item) !== savedAidKey(row))
      : [...current, row]);

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      await createManualKit({
        sourceId: kit.sourceId,
        sourceType: kit.sourceType as ManualKitSourceType,
        title: kit.title,
        artifacts: selected,
        allowExisting: true,
        expectedFingerprint: kitMembershipFingerprint(kit),
      });
      toast.success(`Added ${selected.length} study aid${selected.length === 1 ? "" : "s"}.`);
      setSelected([]);
      setOpen(false);
      onAdded();
    } catch (cause) {
      setError(describeFailure(cause, { action: "adding study aids", fallback: "Could not add these study aids." }).sentence);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setSelected([]); setError(null); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add saved aids</DialogTitle>
        </DialogHeader>
        {open && <SavedAidPicker selected={selected} onToggle={toggle} exclude={inKit} />}
        {error && <ErrorNotice size="inline" message={error} error={error} operation="Add saved study aids" />}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={saving || selected.length === 0} onClick={() => void add()}>
            {saving ? "Adding…" : selected.length > 0 ? `Add ${selected.length}` : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
