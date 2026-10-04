"use client";

// "Make an agent from this chat" — the window every conversation menu opens.
//
// Single agent: the server reads the chat, writes the build brief, has the Agent Builder build the
// agent, and runs it once on the chat's own first request. The result is shown beside the answer the
// person accepted — a same-input replay, never a machine verdict (aidream
// `services/agent_studio/from_chat.py`). Masterwork: a draft Rulebook plus the existing conversation
// importer, opened with this chat already selected. Client: `features/agents/from-chat/service.ts`.

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Layers } from "lucide-react";

import { Button, EmptyState, SegmentedControl, Tabs } from "@ai-matrx/design-system/controls";
import { LiveRunProgress } from "@ai-matrx/chat/agents/components/live-run/LiveRunProgress";
import type {
  LiveRunProgressItem,
  LiveRunProgressState,
} from "@ai-matrx/chat/agents/components/live-run/LiveRunProgress";
import MarkdownStream from "@/components/MarkdownStream";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  FROM_CHAT_STEPS,
  makeAgentFromChat,
  startMasterworkFromChat,
  type FromChatResult,
  type FromChatStep,
} from "@/features/agents/from-chat/service";
import { useAppDispatch } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";

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
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [lane, setLane] = useState<Lane>("agent");
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [reached, setReached] = useState<FromChatStep | null>(null);
  const [says, setSays] = useState("");
  const [failure, setFailure] = useState<{ says: string; at: FromChatStep | null } | null>(null);
  const [result, setResult] = useState<FromChatResult | null>(null);
  const [tab, setTab] = useState<ResultTab>("compare");
  const [startingMasterwork, setStartingMasterwork] = useState(false);
  // ONE INTENT, ONE RULEBOOK: a second press of "Start" lands on the same draft.
  const masterworkToken = useRef<string | null>(null);

  const title = conversationTitle?.trim() || "this chat";

  const buildAgent = async () => {
    if (!conversationId) return;
    setPhase("running");
    setReached("reading");
    setSays("");
    setFailure(null);
    setResult(null);
    const answer = await makeAgentFromChat(dispatch, conversationId, (step, line) => {
      setReached(step);
      setSays(line);
    });
    if (answer.ok) {
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
      if (isOrganizationSelectionCancelled(err)) return;
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
      return { id: step, label, status, detail: index === at && phase === "running" ? says : undefined };
    }),
  };

  return (
    <WindowPanel
      title="Make an agent"
      id="agent-from-chat-window"
      minWidth={420}
      minHeight={220}
      width={phase === "done" ? 960 : 520}
      height={phase === "done" ? 680 : phase === "idle" ? 240 : 420}
      position="center"
      onClose={onClose}
      overlayId="agentFromChatWindow"
      onCollectData={() => ({ conversationId, conversationTitle })}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {phase === "idle" ? (
          <>
            <p className="truncate text-sm text-muted-foreground">From “{title}”</p>
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
          <a href={`/agents/${result.agent_id}/run`} target="_blank" rel="noreferrer">
            Run
          </a>
        </Button>
        <Button variant="primary" asChild>
          <Link href={`/agents/${result.agent_id}/build`} onClick={onOpened}>
            Open
          </Link>
        </Button>
      </div>

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
              <MarkdownStream content={result.proof_output} />
            ) : (
              <p className="text-sm text-muted-foreground">{result.proof_error ?? "No answer."}</p>
            )}
          </ComparePane>
          <ComparePane heading="What you accepted">
            {result.accepted_result ? (
              <MarkdownStream content={result.accepted_result} />
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

function ComparePane({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col rounded-md border border-border">
      <h3 className="shrink-0 border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">{heading}</h3>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}
