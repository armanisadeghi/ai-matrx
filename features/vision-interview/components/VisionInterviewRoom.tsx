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
// header-height calc).
//
// ON A PHONE THIS ROOM USED TO BE UNUSABLE (jobs-bar-2026-09-16, item 19). It
// carried its OWN three-way pane switcher — a bespoke copy of a thing the
// platform already owns — and the switcher was the smaller half of the
// problem: the "Room" pane then spent a third of a 390px screen on six wrapped
// expert tabs before a single word of the conversation, with the document
// controls stranded as unlabeled icons in the gap beside them.
//
// It now uses `MobilePanelShell`, the same primitive every other multi-pane
// route on the platform uses (the code editor, the transcript studio, the RAG
// stores, agent connections…): the CONVERSATION is the whole phone column, and
// the questions and the expert feed are bottom drawers off one header control
// — which carries the open-question count, because a drawer you cannot see
// must still be able to say it is holding work for you.

import { useEffect, useRef } from "react";
import { Panel } from "react-resizable-panels";
import { ListTodo, PanelsTopLeft, Radio } from "lucide-react";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { MobilePanelShell } from "@/features/shell/components/header/templates/MobilePanelShell";
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

export function VisionInterviewRoom({ sessionId }: { sessionId: string }) {
  const { retryRoles } = useInterviewRoom(sessionId);
  // Stamps dictation audio (already durably saved) onto the human turn the
  // server creates — v2 §13.1 raw-audio capture.
  useTurnAudioAttachment(sessionId);
  const { resume, finish } = useInterviewRun(sessionId);
  const dispatch = useAppDispatch();
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
  // `interview.finalize` (the Vision + Requirements documents).
  //
  // Both halves of that journey — starting the run and telling it the
  // interview is over — now live behind ONE press inside `useInterviewRun`,
  // because a person who presses Finish has said what they want and should
  // not have to say it again in different words. See the comment on `finish`
  // and FinishInterviewDialog.
  const finishInterview = () => finish();

  const conversation = (
    <RoomChatPane
      onGotoStage={gotoStage}
      onRetryRoles={retryRoles}
      onAdvanceStage={advanceStage}
    />
  );

  return (
    <>
      <RoomHeader onAdvanceStage={advanceStage} onFinishRun={finishInterview} />
      <div
        className="matrx-touch-targets flex h-full flex-col overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <div className="min-h-0 w-full min-w-0 flex-1">
          <MobilePanelShell
            menuIcon={PanelsTopLeft}
            menuLabel="Questions and what the experts wrote"
            mainClassName="min-w-0 overflow-hidden"
            main={conversation}
            panels={[
              {
                id: "questions",
                label: "Questions for you",
                icon: ListTodo,
                badge: openQuestions,
                // Both panels own their scrolling and size themselves to their
                // container, so the drawer gives them a REAL height — dropped
                // into an auto-height sheet body an `h-full` panel collapses to
                // nothing.
                content: (
                  <div className="h-[68dvh] min-w-0">
                    <QuestionsPanel />
                  </div>
                ),
              },
              {
                id: "feed",
                label: "What the experts wrote",
                icon: Radio,
                content: (
                  <div className="h-[68dvh] min-w-0">
                    <ExpertFeedPanel />
                  </div>
                ),
              },
            ]}
            desktop={
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
                  <div className="h-full overflow-hidden">{conversation}</div>
                </Panel>
                <Handle />
                <Panel id="feed" defaultSize="28%" minSize="16%">
                  <div className="h-full overflow-hidden border-l border-border">
                    <ExpertFeedPanel />
                  </div>
                </Panel>
              </ClientGroup>
            }
          />
        </div>
      </div>
    </>
  );
}
