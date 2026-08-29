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
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { RunAssetKind } from "@/features/podcasts/studio/runs/run-types";

export interface AssetRegenerateOpts {
  modelAlias?: string;
  customPrompt?: string;
}

/**
 * THE DESTRUCTIVE/EXPENSIVE CLICK LAW: a regenerate is BOTH destructive (the
 * image/clip in this slot is replaced by the new one) and expensive (a fresh
 * paid server-side AI generation). Shared by the "…" menu here and by the
 * canonical media menu's fold-in actions on `AssetCard`, so both tell the same
 * truth. Not used on the edit-description path — `TextInputDialog` already
 * stops there and carries the consequence in its own description text; a
 * second prompt would be double-prompting.
 */
export async function confirmAssetRegenerate(
  kind: RunAssetKind,
  { replacesExisting }: { replacesExisting: boolean },
): Promise<boolean> {
  const noun = kind === "video" ? "clip" : "image";
  return replacesExisting
    ? confirm({
        title: `Replace this ${noun}?`,
        description: `The ${noun} in this slot is thrown away and replaced by a newly generated one — the current one is not kept and there is no version to go back to. Generating the new ${noun} runs a paid AI model on the server and takes up to a minute or two.`,
        confirmLabel: `Replace ${noun}`,
        variant: "destructive",
      })
    : confirm({
        title: `Generate this ${noun} again?`,
        description: `Starts a fresh server-side AI generation for this slot, which costs real money and takes up to a minute or two. Anything already running for this slot is superseded by the new attempt.`,
        confirmLabel: "Generate again",
      });
}

interface AssetActionsMenuProps {
  kind: RunAssetKind;
  slot: number;
  /** How many internal models exist for this kind (from the durable record). */
  modelCount: number;
  currentPrompt: string;
  busy: boolean;
  onRegenerate: (opts: AssetRegenerateOpts) => void;
  /**
   * True when this slot already holds a finished asset that a regenerate would
   * overwrite — drives which consequence the confirmation names. Today the
   * menu only mounts on non-done slots (the canonical media menu owns a done
   * one), so it defaults to false.
   */
  replacesExisting?: boolean;
}

export function AssetActionsMenu({
  kind,
  slot,
  modelCount,
  currentPrompt,
  busy,
  onRegenerate,
  replacesExisting = false,
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
            onClick={async () => {
              if (!(await confirmAssetRegenerate(kind, { replacesExisting })))
                return;
              onRegenerate({ modelAlias: defaultAlias });
            }}
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
                    onClick={async () => {
                      if (
                        !(await confirmAssetRegenerate(kind, {
                          replacesExisting,
                        }))
                      )
                        return;
                      onRegenerate({ modelAlias: `model_${i + 1}` });
                    }}
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
        // The consequence lives HERE rather than behind a second confirm — this
        // dialog is already the stop, and double-prompting is its own defect.
        description={
          replacesExisting
            ? `Regenerates this ${noun} from a new description. The ${noun} in this slot is thrown away and replaced, and a new paid AI generation runs on the server (up to a minute or two).`
            : `Regenerates this ${noun} from a new description. This starts a new paid AI generation on the server (up to a minute or two).`
        }
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
