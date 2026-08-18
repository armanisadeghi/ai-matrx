"use client";

// features/vision-interview/components/RoomChatPane.tsx
//
// The CENTRE panel of the v3 room: stage tabs across the top, and beneath
// them THE CANONICAL CHAT for whichever expert is live.
//
// The load-bearing fact (v3 contract): `interview.session.role_bindings`
// already holds, per role, the agent the server bound and a conversation id
// that is stable per role, per session, across runs. So there is no bespoke
// chat to build — the tab mounts `ChatRoomClient` with that role's agentId +
// conversationId, exactly like /chat does. ONLY the active tab is mounted, so
// the execution system's one-conversation-per-surface assumption holds;
// switching tabs unmounts the old room and mounts the new one.
//
// The Scribe's living document (and, once finalized, the deliverables) stay
// reachable from this bar — the chat stays MOUNTED underneath while a
// document is on screen, so reading the document never interrupts a stream.

import { useEffect, useRef, useState } from "react";
import {
  BookOpenText,
  FileText,
  ListChecks,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { ChatRoomClient } from "@/features/agents/components/chat/ChatRoomClient";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  selectLastSubmittedText,
  selectSubmissionPhase,
  selectUserInputText,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  pendingAnswersCleared,
  selectActiveRoleTab,
  selectPendingAnswers,
  selectRoleBindings,
  selectRolesError,
  selectRolesPhase,
  selectRoomSession,
  selectRunPhase,
  type PendingAnswer,
  type RolesPhase,
} from "../redux/vision-interview.slice";
import { useObserveRoleTurns } from "../hooks/useObserveRoleTurns";
import {
  normalizeStage,
  ROLES,
  roleBinding,
  stageForRole,
  STAGES,
  type InterviewStage,
  type RoleKey,
} from "../types";
import { DeliverablePane } from "./DeliverablePane";
import { DocumentPane } from "./DocumentPane";
import { StageTabs } from "./StageTabs";

// ── The answer-append rule (v3 contract) ───────────────────────────────────
// Answers written in the left-hand questions panel ride the NEXT message the
// Expert sends, as an XML block both the speaking expert and the Scribe read.

const ANSWERS_OPEN = "<answered_questions>";
const ANSWERS_CLOSE = "</answered_questions>";
/** Strips a leading answers block (ours, or one the Expert edited). */
const LEADING_BLOCK_RE =
  /^\s*<answered_questions>[\s\S]*?<\/answered_questions>\s*/;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildAnsweredQuestionsBlock(answers: PendingAnswer[]): string {
  if (answers.length === 0) return "";
  const items = answers
    .map(
      (a) =>
        `  <item question_id="${escapeXml(a.questionId)}">\n` +
        `    <question>${escapeXml(a.questionText)}</question>\n` +
        `    <answer>${escapeXml(a.answerText)}</answer>\n` +
        `  </item>`,
    )
    .join("\n");
  return `${ANSWERS_OPEN}\n${items}\n${ANSWERS_CLOSE}\n\n`;
}

/**
 * THE SEAM. The canonical chat has no "transform the outgoing message" hook —
 * its send path (`smartExecute`) reads the composer draft straight out of
 * `instanceUserInput`. So the block is written INTO that draft through
 * `setUserInputText`, the same action the Expert's own keystrokes dispatch
 * (and the same one the `input_draft` surface write target uses). Nothing
 * bespoke, and the Expert can see exactly what rides their message.
 *
 * Answers are never lost: they live in the slice until the send is DURABLY
 * confirmed — `submissionPhase === "persisted"` means the server reserved the
 * user request. A failed send leaves the phase behind and both the block and
 * the pending answers stay put.
 */
