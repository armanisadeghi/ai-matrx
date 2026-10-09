"use client";

// "Make an agent from this chat" — the window every conversation menu opens.
//
// Single agent: the server reads the chat, writes the build brief, has the Agent Builder build the
// agent, and runs it once on the chat's own first request. The result is shown beside the answer the
// person accepted — a same-input replay, never a machine verdict (aidream
// `services/agent_studio/from_chat.py`). Masterwork: a draft Rulebook plus the existing conversation
// importer, opened with this chat already selected. Client: `features/agents/from-chat/service.ts`.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Layers, MessagesSquare } from "lucide-react";

import { Button, EmptyState, SegmentedControl, Tabs } from "@ai-matrx/design-system/controls";
import { LiveRunProgress } from "@ai-matrx/chat/agents/components/live-run/LiveRunProgress";
import { LiveRunDisplay } from "@ai-matrx/chat/agents/components/live-run/LiveRunDisplay";
import type {
  LiveRunProgressItem,
  LiveRunProgressState,
} from "@ai-matrx/chat/agents/components/live-run/LiveRunProgress";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { BuildProgress } from "@/features/agents/factory/components/BuildProgress";
import { ExamplesField, ProofCount, emptyExamples, filledExamples } from "@/features/agents/factory/components/ExamplesField";
import { useFactoryDoor } from "@/features/agents/factory/door";
import {
  FROM_CHAT_STEPS,
  continueWithAgentHref,
  fromChatRunHref,
  latestAgentFromChat,
  makeAgentFromChat,
  resultRuns,
  startMasterworkFromChat,
  type FromChatResult,
  type FromChatStep,
} from "@/features/agents/from-chat/service";
import { useAppDispatch } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { toast } from "@/lib/toast";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { adminDoorOpen } from "@/lib/api/adminDoor";
import { agentGoHref } from "@ai-matrx/chat/agents/addressing/agentAddress";

type Lane = "agent" | "masterwork";
type ResultTab = "compare" | "requirements" | "inputs";

interface AgentFromChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string | null;
  conversationTitle?: string | null;
}

export default function AgentFromChatWindow({
  isOpen,
  onClose,
  conversationId,
  conversationTitle,
}: AgentFromChatWindowProps) {
  if (!isOpen) return null;
  return (
    <AgentFromChatWindowInner
      // A singleton reopened for ANOTHER chat starts over, never shows the last chat's agent.
      key={conversationId ?? "none"}
      onClose={onClose}
      conversationId={conversationId}
      conversationTitle={conversationTitle ?? null}
    />
  );
}

