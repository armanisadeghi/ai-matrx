"use client";

// features/vision-interview/components/RoomOpening.tsx
//
// THE FIRST FIVE SECONDS OF THE ROOM. Two things that were both missing when
// a first-time Expert walked in, and that are both about the same promise:
// the screen in front of you knows who is here and what you already said.
//
//  1. WHO IS IN THE ROOM (`RoleHeroIdentity`). Every expert tab mounted the
//     canonical chat, and the canonical chat's empty state is the shared
//     default hero: a wireframe glyph over "Ready to run" and, as the single
//     instruction on the screen, "Type a message below to start."
//     (`features/agents/components/messages-display/assistant/AgentEmptyMessageDisplay.tsx`
//     lines 83 and 95.) That names no expert, explains no interview, and says
//     "run" — a programmer's word — to an artist describing their vision.
//     The hero is DISPLAY STATE, so the surface that knows what the
//     conversation is for says so: the three `display*Override` fields on
//     `instanceUIState`. Two sibling surfaces already adopted this mechanism
//     (Masterwork's `ScoutInterviewPanel`, the Conductor lane); this room
//     never did. It is per ROLE, because six different experts open six
//     different rooms and each one has its own name, its own first words and
//     its own icon.
//
//  2. WHAT YOU ALREADY SAID (`OpeningVisionSend`). The person writes a whole
//     paragraph into "What do you see?" and presses "Begin the interview".
//     That text was written to `interview.session.vision_statement` and then
//     read by nobody: the lead expert's conversation opened EMPTY and the
//     expert greeted a room it knew nothing about. The click on "Begin the
//     interview" IS the send — so the room sends it, once, as the first user
//     turn of the lead expert's conversation, through the one canonical send
//     path (`smartExecute`), exactly as if the person had typed it into the
//     composer and pressed send.
//
// EXACTLY ONCE is the whole risk here: sending someone's vision twice is
// worse than not sending it. Three independent gates, any one of which holds:
//   * the server's own answer — `binding.conversationStarted === false` means
//     `chat.conversation` does not hold this id yet, i.e. no turn has ever
//     been taken in this room (types.ts `RoleBinding.conversationStarted`);
//   * an in-memory mark that survives a role-tab switch and an SPA remount
//     (module scope, not a component ref — the pane remounts on navigation);
//   * a per-tab `sessionStorage` mark, for the reload that happens before the
//     server's answer has flipped.

import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { chatRouteSurfaceKey } from "@/features/agents/components/chat/begin-fresh-chat";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectUserInputEntryExists } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import {
  setDisplayDescriptionOverride,
  setDisplayIconNameOverride,
  setDisplayNameOverride,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type { AppStore } from "@/lib/redux/store";
import { ROLES, STAGES, type RoleBinding, type RoleKey } from "../types";

/**
 * The expert who is handed the typed opening: the primary of the FIRST stage
 * (`capture` → Sounding Board). Derived, never a second hardcoded role key —
 * if the stage arc's opening primary ever changes, this follows it.
 */
export const LEAD_ROLE: RoleKey = STAGES.capture.primaryRole ?? "sounding_board";

/**
 * Tell the canonical chat WHOSE room this is.
 *
 * Mounted per active role with that role's own conversation id, so each
 * expert's empty room carries that expert's name, that expert's first words
 * and that expert's icon — never one string shared by all six.
 *
 * No readiness gate: since D326 (2026-09-16) these writes are staged by the
 * slice and replayed when the conversation row lands, so dispatching on mount
 * is correct even before the instance exists.
 */
export function RoleHeroIdentity({
  role,
  conversationId,
}: {
  role: RoleKey;
  conversationId: string;
}) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const meta = ROLES[role];
    dispatch(setDisplayNameOverride({ conversationId, value: meta.name }));
    dispatch(
      setDisplayDescriptionOverride({ conversationId, value: meta.opening }),
    );
    dispatch(
      setDisplayIconNameOverride({ conversationId, value: meta.iconName }),
    );
  }, [role, conversationId, dispatch]);
  return null;
}

// ── The exactly-once marks ─────────────────────────────────────────────────

/** Marks held for the lifetime of the tab's JS — survives a role-tab switch
 *  and an SPA remount of the room, both of which destroy component refs. */
const openingSent = new Set<string>();

const markKey = (sessionId: string, conversationId: string) =>
  `matrx:vision-interview:opening-sent:${sessionId}:${conversationId}`;

function alreadySent(sessionId: string, conversationId: string): boolean {
  const key = markKey(sessionId, conversationId);
  if (openingSent.has(key)) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    // Storage denied (private mode, blocked site data) — the in-memory mark
    // and the server's own `conversationStarted` still hold the line.
    return false;
  }
}

