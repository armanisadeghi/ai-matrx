/**
 * Recovery Window — heavy body (Impl)
 *
 * Sidebar + detail pane showing every orphaned user-authored payload.
 * Imported lazily by the thin shell `RecoveryWindow.tsx` ONLY when the
 * recovery context's `isOpen` is true, so the dialog/button/icon dep
 * graph below never enters the static graph of any route.
 *
 * Actions per item: Copy, Edit (rawUserInput), Retry (navigate to routeHref),
 * Delete. Items marked viewedByUser on selection so the "new" badge clears.
 */

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Copy,
  Inbox,
  Pencil,
  RotateCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useRequestRecovery } from "../providers/RequestRecoveryProvider";
import type { PayloadRecord } from "@/lib/persistence/payloadSafetyStore";
import { toast } from "sonner";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function kindBadge(kind: PayloadRecord["kind"]): string {
  switch (kind) {
    case "agent-run":
      return "Agent";
    case "chat":
      return "Chat";
    case "note":
      return "Note";
    case "form":
      return "Form";
    default:
      return "API";
  }
}

export default function RecoveryWindowImpl() {
  const { items, isOpen, close, markViewed, deleteItem, updatePayload } =
    useRequestRecovery();
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  // Auto-select first item on open.
  useEffect(() => {
    if (!isOpen) return;
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    }
  }, [isOpen, items, selectedId]);

  // Reset editing state when selection changes and mark as viewed.
  useEffect(() => {
    if (!selected) return;
    setIsEditing(false);
    setDraftText(selected.rawUserInput ?? "");
    if (!selected.viewedByUser) {
      void markViewed(selected.id);
    }
  }, [selected, markViewed]);

  const handleCopy = async () => {
    if (!selected) return;
    const text =
      selected.rawUserInput ??
      (typeof selected.payload === "string"
        ? selected.payload
        : JSON.stringify(selected.payload, null, 2));
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    await updatePayload(selected.id, { rawUserInput: draftText });
    setIsEditing(false);
    toast.success("Saved");
  };

  const handleRetry = () => {
    if (!selected) return;
    close();
    router.push(selected.routeHref);
    toast.info("Navigated to original page. Your input is preserved below.", {
      description:
        "Paste from the recovery tray if the composer doesn't auto-fill.",
    });
  };

  const handleDelete = async () => {
    if (!selected) return;
    const deletedId = selected.id;
    const remaining = items.filter((item) => item.id !== deletedId);
    await deleteItem(deletedId);
    setSelectedId(remaining[0]?.id ?? null);
    toast.success("Removed from recovery tray");
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-4xl w-[92vw] h-[80dvh] p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Recovered submissions</DialogTitle>
          <DialogDescription>
            Submissions that failed to send. Retry, edit, copy, or delete.
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-full min-h-0">
          {/* Sidebar */}
          <aside className="w-72 shrink-0 border-r border-border bg-muted/30 flex flex-col">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Inbox className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Saved Submissions</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {items.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing recovered.
                </div>
              ) : (
                <ul className="py-1">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          "w-full text-left px-4 py-2 flex flex-col gap-0.5 border-l-2 border-transparent hover:bg-accent/50",
                          selectedId === item.id && "bg-accent border-primary",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {!item.viewedByUser && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          )}
                          <span className="text-sm font-medium truncate">
                            {item.label || kindBadge(item.kind)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                            {kindBadge(item.kind)}
                          </span>
                          <span>{formatTimestamp(item.createdAt)}</span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-3 py-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={close}
                className="w-full justify-start text-xs"
              >
                <X className="w-3.5 h-3.5 mr-2" />
                Close
              </Button>
            </div>
          </aside>

          {/* Detail */}
          <section className="flex-1 min-w-0 flex flex-col">
            {selected ? (
              <>
                <header className="px-5 py-3 border-b border-border flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {selected.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatTimestamp(selected.createdAt)} ·{" "}
                      {kindBadge(selected.kind)} · {selected.status}
                    </div>
                    {selected.errorMessage && (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          {selected.errorMessage}
                        </span>
                      </div>
                    )}
                  </div>
                </header>

                <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Your input
                  </div>
                  {isEditing ? (
                    <Textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                    />
                  ) : (
                    <pre className="text-sm whitespace-pre-wrap break-words bg-muted/40 rounded-md p-3 border border-border">
                      {selected.rawUserInput ??
                        (typeof selected.payload === "string"
                          ? selected.payload
                          : JSON.stringify(selected.payload, null, 2))}
                    </pre>
                  )}
                </div>

                <footer className="px-5 py-3 border-t border-border flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={handleRetry} className="gap-1.5">
                    <RotateCw className="w-3.5 h-3.5" />
                    Retry
                  </Button>
                  {isEditing ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSaveEdit}
                      className="gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Edit
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                      className="gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopy}
                    className="gap-1.5"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDelete}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                </footer>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                {items.length === 0
                  ? "No recovered submissions."
                  : "Select an item from the sidebar."}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
