"use client";

import { Loader2, Bug } from "lucide-react";
import { TapTargetButtonSolid } from "@ai-matrx/tap-target";
import { ArrowUpTapButton } from "@ai-matrx/tap-target/buttons";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";

interface InputActionButtonsProps {
  /** Show the voice mic button */
  showVoice: boolean;
  /** Called when transcription finishes — append the result to the input */
  onTranscriptionComplete: (text: string) => void;
  isExecuting: boolean;
  isDisabled: boolean;
  isUploading: boolean;
  sendButtonVariant: "gray" | "blue" | "default";
  onSubmit: () => void;
  /** When provided, shows the Bug icon button (admin+debug mode only) */
  onDebugClick?: () => void;
}

export function InputActionButtons({
  showVoice,
  onTranscriptionComplete,
  isExecuting,
  isDisabled,
  isUploading,
  sendButtonVariant,
  onSubmit,
  onDebugClick,
}: InputActionButtonsProps) {
  const bgColor = sendButtonVariant === "gray" ? "bg-muted" : "bg-blue-600";
  const hoverBgColor =
    sendButtonVariant === "gray" ? "hover:bg-muted/80" : "hover:bg-blue-700";
  const iconColor =
    sendButtonVariant === "gray" ? "text-foreground" : "text-white";

  return (
    <div className="flex items-center">
      {onDebugClick && (
        <button
          type="button"
          onClick={onDebugClick}
          title="Debug instance state"
          className="p-1.5 text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
        >
          <Bug className="w-3.5 h-3.5" />
        </button>
      )}

      {showVoice && (
        <MicrophoneIconButton
          variant="icon-only"
          size="md"
          onTranscriptionComplete={onTranscriptionComplete}
        />
      )}

      {isExecuting ? (
        <TapTargetButtonSolid
          ariaLabel="Sending..."
          bgColor={bgColor}
          hoverBgColor={hoverBgColor}
          iconColor={iconColor}
          icon={<Loader2 className="w-4 h-4 animate-spin" />}
        />
      ) : (
        <ArrowUpTapButton
          variant="solid"
          onClick={onSubmit}
          disabled={isDisabled || isUploading}
          ariaLabel="Send message"
          bgColor={bgColor}
          hoverBgColor={hoverBgColor}
          iconColor={iconColor}
        />
      )}
    </div>
  );
}