function markSent(sessionId: string, conversationId: string): void {
  const key = markKey(sessionId, conversationId);
  openingSent.add(key);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* see alreadySent */
  }
}

/** Test seam ONLY — the marks are process-wide by design. */
export function __resetOpeningSentMarks(): void {
  openingSent.clear();
}

/**
 * Did a turn actually leave the building?
 *
 * `smartExecute` is allowed to return without executing — a duplicate-submit
 * claim, a conversation that vanished from the execution boundary, a declined
 * organization gate. None of those throw, and a silent no-op here would leave
 * the person looking at a canned greeting with their paragraph nowhere. So the
 * send is judged by its EFFECT: a turn is in flight, or a message exists.
 */
function turnStarted(store: AppStore, conversationId: string): boolean {
  const state = store.getState();
  return (
    selectIsExecuting(conversationId)(state) ||
    selectMessageCount(conversationId)(state) > 0
  );
}

/**
 * Hand the typed opening vision to the lead expert as the first user turn.
 *
 * Renders nothing while it works. If the send cannot start, it renders the
 * honest alternative instead of a silent fallback to the canned greeting: it
 * says so, it has already put the words back in the composer, and it offers
 * the one control that finishes the job.
 */
export function OpeningVisionSend({
  sessionId,
  visionStatement,
  role,
  binding,
}: {
  sessionId: string;
  visionStatement: string | null;
  role: RoleKey;
  binding: RoleBinding;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [failed, setFailed] = useState(false);
  const inFlightRef = useRef(false);
  const { conversationId, agentId, conversationStarted, conversationStartedKnown } =
    binding;
  const vision = visionStatement?.trim() ?? "";
  const meta = ROLES[role];

  const send = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    // The mark goes down BEFORE the await: a second render, a tab switch or a
    // sibling mount must never find an unmarked session mid-send.
    markSent(sessionId, conversationId);
    setFailed(false);
    try {
      // The canonical composer submit, unchanged: stage the text on the
      // instance, then fire the one send thunk in the same tick — exactly
      // what every composer's send button does
      // (`features/agents/components/inputs/smart-input/InputActionButtons.tsx`,
      // `features/agent-apps/hooks/useAgentApp.ts` `submit()`).
      dispatch(setUserInputText({ conversationId, text: vision }));
      await dispatch(
        smartExecute({
          conversationId,
          surfaceKey: chatRouteSurfaceKey(agentId),
        }),
      );
      if (!turnStarted(store, conversationId)) throw new Error("no turn");
    } catch {
      // NEVER a silent fall back to the canned greeting. Put the words where
      // the person can see and send them, and say what happened.
      dispatch(setUserInputText({ conversationId, text: vision }));
      setFailed(true);
    } finally {
      inFlightRef.current = false;
    }
  }, [agentId, conversationId, dispatch, sessionId, store, vision]);

  // The instance has to exist before text can be staged on it — the same
  // readiness gate ChatRoomClient's draft transfer uses. Read as SELECTORS so
  // the effect re-runs when the room becomes ready, rather than polling the
  // store on every render.
  const inputEntryReady = useAppSelector(
    selectUserInputEntryExists(conversationId),
  );
  const messageCount = useAppSelector(selectMessageCount(conversationId));
  const executing = useAppSelector(selectIsExecuting(conversationId));

  useEffect(() => {
    if (!vision) return;
    // 🚨 WAIT FOR THE ANSWER BEFORE ACTING ON IT (cold walk 5, finding 7). The
    // persisted binding can never carry `conversation_started`, so before
    // `/roles` answers this read `false` on a room that HAD been spoken in —
    // and this effect would send the opening statement into it a second time.
    // "Nobody has told us yet" is not "no".
    if (!conversationStartedKnown) return;
    // The server's answer: this room has already been spoken in.
    if (conversationStarted) return;
    if (alreadySent(sessionId, conversationId)) return;
    if (!inputEntryReady) return;
    // Anything already in this room means the opening is not the first word.
    if (messageCount > 0) return;
    if (executing) return;
    void send();
  }, [
    vision,
    conversationStarted,
    conversationStartedKnown,
    sessionId,
    conversationId,
    inputEntryReady,
    messageCount,
    executing,
    send,
  ]);

  if (!failed) return null;
  return (
    <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-3">
      <p className="text-sm font-medium text-foreground">
        We could not hand your opening to {meta.name} automatically.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing is lost — every word you wrote is waiting in the box below.
        Press send there, or use this button, and {meta.name} will read it and
        begin.
      </p>
      <div className="mt-2.5">
        <Button size="sm" onClick={() => void send()}>
          <SendHorizonal className="mr-1.5 h-4 w-4" aria-hidden />
          Send my opening to {meta.name}
        </Button>
      </div>
    </div>
  );
}
