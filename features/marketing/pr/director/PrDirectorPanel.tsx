"use client";

/**
 * THE PR DIRECTOR, IN THE PRESS ROOM (BRIEFS-STRATEGY-AND-ORG-CHART §2).
 *
 * A person talks to the PR department from the PR surface. This panel is the platform's ONE chat column
 * (`AgentConversationColumn` — same transcript, composer, streaming, tool cards), started on the job
 * `seo.press_strategist` through the mandate door. Nothing here is a second chat engine.
 *
 * What this file adds, and only this:
 * - the brand, as a lazy `pr_brand_context` pointer on EVERY turn (the server builds the body behind the
 *   brand's access check);
 * - the `conversation → web_brand` edge after the first turn, so a continuation from any other surface keeps
 *   the brand (aidream seeds it from the edge);
 * - the front door's starting points, as live actions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";

import { AgentConversationColumn } from "@ai-matrx/chat/agents/components/shared/AgentConversationColumn";
import { useComposerMode } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/useComposerMode";
import { useCompactInputMaxHeight } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/useCompactInputMaxHeight";
import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { setContextEntries } from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import { setUserInputText } from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { smartExecute } from "@ai-matrx/chat/agents/redux/execution-system/thunks/smart-execute.thunk";
import { resumeConversation } from "@ai-matrx/chat/agents/redux/execution-system/thunks/resume-conversation.thunk";
import { selectIsExecuting } from "@ai-matrx/chat/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectConversationMessages,
  selectMessageCount,
  selectMessagesHydrationFailure,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { selectIsCacheOnly } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { apiGet, buildPath } from "@/lib/api/typed-client";
import { cn } from "@/lib/utils";

import {
  DIRECTOR_ASK_PARAM,
  DIRECTOR_CONVERSATION_PARAM,
  PR_BRAND_CONTEXT_KEY,
  PR_BRAND_CONTEXT_LABEL,
  PR_DIRECTOR_MANDATE_KEY,
  bindConversationToBrand,
  prBrandContextValue,
} from "./director-context";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";

/** The front door's starting points. `send` runs now; otherwise the words wait in the composer for the rest. */
export const PR_STARTING_POINTS: ReadonlyArray<{
  label: string;
  text: string;
  send: boolean;
}> = [
  {
    label: "What should we do first?",
    text: "What is our best PR move right now? Give me a plan.",
    send: true,
  },
  {
    label: "Plan the next quarter",
    text: "Plan our PR for the next quarter: which dated moments should we own, and what would we say?",
    send: true,
  },
  {
    label: "Is this newsworthy?",
    text: "Is this newsworthy for us: ",
    send: false,
  },
  {
    label: "A reporter asked us…",
    text: "A reporter is asking for sources on this — should we answer, and how? ",
    send: false,
  },
];

type BindState = "idle" | "binding" | "bound" | { refused: string };



function readHeldDirectorConversation(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get(
    DIRECTOR_CONVERSATION_PARAM,
  );
}

/** The `?ask=` a door handed over, removed from the URL as it is read. */
function takeAskFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const ask = url.searchParams.get(DIRECTOR_ASK_PARAM)?.trim() || null;
  if (!ask) return null;
  url.searchParams.delete(DIRECTOR_ASK_PARAM);
  replaceAddressWithoutNavigating(url);
  // A door never sends `ask` WITH a held conversation. Both at once means the ask was already
  // sent into that conversation and a stale URL snapshot (the workspace rewriting its own
  // params) carried it back — reopen the conversation, never send it twice.
  return url.searchParams.get(DIRECTOR_CONVERSATION_PARAM) ? null : ask;
}

/**
 * Reopen a held conversation, retrying while its row is not there yet. A reload can land in the
 * second between the run starting and the server writing the row; that read is not a failure,
 * it is early. About 20 seconds of patience, then the honest error with Try again.
 */
const REOPEN_DELAYS_MS: readonly number[] = [1000, 2000, 3000, 4000, 5000, 5000];
/** With the question kept on this tab, a missing row is resent sooner: ~8 seconds, not ~20. */
const REOPEN_DELAYS_WITH_KEPT_MS: readonly number[] = [1000, 2000, 2000, 3000];
async function reopenWithRetry<T>(
  attempt: () => Promise<T>,
  delays: readonly number[] = REOPEN_DELAYS_MS,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      if (i === delays.length) break;
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
  throw lastError;
}

