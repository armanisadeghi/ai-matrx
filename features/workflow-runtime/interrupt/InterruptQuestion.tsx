"use client";

/**
 * THE INTERRUPT, on screen — SPEC-workflow-ui-contract §4 adopted.
 *
 * What was here before: a hand-rolled `<select>` / `<input>` / `<textarea>`
 * switch inside `readout-parts.tsx`, deriving its own fields from the schema
 * hint. That was a THIRD input renderer beside the agent runner's and the
 * served run form's, and §4.1 forbids exactly that ("No third input renderer,
 * ever"). Every control below now resolves through the ONE ladder —
 * `resolveVariantComponent(kind, variantName)` → `VariableInputComponent` —
 * the same path `ServedRunForm` walks, reading the same registry through the
 * same `loadKindSources`.
 *
 * Four things this component owns, and nothing else:
 *
 *  · THE TITLE + PRESENTATION. The author's `title` heads the card; a
 *    `showcase` question is STAGED by the host (RunStage hands it to
 *    `ShowcaseSlot`) rather than drawn twice — see `placement`.
 *  · THE CONTEXT. A context value carrying `__kind` renders through
 *    `KindInstanceRender` ABOVE the answer control — §3's routing rule applied
 *    to the question. Nothing is stripped from it on the way in.
 *  · THE ANSWER. Fields derived from the DERIVED schema hint (value contract
 *    only), each rendered by the resolved component.
 *  · THE DEADLINE. While the question waits, the escalation says when it stops
 *    waiting, in one line.
 *
 * The approval preset is sugar over all of the above: the same card, the same
 * `/runs/{id}/resume` POST, two buttons instead of a boolean field.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, X } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import {
  resolveVariantComponent,
  type ResolvedVariantComponent,
  type VariantResolvableKind,
} from "@/features/content-ir/variants/kind-variants";

import { useWorkflowRunControls } from "../hooks/useWorkflowRunControls";
import { selectRunInterrupt } from "../redux/workflow-runs.selectors";
import { loadKindSources } from "../served-form/kind-source";
import {
  answerFieldsOf,
  approvalResumeValue,
  escalationLine,
  isApprovalQuestion,
  kindContextValue,
  parseInterruptPayload,
  plainContextEntries,
  unansweredFields,
  type InterruptAnswerField,
  type InterruptQuestionView,
} from "./interrupt-view";
import { ProTextarea } from "@/components/official/ProTextarea";

/**
 * Where the host is drawing questions.
 *
 *  · `"all"` (default) — every question, whatever it asked for. What a surface
 *    with no showcase slot uses, so the ~10 existing `InterruptCard` hosts
 *    keep behaving exactly as they did.
 *  · `"panel"` — only `presentation: "panel"` questions; the host is staging
 *    the showcase itself.
 *  · `"showcase"` — only the staged question, chrome-less, because the slot
 *    already carries the frame (THE WRAPPER RULE).
 */
export type InterruptPlacement = "all" | "panel" | "showcase";

export interface InterruptQuestionProps {
  runId: string;
  placement?: InterruptPlacement;
}

/** Does this run currently hold a question, and does it want the stage? */
export function useInterruptQuestion(runId: string): {
  view: InterruptQuestionView;
  checkpointId: string;
  nodeId: string;
} | null {
  const interrupt = useAppSelector(selectRunInterrupt(runId));
  const payload = interrupt?.payload;
  const view = useMemo(
    () => (payload ? parseInterruptPayload(payload) : null),
    [payload],
  );
  if (!interrupt || !view) return null;
  return {
    view,
    checkpointId: interrupt.checkpointId,
    nodeId: interrupt.nodeId,
  };
}

export function InterruptQuestion({
  runId,
  placement = "all",
}: InterruptQuestionProps) {
  const question = useInterruptQuestion(runId);
  if (!question) return null;
  if (placement === "panel" && question.view.presentation === "showcase") {
    return null;
  }
  if (placement === "showcase" && question.view.presentation !== "showcase") {
    return null;
  }
  return (
    // Keyed by checkpoint so a LATER Pause & Ask in the same run mounts a
    // fresh form — carrying the previous values across interrupts submitted
    // stale keys against the new question.
    <InterruptBody
      key={`${runId}:${question.checkpointId}`}
      runId={runId}
      checkpointId={question.checkpointId}
      view={question.view}
      bare={placement === "showcase"}
    />
  );
}

