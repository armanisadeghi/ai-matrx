"use client";

// features/flashcards/fast-fire/voice-test/CardVoiceTestDialog.tsx
//
// Shell around SingleCardVoiceTest — backdrop on desktop, bottom sheet on mobile.
// Portals to document.body so fixed centering isn't trapped by flashcard
// transform/perspective ancestors. Mic teardown on close via unmount cleanup.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { SingleCardVoiceTest } from "./SingleCardVoiceTest";

export interface CardVoiceTestDialogProps {
  card: { id: string; front: string; back: string };
  spokenFrontFileId?: string | null;
  answerSeconds?: number;
  open: boolean;
  onClose: () => void;
}

export function CardVoiceTestDialog({
  card,
  spokenFrontFileId,
  answerSeconds,
  open,
  onClose,
}: CardVoiceTestDialogProps) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const test = (
    <SingleCardVoiceTest
      card={card}
      spokenFrontFileId={spokenFrontFileId}
      answerSeconds={answerSeconds}
      onClose={onClose}
    />
  );

  if (!open || !mounted) return null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
        <DrawerContent className="max-h-[92dvh] pb-safe">
          <DrawerTitle className="sr-only">Voice test</DrawerTitle>
          {test}
        </DrawerContent>
      </Drawer>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Voice test"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-2xl">{test}</div>
    </div>,
    document.body,
  );
}
