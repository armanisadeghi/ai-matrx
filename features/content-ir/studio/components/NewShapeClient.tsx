"use client";

/**
 * Create a Shape — the DEDICATED destination.
 *
 * Two ways to make a Shape, and they are deliberately different experiences:
 *
 *   - From anywhere else in the app, the `shape_builder` role opens in a
 *     floating window so you never leave what you were doing. Generic chrome
 *     is the right answer there: the point is not leaving.
 *   - You came HERE, from the home of Shapes, to make one. That deserves a
 *     purpose-built interface that asks the questions that actually decide a
 *     Shape — not the same generic agent window with a wall of variables.
 *
 * So this page asks, in the words of a non-technical expert: what is it, what
 * does one of these hold, what does your real data look like, how should it
 * draw, one or a set, who can use it, and what should we build alongside it.
 * Those answers compose into the builder agent's brief (`new-shape-options.ts`)
 * and the run streams into the right-hand pane, where the conversation stays
 * open so they can keep working with the agent.
 *
 * ON THE FLOATING LAW (features/window-panels/FEATURE.md § THE ONE EXCEPTION):
 * the run renders inline rather than in `LiveRunWindow` because this surface
 * earns it — the interface is purpose-built for one kind of work, and the
 * result pane is present at a fixed size from first paint, so starting a run
 * shifts NOTHING on the page. It fills a box that was already there.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  CircleAlert,
  Loader2,
  RotateCcw,
  Shapes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { selectInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createShapesScope } from "@/features/surfaces/manifests/shapes.manifest";
import {
  SHAPES_ALL_HREF,
  SHAPES_SURFACE_NAME,
  SHAPE_BUILDER_ROLE,
} from "@/features/content-ir/studio/constants";
import {
  NEW_SHAPE_ASSETS,
  NEW_SHAPE_CARDINALITIES,
  NEW_SHAPE_EMPTY_ANSWERS,
  NEW_SHAPE_RENDER_STYLES,
  NEW_SHAPE_VISIBILITIES,
  composeNewShapeBrief,
  newShapeAnswersReady,
  type NewShapeAnswers,
  type NewShapeAsset,
} from "@/features/content-ir/studio/new-shape-options";
import { cn } from "@/lib/utils";

// The result pane is this tall from first paint, empty state included, so the
// page geometry never changes when a run starts (see the floating-law note).
const RESULT_PANE_H = "h-[clamp(24rem,68vh,44rem)]";

// ---------------------------------------------------------------- form parts

function FieldBlock({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {hint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Icon tiles — a radio group that shows its options instead of describing them. */
function TileChoice<T extends string>({
  options,
  value,
  onChange,
  columns = "sm:grid-cols-3",
}: {
  options: ReadonlyArray<{
    id: T;
    label: string;
    description: string;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  value: T;
  onChange: (next: T) => void;
  columns?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn("grid grid-cols-1 gap-2", columns)}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "group flex min-h-[44px] flex-col rounded-md border p-2.5 text-left transition-colors",
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-background hover:border-primary/40 hover:bg-accent/50",
            )}
          >
            <span className="flex items-center gap-1.5">
              {Icon ? (
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}
                />
              ) : null}
              <span className="text-xs font-medium text-foreground">
                {option.label}
              </span>
              {selected ? (
                <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
              ) : null}
            </span>
            <span className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ run pane

/**
 * The launched run. Mounted only once the user submits, so the conversation is
 * created at that moment and never before. Managed-mode `useAgentLauncher`
 * gives a stable id with `displayMode: "direct"` — no overlay, the pane owns
 * the UI — and `AgentRunner` supplies the transcript plus the composer, so the
 * conversation stays open for follow-up work after the Shape lands.
 */
