"use client";

// features/applets-host/AppletWritingBox.tsx
//
// The writing box every Applet box a person writes in renders (`<WritingBox>` and `<ConversationComposer>` from
// `@ai-matrx/applets/react` → the frame's `renderWritingBox`). It is the platform's ProTextarea — dictation,
// read-aloud and the "…" actions — joined to the Applet's own surface so the agents bound to that Applet show in
// its menu. Applet code never sees ProTextarea; it imports `<WritingBox>` and gets this.

import type { ChangeEvent } from "react";
import type { WritingBoxProps } from "@ai-matrx/applets/react";
import { ProTextarea } from "@/components/official/ProTextarea";

export function AppletWritingBox({
  surfaceName,
  value,
  onValueChange,
  placeholder,
  label,
  rows = 3,
  disabled,
  onKeyDown,
  className,
  name,
  id,
}: WritingBoxProps & { surfaceName: string }) {
  return (
    <ProTextarea
      aria-label={label ?? placeholder ?? "Text"}
      value={value}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onValueChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      onKeyDown={onKeyDown}
      name={name}
      id={id}
      surfaceName={surfaceName}
      wrapperClassName={className}
    />
  );
}
