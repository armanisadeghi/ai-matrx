"use client";

import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { buildFileReferenceFence } from "@/features/matrx-envelope/fileReference";

interface ReferenceCopyMenuItemBase {
  toastLabel: string;
  onCopied?: () => void;
}

interface RecordReferenceCopyMenuItemProps extends ReferenceCopyMenuItemBase {
  kind?: "record";
  referenceType: string;
  id: string;
  label?: string;
}

interface FileReferenceCopyMenuItemProps extends ReferenceCopyMenuItemBase {
  kind: "file";
  fileId: string;
  label?: string;
}

export type ReferenceCopyMenuItemProps =
  | RecordReferenceCopyMenuItemProps
  | FileReferenceCopyMenuItemProps;

/** Dropdown / action-sheet item — copies a matrx reference fence to clipboard. */
export function ReferenceCopyMenuItem(props: ReferenceCopyMenuItemProps) {
  const handleSelect = async (e: Event) => {
    e.preventDefault();
    try {
      const fence =
        props.kind === "file"
          ? buildFileReferenceFence({
              fileId: props.fileId,
              label: props.label,
            })
          : buildRecordReferenceFence({
              type: props.referenceType,
              id: props.id,
              label: props.label,
            });
      await navigator.clipboard.writeText(fence);
      toast.success("Reference copied to clipboard", {
        description: props.toastLabel,
        duration: 2500,
      });
      props.onCopied?.();
    } catch {
      toast.error("Failed to copy reference");
    }
  };

  return (
    <DropdownMenuItem onSelect={handleSelect}>
      <Bookmark className="mr-2 h-4 w-4" />
      Copy reference
    </DropdownMenuItem>
  );
}
