"use client";

import { ErrorNotice } from "@ai-matrx/design-system";
import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import { asConversationId } from "@ai-matrx/messaging";
import { useMessagingHost } from "@ai-matrx/messaging/react";
import { Button } from "@/components/ui/button";
import { ConversationPane } from "@/features/messaging/components/ConversationPane";
import type { LivePresence } from "../presence";
import { openDirectLine } from "../service";

const READS_IT: Record<LivePresence, string> = {
  busy: "Busy: reads this at its next tool call",
  idle: "Idle: reads this when its next turn starts",
  ended: "Ended: reads this if it resumes",
};

/**
 * The person's direct line to one session. An existing line renders the
 * messaging package's thread; the first message creates the line through the
 * agent-messages service (so the session is a member and delivery runs), then
 * posts through the messaging engine like any other message.
 */
export function DirectLine({
  address,
  roomId,
  presence,
  onCreated,
}: {
  address: string;
  roomId: string | null;
  presence: LivePresence;
  onCreated: (roomId: string) => void;
}) {
  const host = useMessagingHost();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startLine = async () => {
    const text = draft.trim();
    if (!text || !host) return;
    setSending(true);
    setError(null);
    try {
      const { roomId: created } = await openDirectLine(address);
      host.engine.send({ conversationId: asConversationId(created), content: text });
      setDraft("");
      onCreated(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The message was not sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        {READS_IT[presence]}
      </div>
      {roomId ? (
        <ConversationPane
          key={roomId}
          conversationId={roomId}
          showHeader={false}
          showAi={false}
          className="min-h-0 flex-1"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 p-3">
          <p className="text-center text-xs text-muted-foreground">
            No messages with this session yet.
          </p>
          {error && <ErrorNotice message={error} size="inline" />}
          <div className="flex items-end gap-2 rounded-lg border border-input p-1.5 focus-within:ring-1 focus-within:ring-ring">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void startLine();
                }
              }}
              rows={2}
              placeholder="Message this session"
              aria-label="Message this session"
              className="min-h-[2.5rem] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none"
            />
            <Button
              icon={<SendHorizontal />}
              aria-label="Send"
              className="shrink-0"
              disabled={!draft.trim() || sending || !host}
              onClick={() => void startLine()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