function ShapeBuilderRun({
  agentId,
  answers,
  applicationScope,
  onComplete,
}: {
  agentId: string;
  answers: NewShapeAnswers;
  applicationScope: Record<string, unknown>;
  /** Fired on the running/streaming → complete edge, so the page can stop
   *  claiming it is still building something that already landed. */
  onComplete: () => void;
}) {
  const { launchAgent } = useAgentLauncher();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const launchedRef = useRef(false);

  // ONE imperative launch, owned by the thunk end to end.
  //
  // Managed mode is the wrong tool here and the reason matters: it hands back
  // a conversation id synchronously from a minted ref, a beat before its
  // effect creates the instance, and in `direct` mode the instance is created
  // at status "draft" and never promoted to "ready" — so neither "the id
  // exists" nor "status is ready" is a usable signal that there is something
  // to run (measured live: the pane sat on "Ready to run" while the user
  // waited). The thunk's own `autoRun` fires the first turn AFTER it has
  // seeded the brief, the variables and the surface scope, in that order,
  // which is the only ordering that is correct. Nothing double-fires:
  // AgentRunner's auto-run gate requires status "ready", which `direct` never
  // reaches.
  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    const seed = composeNewShapeBrief(answers);
    void launchAgent(agentId, {
      surfaceKey: `surface-role:${SHAPES_SURFACE_NAME}:${SHAPE_BUILDER_ROLE}`,
      sourceFeature: "ai-results",
      config: {
        displayMode: "direct",
        autoRun: true,
        allowChat: true,
        showVariablePanel: false,
      },
      runtime: {
        surfaceName: SHAPES_SURFACE_NAME,
        applicationScope,
        variables: seed.variables,
        userInput: seed.userInput,
      },
      onConversationCreated: setConversationId,
    }).catch((err: unknown) => {
      console.error("[NewShapeClient] the Shape builder failed to start:", err);
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [agentId, answers, applicationScope, launchAgent]);

  const status = useAppSelector(
    conversationId ? selectInstanceStatus(conversationId) : () => undefined,
  );
  const prevStatusRef = useRef<typeof status>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status === "complete" && (prev === "running" || prev === "streaming")) {
      onComplete();
    }
  }, [status, onComplete]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <CircleAlert className="h-6 w-6 text-destructive" aria-hidden />
        <p className="mt-2 text-sm font-medium text-foreground">
          The Shape builder could not start.
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Starting the builder…
      </div>
    );
  }
  return <AgentRunner conversationId={conversationId} className="h-full" />;
}

