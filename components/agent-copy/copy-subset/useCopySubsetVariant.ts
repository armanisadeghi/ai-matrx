"use client";

/**
 * useCopySubsetVariant — the ONE way "Filter & sort before copying…" enters a
 * Copy-for-AI menu. Returns a factory so one component can offer the door
 * on several menus (the whole view AND the selected rows) with different
 * sources; each call to the factory produces an `AiVariant` whose `onSelect`
 * opens the copy-subset window over a snapshot of that source.
 *
 *   const copySubset = useCopySubsetVariant();
 *   <CopyButtons … aiVariants={[copySubset(() => ({ rows, columns, … }))]} />
 *
 * The source getter runs at click time, so the snapshot is what the user
 * sees at that moment, never what was on screen at render.
 */

import { SlidersHorizontal } from "lucide-react";

import type { AiVariant } from "@/components/agent-copy/AiCopyMenu";
import type { CopySubsetSource } from "@/components/agent-copy/copy-subset/types";
import { useOpenCopySubsetWindow } from "@/features/overlays/openers/copySubsetWindow";

export const COPY_SUBSET_VARIANT_ID = "copy-subset";
export const COPY_SUBSET_VARIANT_LABEL = "Filter & sort before copying…";
export const COPY_SUBSET_VARIANT_HINT =
  "Shape the rows and columns in a table, then copy exactly that";

export type CopySubsetVariantFactory = <T>(
  getSource: () => CopySubsetSource<T>,
  overrides?: Partial<Pick<AiVariant, "id" | "label" | "hint">>,
) => AiVariant;

export function useCopySubsetVariant(): CopySubsetVariantFactory {
  const open = useOpenCopySubsetWindow();
  return function copySubsetVariant<T>(
    getSource: () => CopySubsetSource<T>,
    overrides?: Partial<Pick<AiVariant, "id" | "label" | "hint">>,
  ): AiVariant {
    return {
      id: overrides?.id ?? COPY_SUBSET_VARIANT_ID,
      label: overrides?.label ?? COPY_SUBSET_VARIANT_LABEL,
      hint: overrides?.hint ?? COPY_SUBSET_VARIANT_HINT,
      icon: SlidersHorizontal,
      section: "ai",
      onSelect: () => {
        open({ source: getSource() });
      },
    };
  };
}
