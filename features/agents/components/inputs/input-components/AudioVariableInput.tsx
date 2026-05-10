"use client";

import { MediaVariableInput } from "./MediaVariableInput";
import type { MediaRef } from "@/features/files/types";

interface AudioVariableInputProps {
  value: unknown;
  onChange: (v: MediaRef | null) => void;
  variableName: string;
  compact?: boolean;
}

export function AudioVariableInput(props: AudioVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="audio" />;
}
