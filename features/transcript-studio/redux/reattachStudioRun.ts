/**
 * reattachStudioRun — the ONE way a `transcripts.studio_runs` pass survives a
 * page reload, shared by Transcript Studio, Scribe, and the Cleanup pad.
 *
 * ## Why this exists
 *
 * THE FLOATING LAW has two halves and only the first one was built: passes
 * streamed into a floating window, but the run's identity lived in the tab
 * that launched it. Reload mid-pass and the column's status, its watch door,
 * and (for the cleanup pad) the output itself were simply gone — "a run that
 * dies on page refresh is the same defect as a spinner"
 * (`features/window-panels/FEATURE.md`).
 *
 * The durable handle already existed: every pass writes a `studio_runs` row
 * before it launches. Two writes closed the gap — `bindAgentRunConversation`
 * stamps the conversation the moment it exists (not at the end of the pass),
 * and `listAgentRuns` hydrates the rows on load. This module is what a surface
 * then DOES with a row it finds still running.
 *
 * ## The shape (copied from `features/marketing/data/useSiteCommandRun.ts`)
 *
 *   durable row on the server  →  find it on load  →  rejoin it  →  show it
 *   floating  →  settle the row from SERVER truth, never from a guess.
 *
 * Rejoining is the platform's own reconnect surface, not a second mechanism:
 * `reconnectServerOperation({ source: "cold-load" })` asks aidream's runtime
 * spine whether anything is still running for the conversation and follows its
 * event stream to terminal. Streams run `detach_on_disconnect`, so the work
 * never stopped — only our delivery did. Token text is deliberately NOT
 * replayed (platform doctrine, `/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md`):
 * reconnect shows live STATUS until terminal, then the conversation refetch
 * carries the finished output. That refetch is where a recovered result comes
 * from here too.
 *
 * ## Honest outcomes only
 *
 * A run whose output this surface cannot re-apply is settled `failed` with a
 * sentence saying exactly that, never left spinning at "running" forever and
 * never laundered into "complete" when nothing landed. The finished text is
 * still readable in the run window either way — the row is a claim about the
 * SURFACE, not about the model.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  selectLatestAssistantMessageId,
  selectMessageContent,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { openLiveRunWindowAction } from "@/features/overlays/openers/liveRunWindow";
import { selectAccumulatedText } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { selectLatestRequestId } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { reconnectServerOperation } from "@/features/agents/runtime-reconnect/reconnect-server-operation.thunk";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { finalizeAgentRun } from "../service/studioService";
import type { AgentRun } from "../types";
import { runUpserted } from "./slice";

/**
 * A row worth rejoining: the surface believed it was still running when the
 * page went away, and it carries the handle needed to find it again.
 */
export function isResumableStudioRun(run: AgentRun): boolean {
  return (
    (run.status === "running" || run.status === "queued") &&
    Boolean(run.conversationId)
  );
}

/** The `metadata.target` a surface stamped on the run, when it stamped one. */
export function studioRunTarget(run: AgentRun): string | null {
  const target = run.metadata?.target;
  return typeof target === "string" && target ? target : null;
}

/** One reattach per run id per page life — effects re-fire, reattaches must not. */
const inFlight = new Set<string>();

/**
 * The window shows the recovered text as a PREVIEW, and that preview lives in
 * overlay Redux state — the full text belongs in the container it was restored
 * to, not in a window's props.
 */
const PREVIEW_MAX_CHARS = 4000;

function previewOf(text: string): string {
  return text.length > PREVIEW_MAX_CHARS
    ? `${text.slice(0, PREVIEW_MAX_CHARS)}…`
    : text;
}

export type StudioRunReattachOutcome =
  /** The run finished and its output was put back on the surface. */
  | "recovered"
  /** The run finished (or died) and nothing could be applied — row settled. */
  | "lost"
  /** Already being reattached by this page, or no handle to rejoin with. */
  | "skipped";

export interface ReattachStudioRunArgs {
  dispatch: AppDispatch;
  getState: () => RootState;
  run: AgentRun;
  /** What the window calls this run, e.g. "Cleaning transcript". */
  label: string;
  /** Stable per-subject window id — the SAME one this surface uses live. */
  instanceId: string;
  /**
   * Put a recovered output back where it belongs. Every surface records what it
   * needs at LAUNCH — the cleanup pad stamps `metadata.target`, a studio pass
   * stamps its replace-window at `metadata.apply` (`studioApplyWindow.ts`).
   * Omit only when the row carries no such stamp (a pre-2026-08-17 run, or a
   * container that no longer exists); the run is then settled `failed` with a
   * sentence telling the user to run it again.
   */
  applyRecoveredOutput?: (text: string, run: AgentRun) => Promise<void> | void;
}

/** Request statuses that mean a live stream in THIS tab has finished. */
const TERMINAL_REQUEST_STATUSES = new Set([
  "complete",
  "error",
  "cancelled",
  "aborted",
  "timeout",
]);

const LIVE_TAKEOVER_POLL_MS = 750;

