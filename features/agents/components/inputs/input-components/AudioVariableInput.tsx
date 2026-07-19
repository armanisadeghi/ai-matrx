"use client";

import {
  MediaVariableInput,
  type MediaVariableInputProps,
} from "./MediaVariableInput";

type AudioVariableInputProps = Omit<MediaVariableInputProps, "mediaKind">;

export function AudioVariableInput(props: AudioVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="audio" />;
}