/** Does the server hold any operation for this conversation? A failed check answers "yes" — the
 *  safe side: never send a person's question twice on a guess. */
async function serverIsWorkingOn(conversationId: string): Promise<boolean> {
  try {
    const { data } = await apiGet(
      buildPath("/runtime/operations/by-link/{link_kind}/{link_id}", {
        link_kind: "conversation",
        link_id: conversationId,
      }),
      // 404 is an expected answer here (no operation), so it stays out of the Error Inspector.
      { captureErrors: false },
    );
    return ((data as { operation_count?: number } | null)?.operation_count ?? 0) > 0;
  } catch (error) {
    // 404 is the server's "no operation you own for this conversation".
    return (error as { status?: number } | null)?.status !== 404;
  }
}

// THE KEPT QUESTION: per tab (sessionStorage), per conversation, only until the server confirms
// the row. Never sent anywhere; read back only to re-send a question the server never received.
const KEPT_PREFIX = "matrx.pr.director.pending.";
function keptQuestion(conversationId: string): string | null {
  try {
    return window.sessionStorage.getItem(KEPT_PREFIX + conversationId);
  } catch {
    return null;
  }
}
function keepQuestion(conversationId: string, text: string): void {
  try {
    window.sessionStorage.setItem(KEPT_PREFIX + conversationId, text);
  } catch {
    // Private mode: the reload can still reopen the conversation once the row exists.
  }
}
function forgetKeptQuestion(conversationId: string): void {
  try {
    window.sessionStorage.removeItem(KEPT_PREFIX + conversationId);
  } catch {
    // nothing kept
  }
}