function ResultPaneEmpty({ ready }: { ready: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="rounded-full bg-primary/10 p-3">
        <Shapes className="h-6 w-6 text-primary" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        {ready ? "Ready when you are" : "Your Shape appears here"}
      </p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        {ready
          ? "Press Build my Shape and watch it get designed, built, and made ready to test — right here."
          : "Tell us what you're shaping and what one of them holds, and the builder takes it from there."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- the client

function NewShapeForm({ agentId }: { agentId: string }) {
  const [answers, setAnswers] = useState<NewShapeAnswers>(
    NEW_SHAPE_EMPTY_ANSWERS,
  );
  const [submitted, setSubmitted] = useState<NewShapeAnswers | null>(null);
  const [done, setDone] = useState(false);
  const ready = newShapeAnswersReady(answers);

  function patch(next: Partial<NewShapeAnswers>) {
    setAnswers((prev) => ({ ...prev, ...next }));
  }

  function toggleAsset(asset: NewShapeAsset, on: boolean) {
    setAnswers((prev) => ({
      ...prev,
      assets: on
        ? [...prev.assets, asset]
        : prev.assets.filter((a) => a !== asset),
    }));
  }

  // Write half of the create form (manifest `writeTargets`): an agent stages
  // prose into the SAME setState the user's own typing calls, and the user
  // still presses Build my Shape. Both handlers validate and THROW on a bad
  // shape — the writeback seam turns a throw into a safe error envelope the
  // agent reads. Fresh closures per call (getWriteHandlers contract).
  const writeHandlers = () => ({
    new_shape_intent: (value: unknown) => {
      if (typeof value !== "string" || !value.trim())
        throw new Error("new_shape_intent expects a non-empty string.");
      if (value.length > 4000)
        throw new Error(
          `new_shape_intent expects at most 4000 characters (got ${value.length}).`,
        );
      patch({ contents: value });
    },
    new_shape_sample: (value: unknown) => {
      // Sample data is free text (JSON, CSV, prose) — but the tool layer
      // parses a JSON-looking argument before it ever reaches us, so an agent
      // sending a raw `{...}` sample cannot get it here AS a string; it
      // arrives already parsed. Accept that and write out the pretty JSON
      // text the textarea is documented to hold.
      let text: string;
      if (typeof value === "string") {
        text = value;
      } else if (typeof value === "object" && value !== null) {
        text = JSON.stringify(value, null, 2);
      } else {
        throw new Error(
          'new_shape_sample expects sample data: a JSON object/array, or a string of JSON, CSV, or plain text. Pass "" to clear it.',
        );
      }

      const trimmed = text.trim();
      if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        let inner: unknown;
        try {
          inner = JSON.parse(trimmed);
        } catch {
          inner = undefined;
        }
        if (typeof inner === "string" && /^[[{]/.test(inner.trim()))
          throw new Error(
            "new_shape_sample received JSON that was encoded twice — the value is a quoted string whose contents are themselves JSON, which would show the user escaped \\n and stray quote marks. Send the sample as a JSON object/array directly.",
          );
      }

      if (text.length > 20000)
        throw new Error(
          `new_shape_sample expects at most 20000 characters (got ${text.length}).`,
        );
      patch({ sample: text });
    },
  });

  const scope = () =>
    createShapesScope({
      studio_tab: "new",
      shape_creator_agent_id: agentId,
      new_shape_name: answers.name || undefined,
      new_shape_intent: answers.contents || undefined,
      new_shape_sample: answers.sample || undefined,
      new_shape_render_style: answers.renderStyle,
      new_shape_cardinality: answers.cardinality,
      new_shape_visibility: answers.visibility,
      new_shape_assets: [...answers.assets],
      new_shape_submitted: submitted !== null,
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---------------------------------------------------------- the form */}
      <div className="space-y-3">
        <FieldBlock
          step={1}
          title="What are you shaping?"
          hint="The name people will see in your Shapes library."
        >
          <ProInput
            value={answers.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Recipe card, Patient intake, Weekly sales summary…"
            className="text-base sm:text-sm"
            data-surface-value="new_shape_name"
          />
        </FieldBlock>

        <FieldBlock
          step={2}
          title="What does one of these hold?"
          hint="List the pieces in plain words — the builder turns them into real fields."
        >
          <ProTextarea
            value={answers.contents}
            onChange={(e) => patch({ contents: e.target.value })}
            placeholder="The ingredients, the steps in order, how long it takes, how hard it is, and a photo."
            className="text-base sm:text-sm"
            wrapperClassName="w-full"
            autoGrow
            minHeight={92}
            maxHeight={220}
            enableTextStats={false}
            data-surface-value="new_shape_intent"
          />
        </FieldBlock>

        <FieldBlock
          step={3}
          title="Have some real data? Paste it."
          hint="Optional — but nothing beats a real example. JSON, a spreadsheet row, or plain text."
        >
          <ProTextarea
            value={answers.sample}
            onChange={(e) => patch({ sample: e.target.value })}
            placeholder='{ "title": "Lemon risotto", "minutes": 35, … }'
            className="font-mono text-base sm:text-sm"
            wrapperClassName="w-full"
            autoGrow
            minHeight={92}
            maxHeight={220}
            enableTextStats={false}
            data-surface-value="new_shape_sample"
          />
        </FieldBlock>

        <FieldBlock
          step={4}
          title="How should it look?"
          hint="This decides the component we build for it."
        >
          <TileChoice
            options={NEW_SHAPE_RENDER_STYLES}
            value={answers.renderStyle}
            onChange={(renderStyle) => patch({ renderStyle })}
          />
        </FieldBlock>

        <FieldBlock step={5} title="Is each one a single thing, or a set?">
          <TileChoice
            options={NEW_SHAPE_CARDINALITIES}
            value={answers.cardinality}
            onChange={(cardinality) => patch({ cardinality })}
            columns="sm:grid-cols-2"
          />
        </FieldBlock>

        <FieldBlock step={6} title="Who can use it?">
          <TileChoice
            options={NEW_SHAPE_VISIBILITIES}
            value={answers.visibility}
            onChange={(visibility) => patch({ visibility })}
            columns="sm:grid-cols-2"
          />
        </FieldBlock>

        <FieldBlock
          step={7}
          title="What should we build alongside it?"
          hint="All three are what makes a Shape usable the moment it exists."
        >
          <div className="space-y-2">
            {NEW_SHAPE_ASSETS.map((asset) => {
              const checked = answers.assets.includes(asset.id);
              return (
                <label
                  key={asset.id}
                  className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-md border border-border bg-background p-2.5 transition-colors hover:bg-accent/50"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) =>
                      toggleAsset(asset.id, next === true)
                    }
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">
                      {asset.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {asset.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </FieldBlock>

        <div className="sticky bottom-0 z-10 rounded-lg border border-border bg-background/95 p-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {done ? (
            // NO DEAD ENDS: the Shape now exists, so the page hands the user
            // the door to it instead of sitting on a spent button. The slug is
            // the agent's to choose and the client never learns it, so the
            // honest destination is the library it just appeared at the top of.
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="h-11 flex-1 gap-2 text-sm">
                <Link href={SHAPES_ALL_HREF}>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                  See it in your Shapes
                </Link>
              </Button>
              <Button
                variant="outline"
                className="h-11 gap-2 text-sm"
                onClick={() => {
                  setSubmitted(null);
                  setDone(false);
                  setAnswers(NEW_SHAPE_EMPTY_ANSWERS);
                }}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Build another
              </Button>
            </div>
          ) : (
            <Button
              className="h-11 w-full gap-2 text-sm"
              disabled={!ready || submitted !== null}
              onClick={() => setSubmitted(answers)}
            >
              {submitted ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <BrainCircuit className="h-4 w-4" aria-hidden />
              )}
              {submitted ? "Building your Shape…" : "Build my Shape"}
            </Button>
          )}
          {!ready && !submitted ? (
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              Give it a name and tell us what one of these holds.
            </p>
          ) : null}
        </div>
      </div>

      {/* -------------------------------------------------------- the result */}
      <SurfaceRuntimeProvider
        surfaceName={SHAPES_SURFACE_NAME}
        getScope={scope}
        isEditable
        getWriteHandlers={writeHandlers}
      >
        <div>
          <div
            className={cn(
              "overflow-hidden rounded-lg border border-primary/25 bg-card shadow-sm lg:sticky lg:top-[calc(var(--shell-header-h)+0.75rem)]",
              RESULT_PANE_H,
            )}
          >
            {submitted ? (
              <ShapeBuilderRun
                agentId={agentId}
                answers={submitted}
                applicationScope={scope() as Record<string, unknown>}
                onComplete={() => setDone(true)}
              />
            ) : (
              <ResultPaneEmpty ready={ready} />
            )}
          </div>
        </div>
      </SurfaceRuntimeProvider>
    </div>
  );
}

export default function NewShapeClient() {
  const { roles, status } = useSurfaceAgentRoles(SHAPES_SURFACE_NAME);
  const agentId = roles[SHAPE_BUILDER_ROLE]?.effectiveAgentId ?? null;

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Getting the Shape builder ready…
      </div>
    );
  }

  if (!agentId) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-6 text-center">
        <CircleAlert className="mx-auto h-6 w-6 text-amber-600 dark:text-amber-400" />
        <p className="mt-2 text-sm font-medium text-foreground">
          The Shape builder agent is unavailable.
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Nothing is filling the{" "}
          <span className="font-medium">
            {roles[SHAPE_BUILDER_ROLE]?.role.label ?? "Shape Builder"}
          </span>{" "}
          role here. Pick an agent for it in the header Agents menu, or check
          its mandate in the admin console.
        </p>
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" asChild>
          <a href="/shapes/all">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to Shapes
          </a>
        </Button>
      </div>
    );
  }

  return <NewShapeForm agentId={agentId} />;
}
