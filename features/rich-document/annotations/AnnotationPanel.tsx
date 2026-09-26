// features/rich-document/annotations/AnnotationPanel.tsx
//
// The right side panel: every comment thread, suggestion, private highlight /
// note and link on the source, in document order, each opening its real
// target (EntityRef: open / new tab / peek). States are shown as they are —
// Saving…, Not saved (with the reason, Retry and Discard), Passage changed
// (with the saved quote and Reattach) — and a failed read is an error with a
// retry, never an empty list.

"use client";

import { useRef, useState } from "react";
import { newRequestId } from "./useAnnotationSidecar";
import { EditConflictError } from "./errors";
import {
  AtSign,
  CalendarDays,
  Check,
  Highlighter,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  NotebookPen,
  PencilLine,
  RotateCcw,
  Trash2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { RichContent } from "@/components/rich-content/RichContent";
import { CollapsibleText } from "@/components/official/CollapsibleText";
import { announceMentions, SWATCH, useSidecar } from "./AnnotationSidecar";
import { HIGHLIGHT_COLORS } from "./constants";
import { MentionComposer } from "./MentionComposer";
import { LinkRecordSheet } from "./LinkRecordSheet";
import { tokenizeMentions } from "./mentions";
import type { ResolvedItem } from "./types";

type Filter = "all" | "comments" | "suggestions" | "highlights" | "links";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "comments", label: "Comments" },
  { id: "suggestions", label: "Edits" },
  { id: "highlights", label: "Private" },
  { id: "links", label: "Links" },
];

function matches(item: ResolvedItem, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "comments") return item.kind === "comment";
  if (f === "suggestions") return item.kind === "suggestion";
  if (f === "highlights") return item.kind === "highlight" || item.kind === "note";
  return item.kind === "link";
}

function position(item: ResolvedItem): number {
  if (!item.anchor) return -1;
  if (!item.resolution || item.resolution.status === "orphaned") return Number.MAX_SAFE_INTEGER;
  return item.resolution.start ?? Number.MAX_SAFE_INTEGER;
}

