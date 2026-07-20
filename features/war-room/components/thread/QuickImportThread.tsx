"use client";

// features/war-room/components/thread/QuickImportThread.tsx
//
// Top-level rail action: bring an existing thread into this room (association
// edges only — Move here / Add here). Sibling of QuickAddThread / QuickAddTask.

import { useState } from "react";
import { FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImportThreadDialog } from "../room/ImportThreadDialog";

export function QuickImportThread({
  sessionId,
  variant = "rail",
}: {
  sessionId: string;
  variant?: "rail" | "card";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group/import flex items-center gap-2.5 rounded-xl border border-dashed border-border/70 bg-transparent px-3 py-2 text-left transition-all",
          "hover:border-primary/50 hover:bg-primary/[0.03]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          variant === "card" && "h-full w-full flex-col justify-center",
        )}
      >
        <span className="grid place-items-center size-5 shrink-0 rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover/import:text-primary">
          <FolderInput className="size-3.5" />
        </span>
        <span className="text-[13px] font-medium text-muted-foreground group-hover/import:text-primary">
          Import thread
        </span>
      </button>

      <ImportThreadDialog
        open={open}
        onOpenChange={setOpen}
        roomId={sessionId}
      />
    </>
  );
}
