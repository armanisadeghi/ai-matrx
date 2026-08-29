"use client";

/**
 * Agent card gallery — a preview of every inline agent card (asks + approvals)
 * rendered with the shared <AgentCardShell> + <ChangeDiff> primitives.
 *
 * This is the design reference for the "agent wants to do X / confirm this /
 * here's what changed" card family. Cards are LIVE: each sample registers a real
 * resolver, so clicking Approve / Yes / Send actually resolves it and logs the
 * response envelope — no mocked buttons.
 */

import { useEffect, useState } from "react";
import { Database, LayoutGrid, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediumComponentLoading } from "@/components/matrx/LoadingComponents";
import { AskCard } from "@/features/agents/ui-first-tools/ui/AskCard";
import { ApprovalCard } from "@/features/agents/ui-first-tools/ui/ApprovalCard";
import { BatchAskCard } from "@/features/agents/ui-first-tools/ui/BatchAskCard";
import { GmailReviewCard } from "@/features/google-workspace/agent/GmailReviewCard";
import {
  groupPendingAsks,
  type PendingAsk,
} from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import { registerAskResolver } from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import type { AskUserResponse } from "@/features/agents/ui-first-tools/tools/schemas";
import type { ApprovalChange } from "@/features/agents/ui-first-tools/ui/approval-types";

const CONV = "demo-agent-cards";

type GallerySource = "full" | "recent";

interface RecentSamplesResponse {
  samples?: PendingAsk[];
  error?: string;
  details?: string;
}

function approvalAsk(callId: string, approval: ApprovalChange): PendingAsk {
  return {
    callId,
    conversationId: CONV,
    toolName: "war_room",
    kind: "approval",
    approval,
    threadId: "demo-thread",
    status: "pending",
    createdAtMs: 0,
  };
}

function ask(
  partial: Omit<PendingAsk, "conversationId" | "status" | "createdAtMs">,
): PendingAsk {
  return {
    conversationId: CONV,
    status: "pending",
    createdAtMs: 0,
    ...partial,
  };
}

