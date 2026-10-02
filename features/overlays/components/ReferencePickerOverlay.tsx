"use client";

/**
 * ReferencePickerOverlay — the shell around `ReferencePickerBody`.
 * Desktop: Dialog. Mobile: bottom Drawer (ios-mobile-first). Resolves the
 * pick handler from the callback group the opener registered.
 */

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import {
  disposeReferencePickerCallbackGroup,
  getReferencePickerCallbackGroup,
} from "@/features/overlays/callbacks/referencePicker";
import { ReferencePickerBody } from "@/features/matrx-envelope/components/reference-picker/ReferencePickerBody";
import type {
  ReferenceDelivery,
  ReferencePick,
} from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";

export interface ReferencePickerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  callbackGroupId: string | null;
  mode: ReferenceDelivery;
}

const TITLE = "Add a reference";

/**
 * A FIXED size, never one that follows the content (G6B review, 2026-10-02):
 * the dialog is centred, so a body that grew when the Task list finished
 * loading re-centred it under the pointer — a click meant for "Change…" landed
 * on a list row and inserted a link. Every step scrolls inside this box; the
 * mobile sheet holds its height the same way. Guard:
 * `__tests__/reference-picker-holds-its-size.test.tsx`.
 */
export const REFERENCE_PICKER_DIALOG_SIZE = "h-[min(600px,80dvh)] sm:max-w-[520px]";
export const REFERENCE_PICKER_SHEET_SIZE = "h-[85dvh] max-h-[85dvh]";
const DESCRIPTION =
  "Link to something, or insert a button that acts on it.";

export default function ReferencePickerOverlay({
  isOpen,
  onClose,
  callbackGroupId,
  mode,
}: ReferencePickerOverlayProps) {
  const isMobile = useIsMobile();
  useEffect(
    () => () => disposeReferencePickerCallbackGroup(callbackGroupId),
    [callbackGroupId],
  );
  if (!isOpen) return null;

  const group = getReferencePickerCallbackGroup(callbackGroupId);

  const handlePicked = (pick: ReferencePick) => {
    group?.onPicked(pick);
    onClose();
  };
  const handleCancel = () => {
    group?.onCancelled?.();
    onClose();
  };

  const body = (
    <ReferencePickerBody mode={mode} onPicked={handlePicked} onCancel={handleCancel} />
  );

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(open) => !open && handleCancel()}>
        <DrawerContent className={`${REFERENCE_PICKER_SHEET_SIZE} pb-safe`}>
          <DrawerHeader className="text-left">
            <DrawerTitle>{TITLE}</DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className={`flex flex-col ${REFERENCE_PICKER_DIALOG_SIZE}`}>
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
