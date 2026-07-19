"use client";

import {
  MediaVariableInput,
  type MediaVariableInputProps,
} from "./MediaVariableInput";

type VideoVariableInputProps = Omit<MediaVariableInputProps, "mediaKind">;

export function VideoVariableInput(props: VideoVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="video" />;
}
