"use client";

// features/war-room/components/room/StageThread.tsx
//
// The hero focus pane: the ONE thread the user is driving right now. Full
// height, a rich two-row header (identity + live status + metric chips, then the
// labeled view switcher), then the real tab body fills everything below. This is
// "your place" — the thing the rail snaps threads into. It carries full working
// state, so resuming is instant and lossless. Honors the room-wide instrument
// projector (shows the projected tab without mutating the saved one) and wears
// the kind accent rail like every other tile.

import { useEffect } from "react";
import { Maximize2, Pin } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectThreadAnchorType,
  selectThreadPickerOption,
} from "@/features/war-room/redux/selectors";
import { setThreadActiveTabPersisted } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { EditableTitle } from "../shared/EditableTitle";
import { ThreadContextOverride } from "../thread/ThreadContextOverride";
import { ThreadTabBar } from "../thread/ThreadTabBar";
import { ThreadProjectMarker } from "../thread/ThreadProjectMarker";
import { ThreadTabContent } from "../thread/ThreadTabContent";
import { ThreadMetricChips } from "../thread/ThreadMetricChips";
import { ThreadOptionsMenu } from "../thread/ThreadOptionsMenu";
import { ThreadCopyForAiButton } from "../shared/ThreadCopyForAiButton";
import { PulseGlyph } from "../thread/PulseGlyph";
import { useThreadPulse } from "@/features/war-room/hooks/useThreadPulse";
import { useThreadActions } from "@/features/war-room/hooks/useThreadActions";
import { useThreadMetrics } from "@/features/war-room/hooks/useThreadMetrics";
import { useRoomView } from "./roomViewContext";
import { dynamicTabKind } from "./threadKind";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

export function StageThread({
  threadId,
  sessionId,
}: {
  threadId: string;
  sessionId: string;
}) {
  const dispatch = useAppDispatch();
  const pulse = useThreadPulse(threadId);
  const metrics = useThreadMetrics(threadId);
  const actions = useThreadActions(threadId, sessionId);
  const { projectedTab } = useRoomView();
  const flavor = useAppSelector((s) => selectThreadPickerOption(threadId)(s));
  const anchorType = useAppSelector((s) => selectThreadAnchorType(threadId)(s));
  if (!actions) return null;

  const shownTab = projectedTab ?? actions.activeTab;
  const kind = dynamicTabKind(shownTab, anchorType);

  useEffect(() => {
    traceWarRoomRenderPath(4, "StageThread.tsx", "Stage tile render", {
      threadId,
      sessionId,
      activeTab: shownTab,
    });
    if (shownTab === "agent") {
      traceWarRoomRenderPath(5, "StageThread.tsx", "Agent tab selected", {
        threadId,
      });
    }
  }, [threadId, sessionId, shownTab]);

  return (
    <div
      className={cn(
        "@container relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-[var(--elevation-2)]",
        shownTab === "combined"
          ? "border-l-[3px] border-l-border/70"
          : cn("border-l-[3px]", kind.sectionBorder),
      )}
    >
      {/* Identity row */}
      <div className="shrink-0 flex items-center gap-2.5 pl-4 pr-3.5 pt-3 pb-2">
        <span className="shrink-0">
          <PulseGlyph pulse={pulse} size={26} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {actions.isPinned ? (
              <Pin className="size-3.5 shrink-0 text-primary fill-primary/20" />
            ) : null}
            <EditableTitle
              value={actions.title}
              onSave={actions.rename}
              placeholder="Untitled thread"
              className="text-[15px] font-semibold"
              inputClassName="text-[15px] font-semibold"
            />
            {flavor === "project" ? (
              <ThreadProjectMarker threadId={threadId} size="md" />
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span>{pulse.headline}</span>
            <span className="hidden @sm:block">
              <ThreadMetricChips m={metrics} />
            </span>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1">
          <ThreadCopyForAiButton threadId={threadId} />
          <ThreadContextOverride threadId={threadId} />
          {actions.canExpand ? (
            <button
              type="button"
              onClick={actions.expand}
              title="Open the full view"
              className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Maximize2 className="size-4" />
            </button>
          ) : null}
          <ThreadOptionsMenu
            actions={actions}
            threadId={threadId}
            isStaged
            size="md"
          />
        </div>
      </div>

      {/* View switcher row */}
      <div className="shrink-0 pl-4 pr-3.5 pb-2.5">
        <ThreadTabBar
          active={shownTab}
          anchorType={anchorType}
          onChange={(tab) =>
            dispatch(setThreadActiveTabPersisted(threadId, tab))
          }
          withLabels
          size="md"
        />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 border-t border-border/60 bg-card">
        <ThreadTabContent
          tab={shownTab}
          threadId={threadId}
          sessionId={sessionId}
          threadLayout="stage"
        />
      </div>
    </div>
  );
}
