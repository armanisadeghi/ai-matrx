"use client";

import { Loader2, Bug } from "lucide-react";
import { TapTargetButtonSolid } from "@ai-matrx/tap-target";
import { ArrowUpTapButton } from "@ai-matrx/tap-target/buttons";
import { MicrophoneIconButton } from "@ai-matrx/chat/host/ui-slots";
import { Button } from "@ai-matrx/design-system/controls";

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
        <Button variant="quiet" icon={<Bug />} glyphTone="warning" onClick={onDebugClick} title="Debug instance state" aria-label="Debug instance state" />
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
