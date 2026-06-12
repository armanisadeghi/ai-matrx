"use client";

// features/podcasts/generator/components/AddAssetCard.tsx
//
// A dashed "add your own" tile in the media grid. Lets the user describe an
// extra image/video and generate it — the way to go beyond the default set.

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import type { RunAssetKind } from "@/features/podcasts/studio/runs/run-types";

interface AddAssetCardProps {
  kind: RunAssetKind;
  busy: boolean;
  onAdd: (description: string) => void;
}

export function AddAssetCard({ kind, busy, onAdd }: AddAssetCardProps) {
  const [open, setOpen] = useState(false);
  const noun = kind === "video" ? "clip" : "image";
  const aspect = kind === "video" ? "aspect-video" : "aspect-square";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className={cn(
          "group flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60",
          aspect,
        )}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
        <span className="text-xs font-medium">
          {busy ? `Generating ${noun}…` : `Add ${noun}`}
        </span>
      </button>

      <TextInputDialog
        open={open}
        onOpenChange={setOpen}
        title={`Add a ${noun}`}
        description={`Describe the ${noun} you want and we'll generate it.`}
        placeholder={`Describe the ${noun}…`}
        multiline
        rows={6}
        confirmLabel={`Generate ${noun}`}
        busy={busy}
        onConfirm={(value) => {
          setOpen(false);
          onAdd(value);
        }}
      />
    </>
  );
}
