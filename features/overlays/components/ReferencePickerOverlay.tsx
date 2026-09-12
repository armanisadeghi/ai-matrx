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
import { useIsMobile } from "@/hooks/use-mobile";
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
const DESCRIPTION =
  "Pick what to reference; it becomes a live link wherever it is used.";

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
        <DrawerContent className="max-h-[85dvh] pb-safe">
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
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
