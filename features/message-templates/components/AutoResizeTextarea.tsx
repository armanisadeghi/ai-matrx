"use client";

// features/message-templates/components/AutoResizeTextarea.tsx
//
// The template editors' auto-growing text box (one copy; the save modal and the
// admin manager both used to carry their own). A template is raw text with
// {{variables}}: the ONE formatting layer (chords + the selection toolbar's
// buttons) inserts markdown on request, and nothing here ever rewrites the
// text — variables stay exactly as typed.

import * as React from "react";
import { useTextareaFormatting } from "@ai-matrx/rich-editor/format/useTextareaFormatting";

export const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    minHeight?: number;
  }
>(({ className, value, onChange, minHeight = 100, ...props }, ref) => {
  const [element, setElement] = React.useState<HTMLTextAreaElement | null>(null);
  useTextareaFormatting(element);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      setElement(node);
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    },
    [ref],
  );

  const adjustHeight = React.useCallback(() => {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = Math.max(minHeight, element.scrollHeight) + "px";
  }, [element, minHeight]);

  React.useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  React.useEffect(() => {
    if (!element) return undefined;
    window.addEventListener("resize", adjustHeight);
    return () => window.removeEventListener("resize", adjustHeight);
  }, [element, adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e);
    setTimeout(adjustHeight, 0);
  };

  return (
    <textarea
      ref={setRefs}
      className={`flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden ${className ?? ""}`}
      value={value}
      onChange={handleChange}
      style={{ minHeight: minHeight + "px" }}
      {...props}
    />
  );
});

AutoResizeTextarea.displayName = "AutoResizeTextarea";
