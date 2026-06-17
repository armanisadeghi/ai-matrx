"use client";

// features/war-room/components/tile/TileTabContent.tsx
//
// Renders the REAL tab bodies (TileTaskTab / TileNotesTab / TileAudioTab) for a
// tile. These components self-manage their data from Redux, so we just place
// them — the single source of body composition shared by the Grid tile and the
// Stage tile. The "All" view is one quiet single-scroll column with full-height
// kind-colored section rails + matching tint across each block (header + body) —
// no nested chrome, no double-layered editors — the combined view the busy
// multitasker scans top-to-bottom; notes render in their single-layer `compact`
// form there.

import { TileTaskTab } from "./TileTaskTab";
import { TileNotesTab } from "./TileNotesTab";
import { TileAudioTab } from "./TileAudioTab";
import { TileAttachmentsTab } from "./TileAttachmentsTab";
import { TileAgentTab } from "./TileAgentTab";
import { tileKindOf } from "@/features/war-room/components/room/tileKind";
import { cn } from "@/lib/utils";
import type { TileTab } from "@/features/war-room/types";

export function TileTabContent({
  tab,
  tileId,
  sessionId,
}: {
  tab: TileTab;
  tileId: string;
  sessionId: string;
}) {
  switch (tab) {
    case "task":
      return <TileTaskTab tileId={tileId} />;
    case "notes":
      return <TileNotesTab tileId={tileId} sessionId={sessionId} />;
    case "audio":
      return <TileAudioTab tileId={tileId} />;
    case "files":
      return <TileAttachmentsTab tileId={tileId} />;
    case "agent":
      // Deliberately NOT part of the combined "All" view — the agent panel
      // (conversation + voice + co-edited working document) is too rich for a
      // stacked section. It lives only as its own dedicated tab.
      return <TileAgentTab tileId={tileId} />;
    case "combined":
      return (
        <div className="h-full overflow-y-auto scrollbar-thin">
          <CombinedSection kind="task">
            <TileTaskTab tileId={tileId} />
          </CombinedSection>
          <CombinedSection kind="notes">
            <TileNotesTab tileId={tileId} sessionId={sessionId} compact />
          </CombinedSection>
          <CombinedSection kind="audio">
            <TileAudioTab tileId={tileId} />
          </CombinedSection>
          <CombinedSection kind="files" last>
            <TileAttachmentsTab tileId={tileId} compact />
          </CombinedSection>
        </div>
      );
  }
}

function CombinedSection({
  kind,
  children,
  last,
}: {
  kind: TileTab;
  children: React.ReactNode;
  last?: boolean;
}) {
  const k = tileKindOf(kind);
  return (
    <section
      className={cn("relative", k.bg, !last && "border-b border-border/50")}
    >
      {/* Full-height kind rail — spans the sticky label row and the body so each
          section reads as one bounded block, not a tick beside the header only. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-[3px]",
          k.rail,
        )}
      />
      <div
        className={cn(
          "sticky top-0 z-10 flex items-center gap-1.5 pl-3.5 pr-3 h-7 bg-inherit backdrop-blur-sm",
        )}
      >
        <k.Icon className={cn("size-3", k.text)} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {k.label}
        </span>
      </div>
      {/* Definite height + clip: the embedded editors are h-full/absolute, so a
          bounded box lets them resolve their height and prevents any content
          (or absolute layers) from bleeding into the section below. Each body
          scrolls internally for more. */}
      <div className="h-64 overflow-hidden pl-3.5">{children}</div>
    </section>
  );
}
