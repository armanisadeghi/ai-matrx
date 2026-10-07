/**
 * FrameTextarea — the sandbox-safe textarea scope module.
 *
 * The app module also exports clipboard-enhanced controls. Importing it would
 * bundle the generic clipboard hook, which includes paste and image-fetch
 * capabilities that cannot exist in the opaque frame. These controls retain
 * the text-input contract while leaving copy feedback to the frame's explicit
 * write-only copy controls.
 */
import * as React from "react";
import {
  BasicTextarea,
  Textarea as PackageTextarea,
  TextareaWithPrefix,
  type TextareaProps as PackageTextareaProps,
  type TextareaWithPrefixProps,
} from "@ai-matrx/design-system";
import { Textarea } from "@ai-matrx/design-system/controls";
import type { TextareaProps } from "@ai-matrx/design-system/controls";

export { BasicTextarea, Textarea, TextareaWithPrefix };
export type { TextareaProps, TextareaWithPrefixProps };

/** The frame needs the legacy skin, but never its host clipboard affordance. */
export { PackageTextarea as TextareaLegacy };

/** The host copy variants degrade to ordinary textareas inside the frame. */
export const CopyTextarea = PackageTextarea;

interface FancyTextareaProps extends PackageTextareaProps {
  prefix?: React.ReactNode;
  wrapperClassName?: string;
}

export const FancyTextarea = React.forwardRef<HTMLTextAreaElement, FancyTextareaProps>(
  ({ prefix, wrapperClassName, ...props }, ref) => (
    <div className={wrapperClassName}>
      {prefix ? <span aria-hidden="true">{prefix}</span> : null}
      <PackageTextarea ref={ref} {...props} />
    </div>
  ),
);
FancyTextarea.displayName = "FrameFancyTextarea";
