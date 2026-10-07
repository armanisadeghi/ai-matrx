"use client";

// features/marketing/seo/ai-visibility/try-prompt/TryOnePrompt.tsx — "Try one
// prompt" on a panel (parity X15; champions Profound's prompt runs and Ahrefs
// Brand Radar's AI responses): ask one of the panel's questions — or any typed
// question — to up to four answer engines NOW, through `seo_ai_visibility
// try_prompt` on the screen-run door (`useToolAction`).
//
// Price before anything runs: every engine is probed alone for free
// (`engine-state.ts`), so each row says "stored — free" or its exact price,
// and the one Ask button names the total it will spend. A paid ask above the
// organization's threshold shows the shared approval dialog in place.
//
// Each answer opens whole in the existing answer canvas tab
// (`ai-visibility-answer`); a capped answer is read in full from its stored
// snapshot first (`full-answer.ts`). This is one question at one moment — it
// writes no panel rows and is never a panel metric.

import { useEffect, useEffectEvent, useState } from "react";
import { MessageSquareQuote, X } from "lucide-react";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { useToolAction } from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import type { ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import { Badge, Button, Chip, Select } from "@ai-matrx/design-system/controls";
import { useCostDisplay } from "@/components/cost/useCostDisplay";

import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { openCanvasItem } from "@/features/canvas/host/openCanvasItem";
import { toast } from "@/lib/toast";
import { PROBE_MAX_COST_USD } from "../../domain-research/section-state";
import { aiAnswerOpenInput } from "../canvas/aiAnswerKind";
import { AI_VISIBILITY_ENGINES } from "../types";
import {
  SEO_AI_VISIBILITY_TOOL,
  type AnswerEngine,
  type TryPromptData,
  type TryPromptResult,
} from "../brand-lookup/types";
import { ANSWER_ENGINES, engineStatesFromOutcome, toAsk, type EngineState } from "./engine-state";
import { readFullAnswer } from "./full-answer";

import { ProTextarea } from "@/components/official/ProTextarea";
type States = Partial<Record<AnswerEngine, EngineState>>;

const engineLabel = (engine: string) =>
  AI_VISIBILITY_ENGINES.find((e) => e.id === engine)?.label ?? engine;

function StatusText({ state }: { state: EngineState | undefined }) {
  const { format } = useCostDisplay();
  if (!state || state.kind === "checking") return <span className="text-muted-foreground">Checking price…</span>;
  if (state.kind === "asking") return <span className="text-muted-foreground">Asking…</span>;
  if (state.kind === "priced") return <span className="tabular-nums">{state.estimateUsd == null ? "cost unknown" : format(state.estimateUsd)}</span>;
  if (state.kind === "error")
    return (
      <ErrorNotice
        size="inline"
        message={state.message}
        operation={`${SEO_AI_VISIBILITY_TOOL} try_prompt`}
      />
    );
  return <span className="text-muted-foreground">{state.reused ? "Stored · free" : "Answered"}</span>;
}

export function TryOnePrompt({
  siteId,
  questions,
  onClose,
}: {
  siteId: string;
  questions: string[];
  onClose: () => void;
}) {
  const { format } = useCostDisplay();
  const tool = useToolAction<ToolEnvelope<TryPromptData>>(SEO_AI_VISIBILITY_TOOL);
  const canvas = useOptionalCanvas();
  const first = (questions[0] ?? "").trim();
  const [draft, setDraft] = useState(first);
  const [prompt, setPrompt] = useState(first);
  const [selected, setSelected] = useState<AnswerEngine[]>([...ANSWER_ENGINES]);
  // States are keyed by the prompt they answer, so a late answer for a prompt
  // the person moved off lands under that prompt, never on the current one.
  // An engine with no state yet is being priced.
  const [byPrompt, setByPrompt] = useState<Record<string, States>>({});
  const states: States = byPrompt[prompt] ?? {};

  const args = (models: AnswerEngine[]) => ({
    action: "try_prompt",
    site_id: siteId,
    prompt,
    models,
  });

  const merge = (forPrompt: string, next: States) =>
    setByPrompt((prev) => ({ ...prev, [forPrompt]: { ...prev[forPrompt], ...next } }));

  const probe = (forPrompt: string, engines: readonly AnswerEngine[]) => {
    for (const engine of engines) {
      void tool
        .run({
          action: "try_prompt",
          site_id: siteId,
          prompt: forPrompt,
          models: [engine],
          max_cost_usd: PROBE_MAX_COST_USD,
        })
        .then((outcome) => merge(forPrompt, engineStatesFromOutcome(outcome, [engine], { probe: true })));
    }
  };
  const probeOnOpen = useEffectEvent((forPrompt: string) => probe(forPrompt, ANSWER_ENGINES));

  // A new prompt opens with one free price check per engine.
  useEffect(() => {
    if (prompt) probeOnOpen(prompt);
  }, [prompt]);

  const plan = toAsk(selected, states);
  const busy = Object.values(states).some((s) => s?.kind === "asking");

  const ask = async () => {
    if (!plan.engines.length) return;
    const forPrompt = prompt;
    merge(forPrompt, Object.fromEntries(plan.engines.map((e) => [e, { kind: "asking" }])) as States);
    const outcome = await tool.run(args(plan.engines));
    const next = engineStatesFromOutcome(outcome, plan.engines, { probe: false });
    if (Object.keys(next).length === 0) {
      // Declined or closed: nothing was spent. Check the prices again.
      merge(forPrompt, Object.fromEntries(plan.engines.map((e) => [e, { kind: "checking" }])) as States);
      probe(forPrompt, plan.engines);
      return;
    }
    merge(forPrompt, next);
  };

  const openAnswer = async (engine: AnswerEngine, result: TryPromptResult) => {
    let text = result.answer ?? "";
    if (result.answer_truncated && result.run_id) {
      try {
        text = (await readFullAnswer(result.run_id)) ?? text;
      } catch (error) {
        toast.error("Showing the shortened answer", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    }
    openCanvasItem(
      canvas,
      aiAnswerOpenInput(result.run_id ?? `try:${engine}:${prompt}`, {
        engine: engineLabel(engine),
        model: result.model_name ?? null,
        answer: text,
      }),
    );
  };

  const toggle = (engine: AnswerEngine) =>
    setSelected((prev) => (prev.includes(engine) ? prev.filter((e) => e !== engine) : [...prev, engine]));

  const commitDraft = () => setPrompt(draft.trim());

  return (
    <div className="flex flex-col gap-2 px-3 py-2" data-surface-value="try_one_prompt">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Try one prompt</span>
        <Button variant="quiet" icon={<X />} aria-label="Close Try one prompt" onClick={onClose} />
      </div>
      {questions.length > 1 ? (
        <Select
          value={questions.includes(prompt) ? prompt : ""}
          options={[
            { value: "", label: "Your own question" },
            ...questions.map((q) => ({ value: q, label: q })),
          ]}
          onValueChange={(q) => {
            if (!q) return;
            setDraft(q);
            setPrompt(q.trim());
          }}
          aria-label="Panel question"
        />
      ) : null}
      <ProTextarea
        aria-label="Prompt"
        placeholder="Type a buyer question"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        rows={2}
        maxLength={2000}
      />
      {draft.trim() !== prompt ? (
        <div>
          <Button onClick={commitDraft} disabled={!draft.trim()}>
            Check prices
          </Button>
        </div>
      ) : null}

      {prompt ? (
        <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60">
          {ANSWER_ENGINES.map((engine) => {
            const state = states[engine];
            const answered = state?.kind === "answered" ? state.result : null;
            return (
              <div key={engine} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs" data-engine={engine}>
                <Chip
                  asChild
                  label={engineLabel(engine)}
                  pressed={selected.includes(engine)}
                >
                  <button type="button" onClick={() => toggle(engine)} />
                </Chip>
                <span className="min-w-0 flex-1">
                  <StatusText state={state} />
                </span>
                {answered ? (
                  <>
                    {answered.mentioned === true ? (
                      <Badge tone="success">Names you</Badge>
                    ) : answered.mentioned === false ? (
                      <Badge tone="neutral">Doesn&apos;t name you</Badge>
                    ) : null}
                    <Badge tone="neutral" title={answered.cited_urls.join("\n") || undefined}>
                      {answered.cited_urls.length} cited
                    </Badge>
                    <Button
                      variant="quiet"
                      icon={<MessageSquareQuote />}
                      onClick={() => void openAnswer(engine, answered)}
                    >
                      Read answer
                    </Button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {prompt ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={plan.engines.length === 0 || busy}
            onClick={() => void ask()}
          >
            {plan.engines.length === 0
              ? "Nothing to ask"
              : `Ask ${plan.engines.length} engine${plan.engines.length === 1 ? "" : "s"} · ${plan.totalUsd == null ? "cost unknown" : format(plan.totalUsd)}`}
          </Button>
          <Badge tone="neutral" title="One question at one moment. It writes no panel data and is not a panel metric.">
            One moment, not a measurement
          </Badge>
        </div>
      ) : null}
      {tool.approvalDialog}
    </div>
  );
}
