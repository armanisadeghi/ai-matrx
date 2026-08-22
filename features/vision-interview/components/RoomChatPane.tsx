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

import { useEffect, useRef } from "react";
import {
  BookOpenText,
  FileText,
  ListChecks,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { ChatRoomClient } from "@/features/agents/components/chat/ChatRoomClient";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import {
  removeContextEntry,
  setContextEntries,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  selectLastSubmittedText,
  selectSubmissionPhase,
  selectUserInputText,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  docViewChanged,
  pendingAnswersCleared,
  selectActiveRoleTab,
  selectDocView,
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
  type DocView,
  type InterviewStage,
  type RoleKey,
} from "../types";
import { DeliverablePane } from "./DeliverablePane";
import { DocumentPane } from "./DocumentPane";
import { StageTabs } from "./StageTabs";

// ── The answer-delivery rule (v3 contract) ─────────────────────────────────
// Answers written in the left-hand questions panel ride the NEXT message the
// Expert sends — as a CONTEXT ENTRY, never as text in their message.
//
// The answers ledger CHANGES during the conversation, which by definition makes
// it context, not a variable (common-docs/systems/agents/agent-variable-binding/
// FEATURE.md § VARIABLE vs CONTEXT). `request.context` is sent on turn 1 and on
// every continuation, and the server prepends the manifest block to that turn's
// last user message without ever persisting it — so this is exactly the
// "transform the outgoing message" seam, and it already existed.
//
// This code used to write an XML block into the Expert's own composer draft and
// its comment claimed no such seam existed. That was wrong: it put machine-
// assembled content into the human channel (THE USER-INPUT LAW) and saved it to
// the DB as the person's typed words. Corrected 2026-08-21.

const ANSWERS_CONTEXT_KEY = "answered_questions";
/** Generous cap so the answers INLINE into the turn rather than becoming a
 *  `ctx_get` stub the agent must fetch (default threshold is 200 chars). */
const ANSWERS_MAX_INLINE = 50_000;

export function buildAnsweredQuestionsValue(answers: PendingAnswer[]) {
  return {
    content: answers.map((a) => ({
      question_id: a.questionId,
      question: a.questionText,
      answer: a.answerText,
    })),
    type: "json" as const,
    label: "Answers the Expert just gave",
    description:
      "Questions from the room's open-questions panel that the Expert answered " +
      "alongside this message. Treat each as their spoken answer to that question.",
    mutable: false,
    max_inline_chars: ANSWERS_MAX_INLINE,
  };
}

/** Stable signature — restage only when the answers actually changed. */
function answersSignature(answers: PendingAnswer[]): string {
  return JSON.stringify(answers.map((a) => [a.questionId, a.answerText]));
}

/**
 * Stages the pending answers as a context entry on the role's conversation and
 * retires them once the carrying turn is DURABLY persisted.
 *
 * Answers are never lost: they stay in the slice (and the entry stays staged)
 * until `submissionPhase === "persisted"` — the server reserved the user
 * request. A failed send leaves both in place for the retry.
 *
 * 🚨 Context entries PERSIST on the conversation until removed. Clearing on the
 * persist edge is what stops spent answers riding every later turn as stale
 * truth.
 */
function PendingAnswersRider({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const answers = useAppSelector(selectPendingAnswers);
  const phase = useAppSelector(selectSubmissionPhase(conversationId));

  const stagedRef = useRef<string | null>(null);
  const prevPhaseRef = useRef(phase);

  // Keep the staged context entry in step with the ledger.
  useEffect(() => {
    if (answers.length === 0) {
      if (stagedRef.current !== null) {
        dispatch(removeContextEntry({ conversationId, key: ANSWERS_CONTEXT_KEY }));
        stagedRef.current = null;
      }
      return;
    }
    const signature = answersSignature(answers);
    if (signature === stagedRef.current) return;
    dispatch(
      setContextEntries({
        conversationId,
        entries: [
          {
            key: ANSWERS_CONTEXT_KEY,
            value: buildAnsweredQuestionsValue(answers),
            type: "json",
            label: "Answers the Expert just gave",
          },
        ],
      }),
    );
    stagedRef.current = signature;
  }, [answers, conversationId, dispatch]);

  // The turn carrying them is durably persisted → the ledger is spent.
  // Edge-triggered: a conversation already sitting at "persisted" must not
  // retire answers the Expert staged afterwards.
  useEffect(() => {
    const previous = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase !== "persisted" || previous === "persisted") return;
    if (stagedRef.current === null) return;
    dispatch(removeContextEntry({ conversationId, key: ANSWERS_CONTEXT_KEY }));
    stagedRef.current = null;
    dispatch(pendingAnswersCleared());
  }, [phase, conversationId, dispatch]);

  return null;
}

// ── Deliverables + document (kept reachable — never a dead end) ─────────────

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
 * and offers the ONE way forward — never a spinner, never a dead tab.
 *
 * It carries no "Start the interview" control any more (2026-08-18): the
 * guided workflow run does not open these rooms — `/roles` does — so a Start
 * button here answered a question nobody asked, and it was the only door to
 * the run in the whole feature. The run now lives in the room header's Finish
 * control (`FinishInterviewDialog`), reachable from a WORKING room.
 */
function ExpertNotJoined({
  roleName,
  roleDescription,
  stageLabel,
  rolesPhase,
  rolesError,
  onRetryRoles,
}: {
  roleName: string;
  roleDescription: string;
  stageLabel: string;
  rolesPhase: RolesPhase;
  rolesError: string | null;
  onRetryRoles: () => void;
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
            <div className="mt-5 flex items-center justify-center">
              <Button variant="outline" onClick={onRetryRoles}>
                Try again
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
  onGotoStage,
  onRetryRoles,
}: {
  /** Human-controlled stage movement (v2 `goto_stage`) — armed only while the
   *  run is waiting on the human, exactly as the retired stage rail was. */
  onGotoStage: (stage: InterviewStage) => void;
  /** Ask the server for the role bindings again, now (see useRoleBindings). */
  onRetryRoles: () => void;
}) {
  const dispatch = useAppDispatch();
  const role = useAppSelector(selectActiveRoleTab);
  const session = useAppSelector(selectRoomSession);
  const runPhase = useAppSelector(selectRunPhase);
  // The SERVER's `/roles` response merged over the session row — so the tab
  // mounts the instant that call lands, not when realtime echoes the write.
  const roleBindings = useAppSelector(selectRoleBindings);
  const rolesPhase = useAppSelector(selectRolesPhase);
  const rolesError = useAppSelector(selectRolesError);
  const binding = roleBinding({ role_bindings: roleBindings }, role);
  // Which record is on screen lives in the SLICE, not here: the finish dialog
  // has to be able to open the Vision document the moment it is written (a
  // document you are told about but cannot reach is a dead end). Switching
  // experts clears it inside `activeRoleTabChanged`.
  const docView = useAppSelector(selectDocView);
  const { tabs: docTabs, finalizedAt } = useDocTabs();
  const activeDoc = docTabs.find((t) => t.key === docView) ?? null;

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
              onClick={() =>
                dispatch(docViewChanged(docView === key ? null : key))
              }
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => onGotoStage(stage)}
          >
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
                href: session
                  ? `/vision-interview/${session.id}`
                  : "/vision-interview",
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
