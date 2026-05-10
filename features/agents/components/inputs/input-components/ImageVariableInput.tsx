"use client";

import { MediaVariableInput } from "./MediaVariableInput";

interface ImageVariableInputProps {
  value: unknown;
  onChange: (v: string) => void;
  variableName: string;
  compact?: boolean;
}

export function ImageVariableInput(props: ImageVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="image" />;
}