export function AnnotationPanel({ className }: { className?: string }) {
  const { api, source, activeKey } = useSidecar();
  const { items, loading, error, capabilities } = api.state;
  const [filter, setFilter] = useState<Filter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [composer, setComposer] = useState<"comment" | "note" | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  // The composer the Add menu opens takes focus when the menu finishes closing — the menu's
  // own focus return would otherwise land on its trigger or the page (verify-RC-B11 F5).
  const composerInput = useRef<HTMLTextAreaElement | null>(null);
  const visible = items
    .filter((i) => matches(i, filter))
    .filter((i) => showResolved || !i.resolvedAt)
    .sort((a, b) => position(a) - position(b) || a.createdAt.localeCompare(b.createdAt));
  const resolvedCount = items.filter((i) => i.resolvedAt).length;
  const linkedKeys = new Set(items.filter((i) => i.link && !i.anchor).map((i) => `${i.link!.token}:${i.link!.id}`));

  return (
    <aside className={cn("matrx-touch-targets flex h-full min-h-0 flex-col bg-muted/20", className)} aria-label="Annotations">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" role="tablist" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                filter === f.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs">Add</Button>
          </DropdownMenuTrigger>
          {/* The composer this opens takes focus itself; the menu must not hand
              focus back to its trigger afterwards (it stole the caret mid-typing). */}
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(e) => {
              if (!composerInput.current) return;
              e.preventDefault();
              composerInput.current.focus();
            }}
          >
            <DropdownMenuItem onSelect={() => setComposer("comment")}>
              <MessageSquare className="mr-2 h-3.5 w-3.5" aria-hidden />Comment on the document
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setComposer("note")}>
              <NotebookPen className="mr-2 h-3.5 w-3.5" aria-hidden />Private note
            </DropdownMenuItem>
            {capabilities.links && (
              <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                <Link2 className="mr-2 h-3.5 w-3.5" aria-hidden />Link a record to the document
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto p-2">
        {composer && (
          <div className="mb-2 rounded-lg border border-border bg-card p-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {composer === "comment" ? "Comment on the whole document — everyone who can open it will see this." : "A private note on this document — only you will see it."}
            </p>
            <MentionComposer
              source={source}
              autoFocus
              inputRef={composerInput}
              mentions={composer === "comment" && capabilities.collaborationDoors}
              submitLabel={composer === "comment" ? "Comment" : "Save note"}
              placeholder={composer === "comment" ? "Comment — type @ to mention" : "Write a note…"}
              onCancel={() => setComposer(null)}
              onSubmit={async (text) => {
                setComposer(null);
                if (composer === "comment") announceMentions(await api.postComment({ body: text, anchor: null }));
                else await api.addHighlight(null, undefined, text);
              }}
            />
          </div>
        )}

        {!capabilities.paint && items.some((i) => i.anchor) && (
          <p className="mb-2 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground">
            This browser cannot draw highlights in the text. Every annotation is still listed here.
          </p>
        )}

        {!loading && error && items.length > 0 && (
          <ErrorNotice
            size="compact"
            className="mb-2"
            message={`Part of this list could not be loaded: ${error}`}
            operation="Load annotations"
            records={[{ type: source.token, id: source.id, label: source.title }]}
            actions={<Button className="h-7 text-xs" size="sm" variant="outline" onClick={() => void api.reload()}>Try again</Button>}
          />
        )}

        {loading ? (
          <div className="grid gap-2" aria-label="Loading annotations">
            {[0, 1, 2].map((n) => <div key={n} className="h-20 animate-pulse rounded-lg border border-border bg-muted" />)}
          </div>
        ) : error && items.length === 0 ? (
          <ErrorNotice
            message={error}
            operation="Load annotations"
            records={[{ type: source.token, id: source.id, label: source.title }]}
            actions={<Button size="sm" variant="outline" onClick={() => void api.reload()}>Try again</Button>}
          />
        ) : visible.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "Select text to highlight it, comment on it, suggest an edit or link something to it."
              : "Nothing here with this filter."}
          </p>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-2">
            {visible.map((item) => <ItemCard key={item.key} item={item} active={item.key === activeKey} />)}
          </div>
        )}

        {resolvedCount > 0 && (
          <button type="button" onClick={() => setShowResolved((s) => !s)} className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground">
            {showResolved ? "Hide" : "Show"} {resolvedCount} resolved
          </button>
        )}
      </div>

      <LinkRecordSheet
        open={linkOpen}
        onOpenChange={setLinkOpen}
        passage={null}
        attachedKeys={linkedKeys}
        onLink={(token, id, title) => api.link(token, id, title, null)}
      />
    </aside>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const KIND_META: Record<ResolvedItem["kind"], { label: string; Icon: typeof Highlighter }> = {
  highlight: { label: "Highlight", Icon: Highlighter },
  note: { label: "Private note", Icon: NotebookPen },
  comment: { label: "Comment", Icon: MessageSquare },
  suggestion: { label: "Suggested edit", Icon: PencilLine },
  link: { label: "Linked", Icon: Link2 },
};

