"use client";
// features/voice-agent/components/VoiceErrorBanner.tsx
//
// Non-blocking error display. Sits under the mic button and fades in/out.
// The Sonner toast is also fired from the orchestrator for things like
// permission denied so the user gets immediate, contextual feedback.

import { AlertCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface VoiceErrorBannerProps {
  error: { code: string; message: string } | null;
}

export function VoiceErrorBanner({ error }: VoiceErrorBannerProps) {
  return (
    <AnimatePresence>
      {error ? (
        <motion.div
          key={error.code}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="mx-auto max-w-md rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive flex items-start gap-2"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span className="leading-snug">{error.message}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