const EMPTY_MESSAGES: readonly { role?: string; content?: unknown }[] = [];
/** The text of the latest user turn, from its content blocks. */
function latestUserText(messages: readonly { role?: string; content?: unknown }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const blocks = Array.isArray(m.content) ? m.content : [m.content];
    const text = blocks
      .map((b) =>
        typeof b === "string" ? b : b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string"
          ? (b as { text: string }).text
          : "",
      )
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

function holdDirectorConversation(conversationId: string): void {
  const url = new URL(window.location.href);
  if (
    url.searchParams.get(DIRECTOR_CONVERSATION_PARAM) === conversationId &&
    !url.searchParams.has(DIRECTOR_ASK_PARAM)
  ) {
    return;
  }
  url.searchParams.set(DIRECTOR_CONVERSATION_PARAM, conversationId);
  // A sent ask must not ride along into the held URL.
  url.searchParams.delete(DIRECTOR_ASK_PARAM);
  replaceAddressWithoutNavigating(url);
}

export interface PrDirectorPanelProps {
  brandId: string;
  brandName: string;
  organizationId: string;
  className?: string;
}

export function PrDirectorPanel({
  brandId,
  brandName,
  organizationId,
  className,
}: PrDirectorPanelProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { mode: composerMode } = useComposerMode();
  const { measureRef, maxInputHeightPx } = useCompactInputMaxHeight();
  const { launchMandate } = useAgentLauncher();
  const surfaceKey = `pr-director:${brandId}`;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  // The ONE open per surface. Held in a ref so a re-render that changes the effect's inputs (the
  // launcher's identity, the organization landing a moment after a cold reload) re-attaches to the
  // same open instead of cancelling it — the 2026-10-05 walk found the panel stranded on "Opening
  // your PR director…" that way. `openNonce` restarts it on demand (Try again).
  const opening = useRef<{ key: string; promise: Promise<string> } | null>(null);
  const [openNonce, setOpenNonce] = useState(0);

  // OPEN: the conversation this page was already holding (a reload mid-answer carries it in the URL, the
  // way /chat carries its id) reopens through the canonical resume sequence — hydrate, re-surface a pending
  // tool prompt, reattach to a turn the server is still running. Only a page holding none starts a new one.
  useEffect(() => {
    const key = `${surfaceKey}#${openNonce}`;
    let held: string | null = null;
    if (opening.current?.key !== key) {
      // A door elsewhere (the PR calendar's "Draft angles") hands a question over as `?ask=`:
      // it opens a fresh conversation and is sent once, then leaves the URL so a reload never
      // sends it twice.
      const ask = takeAskFromUrl();
      if (ask) setPendingAsk(ask);
      held = ask ? null : readHeldDirectorConversation();
      const reopen = held;
      opening.current = {
        key,
        promise: reopen
          ? reopenWithRetry(async () => {
              await dispatch(
                resumeConversation({
                  conversationId: reopen,
                  agentId: null,
                  surfaceKey,
                  sourceFeature: "marketing",
                }),
              ).unwrap();
              // The resume FULFILLS on a row that is not there yet and records a hydration failure
              // instead; that is the "early" case this retry exists for, so it counts as a miss.
              const failure = selectMessagesHydrationFailure(reopen)(store.getState());
              if (failure) throw new Error(failure);
            }, keptQuestion(reopen) ? REOPEN_DELAYS_WITH_KEPT_MS : REOPEN_DELAYS_MS)
              .then(async () => {
                // The row can exist EMPTY (its id is reserved at launch). Empty, with no operation on
                // the server, means the turn never reached it: send the kept question again, once.
                // Empty WITH an operation is a turn still running — reconnect follows it.
                const question = keptQuestion(reopen);
                if (
                  question &&
                  selectMessageCount(reopen)(store.getState()) === 0 &&
                  !(await serverIsWorkingOn(reopen))
                ) {
                  forgetKeptQuestion(reopen);
                  setPendingAsk(question);
                }
                return reopen;
              })
              .catch(async (error: unknown) => {
                // The row never appeared: the server never received the turn (it writes the row
                // before it streams). If this tab kept the question, send it again under the SAME
                // id — the person's words are never lost to a reload.
                const question = keptQuestion(reopen);
                if (!question) throw error;
                const relaunched = await launchMandate(PR_DIRECTOR_MANDATE_KEY, {
                  surfaceKey,
                  sourceFeature: "marketing",
                  organizationId,
                  conversationId: reopen,
                });
                forgetKeptQuestion(reopen);
                setPendingAsk(question);
                return relaunched.conversationId;
              })
          : launchMandate(PR_DIRECTOR_MANDATE_KEY, {
              surfaceKey,
              sourceFeature: "marketing",
              organizationId,
            }).then((result) => result.conversationId),
      };
    } else {
      held = readHeldDirectorConversation();
    }
    let cancelled = false;
    opening.current.promise
      .then((id) => {
        if (!cancelled) {
          setLaunchError(null);
          setConversationId(id);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : String(error);
        setLaunchError(
          held ? `the conversation you were in could not be reopened (${reason})` : reason,
        );
      });
    return () => {
      cancelled = true;
    };
    // The open is keyed by surface and nonce only; organization and launcher changes re-attach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceKey, openNonce]);

  // EVERY TURN: the brand pointer. Instance context persists per conversation and rides each request.
  useEffect(() => {
    if (!conversationId) return;
    dispatch(
      setContextEntries({
        conversationId,
        entries: [
          {
            key: PR_BRAND_CONTEXT_KEY,
            value: prBrandContextValue(brandId),
            type: "json",
            label: PR_BRAND_CONTEXT_LABEL,
          },
        ],
      }),
    );
  }, [conversationId, brandId, dispatch]);

  // The handed-over question, sent after the brand pointer above is in place.
  useEffect(() => {
    if (!conversationId || !pendingAsk) return;
    dispatch(setUserInputText({ conversationId, text: pendingAsk }));
    void dispatch(smartExecute({ conversationId }));
    setPendingAsk(null);
  }, [conversationId, pendingAsk, dispatch]);

  // THE EDGE, once a turn has finished and the conversation has messages (the row exists then; before
  // it, assoc_add is a guaranteed refusal). Retried briefly; a refusal is said, never swallowed. Keyed on
  // the message count rather than a watched run, so a page that reloaded mid-run still binds.
  const executing = useAppSelector((state) =>
    conversationId ? selectIsExecuting(conversationId)(state) : false,
  );
  const messageCount = useAppSelector((state) =>
    conversationId ? selectMessageCount(conversationId)(state) : 0,
  );
  // HOLD IT, THE MOMENT A TURN IS SENT. The id is minted on this client and adopted by the server, so
  // it can ride the URL at once; until the server confirms the row, the question is kept on this tab,
  // so a reload at ANY moment either reopens the conversation or re-sends the question (above).
  const serverHasRow = useAppSelector((state) =>
    conversationId ? !selectIsCacheOnly(conversationId)(state) : false,
  );
  const messages = useAppSelector((state) =>
    conversationId ? selectConversationMessages(conversationId)(state) : EMPTY_MESSAGES,
  );
  const latestQuestion = latestUserText(messages);
  useEffect(() => {
    if (!conversationId) return;
    if (messageCount === 0 && !executing) return;
    holdDirectorConversation(conversationId);
    if (serverHasRow) forgetKeptQuestion(conversationId);
    else if (latestQuestion) keepQuestion(conversationId, latestQuestion);
  }, [conversationId, serverHasRow, messageCount, executing, latestQuestion]);

  const [bind, setBind] = useState<BindState>("idle");
  const boundFor = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || executing || messageCount < 2) return;
    const key = `${conversationId}:${brandId}`;
    if (boundFor.current === key) return;
    boundFor.current = key;
    setBind("binding");
    void (async () => {
      let last: string | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        last = await bindConversationToBrand({
          conversationId,
          brandId,
          organizationId,
        });
        if (last === null) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (boundFor.current === key)
        setBind(last === null ? "bound" : { refused: last });
    })();
  }, [conversationId, executing, messageCount, brandId, organizationId]);

  // A NEW CONVERSATION on demand: the held one stays in history; the URL lets go of it.
  const [startingFresh, setStartingFresh] = useState(false);
  const startFresh = useCallback(() => {
    setStartingFresh(true);
    const url = new URL(window.location.href);
    url.searchParams.delete(DIRECTOR_CONVERSATION_PARAM);
    replaceAddressWithoutNavigating(url);
    launchMandate(PR_DIRECTOR_MANDATE_KEY, {
      surfaceKey,
      sourceFeature: "marketing",
      organizationId,
    })
      .then((result) => {
        setLaunchError(null);
        setConversationId(result.conversationId);
      })
      .catch((error: unknown) =>
        setLaunchError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setStartingFresh(false));
  }, [launchMandate, surfaceKey, organizationId]);

  const start = useCallback(
    (text: string, send: boolean) => {
      if (!conversationId) return;
      dispatch(setUserInputText({ conversationId, text }));
      if (send) void dispatch(smartExecute({ conversationId }));
    },
    [conversationId, dispatch],
  );

  // The starting points sit ABOVE the composer (never as `landingContent`, which replaces the composer
  // with nothing) and fall away once the conversation has its first message.
  const landing =
    messageCount > 0 ? null : (
      <div className="flex flex-col gap-3 px-1 py-3">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" aria-hidden />
          <p className="text-sm font-semibold">Your PR director</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Tell it what is going on at {brandName}. It already knows what we have
          on file — the company, its facts, recent coverage and the news monitor
          — and it will give you a main play and two backups, each one a button.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PR_STARTING_POINTS.map((point) => (
            <button
              key={point.label}
              type="button"
              disabled={!conversationId}
              onClick={() => start(point.text, point.send)}
              className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50"
            >
              {point.label}
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <section
      ref={measureRef}
      aria-label="PR director"
      className={cn("flex min-h-0 flex-1 flex-col bg-background", className)}
      data-testid="pr-director-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Megaphone className="size-4 shrink-0 text-primary" aria-hidden />
          <h2 className="truncate text-sm font-medium">PR Director</h2>
          <span className="truncate text-[11px] text-muted-foreground">
            About: {brandName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {messageCount > 0 ? (
            <button
              type="button"
              onClick={startFresh}
              disabled={startingFresh}
              className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              New conversation
            </button>
          ) : null}
          {bind === "binding" ? (
            <span className="text-[11px] text-muted-foreground">
              Saving this chat to {brandName}…
            </span>
          ) : typeof bind === "object" ? (
            <span className="text-[11px] text-destructive" title={bind.refused}>
              This chat is not saved to {brandName}; reopening it elsewhere will
              not carry the brand.
            </span>
          ) : null}
        </div>
      </header>
      {launchError ? (
        <p
          role="alert"
          className="m-3 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs"
        >
          The PR director could not be opened: {launchError}
          <span className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLaunchError(null);
                setOpenNonce((n) => n + 1);
              }}
              className="rounded border px-2 py-0.5 hover:bg-muted"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={startFresh}
              className="rounded border px-2 py-0.5 hover:bg-muted"
            >
              Start a new conversation
            </button>
          </span>
        </p>
      ) : !conversationId ? (
        <p className="p-3 text-xs text-muted-foreground">
          Opening your PR director…
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <AgentConversationColumn
            conversationId={conversationId}
            surfaceKey={surfaceKey}
            aboveInput={landing}
            smartInputProps={{
              composer: { size: "compact", mode: composerMode, maxInputHeightPx },
            }}
          />
        </div>
      )}
    </section>
  );
}