function PendingAnswersRider({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const answers = useAppSelector(selectPendingAnswers);
  const phase = useAppSelector(selectSubmissionPhase(conversationId));
  const lastSubmitted = useAppSelector(selectLastSubmittedText(conversationId));
  const block = buildAnsweredQuestionsBlock(answers);

  // Keep the draft's answers block in step with the ledger.
  useEffect(() => {
    const text = selectUserInputText(conversationId)(store.getState());
    const rest = text.replace(LEADING_BLOCK_RE, "");
    const next = block ? `${block}${rest}` : rest;
    if (next !== text) dispatch(setUserInputText({ conversationId, text: next }));
  }, [block, conversationId, dispatch, store]);

  // The message carrying them is durably persisted → the ledger is spent.
  useEffect(() => {
    if (phase !== "persisted") return;
    if (!lastSubmitted.includes(ANSWERS_OPEN)) return;
    dispatch(pendingAnswersCleared());
  }, [phase, lastSubmitted, dispatch]);

  return null;
}

// ── Deliverables + document (kept reachable — never a dead end) ─────────────

type DocView = "document" | "vision" | "requirements" | "transcript";

interface DocTab {
  key: DocView;
  label: string;
  icon: LucideIcon;
  filename: string;
  content: string;
}

function useDocTabs(): { tabs: DocTab[]; finalizedAt: string | null } {
  const session = useAppSelector(selectRoomSession);
  const tabs: DocTab[] = [
    {
      key: "document",
      label: "Document",
      icon: FileText,
      filename: "document",
      content: session?.document ?? "",
    },
  ];
  if (session?.vision_document?.trim())
    tabs.push({
      key: "vision",
      label: "Vision",
      icon: BookOpenText,
      filename: "vision",
      content: session.vision_document,
    });
  if (session?.requirements_document?.trim())
    tabs.push({
      key: "requirements",
      label: "Requirements",
      icon: ListChecks,
      filename: "requirements",
      content: session.requirements_document,
    });
  if (session?.cleaned_transcript?.trim())
    tabs.push({
      key: "transcript",
      label: "Transcript",
      icon: ScrollText,
      filename: "transcript",
      content: session.cleaned_transcript,
    });
  return { tabs, finalizedAt: session?.finalized_at ?? null };
}

/**
 * The expert's room is not open yet. In v3 this is a genuine EDGE CASE — the
 * room resolves every role through `POST /roles` the moment it opens, for
 * every session, before the person can talk. Reaching this state means that
 * call has not landed yet (or is failing), so it says WHICH of those is true
 * and offers the way forward, never a spinner and never a dead tab.
 */
function ExpertNotJoined({
  roleName,
  roleDescription,
  stageLabel,
  rolesPhase,
  rolesError,
  onRetryRoles,
  onStart,
  starting,
}: {
  roleName: string;
  roleDescription: string;
  stageLabel: string;
  rolesPhase: RolesPhase;
  rolesError: string | null;
  onRetryRoles: () => void;
  onStart: () => void;
  starting: boolean;
}) {
  const failed = rolesPhase === "failed";
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold text-foreground">
          {failed
            ? `Opening ${roleName}'s room didn't work`
            : `Opening ${roleName}'s room…`}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{roleDescription}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {roleName} leads the {stageLabel} step. Every expert gets their own
          room in this interview, and everything they say stays there.
        </p>
        {failed ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              The room is still trying on its own — nothing you have written is
              lost. You can also try again right now.
            </p>
            {rolesError && (
              <p className="mt-2 break-words text-xs text-muted-foreground/80">
                {rolesError}
              </p>
            )}
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button variant="outline" onClick={onRetryRoles}>
                Try again
              </Button>
              <Button variant="ghost" onClick={onStart} disabled={starting}>
                {starting ? "Starting the interview…" : "Start the interview"}
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            One moment — the experts are taking their seats.
          </p>
        )}
      </div>
    </div>
  );
}

/** Mounted beside the chat: reports a finished exchange to the Scribe. */
function RoleTurnObserver({
  sessionId,
  role,
  conversationId,
}: {
  sessionId: string;
  role: RoleKey;
  conversationId: string;
}) {
  useObserveRoleTurns({ sessionId, role, conversationId });
  return null;
}