/**
 * Resolve when a REAL stream for this conversation opens in this tab and then
 * finishes — the `/tool_results` → resume path a rejoined run takes when it was
 * waiting on a client tool. `onOpened` fires once, the moment the stream is
 * first seen, so the caller can hand the window to the canonical renderer.
 *
 * A Redux poll, not a subscription: the caller is a thunk with `getState` only,
 * and this reads local state — no network, and it ends with the reattach.
 */
function waitForLiveTakeover(
  getState: () => RootState,
  conversationId: string,
  signal: AbortSignal,
  onOpened: () => void,
  onWaitingInput: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    let opened = false;
    let announcedWaiting = false;
    const timer = setInterval(() => {
      if (signal.aborted) {
        clearInterval(timer);
        return;
      }
      const state = getState();
      // The run can pause on a question for the user. Saying so beats a
      // spinner that means "working" when the run is waiting on THEM.
      if (
        !announcedWaiting &&
        state.conversations?.byConversationId?.[conversationId]?.serverOperation
          ?.waitingInput
      ) {
        announcedWaiting = true;
        onWaitingInput();
      }
      const requestId = selectLatestRequestId(conversationId)(state);
      if (!requestId) return;
      if (!opened) {
        opened = true;
        onOpened();
      }
      const status = state.activeRequests.byRequestId[requestId]?.status;
      if (status && TERMINAL_REQUEST_STATUSES.has(status)) {
        clearInterval(timer);
        resolve();
      }
    }, LIVE_TAKEOVER_POLL_MS);
    signal.addEventListener(
      "abort",
      () => {
        clearInterval(timer);
      },
      { once: true },
    );
  });
}

/**
 * A stored message's text. Persisted content is a PART ARRAY
 * (`[{ id, text }, …]`), not a string — reading it as a string is how a
 * recovered run first reported "no saved output" while its answer sat in the
 * DB (caught in browser verification, 2026-08-15).
 */
function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const { type, text } = part as { type?: unknown; text?: unknown };
        // 🚨 The model's chain-of-thought is a part of its own
        // (`type: "thinking"`). Answer text ONLY — reasoning reaching a
        // surface is the `reasoning-leak` defect class, and here it would be
        // saved into the user's cleaned transcript.
        if (typeof type === "string" && type !== "text") return "";
        return typeof text === "string" ? text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (
    content &&
    typeof content === "object" &&
    typeof (content as { text?: unknown }).text === "string"
  ) {
    return (content as { text: string }).text;
  }
  return "";
}

function latestAssistantText(
  state: RootState,
  conversationId: string,
): string {
  const messageId = selectLatestAssistantMessageId(conversationId)(state);
  if (messageId) {
    const text = messageText(
      selectMessageContent(conversationId, messageId)(state),
    );
    if (text.trim()) return text;
  }
  // A stream that finished in THIS tab may not have been re-fetched into the
  // message store yet — the request row holds the same answer.
  const requestId = selectLatestRequestId(conversationId)(state);
  return requestId ? selectAccumulatedText(requestId)(state) : "";
}

async function settle(
  dispatch: AppDispatch,
  runId: string,
  status: "complete" | "failed",
  error: string | null,
): Promise<void> {
  try {
    const settled = await finalizeAgentRun({ id: runId, status, error });
    dispatch(runUpserted({ run: settled }));
  } catch (err) {
    // Loud: the row now lies about a run that is over, and every later load
    // will try to rejoin it again.
    captureError({
      source: "durable-run",
      relation: "transcripts.studio_runs",
      message:
        err instanceof Error
          ? err.message
          : "Could not settle a reattached studio run.",
      userMessage: "Could not record the outcome of a background AI pass.",
      raw: { runId, status },
    });
  }
}

/**
 * Rejoin one run that was still going when this page loaded: float its window,
 * follow it to terminal on the server, then apply + settle from server truth.
 *
 * Resolves when the run is settled. Callers `void` it — the window is the UI.
 */
