"use client";

// DictionarySection — a collapsible "Custom Dictionary" section that embeds the
// DictionaryManager for one owner. Dropped into the Advanced area of every
// entity edit flow (organization, scope type, scope) so the same management UI
// appears everywhere, the right way. Defaults collapsed to keep edit forms calm.

import { useState } from "react";
import { BookA, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DictionaryManager } from "@/features/dictionary/components/DictionaryManager";
import type { DictLevel } from "@/features/dictionary/types";

interface Props {
  level: DictLevel;
  ownerId: string;
  ownerName?: string;
  canEdit?: boolean;
  /** Render expanded on mount (e.g. when it's the focus of the page). */
  defaultOpen?: boolean;
}

export function DictionarySection({ level, ownerId, ownerName, canEdit = true, defaultOpen }: Props) {
  const [open, setOpen] = useState(!!defaultOpen);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <BookA className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">Custom Dictionary</div>
          <p className="text-xs text-muted-foreground">
            Terminology &amp; pronunciation for transcription and speech, scoped to this{" "}
            {level === "scope_type" ? "scope type" : level}.
          </p>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-border p-4">
          <DictionaryManager
            level={level}
            ownerId={ownerId}
            ownerName={ownerName}
            canEdit={canEdit}
            embedded
          />
        </div>
      )}
    </div>
  );
}