export function RoomChatPane({
  onStart,
  onGotoStage,
  onRetryRoles,
}: {
  onStart: () => void;
  /** Human-controlled stage movement (v2 `goto_stage`) — armed only while the
   *  run is waiting on the human, exactly as the retired stage rail was. */
  onGotoStage: (stage: InterviewStage) => void;
  /** Ask the server for the role bindings again, now (see useRoleBindings). */
  onRetryRoles: () => void;
}) {
  const role = useAppSelector(selectActiveRoleTab);
  const session = useAppSelector(selectRoomSession);
  const runPhase = useAppSelector(selectRunPhase);
  // The SERVER's `/roles` response merged over the session row — so the tab
  // mounts the instant that call lands, not when realtime echoes the write.
  const roleBindings = useAppSelector(selectRoleBindings);
  const rolesPhase = useAppSelector(selectRolesPhase);
  const rolesError = useAppSelector(selectRolesError);
  const binding = roleBinding({ role_bindings: roleBindings }, role);
  const [docView, setDocView] = useState<DocView | null>(null);
  const { tabs: docTabs, finalizedAt } = useDocTabs();
  const activeDoc = docTabs.find((t) => t.key === docView) ?? null;

  // Moving to another expert always returns to their conversation.
  const lastRoleRef = useRef(role);
  useEffect(() => {
    if (lastRoleRef.current !== role) {
      lastRoleRef.current = role;
      setDocView(null);
    }
  }, [role]);

  const meta = ROLES[role];
  const stage = stageForRole(role);
  const currentStage = session ? normalizeStage(session.stage) : null;
  // Reading another expert's room does not move the interview — but when the
  // run is waiting on the human, moving it there is one click away.
  const canMoveHere =
    stage !== null &&
    currentStage !== null &&
    stage !== currentStage &&
    runPhase === "waiting_human";

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 flex-wrap items-stretch border-b border-border">
        <StageTabs className="min-w-0 flex-1 border-b-0" />
        <div className="flex shrink-0 items-center gap-1 px-2 py-1 sm:border-l sm:border-border">
          {docTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDocView(docView === key ? null : key)}
              className={cn(
                "inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2 text-xs",
                docView === key
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={`${label} — the Scribe's record`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {canMoveHere && stage && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            {meta.name} leads the {STAGES[stage].label} step — the interview is
            on {currentStage ? STAGES[currentStage].label : "another step"}.
          </span>
          <Button size="sm" variant="outline" onClick={() => onGotoStage(stage)}>
            Move the interview here
          </Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {/* The chat stays MOUNTED while a document is open — reading the
            record never interrupts a live stream. */}
        <div className={cn("h-full", activeDoc && "hidden")}>
          {binding ? (
            /* Origin stamp — every dictation started in this room's composer
               is saved by the shared recorder WITH attribution to this
               session (v2 §13.1: never lose the speaker's audio). */
            <RecordingOriginProvider
              origin={{
                surface: "vision-interview.room",
                entityId: session?.id ?? "",
                label: session?.title || "Vision interview",
                href: session ? `/vision-interview/${session.id}` : "/vision-interview",
              }}
            >
              <ChatRoomClient
                key={binding.conversationId}
                agentId={binding.agentId}
                conversationId={binding.conversationId}
              />
              <PendingAnswersRider conversationId={binding.conversationId} />
              {/* A finished exchange is reported to the Scribe from here —
                  the hijack's client half (useObserveRoleTurns). */}
              {session && (
                <RoleTurnObserver
                  sessionId={session.id}
                  role={role}
                  conversationId={binding.conversationId}
                />
              )}
            </RecordingOriginProvider>
          ) : (
            <ExpertNotJoined
              roleName={meta.name}
              roleDescription={meta.description}
              stageLabel={stage ? STAGES[stage].label : "right"}
              rolesPhase={rolesPhase}
              rolesError={rolesError}
              onRetryRoles={onRetryRoles}
              onStart={onStart}
              starting={runPhase === "starting"}
            />
          )}
        </div>
        {activeDoc && (
          <div className="absolute inset-0 bg-card">
            {activeDoc.key === "document" ? (
              <DocumentPane />
            ) : (
              <DeliverablePane
                label={activeDoc.label}
                icon={activeDoc.icon}
                content={activeDoc.content}
                filename={activeDoc.filename}
                finalizedAt={finalizedAt}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
