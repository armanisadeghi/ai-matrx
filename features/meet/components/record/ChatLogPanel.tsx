"use client";

// features/meet/components/record/ChatLogPanel.tsx
//
// THE MEETING'S CHAT, AFTER IT (Meet wave 3): what was said to everyone, read
// from `GET /v1/meet/chat` (the saved history the room itself reads on join).
// Private messages are never saved, by design — the empty state says so, and
// a refusal from the server is shown in its own words.

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import {
  loadMeetingChat,
  useMeetHost,
  type MeetingChatHistory,
  type MeetingId,
} from "@ai-matrx/meet/react";
import { Skeleton } from "@ai-matrx/design-system";

function clock(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ChatLogPanel({ meetingId }: { meetingId: MeetingId }) {
  const host = useMeetHost();
  const [history, setHistory] = useState<MeetingChatHistory | null>(null);
  const api = host?.api ?? null;

  useEffect(() => {
    if (api === null) return undefined;
    let live = true;
    void loadMeetingChat(api, meetingId).then((result) => {
      if (live) setHistory(result);
    });
    return () => {
      live = false;
    };
  }, [api, meetingId]);

  if (api === null) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Choose an organization from the avatar menu to read this meeting&apos;s
        chat.
      </p>
    );
  }
  if (history === null) {
    return (
      <div
        className="space-y-2 p-3"
        aria-busy="true"
        aria-label="Reading the chat"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }
  if (history.refusal !== null) {
    return (
      <div role="alert" className="p-4 text-sm">
        <p>
          {history.refusal.message}
          <ErrorAlchemyMenu error={history.refusal.message} size="xs" />
        </p>
        <p className="mt-1 text-muted-foreground">{history.refusal.remedy}</p>
      </div>
    );
  }
  if (history.messages.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nobody wrote in this meeting&apos;s chat. Private messages between two
        people are never saved.
      </p>
    );
  }
  return (
    <ol className="h-full space-y-2.5 overflow-y-auto px-3 py-3">
      {history.messages.map((message) => (
        <li key={message.id} className="text-sm">
          <p className="flex items-baseline gap-2 text-xs">
            <span className="font-medium text-foreground">
              {message.displayName}
            </span>
            <time dateTime={message.at} className="text-muted-foreground">
              {clock(message.at)}
            </time>
          </p>
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        </li>
      ))}
    </ol>
  );
}
