"use client";

// features/vision-interview/components/VisionInterviewRoom.tsx
//
// The v2 room surface, re-centered on the CONVERSATION: RouteHeader chrome,
// the full-width stage rail (click-to-jump via goto_stage), then a two-pane
// resizable body — the transcript + composer own the wide center; the living
// document moves to the RIGHT pane with the questions/holes instrument panel
// as a sibling tab. Body wrapper is `h-full overflow-hidden` (core-route
// rules — never a header-height calc).
//
// Mobile: the panes stack via the simple pane switcher (Room · Document ·
// Questions); the stage rail renders on every size.

import { useState } from "react";
import { Panel } from "react-resizable-panels";
import { FileText, ListTodo, MessagesSquare } from "lucide-react";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOpenQuestionCount } from "../redux/vision-interview.slice";
import { useInterviewRoom } from "../hooks/useInterviewRoom";
import { useInterviewRun } from "../hooks/useInterviewRun";
import type { InterviewStage } from "../types";
import { DocumentPane } from "./DocumentPane";
import { OpenQuestionsPanel } from "./OpenQuestionsPanel";
import { RoomHeader } from "./RoomHeader";
import { StageRail } from "./StageRail";
import { TranscriptPane } from "./TranscriptPane";

// v2 cookie — the retired 3-pane layout persisted under
// "vision-interview-room-layout"; a fresh name keeps stale sizes from
// misshaping the new 2-pane group.
const LAYOUT_COOKIE = "vision-interview-room-layout-v2";

type MobilePane = "room" | "document" | "questions";
type SideTab = "document" | "questions";

/** Right pane: living document + questions/holes as sibling tabs. */
function SidePane() {
  const [tab, setTab] = useState<SideTab>("document");
  const openQuestions = useAppSelector(selectOpenQuestionCount);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        {(
          [
            ["document", "Document", FileText],
            ["questions", "Questions", ListTodo],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
              tab === key
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
            {key === "questions" && openQuestions > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                {openQuestions}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "document" ? <DocumentPane /> : <OpenQuestionsPanel />}
      </div>
    </div>
  );
}

export function VisionInterviewRoom({ sessionId }: { sessionId: string }) {
  useInterviewRoom(sessionId);
  const { start, resume } = useInterviewRun(sessionId);
  const isMobile = useIsMobile();
  const [mobilePane, setMobilePane] = useState<MobilePane>("room");

  const advanceStage = async () => {
    await resume({ message: "", advanceStage: true });
  };

  const gotoStage = async (stage: InterviewStage) => {
    await resume({ message: "", gotoStage: stage });
  };

  return (
    <>
      <RoomHeader onAdvanceStage={advanceStage} />
      <div
        className="matrx-touch-targets flex h-full flex-col overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <StageRail onGotoStage={gotoStage} />
        {isMobile ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-1 border-b border-border px-2 py-1">
              {(
                [
                  ["room", "Room", MessagesSquare],
                  ["document", "Document", FileText],
                  ["questions", "Questions", ListTodo],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobilePane(key)}
                  className={cn(
                    "inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 text-sm",
                    mobilePane === key
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {mobilePane === "room" ? (
                <TranscriptPane sessionId={sessionId} onResume={resume} onStart={start} />
              ) : mobilePane === "document" ? (
                <DocumentPane />
              ) : (
                <OpenQuestionsPanel />
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <ClientGroup
              id="vision-interview-room-v2"
              cookieName={LAYOUT_COOKIE}
              orientation="horizontal"
              className="h-full w-full"
            >
              <Panel id="conversation" defaultSize="62%" minSize="40%">
                <div className="h-full overflow-hidden border-r border-border">
                  <TranscriptPane
                    sessionId={sessionId}
                    onResume={resume}
                    onStart={start}
                  />
                </div>
              </Panel>
              <Handle />
              <Panel id="side" defaultSize="38%" minSize="22%">
                <div className="h-full overflow-hidden">
                  <SidePane />
                </div>
              </Panel>
            </ClientGroup>
          </div>
        )}
      </div>
    </>
  );
}
