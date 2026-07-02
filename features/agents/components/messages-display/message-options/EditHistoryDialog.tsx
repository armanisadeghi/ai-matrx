"use client";

/**
 * EditHistoryDialog — view and restore prior versions of an assistant
 * (or user) message's content.
 *
 * Each entry in `cx_message.content_history` is auto-archived by the
 * `cx_message_edit` Postgres RPC every time the message is edited (inline
 * decision resolve, code-block save, full-screen save, etc.). This dialog
 * gives users a way to inspect those snapshots and restore one — which
 * routes back through `editMessage`, archiving the current text as a new
 * history entry in the process (so restoring is itself reversible).
 *
 * Mounted as a controlled child of `AssistantActionBar` (so the dialog
 * survives after `MessageOptionsMenu` closes), opened via the
 * `onRequestEditHistory` callback on the menu action context.
 */

import { useState } from "react";
import {
  History,
  RotateCcw,
  Clock,
  ChevronRight,
  GitCompareArrows,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  selectMessageContentHistory,
  selectMessageContent,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { editMessage } from "@/features/agents/redux/execution-system/message-crud/edit-message.thunk";
import { setRequestEditedText } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { selectMessageStreamRequestId } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { Json } from "@/types/database.types";

interface EditHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  messageId: string;
}

interface HistoryEntry {
  // Archived verbatim from `cx_message.content_history` (JSONB) — a real
  // Json[] at the source, not an opaque unknown[].
  content: Json[];
  saved_at: string;
}

function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is HistoryEntry => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    return Array.isArray(e.content) && typeof e.saved_at === "string";
  });
}

function previewOf(blocks: unknown[]): string {
  let out = "";
  for (const b of blocks) {
    if (b && typeof b === "object") {
      const block = b as { type?: string; text?: string };
      if (block.type === "text" && typeof block.text === "string") {
        if (out.length > 0) out += "\n";
        out += block.text;
      }
    }
  }
  return out;
}

function HistoryEntryCard({
  entry,
  index,
  total,
  isRestoring,
  onRestore,
  onCompare,
}: {
  entry: HistoryEntry;
  index: number;
  total: number;
  isRestoring: boolean;
  onRestore: () => void;
  onCompare: () => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const preview = previewOf(entry.content);
  const truncated =
    preview.length > 400 ? `${preview.slice(0, 400)}…` : preview || "(empty)";
  const savedAt = new Date(entry.saved_at);
  const versionLabel =
    total > 1 ? `Version ${total - index}` : "Previous version";

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0 flex flex-col">
            <span className="text-xs font-medium text-foreground">
              {versionLabel}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {savedAt.toLocaleString()}
            </span>
          </div>
        </div>
        <ChevronRight
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border">
          <div className="mt-2 text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-muted/30 rounded p-2 font-mono">
            {truncated}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onCompare}
            >
              <GitCompareArrows className="w-3 h-3" />
              Compare with current
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={isRestoring}
              onClick={onRestore}
            >
              <RotateCcw className="w-3 h-3" />
              {isRestoring ? "Restoring…" : "Restore this version"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryContent({
  conversationId,
  messageId,
  onClose,
}: {
  conversationId: string;
  messageId: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const raw = useAppSelector(
    selectMessageContentHistory(conversationId, messageId),
  );
  const streamRequestId = useAppSelector(
    selectMessageStreamRequestId(conversationId, messageId),
  );
  const currentContent = useAppSelector(
    selectMessageContent(conversationId, messageId),
  );
  const openDiff = useOpenDiffViewerWindow();
  const history = parseHistory(raw);
  // Most recent edit first.
  const ordered = [...history].reverse();
  const [restoringIndex, setRestoringIndex] = useState<number | null>(null);

  const handleCompare = (entry: HistoryEntry, index: number) => {
    const versionLabel =
      ordered.length > 1 ? `Version ${ordered.length - index}` : "Previous";
    openDiff({
      original: previewOf(entry.content),
      modified: previewOf(Array.isArray(currentContent) ? currentContent : []),
      originalLabel: versionLabel,
      modifiedLabel: "Current",
      title: "Compare versions",
      engine: "light",
      defaultView: "split",
    });
  };

  const handleRestore = async (entry: HistoryEntry, index: number) => {
    setRestoringIndex(index);
    try {
      // Mirror the renderer immediately so the restored text shows up in
      // this session without waiting for the RPC round-trip. Per the
      // AgentAssistantMessage lifetime rule, the renderer otherwise stays
      // bound to the active-request render blocks until reload.
      if (streamRequestId) {
        dispatch(
          setRequestEditedText({
            requestId: streamRequestId,
            text: previewOf(entry.content),
          }),
        );
      }
      await dispatch(
        editMessage({
          conversationId,
          messageId,
          newContent: entry.content,
        }),
      ).unwrap();
      toast.success("Restored");
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Restore failed";
      toast.error(message);
      setRestoringIndex(null);
    }
  };

  if (ordered.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No edit history yet. Inline edits and saves will appear here.
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[60dvh]">
      <div className="space-y-2 p-1">
        {ordered.map((entry, i) => (
          <HistoryEntryCard
            key={`${entry.saved_at}-${i}`}
            entry={entry}
            index={i}
            total={ordered.length}
            isRestoring={restoringIndex === i}
            onRestore={() => handleRestore(entry, i)}
            onCompare={() => handleCompare(entry, i)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

export function EditHistoryDialog({
  open,
  onOpenChange,
  conversationId,
  messageId,
}: EditHistoryDialogProps) {
  const isMobile = useIsMobile();

  const title = "Edit history";
  const description =
    "Restore an earlier version of this message. The current text is auto-archived when you restore, so this is reversible.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <History className="w-4 h-4" />
              {title}
            </DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 pb-safe">
            <HistoryContent
              conversationId={conversationId}
              messageId={messageId}
              onClose={() => onOpenChange(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <HistoryContent
          conversationId={conversationId}
          messageId={messageId}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default EditHistoryDialog;
