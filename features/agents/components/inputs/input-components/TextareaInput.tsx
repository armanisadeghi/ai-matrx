import React, { useRef } from "react";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";
import { toast } from "sonner";

interface TextareaInputProps {
  value: string;
  onChange: (value: string) => void;
  variableName: string;
  onRequestClose?: () => void;
  compact?: boolean;
  wizardMode?: boolean;
  containerWidth?: number;
  /**
   * Field-navigation: when set, plain Enter advances to the next field instead
   * of inserting a newline (Shift / Cmd / Ctrl + Enter still insert one).
   */
  onEnterAdvance?: () => void;
}

/**
 * Textarea Input - Multi-line text input with voice input capability
 * Protection against accidental transcription loss is built-in
 */
export function TextareaInput({
  value,
  onChange,
  variableName,
  onRequestClose,
  compact = false,
  wizardMode = false,
  onEnterAdvance,
}: TextareaInputProps) {
  const hasSelectedRef = useRef(false);

  const isCompact = compact && !wizardMode;

  // Select all text on first focus (works with autoFocus)
  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!hasSelectedRef.current && e.target.value) {
      e.target.select();
      hasSelectedRef.current = true;
    }
  };

  return (
    <VoiceTextarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={handleFocus}
      placeholder={`Enter ${variableName.toLowerCase()}... (hover for voice input)`}
      className={isCompact ? "min-h-[60px] text-xs" : "min-h-[160px] text-sm"}
      rows={isCompact ? 2 : undefined}
      autoFocus
      appendTranscript={true}
      onEnterKey={onEnterAdvance ? () => onEnterAdvance() : undefined}
      onRequestClose={onRequestClose}
      protectTranscription={true}
      onTranscriptionComplete={(text) => {
        toast.success("Voice input added");
      }}
      onTranscriptionError={(error) => {
        toast.error("Voice input failed", {
          description: error,
        });
      }}
    />
  );
}
