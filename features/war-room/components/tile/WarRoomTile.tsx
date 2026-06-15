"use client";

// features/war-room/components/tile/WarRoomTile.tsx
//
// The tabbed tile shell: Task / Notes / Audio / All, with pin/hide controls.
// Wave 2 renders minimal placeholder bodies so layout, tabs, and pin/hide are
// testable; Wave 3 wires real task/notes/audio content into each tab.

import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";
import { useOpenTranscriptStudioWindow } from "@/features/overlays/openers/transcriptStudioWindow";
import {
  selectActiveAudioSessionId,
  selectTileById,
} from "@/features/war-room/redux/selectors";
import {
  deleteTile,
  renameTile,
  setTileActiveTabPersisted,
  toggleTileHide,
  toggleTilePin,
} from "@/features/war-room/redux/thunks";
import type { TileTab } from "@/features/war-room/types";
import { TileFrame } from "../shared/TileFrame";
import { TileTabBar } from "./TileTabBar";
import { TileNotesTab } from "./TileNotesTab";
import { TileTaskTab } from "./TileTaskTab";
import { TileAudioTab } from "./TileAudioTab";
import { TileContextOverride } from "./TileContextOverride";

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
  const audioSessionId = useAppSelector(selectActiveAudioSessionId(tileId));
  const router = useRouter();
  const openNotes = useOpenNotesWindow();
  const openStudio = useOpenTranscriptStudioWindow();
  if (!tile) return null;

  const activeTab = (tile.active_tab as TileTab) ?? "task";
  const title = tile.title?.trim() || "Untitled tile";

  // Expand the active tab into its full UI.
  function handleExpand() {
    if (!tile) return;
    switch (activeTab) {
      case "notes":
        if (tile.note_id) openNotes({ singleNoteId: tile.note_id });
        break;
      case "audio":
        if (audioSessionId) openStudio({ activeSessionId: audioSessionId });
        break;
      case "task":
      case "combined":
        if (tile.task_id) router.push(`/tasks/${tile.task_id}`);
        else if (tile.note_id) openNotes({ singleNoteId: tile.note_id });
        break;
    }
  }

  const canExpand =
    (activeTab === "notes" && !!tile.note_id) ||
    (activeTab === "audio" && !!audioSessionId) ||
    ((activeTab === "task" || activeTab === "combined") &&
      (!!tile.task_id || !!tile.note_id));

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
      onRename={(next) => dispatch(renameTile(tileId, next))}
      featured={featured}
      isPinned={tile.is_pinned}
      onTogglePin={() => dispatch(toggleTilePin(tileId, !tile.is_pinned))}
      onHide={() => dispatch(toggleTileHide(tileId, true))}
      onExpand={canExpand ? handleExpand : undefined}
      onDelete={handleDelete}
      contextSlot={<TileContextOverride tileId={tileId} />}
      tabsSlot={
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
      return <TileAudioTab tileId={tileId} />;
    case "combined":
      return (
        <div className="h-full overflow-y-auto flex flex-col divide-y divide-border/60">
          <CombinedSection label="Task">
            <TileTaskTab tileId={tileId} sessionId={sessionId} />
          </CombinedSection>
          <CombinedSection label="Notes">
            <TileNotesTab tileId={tileId} sessionId={sessionId} compact />
          </CombinedSection>
          <CombinedSection label="Audio">
            <TileAudioTab tileId={tileId} />
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

