"use client";

// features/education/classes/components/AddClassSourcesDialog.tsx
//
// "Add sources" to a class — or to one part of it (a unit, lesson, section) —
// after the class exists. The input is THE one Source input (`SourceInput`:
// Use existing + Add new), configured by props only. New material lands and
// is kept; "Add" then files every picked Source — new or existing — under the
// target, and under the class too when the target is a part, through the
// host's `onFile`: a Source through THE landing door's Keep
// (`/sources/{id}/keep`, class + part in one server write), an existing
// non-Source record through the association door. Nothing is filed before
// "Add" (no `attachTo` on the input).
// A pick that cannot be filed under a class is named, never skipped silently.
//
// A plain Dialog: it becomes a bottom sheet on mobile by itself.

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import {
  ALL_SOURCE_KIND_IDS,
  sourceKindNoun,
} from "@/features/resource-manager/source-input/sourceKinds";
import type { SourceKindId } from "@ai-matrx/agents/sources/runtime";
import { attachableSourceRef } from "../classParts";

/** "Just a topic" is not a thing a class can hold. */
const CLASS_SOURCE_KINDS: readonly SourceKindId[] = ALL_SOURCE_KIND_IDS.filter(
  (k) => k !== "topic",
);

/** The Source input key for one class (or part) — picks survive a reload. */
export function classSourcesSurfaceKey(targetId: string): string {
  return `education:class-sources:${targetId}`;
}

export interface ClassSourceTarget {
  /** The scope the sources are filed under (the class, or one of its parts). */
  id: string;
  name: string;
}

interface AddClassSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ClassSourceTarget;
  /**
   * File one picked Source under the target (and the class). Resolves on
   * success; rejects with a sentence on failure.
   */
  onFile: (token: string, id: string, name: string) => Promise<void>;
}

export function AddClassSourcesDialog({
  open,
  onOpenChange,
  ...rest
}: AddClassSourcesDialogProps) {
  if (!open) return null;
  return <AddClassSourcesBody onOpenChange={onOpenChange} {...rest} />;
}

function AddClassSourcesBody({
  onOpenChange,
  target,
  onFile,
}: Omit<AddClassSourcesDialogProps, "open">) {
  const surfaceKey = classSourcesSurfaceKey(target.id);
  const set = useSourceSet(surfaceKey);
  const [busy, setBusy] = useState(false);

  const ready = set.sources.filter((s) => s.status === "ready" && s.draft.ref);
  const landing = set.sources.filter(
    (s) => s.status === "pending" || s.status === "resolving",
  );
  const blocked = landing.length
    ? "Wait until your new source has finished adding."
    : ready.length === 0
      ? "Pick at least one source."
      : null;

  async function fileAll() {
    setBusy(true);
    const refused: string[] = [];
    let filed = 0;
    try {
      for (const card of ready) {
        const name = card.draft.label || sourceKindNoun(card.draft);
        const ref = attachableSourceRef(
          card.draft.ref,
          sourceKindNoun(card.draft),
        );
        if (!ref.ok) {
          refused.push(`${name}: ${ref.reason}`);
          continue;
        }
        try {
          await onFile(ref.token, ref.id, name);
          // Filed: it leaves the input, so a second "Add" never repeats it.
          set.remove(card.id);
          filed += 1;
        } catch (err) {
          const why = err instanceof Error ? err.message : String(err);
          console.error("[AddClassSourcesDialog] filing failed:", err);
          refused.push(`${name}: ${why}`);
        }
      }
    } finally {
      setBusy(false);
    }
    if (filed > 0) {
      toast.success(
        `Added ${filed} ${filed === 1 ? "source" : "sources"} to ${target.name}.`,
      );
    }
    if (refused.length > 0) {
      toast.error(`Not added: ${refused.join(" · ")}`);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="px-5 py-4">
          <DialogTitle className="text-base">
            Add sources to {target.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Add sources to {target.name}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto px-4 pb-4 sm:px-5">
          <SourceInput
            surfaceKey={surfaceKey}
            title="Sources"
            purpose={target.name}
            kinds={CLASS_SOURCE_KINDS}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {blocked ? (
              <span className="mr-auto text-xs text-muted-foreground">
                {blocked}
              </span>
            ) : null}
            <Button
              type="button"
              variant="quiet"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              icon={busy ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus />
              )}
              variant="primary"
              type="button"
              disabled={busy || !!blocked}
              onClick={() => void fileAll()}
            >
              {ready.length > 0 ? `Add ${ready.length}` : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
