"use client";

// features/vision-interview/components/VisionInterviewRoom.tsx
//
// The room surface: RouteHeader chrome + a three-pane resizable body
// (transcript · living document · open questions/holes), per the
// transcript-studio / content-plan layout precedent. Body wrapper is
// `h-full overflow-hidden` (core-route rules — never a header-height calc).
//
// Mobile (v1): the panes stack into a single scrollable column via a simple
// pane switcher; full Drawer treatment is a documented deferral (FEATURE.md).

import { useState } from "react";
import { Panel } from "react-resizable-panels";
import { FileText, ListTodo, MessagesSquare } from "lucide-react";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useInterviewRoom } from "../hooks/useInterviewRoom";
import { useInterviewRun } from "../hooks/useInterviewRun";
import { DocumentPane } from "./DocumentPane";
import { OpenQuestionsPanel } from "./OpenQuestionsPanel";
import { RoomHeader } from "./RoomHeader";
import { TranscriptPane } from "./TranscriptPane";

const LAYOUT_COOKIE = "vision-interview-room-layout";

type MobilePane = "room" | "document" | "questions";

export function VisionInterviewRoom({ sessionId }: { sessionId: string }) {
  useInterviewRoom(sessionId);
  const { start, resume } = useInterviewRun(sessionId);
  const isMobile = useIsMobile();
  const [mobilePane, setMobilePane] = useState<MobilePane>("room");

  const advanceStage = async () => {
    await resume({ message: "", advanceStage: true });
  };

  return (
    <>
      <RoomHeader onAdvanceStage={advanceStage} />
      <div
        className="h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        {isMobile ? (
          <div className="flex h-full min-h-0 flex-col">
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
          <ClientGroup
            id="vision-interview-room"
            cookieName={LAYOUT_COOKIE}
            orientation="horizontal"
            className="h-full w-full"
          >
            <Panel id="transcript" defaultSize="40%" minSize="25%">
              <div className="h-full overflow-hidden border-r border-border">
                <TranscriptPane sessionId={sessionId} onResume={resume} onStart={start} />
              </div>
            </Panel>
            <Handle />
            <Panel id="document" defaultSize="35%" minSize="20%">
              <div className="h-full overflow-hidden border-r border-border">
                <DocumentPane />
              </div>
            </Panel>
            <Handle />
            <Panel id="questions" defaultSize="25%" minSize="15%">
              <div className="h-full overflow-hidden">
                <OpenQuestionsPanel />
              </div>
            </Panel>
          </ClientGroup>
        )}
      </div>
    </>
  );
}
