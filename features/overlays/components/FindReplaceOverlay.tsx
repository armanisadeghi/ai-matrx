"use client";

/**
 * FindReplaceOverlay
 *
 * Overlay wrapper around `FindReplaceModal`. The modal needs a live DOM target
 * (a textarea/input) and an `onReplace` handler — neither can travel through
 * Redux — so the opener stores them in a `callbackManager` group and passes
 * only the `callbackGroupId` string through `openOverlay` data. This component
 * resolves that group and reads the live target + handler back out.
 *
 * `getTargetElement()` is re-read on every render so the modal always points at
 * the current node even if it remounts while the overlay is open.
 */

import React from "react";
import { FindReplaceModal } from "@/components/modals/FindReplaceModal";
import { getFindReplaceCallbackGroup } from "@/features/overlays/callbacks/findReplace";

export interface FindReplaceOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  callbackGroupId: string | null;
}

export default function FindReplaceOverlay({
  isOpen,
  onClose,
  callbackGroupId,
}: FindReplaceOverlayProps) {
  if (!isOpen) return null;

  const group = getFindReplaceCallbackGroup(callbackGroupId);
  const targetElement = group?.getTargetElement() ?? null;

  return (
    <FindReplaceModal
      isOpen
      onClose={onClose}
      targetElement={targetElement}
      onReplace={group?.onReplace}
    />
  );
}
