"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { providerMeta } from "@/features/agent-connections/coding-sessions/catalog";
import { compactAge, deliveryLag, needsClaudeAccount } from "../presence";
import type { LiveSession } from "../useLiveHub";
import type { SessionMemberRow } from "../service";
import { LagMarker, PresenceDot, lagText, presenceLabel, worstLag } from "./LiveBits";
import { SessionTranscriptPane } from "./SessionTranscriptPane";
import { DirectLine } from "./DirectLine";

type Tab = "messages" | "transcript";

export function SessionDetail({
  session,
  members,
  directRoomId,
  directMembers,
  nowMs,
  onBack,
  onDirectRoomCreated,
}: {
  session: LiveSession;
  members: readonly SessionMemberRow[];
  directRoomId: string | null;
  directMembers: readonly SessionMemberRow[];
  nowMs: number;
  onBack: () => void;
  onDirectRoomCreated: (roomId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("messages");
  const Icon = providerMeta(session.provider)?.icon ?? AGENT_ICON;
  const lag = worstLag(members.map((m) => deliveryLag(m, nowMs)));
  const lagLine = lagText(lag);
  const seen = session.lastSeenAt
    ? `seen ${compactAge(nowMs - Date.parse(session.lastSeenAt))} ago`
    : "never seen";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="shrink-0 @2xl/live:hidden">
          <Button variant="quiet" icon={<ArrowLeft />} aria-label="Back" onClick={onBack} />
        </span>
        <PresenceDot presence={session.presence} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{session.title}</h2>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Icon className="size-3 shrink-0" />
            <span className="truncate">
              {[
                presenceLabel(session.presence),
                session.providerLabel,
                session.workspace,
                session.account,
                seen,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {lagLine && (
              <span className="ml-1 inline-flex items-center gap-1">
                <LagMarker lag={lag} />
                <span className="truncate">{lagLine}</span>
              </span>
            )}
          </p>
        </div>
        {needsClaudeAccount(lag) && (
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/work/connections#claude-accounts">Connect Claude account</Link>
          </Button>
        )}
        <Button asChild variant="quiet" className="shrink-0">
          <Link href={`/work/conversations/${session.address}`}>
            <ExternalLink className="size-3.5" />
            <span className="hidden @lg/live:inline">Open</span>
          </Link>
        </Button>
      </header>

      <div role="tablist" className="flex border-b border-border @4xl/live:hidden">
        {(["messages", "transcript"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 text-xs font-medium capitalize",
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "messages" ? "Messages" : "Transcript"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Transcript"
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin @4xl/live:block",
            tab === "transcript" ? "block" : "hidden",
          )}
        >
          <SessionTranscriptPane address={session.address} />
        </section>
        <section
          aria-label="Messages"
          className={cn(
            "min-h-0 w-full flex-col @4xl/live:flex @4xl/live:w-[24rem] @6xl/live:w-[28rem] @4xl/live:shrink-0 @4xl/live:border-l @4xl/live:border-border",
            tab === "messages" ? "flex" : "hidden",
          )}
        >
          <DirectLine
            session={session}
            roomId={directRoomId}
            members={directMembers}
            onCreated={onDirectRoomCreated}
          />
        </section>
      </div>
    </div>
  );
}