function ItemCard({ item, active }: { item: ResolvedItem; active: boolean }) {
  const { api, source, reveal, setActiveKey, setPendingReattach } = useSidecar();
  const { label, Icon } = KIND_META[item.kind];
  const orphaned = item.resolution?.status === "orphaned";
  const run = async (p: Promise<string | null>, ok?: string) => {
    const err = await p;
    if (err) toast.error(err);
    else if (ok) toast.success(ok);
  };

  return (
    <article
      aria-current={active || undefined}
      onClick={() => (item.anchor && !orphaned ? reveal(item.key) : setActiveKey(item.key))}
      className={cn(
        "min-w-0 cursor-default overflow-hidden break-words rounded-lg border bg-card p-2 text-sm shadow-sm transition-colors",
        active ? "border-primary/60 ring-1 ring-primary/30" : "border-border hover:border-primary/30",
        item.resolvedAt && "opacity-70",
      )}
    >
      <header className="flex min-w-0 items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="font-medium text-foreground">{label}</span>
        <span className="truncate text-muted-foreground">
          {item.kind === "comment" || item.kind === "suggestion" ? `${item.author.name} · ${when(item.createdAt)}` : when(item.createdAt)}
          {item.editedAt ? <EditedMark at={item.editedAt} /> : null}
        </span>
        {item.resolvedAt && <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Resolved</span>}
        {item.saveState === "pending" && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />Saving
          </span>
        )}
      </header>

      {item.anchor && (
        <blockquote className={cn("mt-1.5 line-clamp-3 border-l-2 pl-2 text-xs", orphaned ? "border-destructive/60 text-muted-foreground" : "border-primary/40 text-muted-foreground")}>
          {item.anchor.exact}
        </blockquote>
      )}
      {!item.anchor && item.kind !== "note" && item.kind !== "link" && (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Whole document</p>
      )}

      {orphaned && (
        <div className="mt-1.5 rounded-md bg-destructive/5 px-2 py-1.5 text-xs">
          <p className="text-foreground">{item.resolution?.reason}</p>
          {(item.kind === "highlight" || item.kind === "link") && item.saveState === "confirmed" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1 h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setPendingReattach(item.key);
                toast.info("Select the text this belongs to, then choose Reattach here.");
              }}
            >
              Reattach
            </Button>
          )}
        </div>
      )}

      {item.saveState === "failed" && (
        <ErrorNotice
          size="compact"
          icon={false}
          className="mt-1.5"
          title="Not saved"
          message={item.error}
          operation={`Save ${label.toLowerCase()}`}
          records={[
            { type: source.token, id: source.id, label: source.title },
            ...(item.commentId ? [{ type: "comment", id: item.commentId }] : []),
          ]}
          unsavedInput={{
            kind: item.kind,
            ...(item.body ? { text: item.body } : {}),
            ...(item.suggestedText != null ? { suggested_text: item.suggestedText } : {}),
            ...(item.anchor ? { passage: item.anchor.exact } : {}),
            ...(item.link ? { link: { token: item.link.token, id: item.link.id, title: item.link.title } } : {}),
            client_request_id: item.clientRequestId ?? null,
          }}
          actions={
            <>
            {item.retryable !== false && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); void api.retry(item); }}>
                <RotateCcw className="mr-1 h-3 w-3" aria-hidden />Retry
              </Button>
            )}
            {item.retryable === false && item.anchor && (item.kind === "comment" || item.kind === "suggestion") && (
              // The real remedy when a passage cannot be saved: the same words on the whole document.
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); void api.postOnWholeDocument(item); }}>
                Post on the whole document
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); void run(api.discardDraft(item.key)); }}>
              Discard
            </Button>
            </>
          }
        />
      )}

      {item.kind === "suggestion" && item.suggestedText != null && (
        <div className="mt-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
          <span className="text-muted-foreground line-through decoration-destructive">{item.anchor?.exact}</span>
          <span className="mx-1 text-muted-foreground">→</span>
          <span className="font-medium text-foreground">{item.suggestedText || "(delete)"}</span>
        </div>
      )}

      {(item.kind === "comment" || item.kind === "suggestion") && item.body && <CommentBody body={item.body} className="mt-1.5" />}

      {(item.kind === "highlight" || item.kind === "note") && item.saveState === "confirmed" && (
        <PrivateNote item={item} />
      )}

      {item.kind === "link" && item.link && (
        <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <EntityRef token={item.link.token} id={item.link.id} name={item.link.title} className="min-w-0 flex-1" />
          {item.saveState === "confirmed" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Detach — the record itself is kept" onClick={() => void run(api.unlink(item.link!.token, item.link!.id), "Detached. The record itself was not changed.")}>
              <Unlink className="mr-1 h-3 w-3" aria-hidden />Detach
            </Button>
          )}
        </div>
      )}

      {item.replies.length > 0 && (
        <div className="mt-2 grid gap-1.5 border-l-2 border-border pl-2">
          {item.replies.map((r) => (
            <ReplyRow key={r.id} reply={r} run={run} />
          ))}
        </div>
      )}

      {(item.kind === "comment" || item.kind === "suggestion") && item.saveState === "confirmed" && item.commentId && (
        <ThreadActions item={item} canApply={!!source.save} run={run} />
      )}
    </article>
  );
}

function EditedMark({ at }: { at: string }) {
  return (
    <span className="ml-1 text-muted-foreground" title={`Edited ${when(at)}`}>
      · edited
    </span>
  );
}

/**
 * One reply: the author can edit it through the SAME compare-and-swap door as a
 * top-level comment (conflicts shown, text kept on failure) or delete it.
 */
