"use client";

import { MediaVariableInput } from "./MediaVariableInput";

interface VideoVariableInputProps {
  value: unknown;
  onChange: (v: string) => void;
  variableName: string;
  compact?: boolean;
}

export function VideoVariableInput(props: VideoVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="video" />;
}
