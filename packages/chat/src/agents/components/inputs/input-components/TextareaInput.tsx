import React, { useEffect, useRef } from "react";
import { ProTextarea } from "@host/components/official/ProTextarea";
import { toast } from "../../../../host/notify";
import { variableInputPlaceholder } from "./variablePlaceholder";

interface TextareaInputProps {
  value: string;
  onChange: (value: string) => void;
  variableName: string;
  onRequestClose?: () => void;
  compact?: boolean;
  autoFocus?: boolean;
  wizardMode?: boolean;
  containerWidth?: number;
  /**
   * Field-navigation: when set, plain Enter advances to the next field instead
   * of inserting a newline (Shift / Cmd / Ctrl + Enter still insert one).
   */
  onEnterAdvance?: () => void;
  /**
   * What goes in this box, when the field's author declared it ("Paste the
   * text to check"). Absent → the one generic invitation.
   */
  placeholder?: string;
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
  autoFocus = true,
  wizardMode = false,
  onEnterAdvance,
  placeholder,
}: TextareaInputProps) {
  const hasSelectedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 🚨 FOCUS NEVER MOVES THE PAGE (cold walk 23, defect B, 2026-09-30). The
  // `autoFocus` attribute focuses on mount WITH the browser's scroll-into-view,
  // so a field rendered below the fold yanked its page down to itself: a run's
  // own address (`/masterwork/encore/<id>?run=…`) landed 2,395px below "Your
  // result", and the Rulebook page at 390px opened on its Understudy form.
  // Focus is still given when asked for — it just never scrolls.
  // Guard: __tests__/focus-never-moves-the-page.test.tsx.
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus({ preventScroll: true });
    // Mount-only, exactly like the attribute it replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCompact = compact && !wizardMode;

  // Select all text on first focus (works with autoFocus)
  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!hasSelectedRef.current && e.target.value) {
      e.target.select();
      hasSelectedRef.current = true;
    }
  };

  return (
    <ProTextarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={handleFocus}
      placeholder={placeholder?.trim() || variableInputPlaceholder()}
      className={isCompact ? "min-h-[60px] text-xs" : "min-h-[160px] text-sm"}
      rows={isCompact ? 2 : undefined}
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
