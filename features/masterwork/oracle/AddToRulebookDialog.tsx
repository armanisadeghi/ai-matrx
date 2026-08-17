"use client";

/**
 * AddToRulebookDialog — the Oracle tap's ONE picker (Approach #10, in-app).
 * Opened through the `addToRulebookDialog` overlay by both entry points (the
 * message ⋯ menu and the thumbs follow-up nudge): pick a Rulebook, the message
 * lands as a DRAFT rule the Expert reviews like any other draft. The write is
 * `appendDraftRuleFromMessage` → the canonical `saveRules` CAS.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  appendDraftRuleFromMessage,
  deriveRuleNameFromContent,
  invalidateHasRulebookCache,
  listMyRulebooks,
  type OracleRulebookOption,
} from "./service";

export interface AddToRulebookDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The message content that becomes the draft rule's statement. */
  initialContent?: string | null;
  /** The conversation the message came from — lands in `source_ref`. */
  initialConversationId?: string | null;
}

export function AddToRulebookDialog({
  isOpen,
  onClose,
  initialContent,
  initialConversationId,
}: AddToRulebookDialogProps) {
  const [rulebooks, setRulebooks] = useState<OracleRulebookOption[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const content = initialContent ?? "";
  const derivedName = useMemo(
    () => deriveRuleNameFromContent(content),
    [content],
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setRulebooks(null);
    setLoadError(null);
    setSelectedId(null);
    void (async () => {
      try {
        const rows = await listMyRulebooks();
        if (cancelled) return;
        setRulebooks(rows);
        // One Rulebook → it's obviously the one; preselect, one click total.
        if (rows.length === 1) setSelectedId(rows[0].id);
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load your Rulebooks.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSave = async () => {
    if (!selectedId || !content.trim()) return;
    const target = rulebooks?.find((r) => r.id === selectedId);
    setIsSaving(true);
    try {
      const { rule } = await appendDraftRuleFromMessage({
        rulebookId: selectedId,
        content,
        conversationId: initialConversationId ?? null,
      });
      invalidateHasRulebookCache();
      toast.success(`Saved to ${target?.name ?? "your Rulebook"} for review`, {
        description: `“${rule.name}” is waiting as a draft — approve it when you review.`,
        action: {
          label: "Open",
          onClick: () =>
            window.open(`/masterwork/${selectedId}`, "_blank", "noopener"),
        },
      });
      onClose();
    } catch (error) {
      toast.error("Could not save to the Rulebook", {
        description:
          error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" aria-hidden />
            Add to Rulebook
          </DialogTitle>
          <DialogDescription>
            Saves this answer into a Rulebook as a draft rule — nothing counts
            until you approve it in review.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium text-foreground">{derivedName}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {content.trim() || "Nothing to save — the message was empty."}
          </p>
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : rulebooks === null ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading your Rulebooks…
          </div>
        ) : rulebooks.length === 0 ? (
          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            <p>You don&apos;t have a Rulebook yet.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/masterwork" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden />
                Start one on the Masterwork page
              </Link>
            </Button>
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {rulebooks.map((rb) => (
              <button
                key={rb.id}
                type="button"
                onClick={() => setSelectedId(rb.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  selectedId === rb.id
                    ? "border-primary/60 bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <span className="min-w-0 truncate font-medium">{rb.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {rb.rule_count} {rb.rule_count === 1 ? "rule" : "rules"}
                </span>
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!selectedId || isSaving || !content.trim()}
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Save as draft rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddToRulebookDialog;
