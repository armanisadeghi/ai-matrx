"use client";

/**
 * Lightweight hover preview for a single note. Reads from Redux directly —
 * no fetch — because notes referenced in a message are essentially always
 * already in the notes slice once the user has interacted with them.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { Check, Copy, ExternalLink, Folder, StickyNote, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTENT_PREVIEW_CHARS = 600;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

interface NotePreviewContentProps {
  noteId: string;
  onOpen?: () => void;
}

export function NotePreviewContent({ noteId, onOpen }: NotePreviewContentProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const note = useAppSelector(selectNoteById(noteId));
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = note?.content ?? "";
    if (!text) return;
    if (!(await copyText(text, "Note text copied"))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!note) {
    return (
      <div className="type-secondary text-muted-foreground italic">
        Note not loaded.
      </div>
    );
  }

  const title = note.label?.trim() || "Untitled";
  const content = note.content ?? "";
  const truncated =
    content.length > CONTENT_PREVIEW_CHARS
      ? content.slice(0, CONTENT_PREVIEW_CHARS).trimEnd() + "…"
      : content;
  const openHref = `/notes/${noteId}`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <StickyNote className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="type-title text-foreground truncate">
            {title}
          </div>
          {note.folder_name && (
            <div className="flex items-center gap-1 type-meta text-muted-foreground mt-0.5">
              <Folder className="w-3 h-3" />
              <span className="truncate">{note.folder_name}</span>
            </div>
          )}
        </div>
      </div>

      {truncated ? (
        <p className="type-secondary text-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
          {truncated}
        </p>
      ) : (
        <p className="type-secondary text-muted-foreground italic">Empty note</p>
      )}

      <div className="type-meta text-muted-foreground pt-1 border-t border-border">
        Updated {formatDateTime(note.updated_at)}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          icon={copied ? <Check className="text-success" /> : <Copy />}
          variant="quiet"
          onClick={handleCopy}
          disabled={!content}
        >
          {copied ? "Copied" : "Copy text"}
        </Button>
        <div className="ml-auto">
          {onOpen ? (
            <Button
              icon={<ArrowUpRight />}
              variant="primary"
              onClick={onOpen}
            >
              Open
            </Button>
          ) : (
            <Link href={openHref} target="_blank" rel="noopener noreferrer">
              <Button icon={<ExternalLink />} type="submit" variant="primary">
                Open
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

interface NoteHoverPreviewProps {
  noteId: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  onOpen?: () => void;
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

export function NoteHoverPreview({
  noteId,
  children,
  side = "top",
  align = "start",
  onOpen,
  openDelay = 250,
  closeDelay = 140,
  className,
}: NoteHoverPreviewProps) {
  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          "w-80 p-3 bg-card border border-border shadow-lg",
          className,
        )}
      >
        <NotePreviewContent noteId={noteId} onOpen={onOpen} />
      </HoverCardContent>
    </HoverCard>
  );
}