const SAMPLES: PendingAsk[] = [
  approvalAsk("a0", {
    verb: "update",
    entity: "proposed change",
    title: "Agent description",
    description:
      "Badass Agent proposed this change. Replaces the agent's description — the prose shown in agent lists and the catalog explaining what this agent is for. Plain text, no markdown headings; a few sentences. Approval only stages it in the editor; you still review and save.",
    fields: [
      {
        label: "Proposed value",
        after:
          "I'm the last set of eyes on every item that hits your intake dock.\n\n" +
          "You hand me the photos — dim, dusty, shot in a hurry off the back of a pallet — and I turn them into a permanent, structured record. I work in JSON only, and I return exactly one analysis object per batch.\n\n" +
          "Every detail remains visible here before you decide, including the final sentence that used to be hidden by the four-line clamp.",
        block: true,
      },
    ],
  }),
  approvalAsk("a1", {
    verb: "add",
    entity: "subtask",
    title:
      "Context-window hygiene: war_room manifest inlines all 31 threads in full + advertises an unresolvable tradeoff",
    fields: [
      {
        label: "Notes",
        after:
          "The inline block grows linearly with thread count; cap it and pull heavy bodies with tools instead.",
        block: true,
      },
    ],
    autoApprove: { scope: "task", noun: "task changes" },
  }),
  approvalAsk("a2", {
    verb: "update",
    entity: "task",
    title: "Ship the approval-card redesign",
    fields: [
      { label: "Status", before: "incomplete", after: "completed" },
      { label: "Priority", before: null, after: "high" },
      { label: "Due date", before: "2026-06-30", after: "2026-06-24" },
    ],
    autoApprove: { scope: "task", noun: "task changes" },
  }),
  approvalAsk("a3", {
    verb: "rename",
    entity: "tile",
    title: "Untitled thread",
    fields: [
      { label: "Name", before: "Untitled thread", after: "Billing migration" },
    ],
    autoApprove: { scope: "tile", noun: "tile renames" },
  }),
  ask({
    callId: "c1",
    toolName: "user",
    kind: "confirm",
    header: "Deploy",
    question: "Push the current branch to production?",
  }),
  ask({
    callId: "c2",
    toolName: "user",
    kind: "choice",
    question: "Which strategy should I use to migrate the rows?",
    options: [
      {
        label: "Backfill in batches",
        description: "Safer; ~10 min",
        preview: "UPDATE … LIMIT 1000\n-- repeat until 0 rows",
      },
      {
        label: "Single transaction",
        description: "Faster; locks the table",
        preview: "BEGIN;\nUPDATE … ;\nCOMMIT;",
      },
    ],
    allowOther: true,
  }),
  ask({
    callId: "c3",
    toolName: "user",
    kind: "choice_many",
    question: "Which surfaces should I update?",
    options: [
      { label: "Web" },
      { label: "Desktop" },
      { label: "Chrome extension" },
      { label: "Mobile" },
    ],
  }),
  ask({
    callId: "t1",
    toolName: "user",
    kind: "text",
    question: "What should the commit message say?",
  }),
  ask({
    callId: "s1",
    toolName: "user",
    kind: "secret",
    question: "Paste the API key to use for this call.",
  }),
  ask({
    callId: "n1",
    toolName: "ui",
    kind: "notify",
    level: "warning",
    message:
      "The export is large (480 MB). Generating it may take a few minutes.",
    actions: ["Continue", "Cancel"],
  }),
  ask({
    callId: "p1",
    toolName: "update_plan",
    kind: "plan_approval",
    plan: {
      title: "Unify the agent card design language",
      reasoning: "Extract the shell + diff so every surface inherits one look.",
      steps: [
        "Extract ChangeDiff + AgentCardShell primitives",
        "Refactor ApprovalCard onto them",
        "Redesign AskCard onto the shell",
      ],
      estimated_minutes: 45,
    },
  }),
  // The Gmail consent surface. Sending is genuinely live here too: the demo
  // connection id is not a real one, so pressing Send exercises the refusal
  // path ("Nothing was sent") instead of mailing anybody.
  ask({
    callId: "g1",
    toolName: "google_email_send",
    kind: "email_review",
    email: {
      connectionId: "demo-connection",
      fromEmail: "you@yourcompany.com",
      to: "dana@clientco.com",
      cc: [],
      subject: "Notes from today's call",
      body:
        "Hi Dana,\n\nThanks for the time today. Recapping what we agreed:\n\n" +
        "- We'll send the revised scope by Friday\n" +
        "- You'll confirm the budget line internally\n\n" +
        "Anything I missed?\n\nBest,\nAlex",
    },
  }),
  ask({
    callId: "k1",
    toolName: "request_user_takeover",
    kind: "takeover",
    question:
      "I'm blocked on the login step — can you sign in, then tell me what you did?",
  }),
  // Batched `user` ask — renders as ONE wizard with free back/forth navigation.
  ask({
    callId: "b1.0",
    toolName: "user",
    kind: "confirm",
    header: "Omni Flash",
    batchId: "b1",
    batchIndex: 0,
    batchTotal: 3,
    question:
      'For Gemini Omni Flash — a new video-gen model on the Interactions API — I\'ll create a new ai.api with translator_key "google_omni_video" against the "google_interactions" ai.endpoint, then insert it. OK to proceed?',
  }),
  ask({
    callId: "b1.1",
    toolName: "user",
    kind: "choice_many",
    header: "Image models",
    batchId: "b1",
    batchIndex: 1,
    batchTotal: 3,
    question: "Which of the new GA image models should I add?",
    options: [
      {
        label: "gemini-3.1-flash-lite-image",
        description: "Nano Banana Lite (GA)",
      },
      {
        label: "gemini-3.1-flash-image",
        description: "GA — alongside preview row",
      },
      {
        label: "gemini-3-pro-image",
        description: "GA — alongside preview row",
      },
      {
        label: "Deprecate the two -preview image rows",
        description: "Docs: shut down",
      },
    ],
    allowOther: true,
  }),
  ask({
    callId: "b1.2",
    toolName: "user",
    kind: "text",
    header: "Notes",
    batchId: "b1",
    batchIndex: 2,
    batchTotal: 3,
    question: "Any naming or tagging preferences for the new rows?",
  }),
];

