/**
 * AttachmentInput — THE editor for an `attachment` column: the current files
 * as chips with a remove control, and "Add files…" which opens the ONE file
 * picker (`openFilePicker`, hosted by `<CloudFilesPickerHost />` in the app
 * providers). Used by the grid cell, the row forms and the row-action editor
 * alike, so an attachment is chosen the same way everywhere.
 *
 * The value is the list of file ids. `onDone` fires when the user is finished
 * (Done, or Escape) so a grid cell can commit once rather than on every pick.
 */
"use client";

import { Check, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { cn } from "@/lib/utils";

import { AttachmentChips, attachmentIds } from "./AttachmentChips";

export function AttachmentInput({
  id,
  value,
  onChange,
  onDone,
  disabled,
  className,
}: {
  id?: string;
  value: unknown;
  onChange: (next: string[] | null) => void;
  /** Called with the final list when the user is finished; omit in a form. */
  onDone?: (final: string[] | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ids = attachmentIds(value);

  const add = async () => {
    const picked = await openFilePicker({ multi: true, title: "Attach files" });
    // null = the picker was cancelled (or no host is mounted, which the opener reports itself).
    if (picked === null) return;
    const next = [...ids, ...picked.filter((p) => !ids.includes(p))];
    if (next.length === ids.length) {
      toast({ title: "Those files are already attached" });
      return;
    }
    onChange(next);
  };

  const remove = (fileId: string) => {
    const next = ids.filter((x) => x !== fileId);
    onChange(next.length ? next : null);
  };

  return (
    <div
      id={id}
      className={cn("flex min-w-[14rem] flex-wrap items-center gap-1.5", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onDone) {
          e.stopPropagation();
          onDone(ids.length ? ids : null);
        }
      }}
    >
      <AttachmentChips value={ids} onRemove={disabled ? undefined : remove} />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-xs"
        disabled={disabled}
        onClick={() => void add()}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {ids.length ? "Add files…" : "Attach files…"}
      </Button>
      {onDone && (
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={disabled}
          onClick={() => onDone(ids.length ? ids : null)}
        >
          <Check className="h-3.5 w-3.5" />
          Done
        </Button>
      )}
    </div>
  );
}
