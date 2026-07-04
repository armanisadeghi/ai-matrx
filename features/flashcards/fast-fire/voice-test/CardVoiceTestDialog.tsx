"use client";

// features/flashcards/fast-fire/voice-test/CardVoiceTestDialog.tsx
//
// A minimal modal shell around SingleCardVoiceTest. The test owns its own chrome
// + close, so this is just a backdrop + centering — no double frame. Closing
// (backdrop, the test's X/Done, or unmount) releases the mic via the test's
// teardown. Use this, or drop SingleCardVoiceTest directly into a window panel.

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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg">
        <SingleCardVoiceTest
          card={card}
          spokenFrontFileId={spokenFrontFileId}
          answerSeconds={answerSeconds}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
