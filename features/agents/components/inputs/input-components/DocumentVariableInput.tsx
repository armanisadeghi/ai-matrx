"use client";

import { MediaVariableInput } from "./MediaVariableInput";
import type { MediaRef } from "@/features/files/types";

interface DocumentVariableInputProps {
  value: unknown;
  onChange: (v: MediaRef | null) => void;
  variableName: string;
  compact?: boolean;
}

export function DocumentVariableInput(props: DocumentVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="document" />;
}
