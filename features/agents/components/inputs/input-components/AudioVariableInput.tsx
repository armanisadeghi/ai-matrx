"use client";

import { MediaVariableInput } from "./MediaVariableInput";

interface AudioVariableInputProps {
  value: unknown;
  onChange: (v: string) => void;
  variableName: string;
  compact?: boolean;
}

export function AudioVariableInput(props: AudioVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="audio" />;
}