export async function reattachStudioRun({
  dispatch,
  getState,
  run,
  label,
  instanceId,
  applyRecoveredOutput,
}: ReattachStudioRunArgs): Promise<StudioRunReattachOutcome> {
  const conversationId = run.conversationId;
  if (!conversationId || inFlight.has(run.id)) return "skipped";
  inFlight.add(run.id);

  /**
   * 🚨 The window NARRATES, it does not stream — and that is deliberate.
   *
   * A rejoined run has no client-side request row (this page never opened the
   * stream) and the platform never replays tokens into one
   * (`/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md`). Binding the window to the conversation alone
   * would open an EMPTY box that never fills — a dead end dressed as progress.
   * So the window carries real stages instead, and the finished text lands in
   * it as the last row's preview: the sanctioned "narrate when you can't
   * stream" form, never a spinner.
   */
  /** Set once a real stream owns the window — narration stands down for good. */
  let liveTookOver = false;

  const show = (
    stage: "rejoining" | "running" | "restoring" | "done" | "failed",
    detail: string,
    preview?: string,
  ): void => {
    // A live stream renders better than any narration of it.
    if (liveTookOver) return;
    const rejoinDone = stage !== "rejoining";
    dispatch(
      openLiveRunWindowAction({
        instanceId,
        conversationId,
        label,
        progress: {
          title: label,
          description:
            "This pass was still running when the page reloaded — rejoined from the server.",
          items: [
            {
              id: "rejoin",
              label: "Rejoining the run",
              status: rejoinDone ? "completed" : "running",
              ...(rejoinDone ? {} : { detail }),
            },
            {
              id: "run",
              label: "Finishing on the server",
              status:
                stage === "rejoining"
                  ? "waiting"
                  : stage === "running"
                    ? "running"
                    : stage === "failed"
                      ? "failed"
                      : "completed",
              ...(stage === "running" || stage === "failed"
                ? { detail }
                : {}),
              ...(preview ? { preview: previewOf(preview) } : {}),
            },
            {
              id: "apply",
              label: "Restoring it into your page",
              status:
                stage === "done"
                  ? "completed"
                  : stage === "restoring"
                    ? "running"
                    : stage === "failed"
                      ? "failed"
                      : "waiting",
              ...(stage === "done" || stage === "failed" ? { detail } : {}),
            },
          ],
        },
      }),
    );
  };

  try {
    // The run is the user's answer — show it before we know anything else.
    // No width/height: the defaults ARE the chat reading column.
    show(
      "rejoining",
      "Following it on the server until it finishes — nothing was lost.",
    );

    let followed = false;
    let finalStatus: string | null = null;
    // 🚨 The spine follower is NOT the only way this ends. A rejoined run that
    // was waiting on a client tool resumes into a REAL stream in this tab
    // (`/tool_results` → resume), and the follower then stands down without
    // ever emitting another event — so awaiting it alone leaves the window at
    // "Rejoining" forever and the row at "running" (observed 2026-08-15).
    // Whichever of the two settles first wins.
    const stopWatch = new AbortController();
    try {
      const result = await Promise.race([
        dispatch(
          reconnectServerOperation({ conversationId, source: "cold-load" }),
        )
          .unwrap()
          .then((r) => ({ kind: "spine" as const, ...r })),
        waitForLiveTakeover(
          getState,
          conversationId,
          stopWatch.signal,
          () => {
            // A real stream owns the display now — hand the window to the
            // canonical renderer instead of narrating over it.
            liveTookOver = true;
            dispatch(
              openLiveRunWindowAction({ instanceId, conversationId, label }),
            );
          },
          () =>
            show(
              "running",
              "This run is waiting on your answer — respond to the prompt and it continues.",
            ),
        ).then(() => ({
          kind: "live" as const,
          followed: false,
          finalStatus: null,
        })),
      ]);
      if (result.kind === "spine") {
        followed = result.followed;
        finalStatus = result.finalStatus;
      }
    } catch (err) {
      // Loud recovery: we still try the conversation below — the run may have
      // finished long before this page loaded.
      console.warn(
        "[studio-reattach] runtime reconnect failed — falling back to the conversation record.",
        { runId: run.id, conversationId, err },
      );
    } finally {
      stopWatch.abort();
    }

    if (!followed && !liveTookOver) {
      // Nothing non-terminal on the spine: the pass ended while we were away.
      // Its output, if it produced any, is on the conversation.
      try {
        await dispatch(loadConversation({ conversationId })).unwrap();
      } catch (err) {
        console.warn(
          "[studio-reattach] could not load the run's conversation.",
          { runId: run.id, conversationId, err },
        );
      }
    }

    if (finalStatus === "failed" || finalStatus === "cancelled") {
      const message =
        finalStatus === "cancelled"
          ? "This pass was cancelled on the server."
          : "This pass failed on the server.";
      show("failed", message);
      await settle(dispatch, run.id, "failed", message);
      return "lost";
    }

    const text = latestAssistantText(getState(), conversationId).trim();
    if (!text) {
      const message =
        "This pass was interrupted when the page closed and produced no saved output. Run it again.";
      show("failed", message);
      await settle(dispatch, run.id, "failed", message);
      return "lost";
    }

    if (!applyRecoveredOutput) {
      const message =
        "This pass finished while the page was closed, so its output was not applied here. Copy it from this window, or run the pass again.";
      show("failed", message, text);
      await settle(dispatch, run.id, "failed", message);
      return "lost";
    }

    show("restoring", "Saving it back where it belongs…", text);

    try {
      await applyRecoveredOutput(text, run);
    } catch (err) {
      captureError({
        source: "durable-run",
        relation: "transcripts.studio_runs",
        message:
          err instanceof Error
            ? err.message
            : "Could not apply a recovered studio run output.",
        userMessage: "Could not save the output of a background AI pass.",
        raw: { runId: run.id, conversationId },
      });
      const message =
        "This pass finished, but its output could not be saved here. Copy it from this window.";
      show("failed", message, text);
      await settle(dispatch, run.id, "failed", message);
      return "lost";
    }

    show("done", "Restored — it is back on the page.", text);
    await settle(dispatch, run.id, "complete", null);
    return "recovered";
  } finally {
    inFlight.delete(run.id);
  }
}