function InterruptBody({
  runId,
  checkpointId,
  view,
  bare,
}: {
  runId: string;
  checkpointId: string;
  view: InterruptQuestionView;
  /** The host already drew the frame — draw no second border/background. */
  bare: boolean;
}) {
  const { answerInterrupt } = useWorkflowRunControls();
  const [sending, setSending] = useState(false);

  const send = (value: Record<string, unknown>) => {
    setSending(true);
    void answerInterrupt(runId, checkpointId, value).finally(() =>
      setSending(false),
    );
  };

  const approval = isApprovalQuestion(view);
  const context = kindContextValue(view.context);
  const plain = plainContextEntries(view.context, context?.name ?? null);

  return (
    <div
      data-interrupt-run={runId}
      data-interrupt-preset={view.preset}
      data-interrupt-presentation={view.presentation}
      className={cn(
        !bare && "rounded-xl border border-primary/40 bg-primary/5 p-3",
      )}
    >
      {view.title ? (
        <h3 className="text-sm font-semibold text-foreground">{view.title}</h3>
      ) : null}
      <p
        className={cn(
          "text-sm text-foreground",
          view.title ? "mt-0.5 font-normal" : "font-medium",
        )}
      >
        {view.prompt}
      </p>

      <Deadline view={view} />

      {/* §4.1 — the kind-carrying context renders through its kind component,
          ABOVE the answer control. `component_ref` is the kindless escape and
          is deliberately NOT consulted here: a registered kind outranks it
          (§3 rule 1), and routing a kindless ref is the emission renderer's
          job, not this card's. */}
      {context ? (
        <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card">
          <KindInstanceRender
            kind={context.kind}
            value={context.value}
            showRoutingNote={false}
            variant="bare"
          />
        </div>
      ) : null}
      {plain.length > 0 ? (
        <dl className="mt-2 space-y-0.5">
          {plain.map((entry) => (
            <div key={entry.name} className="flex gap-1.5 text-[11px]">
              <dt className="shrink-0 text-muted-foreground">{entry.name}</dt>
              <dd className="min-w-0 break-words text-foreground/90">
                {formatPlain(entry.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {approval ? (
        <ApprovalControl sending={sending} onDecide={send} />
      ) : (
        <AnswerControl view={view} sending={sending} onSend={send} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The deadline, while the question is still waiting
// ---------------------------------------------------------------------------

/** Re-render cadence for the countdown. A minute is the smallest unit the copy
 * shows above 60s, so ticking faster would only burn renders. */
const COUNTDOWN_TICK_MS = 15_000;

function Deadline({ view }: { view: InterruptQuestionView }) {
  const [now, setNow] = useState(() => Date.now());
  const escalation = view.escalation;

  useEffect(() => {
    if (!escalation) return undefined;
    const id = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [escalation]);

  const line = escalationLine(escalation, now);
  if (!line) return null;
  return (
    <p
      data-interrupt-deadline
      className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300"
    >
      <Clock className="h-3 w-3 shrink-0" />
      {line}
    </p>
  );
}

// ---------------------------------------------------------------------------
// §4.2 — the approval preset
// ---------------------------------------------------------------------------

function ApprovalControl({
  sending,
  onDecide,
}: {
  sending: boolean;
  onDecide: (value: Record<string, unknown>) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-interrupt-approve
          disabled={sending}
          onClick={() => onDecide(approvalResumeValue(true, note))}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Approve
        </button>
        <button
          type="button"
          data-interrupt-reject
          disabled={sending}
          onClick={() => onDecide(approvalResumeValue(false, note))}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-destructive/50 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Reject
        </button>
      </div>
      <ProTextarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Add a note (optional)"
        data-interrupt-note
        className="mt-2 w-full rounded-md border border-border bg-background p-2 text-base"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The answer control — the ONE renderer, once more
// ---------------------------------------------------------------------------

function AnswerControl({
  view,
  sending,
  onSend,
}: {
  view: InterruptQuestionView;
  sending: boolean;
  onSend: (value: Record<string, unknown>) => void;
}) {
  const fields = useMemo(() => answerFieldsOf(view.schemaHint), [view.schemaHint]);

  // Seed: the author's default answer belongs to the free-text field, which is
  // the only field a question with no schema has.
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    view.defaultAnswer && fields.length === 1 && fields[0].name === "answer"
      ? { answer: view.defaultAnswer }
      : {},
  );

  // The registry, for exactly the kinds these fields address — most questions
  // address none, and then no read happens at all.
  const [kinds, setKinds] = useState<Record<string, VariantResolvableKind>>({});
  const [kindError, setKindError] = useState<string | null>(null);
  const kindSlugs = useMemo(
    () =>
      Array.from(
        new Set(fields.map((f) => f.kind).filter((k): k is string => !!k)),
      ),
    [fields],
  );
  useEffect(() => {
    let live = true;
    if (kindSlugs.length === 0) {
      setKinds({});
      setKindError(null);
      return undefined;
    }
    void loadKindSources(kindSlugs).then((result) => {
      if (!live) return;
      setKinds(result.kinds);
      setKindError(result.error);
    });
    return () => {
      live = false;
    };
  }, [kindSlugs]);

  const gaps = unansweredFields(fields, values);

  return (
    <div className="mt-2 space-y-2">
      {kindError ? (
        <p className="flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {kindError}
        </p>
      ) : null}

      {fields.map((field) => (
        <AnswerField
          key={field.name}
          field={field}
          kind={field.kind ? kinds[field.kind] : undefined}
          value={values[field.name]}
          onChange={(v) =>
            setValues((prev) => ({ ...prev, [field.name]: v }))
          }
        />
      ))}

      <button
        type="button"
        data-interrupt-send
        disabled={sending || gaps.length > 0}
        onClick={() => onSend(values)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {sending ? "Sending…" : "Send answer"}
      </button>
      {gaps.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Still needed: {gaps.map((g) => g.label).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function AnswerField({
  field,
  kind,
  value,
  onChange,
}: {
  field: InterruptAnswerField;
  kind: VariantResolvableKind | undefined;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const resolution: ResolvedVariantComponent = resolveVariantComponent(
    kind ?? {
      kind: field.kind ?? `answer.${field.name}`,
      variants: [],
      valueType: field.valueType,
    },
    field.variant,
  );

  // A closed `enum` is a VALUE CONTRACT, not a presentation preference: the
  // schema admits those values and no others, so a textarea would invite an
  // answer the engine will refuse. This mirrors SPEC §1.1's server-side
  // derivation (`choice` → `select`) and only ever applies when no variant and
  // no kind default answered — an author's variant still wins.
  const component =
    field.options.length > 0 && resolution.source === "derived-default"
      ? { type: "select" as const, options: field.options }
      : resolution.component;

  return (
    <label className="block" data-interrupt-field={field.name}>
      <span className="text-xs text-muted-foreground">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {component ? (
        <div className="mt-0.5">
          <VariableInputComponent
            value={value}
            onChange={onChange}
            variableName={field.label || field.name}
            customComponent={component}
            helpText={field.description || undefined}
            hideLabel
            compact
          />
        </div>
      ) : (
        // The kind resolves this field to a DB-authored renderer. Routing those
        // is the kind host's job — screaming beats silently substituting a box
        // for a component that promised more.
        <p className="mt-0.5 flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Field <code className="font-mono">{field.name}</code> resolves to the
          DB-authored component{" "}
          <code className="font-mono">{resolution.dbComponentKey}</code>, which
          this card has no routing for. Route it in the kind host.
        </p>
      )}
      {resolution.unregisteredVariant ? (
        <p className="mt-0.5 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Variant{" "}
          <code className="font-mono">{resolution.unregisteredVariant}</code> is
          not registered on{" "}
          <code className="font-mono">{field.kind ?? "this field's kind"}</code>{" "}
          — rendered with the next rung down. Register it, or stop asking for it.
        </p>
      ) : null}
    </label>
  );
}

function formatPlain(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default InterruptQuestion;
