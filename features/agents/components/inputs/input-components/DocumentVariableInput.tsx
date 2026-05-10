"use client";

import { MediaVariableInput } from "./MediaVariableInput";

interface DocumentVariableInputProps {
  value: unknown;
  onChange: (v: string) => void;
  variableName: string;
  compact?: boolean;
}

export function DocumentVariableInput(props: DocumentVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="document" />;
}
