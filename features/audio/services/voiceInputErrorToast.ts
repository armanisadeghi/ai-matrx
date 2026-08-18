import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";

interface VoiceInputErrorToastOptions {
  message: string;
  code: string;
  onHelp: () => void;
}

/**
 * Show the canonical voice-input failure notice without duplicating the
 * fallback transcription error that the audio service already persisted.
 */
export function showVoiceInputErrorToast({
  message,
  code,
  onHelp,
}: VoiceInputErrorToastOptions): void {
  const data = {
    description: message,
    duration: 10000,
    action: { label: "Get Help", onClick: onHelp },
  };

  if (code === "TRANSCRIPTION_FAILED") {
    toastErrorAlreadyCaptured("Voice input failed", data);
    return;
  }

  toast.error("Voice input failed", data);
}
