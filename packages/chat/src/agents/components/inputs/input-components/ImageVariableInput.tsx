"use client";

import {
  MediaVariableInput,
  type MediaVariableInputProps,
} from "./MediaVariableInput";

type ImageVariableInputProps = Omit<MediaVariableInputProps, "mediaKind">;

export function ImageVariableInput(props: ImageVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="image" />;
}
