/**
 * Recovery Window — heavy body (Impl)
 *
 * Sidebar + detail pane showing every orphaned user-authored payload.
 * Imported lazily by the thin shell `RecoveryWindow.tsx` ONLY when the
 * recovery context's `isOpen` is true, so the dialog/button/icon dep
 * graph below never enters the static graph of any route.
 *
 * Actions per item: Copy (input or JSON), Edit (rawUserInput), Retry,
 * Delete. Detail pane has "Your input" + variables vs Raw JSON tabs.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRequestRecovery } from "../providers/RequestRecoveryProvider";
import type { PayloadRecord } from "@/lib/persistence/payloadSafetyStore";
import {
  buildHumanReadableRecoveryText,
  extractUserInput,
  extractVariables,
  formatPayloadJson,
} from "../utils/formatRecoveryDisplay";
import { formatVariablesForDisplay } from "@/features/agents/utils/variable-utils";
import { toast } from "@/lib/toast";

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

function RecoveryInputSection({
  isEditing,
  draftText,
  onDraftChange,
  userInput,
  variables,
}: {
  isEditing: boolean;
  draftText: string;
  onDraftChange: (value: string) => void;
  userInput: string;
  variables: Record<string, unknown> | null;
}) {
  const variableLines = variables ? formatVariablesForDisplay(variables) : "";

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Your input
        </div>
        {isEditing ? (
          <Textarea
            value={draftText}
            onChange={(e) => onDraftChange(e.target.value)}
            className="min-h-[160px] text-base"
            style={{ fontSize: "16px" }}
          />
        ) : userInput ? (
          <pre className="text-sm whitespace-pre-wrap break-words bg-muted/40 rounded-md p-3 border border-border">
            {userInput}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No user input saved for this submission.
          </p>
        )}
      </div>

      {variableLines ? (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Variables
          </div>
          <pre className="text-sm whitespace-pre-wrap break-words bg-muted/40 rounded-md p-3 border border-border">
            {variableLines}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export default function RecoveryWindowImpl() {
  const { items, isOpen, close, markViewed, deleteItem, updatePayload } =
    useRequestRecovery();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeViewTab, setActiveViewTab] = useState<"input" | "json">("input");
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const humanReadableText = useMemo(
    () => (selected ? buildHumanReadableRecoveryText(selected) : ""),
    [selected],
  );

  const displayUserInput = useMemo(
    () =>
      selected ? extractUserInput(selected.payload, selected.rawUserInput) : "",
    [selected],
  );

  const displayVariables = useMemo(
    () => (selected ? extractVariables(selected.payload) : null),
    [selected],
  );

  const payloadJson = useMemo(
    () => (selected ? formatPayloadJson(selected.payload) : ""),
    [selected],
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
    setActiveViewTab("input");
    setIsEditing(false);
    setDraftText(
      selected.rawUserInput ??
        extractUserInput(selected.payload, selected.rawUserInput),
    );
    if (!selected.viewedByUser) {
      void markViewed(selected.id);
    }
  }, [selected, markViewed]);

  const copyLabel = copied
    ? "Copied"
    : activeViewTab === "json" && !isMobile
      ? "Copy JSON"
      : "Copy input";

  const handleCopyJson = async () => {
    if (!payloadJson.trim()) return;
    await navigator.clipboard.writeText(payloadJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopy = async () => {
    if (!selected) return;
    const text =
      activeViewTab === "json" && !isMobile
        ? payloadJson
        : isEditing
          ? draftText
          : humanReadableText;
    if (!text.trim()) return;
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

                <div className="flex-1 min-h-0 flex flex-col px-5 py-4">
                  {isMobile ? (
                    <div className="flex-1 min-h-0 overflow-auto space-y-5">
                      <RecoveryInputSection
                        isEditing={isEditing}
                        draftText={draftText}
                        onDraftChange={setDraftText}
                        userInput={displayUserInput}
                        variables={displayVariables}
                      />
                      <div className="border-t border-border pt-5">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Raw JSON
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCopyJson}
                            className="h-7 px-2 text-xs gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copy JSON
                          </Button>
                        </div>
                        <pre className="text-sm whitespace-pre-wrap break-words bg-muted/40 rounded-md p-3 border border-border font-mono">
                          {payloadJson}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <Tabs
                      value={activeViewTab}
                      onValueChange={(value) => {
                        if (value === "input" || value === "json") {
                          setActiveViewTab(value);
                        }
                      }}
                      className="flex-1 min-h-0 flex flex-col"
                    >
                      <TabsList className="w-fit shrink-0">
                        <TabsTrigger value="input">Your input</TabsTrigger>
                        <TabsTrigger value="json">Raw JSON</TabsTrigger>
                      </TabsList>
                      <TabsContent
                        value="input"
                        className="flex-1 min-h-0 overflow-auto mt-3"
                      >
                        <RecoveryInputSection
                          isEditing={isEditing}
                          draftText={draftText}
                          onDraftChange={setDraftText}
                          userInput={displayUserInput}
                          variables={displayVariables}
                        />
                      </TabsContent>
                      <TabsContent
                        value="json"
                        className="flex-1 min-h-0 overflow-auto mt-3"
                      >
                        <pre className="text-sm whitespace-pre-wrap break-words bg-muted/40 rounded-md p-3 border border-border font-mono">
                          {payloadJson}
                        </pre>
                      </TabsContent>
                    </Tabs>
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
                      onClick={() => {
                        setActiveViewTab("input");
                        setIsEditing(true);
                      }}
                      disabled={activeViewTab === "json" && !isMobile}
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
                    {copied ? "Copied" : copyLabel}
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