function AgentFromChatWindowInner({
  onClose,
  conversationId,
  conversationTitle,
}: Omit<AgentFromChatWindowProps, "isOpen">) {
  // Inside /administration this window works on any person's chat and builds FOR its owner
  // (the one admin-door rule, lib/api/adminDoor.ts — decided by the page, never a flag).
  const asAdmin = adminDoorOpen();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [lane, setLane] = useState<Lane>("agent");
  const [phase, setPhase] = useState<"idle" | "running" | "building" | "done" | "failed">("idle");
  const [reached, setReached] = useState<FromChatStep | null>(null);
  const [says, setSays] = useState("");
  const [failure, setFailure] = useState<{ says: string; at: FromChatStep | null } | null>(null);
  const [result, setResult] = useState<FromChatResult | null>(null);
  // AF-D door #4 on `pipeline`: the Agent Factory build the server started for this chat.
  const [buildId, setBuildId] = useState<string | null>(null);
  // R55: what the started build really proves on, as the server counted it.
  const [proof, setProof] = useState<{ cases: number | null; says: string } | null>(null);
  const [tab, setTab] = useState<ResultTab>("compare");
  // NOTHING IS HIDDEN (Arman, 2026-10-07): the live stream of every sub-run, and each step's stored run.
  const [liveRequestId, setLiveRequestId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Partial<Record<FromChatStep, string>>>({});
  // R52: on the factory path the person may add examples; the chat's own request is case 1.
  const pipelineMode = useFactoryDoor("from_chat") === "pipeline";
  const [examples, setExamples] = useState<string[]>(() => emptyExamples().slice(0, 2));
  const [startingMasterwork, setStartingMasterwork] = useState(false);
  // ONE INTENT, ONE RULEBOOK: a second press of "Start" lands on the same draft.
  const masterworkToken = useRef<string | null>(null);

  const title = conversationTitle?.trim() || "this chat";

  // The last agent made from this chat, read back from the record (it outlives a reload).
  const [previous, setPrevious] = useState<FromChatResult | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    let live = true;
    latestAgentFromChat(conversationId)
      .then((found) => {
        if (live) setPrevious(found);
      })
      .catch(() => {
        // Only a convenience door: the build itself never depends on it.
      });
    return () => {
      live = false;
    };
  }, [conversationId]);

  const buildAgent = async () => {
    if (!conversationId) return;
    setPhase("running");
    setReached("reading");
    setSays("");
    setFailure(null);
    setResult(null);
    setBuildId(null);
    setProof(null);
    setLiveRequestId(null);
    setRuns({});
    const answer = await makeAgentFromChat(
      dispatch,
      conversationId,
      (step, line, run) => {
        setReached(step);
        setSays(line);
        if (run) setRuns((r) => ({ ...r, [step]: run }));
      },
      pipelineMode ? examples : [],
      setLiveRequestId,
    );
    if (answer.ok && "buildId" in answer) {
      setBuildId(answer.buildId);
      setProof({ cases: answer.proofCases, says: answer.says });
      setPhase("building");
    } else if (answer.ok) {
      setResult(answer.result);
      setTab("compare");
      setPhase("done");
    } else {
      setFailure({ says: answer.says, at: answer.failedAt });
      setPhase("failed");
    }
  };

  const startMasterwork = async () => {
    if (!conversationId) return;
    if (asAdmin) {
      // The importer distils only the caller's own chats; the admin door is a tracked promise.
      void announceComingSoon("agents.admin-masterwork-from-chat");
      return;
    }
    setStartingMasterwork(true);
    try {
      // Asks the person to pick one when none is selected; never picks for them.
      const organizationId = await ensureOrgId(null);
      masterworkToken.current ??= crypto.randomUUID();
      const href = await startMasterworkFromChat({
        conversationId,
        title: conversationTitle ?? "",
        organizationId,
        clientToken: masterworkToken.current,
      });
      onClose();
      router.push(href);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The Masterwork could not be started.");
    } finally {
      setStartingMasterwork(false);
    }
  };

  const progress: LiveRunProgressState = {
    title: "Making your agent",
    shape: "sequence",
    items: FROM_CHAT_STEPS.map(({ step, label }): LiveRunProgressItem => {
      const index = FROM_CHAT_STEPS.findIndex((s) => s.step === step);
      const at = FROM_CHAT_STEPS.findIndex((s) => s.step === (failure?.at ?? reached));
      const status =
        phase === "done" || index < at
          ? "completed"
          : index === at
            ? phase === "failed"
              ? "failed"
              : "running"
            : "waiting";
      return { id: step, label, status, detail: index === at && (phase === "running" || phase === "failed") ? says : undefined };
    }),
  };

  return (
    <WindowPanel
      // ONE SIZE, from the first frame: the window sizes itself only when it opens, so a small
      // "idle" size stayed small for the live run and the result (the "midget window", 2026-10-07).
      title="Make an agent"
      id="agent-from-chat-window"
      minWidth={420}
      minHeight={320}
      width={980}
      height={760}
      position="center"
      onClose={onClose}
      overlayId="agentFromChatWindow"
      onCollectData={() => ({ conversationId, conversationTitle })}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {phase === "idle" ? (
          <>
            <p className="truncate text-sm text-muted-foreground">
              From “{title}”{asAdmin ? " · built for its owner" : ""}
            </p>
            <SegmentedControl
              aria-label="What to make"
              value={lane}
              onValueChange={setLane}
              data={[
                { value: "agent", label: "Single agent" },
                { value: "masterwork", label: "Masterwork" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {lane === "agent"
                ? "One agent that gets this result on the first try."
                : "A Rulebook built from this chat, for a multi-step job."}
            </p>
            {pipelineMode && lane === "agent" ? (
              <ExamplesField examples={examples} onChange={setExamples} supplied={1} />
            ) : null}
            {previous ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <AGENT_ICON className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs">Made: {previous.agent_name}</span>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setResult(previous);
                    setTab("compare");
                    setPhase("done");
                  }}
                >
                  Show result
                </Button>
              </div>
            ) : null}
            <div className="flex justify-end">
              {lane === "agent" ? (
                <Button variant="primary" icon={<AGENT_ICON className="h-4 w-4" />} onClick={buildAgent} disabled={!conversationId}>
                  Build agent
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<Layers className="h-4 w-4" />}
                  onClick={startMasterwork}
                  disabled={!conversationId || startingMasterwork}
                >
                  Start Masterwork
                </Button>
              )}
            </div>
          </>
        ) : null}

        {phase === "running" || phase === "failed" ? <LiveRunProgress progress={progress} /> : null}

        {phase !== "idle" ? <StepRuns runs={runs} /> : null}

        {(phase === "running" || phase === "failed") && liveRequestId ? (
          <section className="flex min-h-[240px] flex-1 flex-col rounded-md border border-border">
            <h3 className="shrink-0 border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Live output
            </h3>
            <LiveRunDisplay requestId={liveRequestId} variant="bare" bodyClassName="min-h-0 flex-1 overflow-y-auto p-3" />
          </section>
        ) : null}

        {phase === "building" && buildId && proof && proof.cases !== null ? (
          <div className="space-y-1 text-xs text-muted-foreground" data-testid="from-chat-proof-cases">
            <p>
              <ProofCount count={proof.cases} />
            </p>
            {/* Fewer cases than the person gave (chat + examples): the server's line says which and why. */}
            {proof.cases < filledExamples(examples).length + 1 ? <p>{proof.says}</p> : null}
          </div>
        ) : null}
        {phase === "building" && buildId ? <BuildProgress buildId={buildId} onRebuilt={setBuildId} /> : null}

        {phase === "failed" && failure ? (
          <EmptyState
            icon={<AGENT_ICON className="h-5 w-5" />}
            title="The agent was not made"
            line={failure.says}
            action={
              <Button variant="outline" onClick={buildAgent}>
                Try again
              </Button>
            }
          />
        ) : null}

        {phase === "done" && result ? (
          <AgentFromChatResult
            result={result}
            tab={tab}
            onTab={setTab}
            onMasterwork={startMasterwork}
            masterworkBusy={startingMasterwork}
            onOpened={onClose}
          />
        ) : null}
      </div>
    </WindowPanel>
  );
}

