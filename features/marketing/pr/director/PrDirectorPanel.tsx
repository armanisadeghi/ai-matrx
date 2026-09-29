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

import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { resumeConversation } from "@/features/agents/redux/execution-system/thunks/resume-conversation.thunk";
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  PR_BRAND_CONTEXT_KEY,
  PR_BRAND_CONTEXT_LABEL,
  PR_DIRECTOR_MANDATE_KEY,
  bindConversationToBrand,
  prBrandContextValue,
} from "./director-context";

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

/** The URL parameter that holds the Director's conversation across a reload. */
export const DIRECTOR_CONVERSATION_PARAM = "director";

function readHeldDirectorConversation(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get(
    DIRECTOR_CONVERSATION_PARAM,
  );
}

function holdDirectorConversation(conversationId: string): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get(DIRECTOR_CONVERSATION_PARAM) === conversationId)
    return;
  url.searchParams.set(DIRECTOR_CONVERSATION_PARAM, conversationId);
  window.history.replaceState(window.history.state, "", url.toString());
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
  const { launchMandate } = useAgentLauncher();
  const surfaceKey = `pr-director:${brandId}`;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const openedFor = useRef<string | null>(null);

  // OPEN: the conversation this page was already holding (a reload mid-answer carries it in the URL, the
  // way /chat carries its id) reopens through the canonical resume sequence — hydrate, re-surface a pending
  // tool prompt, reattach to a turn the server is still running. Only a page holding none starts a new one.
  useEffect(() => {
    if (openedFor.current === surfaceKey) return;
    openedFor.current = surfaceKey;
    let cancelled = false;
    const held = readHeldDirectorConversation();
    const opening = held
      ? dispatch(
          resumeConversation({
            conversationId: held,
            agentId: null,
            surfaceKey,
            sourceFeature: "marketing",
          }),
        )
          .unwrap()
          .then(() => held)
      : launchMandate(PR_DIRECTOR_MANDATE_KEY, {
          surfaceKey,
          sourceFeature: "marketing",
          organizationId,
        }).then((result) => result.conversationId);
    opening
      .then((id) => {
        if (!cancelled) setConversationId(id);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : String(error);
        setLaunchError(
          held
            ? `the conversation you were in could not be reopened (${reason})`
            : reason,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [surfaceKey, organizationId, launchMandate, dispatch]);

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

  // THE EDGE, once a turn has finished and the conversation has messages (the row exists then; before
  // it, assoc_add is a guaranteed refusal). Retried briefly; a refusal is said, never swallowed. Keyed on
  // the message count rather than a watched run, so a page that reloaded mid-run still binds.
  const executing = useAppSelector((state) =>
    conversationId ? selectIsExecuting(conversationId)(state) : false,
  );
  const messageCount = useAppSelector((state) =>
    conversationId ? selectMessageCount(conversationId)(state) : 0,
  );
  // HOLD IT: once a turn has been sent (the server now has the row), the id rides the URL so a reload finds
  // it. Never before — an unsent conversation has no row, and reopening it would be a failed read.
  useEffect(() => {
    if (!conversationId || (messageCount === 0 && !executing)) return;
    holdDirectorConversation(conversationId);
  }, [conversationId, messageCount, executing]);

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
    window.history.replaceState(window.history.state, "", url.toString());
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
          />
        </div>
      )}
    </section>
  );
}
