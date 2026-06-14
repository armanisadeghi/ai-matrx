"use client";

// features/war-room/components/tile/WarRoomTile.tsx
//
// The tabbed tile shell: Task / Notes / Audio / All, with pin/hide controls.
// Wave 2 renders minimal placeholder bodies so layout, tabs, and pin/hide are
// testable; Wave 3 wires real task/notes/audio content into each tab.

import { ListChecks, Mic } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { selectTileById } from "@/features/war-room/redux/selectors";
import {
  deleteTile,
  setTileActiveTabPersisted,
  toggleTileHide,
  toggleTilePin,
} from "@/features/war-room/redux/thunks";
import type { TileTab } from "@/features/war-room/types";
import { TileFrame } from "../shared/TileFrame";
import { TileTabBar } from "./TileTabBar";
import { TileNotesTab } from "./TileNotesTab";
import { TileTaskTab } from "./TileTaskTab";

export function WarRoomTile({
  tileId,
  sessionId,
  featured,
}: {
  tileId: string;
  sessionId: string;
  featured?: boolean;
}) {
  const dispatch = useAppDispatch();
  const tile = useAppSelector(selectTileById(tileId));
  if (!tile) return null;

  const activeTab = (tile.active_tab as TileTab) ?? "task";
  const title = tile.title?.trim() || "Untitled tile";

  async function handleDelete() {
    const ok = await confirm({
      title: "Remove this tile?",
      description:
        "The tile is removed from this War Room. Any linked task or note stays safe in its own feature.",
      variant: "destructive",
      confirmLabel: "Remove",
    });
    if (ok) dispatch(deleteTile(tileId, sessionId));
  }

  return (
    <TileFrame
      title={title}
      featured={featured}
      isPinned={tile.is_pinned}
      onTogglePin={() => dispatch(toggleTilePin(tileId, !tile.is_pinned))}
      onHide={() => dispatch(toggleTileHide(tileId, true))}
      onDelete={handleDelete}
      tabBar={
        <TileTabBar
          active={activeTab}
          onChange={(tab) => dispatch(setTileActiveTabPersisted(tileId, tab))}
        />
      }
    >
      <TileTabContent tab={activeTab} tileId={tileId} sessionId={sessionId} />
    </TileFrame>
  );
}

function TileTabContent({
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
      return <TileTaskTab tileId={tileId} sessionId={sessionId} />;
    case "notes":
      return <TileNotesTab tileId={tileId} sessionId={sessionId} />;
    case "audio":
      return (
        <TabPlaceholder
          Icon={Mic}
          label="Audio"
          hint="Record and transcribe into this tile"
        />
      );
    case "combined":
      return (
        <div className="h-full overflow-y-auto flex flex-col divide-y divide-border/60">
          <CombinedSection label="Task">
            <TileTaskTab tileId={tileId} sessionId={sessionId} />
          </CombinedSection>
          <CombinedSection label="Notes">
            <TileNotesTab tileId={tileId} sessionId={sessionId} />
          </CombinedSection>
          <CombinedSection label="Audio">
            <TabPlaceholder
              Icon={Mic}
              label="Audio"
              hint="Record and transcribe into this tile"
            />
          </CombinedSection>
        </div>
      );
  }
}

function CombinedSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="shrink-0">
      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30">
        {label}
      </div>
      <div className="min-h-44">{children}</div>
    </section>
  );
}

function TabPlaceholder({
  Icon,
  label,
  hint,
}: {
  Icon: typeof ListChecks;
  label: string;
  hint: string;
}) {
  return (
    <div className="h-full min-h-32 grid place-items-center text-center px-3">
      <div className="text-muted-foreground">
        <Icon className="size-6 mx-auto mb-1.5 opacity-50" />
        <p className="text-xs font-medium text-foreground/80">{label}</p>
        <p className="text-[11px] mt-0.5 opacity-70">{hint}</p>
      </div>
    </div>
  );
}
