"use client";
import React, { Suspense, lazy } from "react";
import { AlertTriangle, Check, CircleSlash, Clock, Hammer, MessagesSquare, RotateCcw } from "lucide-react";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openCommentThread } from "@/features/rich-document/annotations/canvas/commentThreadKind";
import { Button } from "@ai-matrx/design-system/controls";

/**
 * DirectiveReceiptBlock — what the directive actually DID, in a sentence.
 *
 * WHY IT EXISTS. Observed live 2026-09-12 (walk K-1): an agent wrote one project
 * and four tasks into a user's organization, and the only thing on screen was
 * the request re-rendered as a card badged `Ready` — the same card, the same
 * badge, whether the write had just landed, whether the identical re-send had
 * been deduped to nothing, or whether nothing had been applied at all. A person
 * who sent the same request twice saw two identical cards and could not tell
 * that the second one wrote nothing.
 *
 * 🚨 THE SENTENCE IS THE SERVER'S, VERBATIM. `message` is authored by
 * `aidream/services/output_directives/receipt_words.py` and rides the
 * `directive_apply.*` receipt event. This component never composes, guesses,
 * pluralizes or "improves" it: only the server knows whether the ledger
 * replayed, what the write-tree touched, or what the handler called it. If this
 * card ever reads wrong, the fix is in that module — not here.
 *
 * The outcome only chooses the icon and the tone.
 *
 * 🚨 AND NOTHING ELSE IS COMPOSED HERE EITHER (V-19, 2026-09-12). The first cut
 * of this card printed a second line — "{N} {resource_kind}s affected" — from
 * `resource_ids.length`. For the real `create_project_with_tasks` receipt that
 * reads **"5 projects affected"** for one project and four tasks, because the
 * five ids all ride under `resource_kind: "project"`. That is the exact
 * derivation the server-side design rejected as a confident lie, reintroduced
 * on the client, under a sentence that was already correct. A screen never
 * lies: the sentence is the whole card. `resourceIds` is kept only as data on
 * the element, for linking later.
 */

export type DirectiveReceiptOutcome =
  | "proposed"
  | "applied"
  | "already_applied"
  | "failed"
  | "blocked"
  /** The directive STARTED long work (aidream ApplyStatus `pending`): the receipt names the job. */
  | "pending";

/**
 * A receipt naming an Agent Factory build (`create_agent` on the pipeline, AF-D door #3):
 * the build's live progress mounts under the sentence — the ONE `BuildProgress` primitive,
 * lazy so a chat never downloads it until a build receipt appears. A replayed receipt
 * (`already_applied`) names the same build, so it shows the same progress.
 */
export const FACTORY_BUILD_RESOURCE = "agent_factory_build";
const BuildProgress = lazy(() =>
  import("@/features/agents/factory/components/BuildProgress").then((m) => ({ default: m.BuildProgress })),
);

export interface DirectiveReceiptBlockProps {
  /** The directive SLUG — the one identity. */
  directive: string;
  outcome: DirectiveReceiptOutcome;
  /** The server's own sentence. Rendered verbatim, and it is the ONLY prose. */
  message: string;
  /** Carried for linking/diagnostics — NEVER counted into a sentence. */
  resourceKind?: string;
  resourceIds?: string[];
  /** A `comment_reply` receipt's `thread` (`ThreadLink`), as the server sent it: the line opens it. */
  thread?: unknown;
}

/** The agent's reply into a comment thread (`directive_v1_action_comment_reply`). */
const COMMENT_REPLY_SLUG = /_action_comment_reply$/;

/** The receipt's `thread` (server `ThreadLink`): the record, the root, and the reply that landed. */
interface ThreadLink {
  entity: string;
  id: string;
  rootId: string;
  replyId: string | null;
  handle: string | null;
}

export function readThreadLink(value: unknown): ThreadLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === "string" && x ? x : null);
  const entity = text(v.entity_type);
  const id = text(v.entity_id);
  const rootId = text(v.root_id);
  if (!entity || !id || !rootId) return null;
  return { entity, id, rootId, replyId: text(v.reply_id), handle: text(v.handle) };
}

/**
 * The comment-reply receipt: ONE line — the server's sentence ("Replied in
 * thread" / why it failed) and the door to the thread in the canvas. The
 * reply's own words are in the thread, never here.
 */
function CommentReplyReceipt({ directive, outcome, message, thread }: DirectiveReceiptBlockProps) {
  const canvas = useOptionalCanvas();
  const style = OUTCOME_STYLE[outcome] ?? OUTCOME_STYLE.applied;
  const failed = outcome === "failed" || outcome === "blocked";
  const link = readThreadLink(thread);
  const Icon = failed ? style.Icon : MessagesSquare;
  return (
    <div className="my-1 flex min-w-0 items-center gap-1.5 text-xs" data-directive={directive} data-outcome={outcome}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${failed ? style.tone : "text-muted-foreground"}`} />
      <span className={`min-w-0 truncate ${failed ? "text-foreground" : "text-muted-foreground"}`}>{message}</span>
      {link && !failed ? (
        <Button variant="link" onClick={() => openCommentThread(canvas, { entity: link.entity, id: link.id, title: "Comments", focus: link.replyId ?? link.rootId })} className="shrink-0">
          Open thread
        </Button>
      ) : null}
    </div>
  );
}

const OUTCOME_STYLE: Record<
  DirectiveReceiptOutcome,
  { Icon: typeof Check; tone: string; label: string }
> = {
  applied: { Icon: Check, tone: "text-primary", label: "Done" },
  already_applied: {
    Icon: RotateCcw,
    tone: "text-muted-foreground",
    label: "Already done",
  },
  proposed: { Icon: Clock, tone: "text-amber-600 dark:text-amber-500", label: "Waiting for you" },
  failed: { Icon: AlertTriangle, tone: "text-destructive", label: "Failed" },
  blocked: { Icon: CircleSlash, tone: "text-destructive", label: "Not applied" },
  pending: { Icon: Hammer, tone: "text-amber-600 dark:text-amber-500", label: "Building" },
};

const DirectiveReceiptBlock: React.FC<DirectiveReceiptBlockProps> = (props) => {
  const { directive, outcome, message, resourceKind, resourceIds } = props;
  if (COMMENT_REPLY_SLUG.test(directive)) return <CommentReplyReceipt {...props} />;
  const style = OUTCOME_STYLE[outcome] ?? OUTCOME_STYLE.applied;
  const { Icon } = style;
  const buildId =
    resourceKind === FACTORY_BUILD_RESOURCE && outcome !== "failed" && outcome !== "blocked"
      ? resourceIds?.[0]
      : undefined;

  return (
    <div
      className="my-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
      data-directive={directive}
      data-outcome={outcome}
      data-resource-kind={resourceKind || undefined}
      data-resource-count={resourceIds?.length ?? undefined}
    >
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.tone}`} />
        {/* The server's sentence, verbatim — the whole point of the card. */}
        <span className="min-w-0 flex-1 text-foreground">{message}</span>
        <span className={`shrink-0 text-xs ${style.tone}`}>{style.label}</span>
      </div>
      {buildId ? (
        <Suspense fallback={null}>
          <BuildProgress buildId={buildId} className="mt-2" />
        </Suspense>
      ) : null}
    </div>
  );
};

export default DirectiveReceiptBlock;
