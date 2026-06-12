"use client";

// features/podcasts/generator/components/AssetActionsMenu.tsx
//
// The "…" menu on a generated asset: regenerate it, regenerate with a different
// (internal, numbered) model, or edit the description and regenerate. Every
// image/video is produced by a different underlying model — we expose them as
// neutral "Model 1..N" so the user can reroll a slot that misfired (e.g. a
// moderation false-positive) without re-running the whole podcast.

import { useState } from "react";
import { MoreHorizontal, RefreshCw, Layers, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import type { RunAssetKind } from "@/features/podcasts/studio/runs/run-types";

export interface AssetRegenerateOpts {
  modelAlias?: string;
  customPrompt?: string;
}

interface AssetActionsMenuProps {
  kind: RunAssetKind;
  slot: number;
  /** How many internal models exist for this kind (from the durable record). */
  modelCount: number;
  currentPrompt: string;
  busy: boolean;
  onRegenerate: (opts: AssetRegenerateOpts) => void;
}

export function AssetActionsMenu({
  kind,
  slot,
  modelCount,
  currentPrompt,
  busy,
  onRegenerate,
}: AssetActionsMenuProps) {
  const [editOpen, setEditOpen] = useState(false);
  // The model that historically made this slot (slot N → model N+1) when in
  // range; otherwise the first model. Plain "Regenerate" reuses it.
  const defaultAlias = slot < modelCount ? `model_${slot + 1}` : "model_1";
  const noun = kind === "video" ? "clip" : "image";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label={`${noun} actions`}
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-50"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            onClick={() => onRegenerate({ modelAlias: defaultAlias })}
            disabled={busy}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate
          </DropdownMenuItem>
          {modelCount > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Layers className="mr-2 h-4 w-4" />
                Try a different model
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {Array.from({ length: modelCount }, (_, i) => (
                  <DropdownMenuItem
                    key={i}
                    onClick={() =>
                      onRegenerate({ modelAlias: `model_${i + 1}` })
                    }
                    disabled={busy}
                  >
                    Model {i + 1}
                    {`model_${i + 1}` === defaultAlias && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        current
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuItem onClick={() => setEditOpen(true)} disabled={busy}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit description…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TextInputDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit ${noun} description`}
        description={`Regenerate this ${noun} from a new description.`}
        placeholder={`Describe the ${noun}…`}
        defaultValue={currentPrompt}
        multiline
        rows={6}
        confirmLabel="Regenerate"
        busy={busy}
        onConfirm={(value) => {
          setEditOpen(false);
          onRegenerate({ customPrompt: value });
        }}
      />
    </>
  );
}
