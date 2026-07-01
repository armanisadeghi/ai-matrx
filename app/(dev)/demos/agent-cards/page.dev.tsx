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
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AskCard } from "@/features/agents/ui-first-tools/ui/AskCard";
import { ApprovalCard } from "@/features/agents/ui-first-tools/ui/ApprovalCard";
import { BatchAskCard } from "@/features/agents/ui-first-tools/ui/BatchAskCard";
import {
  groupPendingAsks,
  type PendingAsk,
} from "@/features/agents/ui-first-tools/redux/pending-asks.slice";
import { registerAskResolver } from "@/features/agents/ui-first-tools/redux/ask-resolver-registry";
import type { AskUserResponse } from "@/features/agents/ui-first-tools/tools/schemas";
import type { ApprovalChange } from "@/features/agents/ui-first-tools/ui/approval-types";

const CONV = "demo-agent-cards";

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
      'For Gemini Omni Flash — a new video-gen model on the Interactions API — I\'ll create a new api_class "google_omni_video" and endpoint tag "google_interactions", then insert it. OK to proceed?',
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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Agent cards</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The inline ask + approval card family. Live — clicking resolves
              the card and logs its response.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAsks(SAMPLES);
              setLog([]);
            }}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {groupPendingAsks(asks).map((group) => {
            if (group.asks.length > 1) {
              return <BatchAskCard key={group.key} asks={group.asks} />;
            }
            const a = group.asks[0];
            return a.kind === "approval" ? (
              <ApprovalCard key={a.callId} ask={a} />
            ) : (
              <AskCard key={a.callId} ask={a} />
            );
          })}
          {asks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
              All cards resolved. Hit Reset to bring them back.
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
