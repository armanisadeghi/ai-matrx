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
import { selectIsExecuting } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
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
export const PR_STARTING_POINTS: ReadonlyArray<{ label: string; text: string; send: boolean }> = [
  { label: "What should we do first?", text: "What is our best PR move right now? Give me a plan.", send: true },
  {
    label: "Plan the next quarter",
    text: "Plan our PR for the next quarter: which dated moments should we own, and what would we say?",
    send: true,
  },
  { label: "Is this newsworthy?", text: "Is this newsworthy for us: ", send: false },
  { label: "A reporter asked us…", text: "A reporter is asking for sources on this — should we answer, and how? ", send: false },
];

type BindState = "idle" | "binding" | "bound" | { refused: string };

export interface PrDirectorPanelProps {
  brandId: string;
  brandName: string;
  organizationId: string;
  className?: string;
}

export function PrDirectorPanel({ brandId, brandName, organizationId, className }: PrDirectorPanelProps) {
  const dispatch = useAppDispatch();
  const { launchMandate } = useAgentLauncher();
  const surfaceKey = `pr-director:${brandId}`;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (openedFor.current === surfaceKey) return;
    openedFor.current = surfaceKey;
    let cancelled = false;
    launchMandate(PR_DIRECTOR_MANDATE_KEY, {
      surfaceKey,
      sourceFeature: "marketing",
      organizationId,
    })
      .then((result) => {
        if (!cancelled) setConversationId(result.conversationId);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLaunchError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [surfaceKey, organizationId, launchMandate]);

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

  // THE EDGE, once the first turn has finished (the conversation row exists then; before it, assoc_add
  // is a guaranteed refusal). Retried briefly; a refusal is said, never swallowed.
  const executing = useAppSelector((state) => (conversationId ? selectIsExecuting(conversationId)(state) : false));
  const sawRun = useRef(false);
  const [bind, setBind] = useState<BindState>("idle");
  useEffect(() => {
    if (!conversationId) return;
    if (executing) {
      sawRun.current = true;
      return;
    }
    if (!sawRun.current || bind !== "idle") return;
    setBind("binding");
    let cancelled = false;
    void (async () => {
      let last: string | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        last = await bindConversationToBrand({ conversationId, brandId, organizationId });
        if (last === null || cancelled) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setBind(last === null ? "bound" : { refused: last });
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, executing, bind, brandId, organizationId]);

  const start = useCallback(
    (text: string, send: boolean) => {
      if (!conversationId) return;
      dispatch(setUserInputText({ conversationId, text }));
      if (send) void dispatch(smartExecute({ conversationId }));
    },
    [conversationId, dispatch],
  );

  const landing = (
    <div className="flex flex-col gap-3 px-1 py-4">
      <div className="flex items-center gap-2">
        <Megaphone className="size-4 text-primary" aria-hidden />
        <p className="text-sm font-semibold">Your PR director</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Tell it what is going on at {brandName}. It already knows what we have on file — the company, its facts,
        recent coverage and the news monitor — and it will give you a main play and two backups, each one a
        button.
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
          <span className="truncate text-[11px] text-muted-foreground">About: {brandName}</span>
        </div>
        {bind === "binding" ? (
          <span className="text-[11px] text-muted-foreground">Saving this chat to {brandName}…</span>
        ) : typeof bind === "object" ? (
          <span className="text-[11px] text-destructive" title={bind.refused}>
            This chat is not saved to {brandName}; reopening it elsewhere will not carry the brand.
          </span>
        ) : null}
      </header>
      {launchError ? (
        <p role="alert" className="m-3 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs">
          The PR director could not be opened: {launchError}
        </p>
      ) : !conversationId ? (
        <p className="p-3 text-xs text-muted-foreground">Opening your PR director…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <AgentConversationColumn conversationId={conversationId} surfaceKey={surfaceKey} landingContent={landing} />
        </div>
      )}
    </section>
  );
}
