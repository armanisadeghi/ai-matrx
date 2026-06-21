"use client";

import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";

export function NoteReferenceCopyButton({
  noteId,
  label,
  size = "sm",
  className,
}: {
  noteId: string;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const toastLabel = label?.trim() || "Note";
  return (
    <ReferenceCopyButton
      referenceType="note"
      id={noteId}
      label={label}
      toastLabel={toastLabel}
      size={size}
      className={className}
    />
  );
}
