"use client";

import { MediaVariableInput } from "./MediaVariableInput";
import type { MediaRef } from "@/features/files/types";

interface VideoVariableInputProps {
  value: unknown;
  onChange: (v: MediaRef | null) => void;
  variableName: string;
  compact?: boolean;
}

export function VideoVariableInput(props: VideoVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="video" />;
}
