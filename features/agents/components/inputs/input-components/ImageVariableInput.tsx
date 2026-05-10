"use client";

import { MediaVariableInput } from "./MediaVariableInput";
import type { MediaRef } from "@/features/files/types";

interface ImageVariableInputProps {
  value: unknown;
  onChange: (v: MediaRef | null) => void;
  variableName: string;
  compact?: boolean;
}

export function ImageVariableInput(props: ImageVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="image" />;
}