function ReplyRow({
  reply,
  run,
}: {
  reply: ResolvedItem["replies"][number];
  run: (p: Promise<string | null>, ok?: string) => Promise<void>;
}) {
  const { api, source } = useSidecar();
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState<{ mine: string; theirs: string } | null>(null);
  // The text and version the person STARTED editing from — frozen when the editor opens, so a
  // realtime reload of the thread underneath never turns a stale edit into a silent overwrite.
  const [base, setBase] = useState({ body: reply.body, version: reply.version });
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p className="text-[11px] text-muted-foreground">
        {reply.author.name} · {when(reply.createdAt)}
        {reply.editedAt ? <EditedMark at={reply.editedAt} /> : null}
      </p>
      {editing ? (
        <>
          <MentionComposer
            source={source}
            autoFocus
            mentions={api.state.capabilities.collaborationDoors}
            initialValue={base.body}
            submitLabel="Save"
            onCancel={() => { setEditing(false); setConflict(null); }}
            onSubmit={async (text) => {
              try {
                await api.editComment(reply.id, text, base);
                setEditing(false);
                return true;
              } catch (e) {
                if (e instanceof EditConflictError) {
                  setConflict({ mine: text, theirs: e.currentBody });
                  return false;
                }
                throw e;
              }
            }}
          />
          {conflict && (
            <div role="alert" className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <p className="font-medium text-foreground">Someone changed this reply while you were editing it.</p>
              <p className="mt-0.5 whitespace-pre-wrap text-foreground">{conflict.theirs || "(empty)"}</p>
              <div className="mt-1 flex gap-1">
                <Button size="sm" className="h-7 px-2 text-xs" onClick={async () => {
                  try { await api.editComment(reply.id, conflict.mine, base, true); setConflict(null); setEditing(false); }
                  catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
                }}>Replace theirs with mine</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setConflict(null); setEditing(false); }}>Keep theirs</Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <CommentBody body={reply.body} />
          {reply.mine && (
            <div className="flex gap-2">
              <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => { setBase({ body: reply.body, version: reply.version }); setEditing(true); }}>
                Edit
              </button>
              <button type="button" className="text-[11px] text-muted-foreground hover:text-destructive" onClick={() => void run(api.deleteComment(reply.id))}>
                Delete
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ThreadActions({
  item,
  canApply,
  run,
}: {
  item: ResolvedItem;
  canApply: boolean;
  run: (p: Promise<string | null>, ok?: string) => Promise<void>;
}) {
  const { api, source } = useSidecar();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  // One id per reply draft, reused when the person presses Reply again after a failure.
  const [replyRequestId, setReplyRequestId] = useState(newRequestId);
  const [conflict, setConflict] = useState<{ mine: string; theirs: string } | null>(null);
  const doors = api.state.capabilities.collaborationDoors;
  // Accept and Reject change what the RECORD says: only its editors see them (door law).
  const canEdit = api.state.capabilities.canEdit;
  const id = item.commentId!;
  // Frozen when the editor opens (see the reply above): the compare-and-swap base.
  const [base, setBase] = useState({ body: item.body, version: item.version ?? null });
  const conflictBox = conflict && (
    <div role="alert" className="mt-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
      <p className="font-medium text-foreground">Someone changed this comment while you were editing it.</p>
      <p className="mt-1 text-muted-foreground">It now says:</p>
      <p className="mt-0.5 whitespace-pre-wrap text-foreground">{conflict.theirs || "(empty)"}</p>
      <p className="mt-1 text-muted-foreground">Your version is still in the box above.</p>
      <div className="mt-1.5 flex gap-1">
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={async () => {
            try {
              await api.editComment(id, conflict.mine, base, true);
              setConflict(null);
              setEditing(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Replace theirs with mine
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setConflict(null); setEditing(false); }}>
          Keep theirs
        </Button>
      </div>
    </div>
  );

  if (editing) {
    return (
      <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
        <MentionComposer
          source={source}
          autoFocus
          mentions={doors}
          initialValue={base.body}
          submitLabel="Save"
          onCancel={() => { setEditing(false); setConflict(null); }}
          onSubmit={async (text) => {
            // The editor closes only when the edit is saved; a failure throws, so the
            // composer keeps the text with the reason and a Retry (verify-RC-B11 F3).
            try {
              await api.editComment(id, text, base);
              setEditing(false);
              return true;
            } catch (e) {
              if (e instanceof EditConflictError) {
                setConflict({ mine: text, theirs: e.currentBody });
                return false; // the person's version stays in the box
              }
              throw e;
            }
          }}
        />
        {conflictBox}
      </div>
    );
  }

  if (replying) {
    return (
      <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
        <MentionComposer
          source={source}
          autoFocus
          mentions={doors}
          submitLabel="Reply"
          placeholder="Reply — type @ to mention"
          onCancel={() => setReplying(false)}
          onSubmit={async (text) => {
            // Throws on failure: the composer stays open with the text, the reason and Retry,
            // and the same request id means a lost-but-landed reply is never written twice.
            const notice = await api.postComment({ body: text, anchor: null, parentId: id, clientRequestId: replyRequestId });
            setReplying(false);
            setReplyRequestId(newRequestId());
            announceMentions(notice);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1">
        {item.kind === "suggestion" && !item.resolvedAt && canApply && canEdit && (
          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => void run(api.acceptSuggestion(item), "Applied — only that part of the document changed.")}>
            <Check className="mr-1 h-3 w-3" aria-hidden />Accept
          </Button>
        )}
        {item.kind === "suggestion" && !item.resolvedAt && canEdit && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void run(api.rejectSuggestion(id), "Suggestion rejected — it stays under resolved.")}>
            Reject
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setReplying(true)}>Reply</Button>
        {doors && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void run(api.resolveComment(id, !item.resolvedAt))}>
            {item.resolvedAt ? "Reopen" : "Resolve"}
          </Button>
        )}
        {item.mine && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label="More">
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuItem onSelect={() => { setBase({ body: item.body, version: item.version ?? null }); setEditing(true); }}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onSelect={() => void run(api.deleteComment(id), "Comment deleted.")}>
                <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function PrivateNote({ item }: { item: ResolvedItem }) {
  const { api } = useSidecar();
  const [draft, setDraft] = useState(item.body);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== item.body;
  const docId = item.annotationDocumentId!;
  return (
    <div className="mt-1.5 grid gap-1" onClick={(e) => e.stopPropagation()}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Your private note"
        placeholder={item.kind === "highlight" ? "Add a private note…" : "Your note"}
        rows={draft ? 2 : 1}
        className="w-full resize-y rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base hover:border-input focus:border-input md:text-sm"
      />
      <div className="flex items-center gap-1">
        {item.kind === "highlight" &&
          HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={item.color === c}
              onClick={async () => {
                const err = await api.recolor(item, c);
                if (err) toast.error(err);
              }}
              className={cn("h-5 w-5 rounded-full border", SWATCH[c], item.color === c ? "border-foreground" : "border-border")}
            />
          ))}
        {dirty && (
          <Button
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const err = await api.saveNote(docId, draft);
              setSaving(false);
              if (err) toast.error(err);
            }}
          >
            {saving ? "Saving" : "Save"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-7 px-2 text-xs text-muted-foreground hover:text-destructive", !dirty && "ml-auto")}
          onClick={async () => {
            const err = await api.removeHighlight(docId);
            if (err) toast.error(err);
            else toast.success(item.kind === "highlight" ? "Highlight removed. The document was not changed." : "Note removed.");
          }}
        >
          <Trash2 className="mr-1 h-3 w-3" aria-hidden />Remove
        </Button>
      </div>
    </div>
  );
}

/** Comment text: people and dates as chips; everything else (incl. [[record]] wikilinks) through the ONE renderer. */
/** Lines a comment shows before "Show more" (a long paste never floods the thread). */
export const COMMENT_COLLAPSED_LINES = 8;

export function CommentBody({ body, className }: { body: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <CollapsibleText
      expanded={expanded}
      onExpandedChange={setExpanded}
      collapsedLines={COMMENT_COLLAPSED_LINES}
      expandLabel="Show more"
      collapseLabel="Show less"
      showLabel
      className={cn("text-sm leading-5 text-foreground", className)}
    >
      <CommentTokens body={body} />
    </CollapsibleText>
  );
}

function CommentTokens({ body }: { body: string }) {
  return (
    <>
      {tokenizeMentions(body).map((t, i) =>
        t.type === "person" ? (
          <span key={i} className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 text-primary">
            <AtSign className="h-3 w-3" aria-hidden />{t.label}
          </span>
        ) : t.type === "date" ? (
          <span key={i} className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-muted px-1 text-foreground">
            <CalendarDays className="h-3 w-3" aria-hidden />{t.label}
          </span>
        ) : (
          <RichContent key={i} level="inline" source={t.text} />
        ),
      )}
    </>
  );
}

