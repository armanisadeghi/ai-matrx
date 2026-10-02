"use client";

import {
  MediaVariableInput,
  type MediaVariableInputProps,
} from "./MediaVariableInput";

type DocumentVariableInputProps = Omit<MediaVariableInputProps, "mediaKind">;

export function DocumentVariableInput(props: DocumentVariableInputProps) {
  return <MediaVariableInput {...props} mediaKind="document" />;
}
