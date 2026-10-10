"use client";

// features/war-room/components/room/StageThread.tsx
//
// The hero focus pane: the ONE thread the user is driving right now. Full
// height with one compact row — back, title, tab selector, context, overflow —
// then the real tab body fills everything below. It carries full working state,
// so resuming is instant and lossless. Honors the room-wide instrument
// projector (shows the projected tab without mutating the saved one).

import { useEffect } from "react";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectThreadAnchorType,
  selectThreadPickerOption,
} from "@/features/war-room/redux/selectors";
import { setThreadActiveTabPersisted } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { EditableTitle } from "../shared/EditableTitle";
import { ThreadContextOverride } from "../thread/ThreadContextOverride";
import { ThreadTabSelect } from "../thread/ThreadTabSelect";
import { ThreadProjectMarker } from "../thread/ThreadProjectMarker";
import { ThreadTabContent } from "../thread/ThreadTabContent";
import { ThreadOptionsMenu } from "../thread/ThreadOptionsMenu";
import { useThreadActions } from "@/features/war-room/hooks/useThreadActions";
import { useRoomView } from "./roomViewContext";
import { dynamicTabKind } from "./threadKind";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

export function StageThread({
  threadId,
  sessionId,
  onBack,
}: {
  threadId: string;
  sessionId: string;
  /** Returns from the focused thread to the War Room thread list. */
  onBack?: () => void;
}) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const actions = useThreadActions(threadId, sessionId);
  const { projectedTab } = useRoomView();
  const flavor = useAppSelector((s) => selectThreadPickerOption(threadId)(s));
  const anchorType = useAppSelector((s) => selectThreadAnchorType(threadId)(s));

  const shownTab = projectedTab ?? actions?.activeTab ?? "task";

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

  if (!actions) return null;

  const kind = dynamicTabKind(shownTab, anchorType);

  // The thread's identity controls. On the Notes tab they fold into the
  // note's ONE top row (a second header above it was duplicated chrome); on
  // every other tab they are the row above the body.
  const back = onBack ? (
    <span>
      <ChevronLeftTapButton
        variant="transparent"
        onClick={onBack}
        ariaLabel="Back to threads"
        tooltip={false}
      />
    </span>
  ) : null;
  const tabSelect = (
    <div className="shrink-0">
      <ThreadTabSelect
        threadId={threadId}
        active={shownTab}
        anchorType={anchorType}
        onChange={(tab) => dispatch(setThreadActiveTabPersisted(threadId, tab))}
      />
    </div>
  );
  const endControls = (
    <div className="shrink-0 flex items-center gap-0">
      <ThreadContextOverride threadId={threadId} />
      <ThreadOptionsMenu
        actions={actions}
        threadId={threadId}
        isStaged
        size="md"
      />
    </div>
  );
  // A phone cannot hold the thread controls AND the note's modes in one row,
  // so only there the thread header stays its own (compact) row.
  const foldIntoNote = shownTab === "notes" && !isMobile;
  const titleField = (
    <EditableTitle
      value={actions.title}
      onSave={actions.rename}
      placeholder="Untitled thread"
      className={foldIntoNote ? "block max-w-full text-sm font-semibold" : "text-[15px] font-semibold"}
      inputClassName={foldIntoNote ? "text-sm font-semibold" : "text-[15px] font-semibold"}
    />
  );

  return (
    <div
      className={cn(
        "@container relative flex h-full min-h-0 flex-col overflow-hidden bg-card pt-[var(--shell-header-h)]",
        shownTab === "combined"
          ? "border-l-[3px] border-l-border/70"
          : cn("border-l-[3px]", kind.sectionBorder),
      )}
    >
      {foldIntoNote ? null : (
        <div className="shrink-0 flex h-11 items-center gap-0 pl-0 pr-1">
          {back}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {titleField}
              {flavor === "project" ? (
                <ThreadProjectMarker
                  threadId={threadId}
                  size="md"
                  className="hidden @2xl:inline-flex"
                />
              ) : null}
            </div>
          </div>
          {tabSelect}
          {endControls}
        </div>
      )}

      {/* Body */}
      <div
        className={cn(
          "flex-1 min-h-0 bg-card",
          foldIntoNote ? "" : "border-t border-border/60",
        )}
      >
        <ThreadTabContent
          tab={shownTab}
          threadId={threadId}
          sessionId={sessionId}
          threadLayout="stage"
          noteLeadingSlot={
            !foldIntoNote ? undefined : <div className="flex shrink-0 items-center gap-0">
              {back}
              <div className="mx-1 hidden min-w-0 max-w-[8rem] shrink @[60rem]:block">
                {titleField}
              </div>
              {tabSelect}
            </div>
          }
          noteTrailingSlot={foldIntoNote ? endControls : undefined}
        />
      </div>
    </div>
  );
}
