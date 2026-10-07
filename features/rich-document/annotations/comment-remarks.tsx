"use client";

/**
 * "With next message" for comments that are NOT on a chat answer — the whole
 * board, a record tile on it, a passage of a note tile, a record's thread in
 * the canvas. When the page has an agent chat (it registered a remark sink,
 * `remark-sink.ts`) and the switch is on, a saved comment is staged as a
 * remark chip in that chat, naming its record: the model reads
 * `comment c5 on task “Ship pricing page”`.
 *
 * The switch starts at `selection_toolbar.comment_sends_with_next_message`
 * (default on) — the same knob a chat answer's comment uses; the person's own
 * flip wins for that composer. A comment on a chat answer keeps staging into
 * its own conversation (AnnotationSidecar), never through the sink.
 */

import { useId, useState } from "react";
import { CommentThread } from "@ai-matrx/associations/react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import {
  activeRemarkSink,
  useHasRemarkSink,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remark-sink";
import type { RemarkRecordTarget } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import {
  COMMENT_SENDS_WITH_NEXT_MESSAGE_DEFAULT,
  COMMENT_SENDS_WITH_NEXT_MESSAGE_KNOB,
} from "@ai-matrx/rich-content/selection-toolbar/selection-actions";
import { Switch } from "@/components/ui/switch";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";

export interface WithNextMessage {
  /** This page has a chat a comment can ride along to. */
  available: boolean;
  /** The switch: the knob's default until the person flips it. */
  on: boolean;
  setOn: (on: boolean) => void;
}

export function useWithNextMessage(): WithNextMessage {
  const available = useHasRemarkSink();
  const userId = useAppSelector(selectUserId);
  const orgId = useAppSelector(selectOrganizationId);
  const knob = useEffectiveKnob(orgId, userId, COMMENT_SENDS_WITH_NEXT_MESSAGE_KNOB);
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const on = flipped ?? (typeof knob === "boolean" ? knob : COMMENT_SENDS_WITH_NEXT_MESSAGE_DEFAULT);
  return { available, on, setOn: setFlipped };
}

/** The switch row, or nothing when the page has no chat to send to. */
export function WithNextMessageSwitch({ state, className }: { state: WithNextMessage; className?: string }) {
  const id = useId();
  if (!state.available) return null;
  return (
    <label htmlFor={id} className={className ?? "flex items-center gap-1.5 text-xs text-muted-foreground"}>
      <Switch id={id} checked={state.on} onCheckedChange={state.setOn} />
      With next message
    </label>
  );
}

/**
 * Stage one saved comment on `record` into the page's chat. Returns false when
 * the page has no chat (nothing staged — the comment itself is saved either way).
 */
export function stageRecordComment(
  record: RemarkRecordTarget,
  posted: { id: string; body: string },
  quote: string | null = null,
): boolean {
  const sink = activeRemarkSink();
  if (!sink) return false;
  sink.stage(
    {
      kind: "comment",
      target: { conversationId: null, messageId: null, record },
      commentId: posted.id,
      quote,
      body: posted.body,
    },
    { coalesceKey: `comment:${posted.id}` },
  );
  return true;
}

/**
 * A record's canonical `CommentThread`, plus — on a page with an agent chat —
 * the "With next message" switch, with each saved comment staged into that
 * chat. Without a chat on the page it is exactly `CommentThread` (and reads no
 * store), so every host can render this one.
 */
export function RecordCommentThread({
  token,
  id,
  title,
  part,
  showHeader,
  className,
}: {
  token: EntityTypeToken;
  id: string;
  /** The record's name as the person sees it — what a staged remark names. */
  title: string | null;
  /** One part of the record (a board tile): that part's comments only, stored with a `part_anchor`. */
  part?: { key: string; label: string };
  showHeader?: boolean;
  className?: string;
}) {
  const hasSink = useHasRemarkSink();
  if (!hasSink) return <CommentThread token={token} id={id} part={part} showHeader={showHeader} className={className} />;
  return <ThreadToPageChat token={token} id={id} title={title} part={part} showHeader={showHeader} className={className} />;
}

function ThreadToPageChat({
  token,
  id,
  title,
  part,
  showHeader,
  className,
}: {
  token: EntityTypeToken;
  id: string;
  title: string | null;
  part?: { key: string; label: string };
  showHeader?: boolean;
  className?: string;
}) {
  const withNext = useWithNextMessage();
  return (
    <div className="flex flex-col gap-2">
      <WithNextMessageSwitch state={withNext} />
      <CommentThread
        token={token}
        id={id}
        part={part}
        showHeader={showHeader}
        className={className}
        onPosted={(posted) => {
          if (withNext.on) stageRecordComment({ token, id, title }, posted);
        }}
      />
    </div>
  );
}