export default function AgentCardGalleryPage() {
  const [asks, setAsks] = useState<PendingAsk[]>(SAMPLES);
  const [log, setLog] = useState<{ callId: string; summary: string }[]>([]);
  const [source, setSource] = useState<GallerySource>("full");
  const [recentSamples, setRecentSamples] = useState<PendingAsk[]>([]);
  const [recentState, setRecentState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [recentError, setRecentError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (source !== "recent") return;
    let active = true;

    async function loadRecentSamples() {
      try {
        const response = await fetch(
          "/api/admin/tool-call-samples?mode=interactions",
          {
            cache: "no-store",
          },
        );
        const body = (await response.json()) as RecentSamplesResponse;
        if (!response.ok) {
          throw new Error(
            body.details || body.error || "Recent calls could not be loaded.",
          );
        }
        if (!active) return;
        const next = Array.isArray(body.samples) ? body.samples : [];
        setRecentSamples(next);
        setAsks(next);
        setLog([]);
        setRecentState("ready");
      } catch (error) {
        if (!active) return;
        setRecentError(
          error instanceof Error
            ? error.message
            : "Recent calls could not be loaded.",
        );
        setRecentState("error");
      }
    }

    void loadRecentSamples();
    return () => {
      active = false;
    };
  }, [source, refreshKey]);

  // Register a real resolver per visible card, so clicking actually resolves.
  useEffect(() => {
    for (const a of asks) {
      registerAskResolver(a.callId, (r: AskUserResponse) => {
        setLog((l) =>
          [{ callId: a.callId, summary: summarize(r) }, ...l].slice(0, 12),
        );
        setAsks((cur) => cur.filter((x) => x.callId !== a.callId));
      });
    }
  }, [asks]);

  return (
    <div className="min-h-dvh bg-textured">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <div className="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Agent cards</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review every inline interaction in one place. Every button
              resolves only this gallery copy and logs its response below.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAsks(source === "full" ? SAMPLES : recentSamples);
              setLog([]);
            }}
            className="h-11 shrink-0 gap-1.5 sm:h-9"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>

        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-border/70 bg-card/70 p-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1">
            <Button
              variant={source === "full" ? "secondary" : "ghost"}
              size="sm"
              className="h-11 flex-1 gap-1.5 sm:h-9 sm:flex-none"
              onClick={() => {
                setSource("full");
                setAsks(SAMPLES);
                setLog([]);
              }}
            >
              <LayoutGrid className="size-3.5" />
              Full gallery
            </Button>
            <Button
              variant={source === "recent" ? "secondary" : "ghost"}
              size="sm"
              className="h-11 flex-1 gap-1.5 sm:h-9 sm:flex-none"
              onClick={() => {
                setRecentState("loading");
                setRecentError(null);
                setSource("recent");
              }}
            >
              <Database className="size-3.5" />
              Recent calls
            </Button>
          </div>
          {source === "recent" && recentState === "ready" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 gap-1.5 sm:h-9"
              onClick={() => {
                setRecentState("loading");
                setRecentError(null);
                setRefreshKey((key) => key + 1);
              }}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          )}
        </div>

        {source === "recent" && (
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Read-only replays from persisted calls. Secret prompts, email calls,
            outputs, owner identity, and conversation identity are excluded.
          </p>
        )}

        {source === "recent" && recentState === "loading" && (
          <div className="rounded-xl border border-border/60 bg-card/40 py-4">
            <MediumComponentLoading />
          </div>
        )}

        {source === "recent" && recentState === "error" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-foreground">
              Recent calls could not be loaded.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{recentError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-11 gap-1.5 sm:h-9"
              onClick={() => {
                setRecentState("loading");
                setRecentError(null);
                setRefreshKey((key) => key + 1);
              }}
            >
              <RefreshCw className="size-3.5" />
              Try again
            </Button>
          </div>
        )}

        <div
          className={
            source === "recent" && recentState !== "ready"
              ? "hidden"
              : "flex flex-col gap-3"
          }
        >
          {groupPendingAsks(asks).map((group) => {
            const first = group.asks[0];
            const card = (() => {
              if (group.asks.length > 1) {
                return <BatchAskCard key={group.key} asks={group.asks} />;
              }
              if (first.kind === "approval") {
                return <ApprovalCard key={first.callId} ask={first} />;
              }
              if (first.kind === "email_review") {
                return <GmailReviewCard key={first.callId} ask={first} />;
              }
              return <AskCard key={first.callId} ask={first} />;
            })();
            return (
              <div key={group.key} className="contents">
                {source === "recent" && (
                  <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
                    <span>{humanizeToolName(first.toolName)}</span>
                    <time dateTime={new Date(first.createdAtMs).toISOString()}>
                      {formatTimestamp(first.createdAtMs)}
                    </time>
                  </div>
                )}
                {card}
              </div>
            );
          })}
          {asks.length === 0 && recentState === "ready" && (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
              {recentSamples.length === 0
                ? "No safe recent interactions were found."
                : "All cards resolved. Hit Reset to bring them back."}
            </div>
          )}
        </div>

        {log.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Resolved
            </div>
            <div className="flex flex-col gap-1">
              {log.map((entry, i) => (
                <div
                  key={`${entry.callId}-${i}`}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 text-xs"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                    {entry.callId}
                  </code>
                  <span className="text-muted-foreground">{entry.summary}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function humanizeToolName(toolName: string): string {
  if (toolName === "apply_surface_write") return "Surface change approval";
  if (toolName === "update_plan") return "Plan approval";
  if (toolName === "request_user_takeover") return "User takeover";
  return "Agent question";
}

function formatTimestamp(createdAtMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(createdAtMs);
}

function summarize(r: AskUserResponse): string {
  if (r.cancelled) return "dismissed";
  if (r.timed_out) return "timed out";
  if (r.wrote_instead) return `wrote instead: "${r.freeform ?? ""}"`;
  if (r.freeform) return `responded: "${r.freeform}"`;
  if (r.confirmed === true) return "approved / yes";
  if (r.confirmed === false) return "declined / no";
  if (r.answer != null) return `answer: "${r.answer}"`;
  if (r.selected) return `selected: ${r.selected.join(", ")}`;
  if (r.action) return `action: ${r.action}`;
  return "resolved";
}
