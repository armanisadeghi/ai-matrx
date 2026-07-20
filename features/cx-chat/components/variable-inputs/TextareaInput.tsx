import React, { useRef } from 'react';
import { VoiceTextarea } from '@/components/official/VoiceTextarea';
import { toast } from "@/lib/toast";

interface TextareaInputProps {
  value: string;
  onChange: (value: string) => void;
  variableName: string;
  onRequestClose?: () => void;
  compact?: boolean;
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
  compact = false
}: TextareaInputProps) {
  const hasSelectedRef = useRef(false);

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
      className={compact ? "min-h-[65px] text-xs" : "min-h-[200px] text-sm"}
      rows={compact ? 2 : undefined}
      autoFocus
      appendTranscript={true}
      onRequestClose={onRequestClose}
      protectTranscription={true}
      onTranscriptionComplete={(text) => {
        toast.success('Voice input added');
      }}
      onTranscriptionError={(error) => {
        toast.error('Voice input failed', {
          description: error,
        });
      }}
    />
  );
}

