"use client";

// features/war-room/components/tile/TileTabContent.tsx
//
// Renders the REAL tab bodies (TileTaskTab / TileNotesTab / TileAudioTab) for a
// tile. These components self-manage their data from Redux, so we just place
// them — the single source of body composition shared by the Grid tile and the
// Stage tile. The "All" view is one quiet single-scroll column: each block gets
// a thin top accent + full-height left rail only (no label row, no interior
// tint) so we never stack a second header on chrome the tab bodies already own.

import { useEffect } from "react";
import { TileTaskTab } from "./TileTaskTab";
import { TileNotesTab } from "./TileNotesTab";
import { TileAudioTab } from "./TileAudioTab";
import { TileAttachmentsTab } from "./TileAttachmentsTab";
import { TileAgentTab } from "./TileAgentTab";
import { combinedSectionKind } from "@/features/war-room/components/room/tileKind";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTileFlavor } from "@/features/war-room/redux/selectors";
import { cn } from "@/lib/utils";
import type { TileFlavor, TileTab } from "@/features/war-room/types";

import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

export function TileTabContent({
  tab,
  tileId,
  sessionId,
  tileLayout = "stage",
}: {
  tab: TileTab;
  tileId: string;
  sessionId: string;
  /** Grid gallery tiles are tight; stage is the hero pane. */
  tileLayout?: "grid" | "stage";
}) {
  const compact = tileLayout === "grid";

  useEffect(() => {
    if (tab !== "agent" || tileLayout !== "stage") return;
    traceWarRoomRenderPath(
      6,
      "TileTabContent.tsx",
      "routing to TileAgentTab (stage)",
      {
        tileId,
        sessionId,
      },
    );
  }, [tab, tileLayout, tileId, sessionId]);

  switch (tab) {
    case "task":
      return <TileTaskTab tileId={tileId} compact={compact} />;
    case "notes":
      return <TileNotesTab tileId={tileId} sessionId={sessionId} />;
    case "audio":
      return <TileAudioTab tileId={tileId} compact={compact} />;
    case "files":
      return <TileAttachmentsTab tileId={tileId} />;
    case "agent":
      // Deliberately NOT part of the combined "All" view — the agent panel
      // (conversation + voice + co-edited working document) is too rich for a
      // stacked section. It lives only as its own dedicated tab.
      return <TileAgentTab tileId={tileId} compact={compact} />;
    case "combined":
      return <CombinedAllView tileId={tileId} sessionId={sessionId} />;
  }
}

function CombinedAllView({
  tileId,
  sessionId,
}: {
  tileId: string;
  sessionId: string;
}) {
  const flavor = useAppSelector((s) => selectTileFlavor(tileId)(s));

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <CombinedSection kind="task" flavor={flavor}>
        <TileTaskTab tileId={tileId} compact />
      </CombinedSection>
      <CombinedSection kind="notes" flavor={flavor}>
        <TileNotesTab tileId={tileId} sessionId={sessionId} compact />
      </CombinedSection>
      <CombinedSection kind="audio" flavor={flavor}>
        <TileAudioTab tileId={tileId} compact />
      </CombinedSection>
      <CombinedSection kind="files" flavor={flavor} last>
        <TileAttachmentsTab tileId={tileId} compact />
      </CombinedSection>
    </div>
  );
}

function CombinedSection({
  kind,
  flavor,
  children,
  last,
}: {
  kind: "task" | "notes" | "audio" | "files";
  flavor: TileFlavor;
  children: React.ReactNode;
  last?: boolean;
}) {
  const k = combinedSectionKind(kind, flavor);
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
