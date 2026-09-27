"use client";

/**
 * The "…" menu on a transcript row in the Knowledge hub (H6d) — the
 * Transcripts list's row menu, drawn from `transcriptMenu` (pure). Record
 * pages open as real links (⌘-click opens a new tab); actions call back into
 * the page, which owns rename and the clipboard.
 */

import Link from "next/link";
import {
  ClipboardCopy,
  Columns2,
  Eraser,
  Eye,
  FileText,
  Inbox,
  Link2,
  Mic,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Copy,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import type { TranscriptMenuAction, TranscriptMenuEntry, TranscriptMenuIcon } from "./transcriptRows";

const ICON: Record<TranscriptMenuIcon, LucideIcon> = {
  processor: Eye,
  studio: Columns2,
  cleanup: Eraser,
  scribe: Mic,
  unsorted: Inbox,
  source: FileText,
  rename: Pencil,
  copy: Copy,
  "copy-ai": Sparkles,
  link: Link2,
  reference: ClipboardCopy,
};

export function TranscriptRowMenu({
  title,
  entries,
  onAction,
  className,
}: {
  title: string;
  entries: TranscriptMenuEntry[];
  onAction: (action: TranscriptMenuAction) => void;
  className?: string;
}) {
  if (!entries.length) return null;
  const sections = (["open", "edit", "copy"] as const)
    .map((s) => entries.filter((e) => e.section === s))
    .filter((s) => s.length);
  return (
    <div
      className={cn("shrink-0", className)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Actions for ${title}`}
            title="Actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {sections.map((items, i) => (
            <div key={items[0].section}>
              {i > 0 ? <DropdownMenuSeparator /> : null}
              {items.map((e) => {
                const Icon = ICON[e.icon];
                if (e.href)
                  return (
                    <DropdownMenuItem key={e.id} asChild>
                      <Link href={e.href} className="gap-2">
                        <Icon className="h-3.5 w-3.5" /> {e.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                return (
                  <DropdownMenuItem key={e.id} className="gap-2" onSelect={() => e.action && onAction(e.action)}>
                    <Icon className="h-3.5 w-3.5" /> {e.label}
                  </DropdownMenuItem>
                );
              })}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
