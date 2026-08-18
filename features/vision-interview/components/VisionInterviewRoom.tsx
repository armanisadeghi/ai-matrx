"use client";

// features/vision-interview/components/VisionInterviewRoom.tsx
//
// The v3 room — THREE panels (Arman, 2026-08-18):
//
//   LEFT  (~22%)  <QuestionsPanel />   the Scribe's questions, answered in place
//   CENTRE(~50%)  <RoomChatPane />     stage tabs + THE CANONICAL CHAT
//   RIGHT (~28%)  <ExpertFeedPanel />  every expert's output, live
//
// One stage tab is one expert is one ordinary agent conversation (their
// `role_bindings` entry on the session row), so the centre is `ChatRoomClient`
// — never a bespoke transcript. The v2 transcript/composer/stage-rail body is
// gone with it.
//
// Body wrapper is `h-full overflow-hidden` (core-route rules — never a
// header-height calc); mobile stacks the three panels behind a pane switcher.

import { useEffect, useRef, useState } from "react";
import { Panel } from "react-resizable-panels";
import { ListTodo, MessagesSquare, Radio } from "lucide-react";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  activeRoleTabDefaulted,
  selectOpenQuestionCount,
  selectRoomHydrated,
  selectRoomSession,
} from "../redux/vision-interview.slice";
import { useInterviewRoom } from "../hooks/useInterviewRoom";
import { useInterviewRun } from "../hooks/useInterviewRun";
import { useTurnAudioAttachment } from "../hooks/useTurnAudioAttachment";
import type { InterviewStage } from "../types";
import { ExpertFeedPanel } from "./ExpertFeedPanel";
import { QuestionsPanel } from "./QuestionsPanel";
import { RoomChatPane } from "./RoomChatPane";
import { RoomHeader } from "./RoomHeader";

// v3 cookie — the v2 two-pane group persisted under
// "vision-interview-room-layout-v2"; a fresh name keeps stale sizes from
// misshaping the three-panel group.
const LAYOUT_COOKIE = "vision-interview-room-layout-v3";

type MobilePane = "questions" | "room" | "feed";

export function VisionInterviewRoom({ sessionId }: { sessionId: string }) {
  const { retryRoles } = useInterviewRoom(sessionId);
  // Stamps dictation audio (already durably saved) onto the human turn the
  // server creates — v2 §13.1 raw-audio capture.
  useTurnAudioAttachment(sessionId);
  const { start, resume } = useInterviewRun(sessionId);
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const [mobilePane, setMobilePane] = useState<MobilePane>("room");
  const openQuestions = useAppSelector(selectOpenQuestionCount);
  const hydrated = useAppSelector(selectRoomHydrated);
  const session = useAppSelector(selectRoomSession);

  // Open on the expert whose stage the session is actually in — ONCE, so a
  // tab the Expert chose is never yanked out from under them.
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (defaultedRef.current || !hydrated || !session) return;
    defaultedRef.current = true;
    dispatch(activeRoleTabDefaulted({ stage: session.stage }));
  }, [dispatch, hydrated, session]);

  const advanceStage = async () => {
    await resume({ message: "", advanceStage: true });
  };

  const gotoStage = (stage: InterviewStage) => {
    void resume({ message: "", gotoStage: stage });
  };

  // The guided run's ONE door is the header's Finish control: in v3 the
  // person holds the conversation themselves, so the run exists only to reach
  // `interview.finalize` (the Vision + Requirements documents). Both halves of
  // that journey live here — start the run, then tell the waiting run the
  // interview is done. See FinishInterviewDialog.
  const startInterview = () => start();
  const finishInterview = () => resume({ message: "", done: true });

  return (
    <>
      <RoomHeader
        onAdvanceStage={advanceStage}
        onStartRun={startInterview}
        onFinishRun={finishInterview}
      />
      <div
        className="matrx-touch-targets flex h-full flex-col overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        {isMobile ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
              {(
                [
                  ["questions", "Questions", ListTodo],
                  ["room", "Room", MessagesSquare],
                  ["feed", "Feed", Radio],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMobilePane(key)}
                  className={cn(
                    "inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm",
                    mobilePane === key
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                  {key === "questions" && openQuestions > 0 && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">
                      {openQuestions}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {mobilePane === "questions" ? (
                <QuestionsPanel />
              ) : mobilePane === "feed" ? (
                <ExpertFeedPanel />
              ) : (
                <RoomChatPane
                  onGotoStage={gotoStage}
                  onRetryRoles={retryRoles}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <ClientGroup
              id="vision-interview-room-v3"
              cookieName={LAYOUT_COOKIE}
              orientation="horizontal"
              className="h-full w-full"
            >
              <Panel id="questions" defaultSize="22%" minSize="14%">
                <div className="h-full overflow-hidden border-r border-border">
                  <QuestionsPanel />
                </div>
              </Panel>
              <Handle />
              <Panel id="room" defaultSize="50%" minSize="32%">
                <div className="h-full overflow-hidden">
                  <RoomChatPane
                    onGotoStage={gotoStage}
                    onRetryRoles={retryRoles}
                  />
                </div>
              </Panel>
              <Handle />
              <Panel id="feed" defaultSize="28%" minSize="16%">
                <div className="h-full overflow-hidden border-l border-border">
                  <ExpertFeedPanel />
                </div>
              </Panel>
            </ClientGroup>
          </div>
        )}
      </div>
    </>
  );
}