function AgentFromChatResult({
  result,
  tab,
  onTab,
  onMasterwork,
  masterworkBusy,
  onOpened,
}: {
  result: FromChatResult;
  tab: ResultTab;
  onTab: (tab: ResultTab) => void;
  onMasterwork: () => void;
  masterworkBusy: boolean;
  onOpened: () => void;
}) {
  // Defaulted lists on the wire: absent means none.
  const goals = result.goals ?? [];
  const variables = result.variables ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <AGENT_ICON className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{result.agent_name}</span>
        {result.fit === "masterwork" ? (
          <Button
            variant="quiet"
            icon={<Layers className="h-4 w-4" />}
            onClick={onMasterwork}
            disabled={masterworkBusy}
            title={result.fit_reason}
          >
            Masterwork instead
          </Button>
        ) : null}
        <Button variant="outline" asChild iconEnd={<ExternalLink className="h-4 w-4" />}>
          <a href={agentGoHref(result.agent_id, "/run")} target="_blank" rel="noreferrer">
            Run
          </a>
        </Button>
        <Button variant="outline" asChild>
          <Link href={agentGoHref(result.agent_id, "/build")} onClick={onOpened}>
            Open
          </Link>
        </Button>
        <Button variant="primary" asChild icon={<MessagesSquare className="h-4 w-4" />}>
          <a href={continueWithAgentHref(result)} target="_blank" rel="noreferrer" title="The agent in the builder, with the agent that wrote it in the side chat">
            Keep working on it
          </a>
        </Button>
      </div>
      <StepRuns runs={resultRuns(result)} />

      <Tabs
        aria-label="Result"
        value={tab}
        onValueChange={onTab}
        data={[
          { value: "compare", label: "Side by side" },
          { value: "requirements", label: "Requirements", count: goals.length },
          { value: "inputs", label: "Inputs", count: variables.length },
        ]}
      />

      {tab === "compare" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          <ComparePane heading="First try, same inputs">
            {result.proof_output ? (
              <RichContent level="full" imagePolicy="ai" source={result.proof_output} />
            ) : (
              <p className="text-sm text-muted-foreground">{result.proof_error ?? "No answer."}</p>
            )}
          </ComparePane>
          <ComparePane heading="What you accepted">
            {result.accepted_result ? (
              <RichContent level="full" imagePolicy="ai" source={result.accepted_result} />
            ) : (
              <p className="text-sm text-muted-foreground">The accepted result is not text in this chat.</p>
            )}
          </ComparePane>
        </div>
      ) : null}

      {tab === "requirements" ? (
        <ul className="min-h-0 flex-1 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
          {goals.map((goal, index) => (
            <li key={`${index}:${goal}`}>{goal}</li>
          ))}
        </ul>
      ) : null}

      {tab === "inputs" ? (
        <dl className="min-h-0 flex-1 space-y-2 overflow-y-auto text-sm">
          {variables.map((v) => (
            <div key={v.name}>
              <dt className="font-medium">{v.name}</dt>
              <dd className="truncate text-muted-foreground" title={v.test_value}>
                {v.test_value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** Every finished step's stored run, opened in full in a new tab — nothing about the build is hidden. */
function StepRuns({ runs }: { runs: Partial<Record<FromChatStep, string>> }) {
  const named = FROM_CHAT_STEPS.filter(({ step }) => runs[step]);
  if (named.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="from-chat-step-runs">
      <span>Full runs:</span>
      {named.map(({ step, label }) => (
        <a
          key={step}
          href={fromChatRunHref(runs[step] as string)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          {label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

function ComparePane({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-md border border-border">
      <h3 className="shrink-0 border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">{heading}</h3>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}
