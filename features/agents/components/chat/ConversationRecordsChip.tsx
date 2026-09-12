"use client";

/**
 * ConversationRecordsChip — the CHAT HEADER's chrome around the ONE reverse
 * view (`features/content-ir/records/AnchorRecordsList.tsx`).
 *
 * The block strip answers "where did this record go?". This answers the
 * opposite question, and the one a person actually asks after a long chat:
 * "what did this conversation produce?"
 *
 * ## Why this file holds no list any more
 *
 * A conversation is just an ANCHOR — one of the things records get produced
 * about. A web site is another (DD-131 slice 2, item 4). The moment the second
 * anchor existed, keeping a conversation-shaped list here would have made two
 * mechanisms that drift: two empty states, two archive controls, two row
 * renderers. So the read and the rendering moved to the anchor list and this
 * file is what it always should have been — a popover, a trigger, and a count.
 *
 * ## Why the header and not the transcript
 *
 * The transcript is the conversation; a running list of its by-products glued
 * above the composer would push the thing the reader came for off the screen
 * and grow without bound. In the header the list is one click away from every
 * turn, costs no vertical space, and stays reachable after the conversation is
 * long enough that its early blocks have scrolled out of reach — which is
 * exactly when the question gets asked.
 */

import { useState } from "react";
import { Boxes } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import {
  AnchorRecordsList,
  useAnchorRecords,
} from "@/features/content-ir/records/AnchorRecordsList";
import { CONVERSATION_ANCHOR_TYPE } from "@/features/content-ir/records/kind-record-service";

export function ConversationRecordsChip({
  conversationId,
}: {
  conversationId: string;
}) {
  const [open, setOpen] = useState(false);
  // THE ZERO-PREFETCH RULE: nothing is read until the reader opens the panel.
  // A chat that never asks the question costs no query.
  const state = useAnchorRecords(
    { type: CONVERSATION_ANCHOR_TYPE, id: conversationId },
    open,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-conversation-records-trigger
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Boxes className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Records</span>
          {state.status === "ready" && state.active.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
              {state.active.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 text-sm font-semibold text-foreground">
          Records this chat produced
        </div>
        <AnchorRecordsList
          state={state}
          loadingText="Reading this chat…"
          emptyText="Nothing yet. When this chat produces a saved Shape — a wine tasting, a recipe, anything with its own record — it is kept here with a link straight to it."
        />
      </PopoverContent>
    </Popover>
  );
}
