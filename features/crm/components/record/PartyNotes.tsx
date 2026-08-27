"use client";

// features/crm/components/record/PartyNotes.tsx
//
// Notes = platform.comments (features/crm/FEATURE.md § inherited, never
// rebuilt). Reached ONLY through commentsService; p_org_id is passed
// explicitly because cmt_add's own org resolution is task-only.

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { AlertTriangle, NotebookText, Trash2 } from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { commentsService } from "@/features/comments/service/commentsService";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  CollapsibleText,
  CollapsibleTextGroupControls,
} from "@/components/official/CollapsibleText";
import type { Comment } from "@/features/comments/types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { formatRelativeTime } from "@/utils/datetime";
import { SectionCard, SectionEmpty } from "./SectionCard";

interface Props {
  /** The record the notes hang on (a party by default; a deal via entityType). */
  partyId: string;
  orgId: string;
  /**
   * Which commentable CRM entity this record is. Notes stay platform.comments
   * either way; generalized rather than forked when the deal record page
   * needed the same card (2026-08-20).
   */
  entityType?: "party" | "crm_deal";
  getApplicationScope?: () => ApplicationScope;
}

export function PartyNotes({
  partyId,
  orgId,
  entityType = "party",
  getApplicationScope,
}: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  // A failed load is NOT an empty list. Rendering "No notes yet" over a failure
  // tells the user this record has no notes when it may have many — and it hid
  // a real `cmt_list` failure on this page (2026-08-14) behind a calm, wrong
  // empty state. Track the failure and say so, with a way to retry.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(
    new Set(),
  );
  const generationRef = useRef(0);

  useEffect(() => {
    // Timer = async boundary, so no setState runs synchronously in the effect.
    const timer = setTimeout(() => {
      const load = async () => {
        const gen = ++generationRef.current;
        const result = await commentsService.listForEntity(entityType, partyId);
        if (generationRef.current !== gen) return;
        if (result.ok) {
          setComments(result.data.comments);
          setLoadError(null);
        } else {
          console.error("[crm] notes load failed:", result.error);
          setLoadError(result.error.message);
        }
      };
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [partyId, entityType, reloadNonce]);

  const allExpanded =
    comments.length > 0 &&
    comments.every((comment) => expandedComments.has(comment.id));
  const anyExpanded = comments.some((comment) =>
    expandedComments.has(comment.id),
  );

  const setCommentExpanded = (id: string, expanded: boolean) => {
    setExpandedComments((current) => {
      const next = new Set(current);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    const result = await commentsService.add({
      entityType,
      entityId: partyId,
      body,
      orgId,
    });
    setSaving(false);
    if (result.ok) {
      setDraft("");
      setReloadNonce((current) => current + 1);
    } else {
      toast.error(result.error.message);
    }
  };

  const remove = async (comment: Comment) => {
    const ok = await confirm({
      title: "Delete this note?",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const result = await commentsService.remove(comment.id);
    if (result.ok) setReloadNonce((current) => current + 1);
    else toast.error(result.error.message);
  };

  return (
    <SectionCard
      title="Notes"
      Icon={NotebookText}
      // No count while the load is failing — an authoritative "0" is the same
      // lie as "No notes yet".
      count={loadError ? undefined : comments.length}
      action={
        <CollapsibleTextGroupControls
          allExpanded={allExpanded}
          anyExpanded={anyExpanded}
          disabled={comments.length === 0}
          onExpandAll={() =>
            setExpandedComments(new Set(comments.map((comment) => comment.id)))
          }
          onCollapseAll={() => setExpandedComments(new Set())}
        />
      }
    >
      <ProTextarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note…"
        autoGrow
        minHeight={64}
        maxHeight={240}
        onSubmit={submit}
        submitDisabled={saving || !draft.trim()}
        isSubmitting={saving}
        submitLabel="Save note"
        surfaceName="matrx-user/crm-record"
        sourceFeature="crm"
        getApplicationScope={getApplicationScope}
        enableTextStats
        defaultShowTextStatsBar={false}
        wrapperClassName="mb-2"
        className="text-base sm:text-sm"
        aria-label="Add a note"
      />

      {loadError ? (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span>Couldn&apos;t load notes — {loadError}</span>
          <button
            type="button"
            onClick={() => setReloadNonce((current) => current + 1)}
            className="rounded px-1.5 py-0.5 font-medium text-primary hover:bg-accent"
          >
            Retry
          </button>
        </div>
      ) : comments.length === 0 ? (
        <SectionEmpty>No notes yet</SectionEmpty>
      ) : (
        <ul className="space-y-1">
          {[...comments].reverse().map((comment) => (
            <li
              key={comment.id}
              className="group rounded border border-border bg-muted/20 px-2 py-1.5"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-medium text-foreground">
                  {comment.author.displayName ??
                    comment.author.email ??
                    "Unknown"}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatRelativeTime(comment.createdAt)}
                </span>
                <button
                  type="button"
                  aria-label="Delete note"
                  onClick={() => void remove(comment)}
                  className="ml-auto rounded p-0.5 text-muted-foreground/40 opacity-0 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <CollapsibleText
                expanded={expandedComments.has(comment.id)}
                onExpandedChange={(expanded) =>
                  setCommentExpanded(comment.id, expanded)
                }
                className="mt-0.5 text-sm leading-relaxed text-foreground"
                expandLabel="Expand note"
                collapseLabel="Collapse note"
              >
                {comment.body}
              </CollapsibleText>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
