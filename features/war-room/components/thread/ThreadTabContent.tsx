"use client";

// features/war-room/components/thread/ThreadTabContent.tsx
//
// Renders the REAL tab bodies (ThreadTaskTab / ThreadNotesTab / ThreadAudioTab) for a
// tile. These components self-manage their data from Redux, so we just place
// them — the single source of body composition shared by the Grid tile and the
// Stage tile. The "All" view is one quiet single-scroll column: each block gets
// a thin top accent + full-height left rail only (no label row, no interior
// tint) so we never stack a second header on chrome the tab bodies already own.

import { useEffect } from "react";
import { ThreadTaskTab } from "./ThreadTaskTab";
import { ThreadNotesTab } from "./ThreadNotesTab";
import { ThreadAudioTab } from "./ThreadAudioTab";
import { ThreadAttachmentsTab } from "./ThreadAttachmentsTab";
import { ThreadAgentTab } from "./ThreadAgentTab";
import { combinedSectionKind } from "@/features/war-room/components/room/threadKind";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectThreadAnchorType } from "@/features/war-room/redux/selectors";
import { cn } from "@/lib/utils";
import type { ThreadTab } from "@/features/war-room/types";

import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

export function ThreadTabContent({
  tab,
  threadId,
  sessionId,
  threadLayout = "stage",
}: {
  tab: ThreadTab;
  threadId: string;
  sessionId: string;
  /** Grid gallery tiles are tight; stage is the hero pane. */
  threadLayout?: "grid" | "stage";
}) {
  const compact = threadLayout === "grid";

  useEffect(() => {
    if (tab !== "agent" || threadLayout !== "stage") return;
    traceWarRoomRenderPath(
      6,
      "ThreadTabContent.tsx",
      "routing to ThreadAgentTab (stage)",
      {
        threadId,
        sessionId,
      },
    );
  }, [tab, threadLayout, threadId, sessionId]);

  switch (tab) {
    case "task":
      return <ThreadTaskTab threadId={threadId} compact={compact} />;
    case "notes":
      return <ThreadNotesTab threadId={threadId} sessionId={sessionId} />;
    case "audio":
      return <ThreadAudioTab threadId={threadId} compact={compact} />;
    case "files":
      return <ThreadAttachmentsTab threadId={threadId} />;
    case "agent":
      // Deliberately NOT part of the combined "All" view — the agent panel
      // (conversation + voice + co-edited working document) is too rich for a
      // stacked section. It lives only as its own dedicated tab.
      return <ThreadAgentTab threadId={threadId} compact={compact} />;
    case "combined":
      return <CombinedAllView threadId={threadId} sessionId={sessionId} />;
  }
}

function CombinedAllView({
  threadId,
  sessionId,
}: {
  threadId: string;
  sessionId: string;
}) {
  const anchorType = useAppSelector((s) => selectThreadAnchorType(threadId)(s));

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <CombinedSection kind="task" anchorType={anchorType}>
        <ThreadTaskTab threadId={threadId} compact />
      </CombinedSection>
      <CombinedSection kind="notes" anchorType={anchorType}>
        <ThreadNotesTab threadId={threadId} sessionId={sessionId} compact />
      </CombinedSection>
      <CombinedSection kind="audio" anchorType={anchorType}>
        <ThreadAudioTab threadId={threadId} compact />
      </CombinedSection>
      <CombinedSection kind="files" anchorType={anchorType} last>
        <ThreadAttachmentsTab threadId={threadId} compact />
      </CombinedSection>
    </div>
  );
}

function CombinedSection({
  kind,
  anchorType,
  children,
  last,
}: {
  kind: "task" | "notes" | "audio" | "files";
  anchorType: import("@/features/war-room/types").ThreadAnchorType;
  children: React.ReactNode;
  last?: boolean;
}) {
  const k = combinedSectionKind(kind, anchorType);
  return (
    <section className={cn(!last && "border-b border-border/50")}>
      {/* Border on the content box (not a sibling column) so the spine always
          matches the full section height — header chrome + CleanupPad body. */}
      <div
        className={cn("flex min-w-0 flex-col border-l-[3px]", k.sectionBorder)}
      >
        <div aria-hidden className={cn("h-0.5 shrink-0", k.rail)} />
        <div className="flex h-64 min-h-0 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </section>
  );
}
