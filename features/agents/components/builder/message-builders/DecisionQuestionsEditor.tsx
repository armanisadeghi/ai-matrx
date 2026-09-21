"use client";

/**
 * The `decision_questions` part editor — a TABLE, not a text box.
 *
 * A questions part is a list of output fields, and a list of fields with a
 * type and a rubric each is a table: one row per question, the columns are
 * name · type · instruction · criteria · threshold. Writing it as prose in a
 * textarea hides exactly the things the author gets wrong — a duplicated
 * field name, a two-part question, a rubric with one level, a budget already
 * blown — so every one of those is a cell or a badge here.
 *
 * Contract: `common-docs/systems/agents/typed-messages/FEATURE.md`.
 * Every string field is a slot: `{{variable}}` works in the instruction and
 * in every criterion, and the chips render exactly as they do elsewhere in
 * the builder (`HighlightedText`).
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { HighlightedText } from "@/features/agents/components/variables-management/HighlightedText";
import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import { formatTokens } from "@/lib/tokens/estimate";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  CHOICE_OPTION_MAX,
  CHOICE_OPTION_MIN,
  SCORE_LEVEL_MAX,
  SCORE_LEVEL_MIN,
  type DecisionQuestionSpec,
  type DecisionQuestionType,
} from "@/features/agents/decision-questions/types";
import { readDecisionBudget } from "@/features/agents/decision-questions/budget";
import { lintQuestion } from "@/features/agents/decision-questions/lint";
import {
  normalizeQuestionName,
  slugifyQuestionName,
  uniqueQuestionName,
} from "@/features/agents/decision-questions/name";
import type { PartCompatibility } from "@/features/agents/decision-questions/compatibility";

const TYPE_LABELS: Record<DecisionQuestionType, string> = {
  noul: "Yes/No",
  choice: "Choice",
  score: "Score",
};

const TYPE_ORDER: DecisionQuestionType[] = ["noul", "choice", "score"];

/** A fresh question, named uniquely against the ones already in the part. */
export function newDecisionQuestion(
  existing: readonly DecisionQuestionSpec[],
): DecisionQuestionSpec {
  return {
    name: uniqueQuestionName(
      "question",
      existing.map((q) => q.name),
    ),
    type: "noul",
    instructions: "",
    criteria: { true: "", false: "" },
  };
}

/** The criteria a type starts with when the author switches to it. */
function defaultCriteria(type: DecisionQuestionType) {
  if (type === "noul") return { true: "", false: "" };
  if (type === "choice") return { yes: "", no: "" };
  return ["", ""];
}

function asChoice(
  criteria: DecisionQuestionSpec["criteria"],
): Array<[string, string]> {
  if (!criteria || Array.isArray(criteria)) return [];
  return Object.entries(criteria).map(([k, v]) => [k, v ?? ""]);
}

function asScore(criteria: DecisionQuestionSpec["criteria"]): string[] {
  return Array.isArray(criteria) ? criteria.map((v) => String(v ?? "")) : [];
}

function asNoul(criteria: DecisionQuestionSpec["criteria"]): {
  true: string;
  false: string;
} {
  if (!criteria || Array.isArray(criteria)) return { true: "", false: "" };
  const record = criteria as Record<string, string | null>;
  return { true: record.true ?? "", false: record.false ?? "" };
}

// ---------------------------------------------------------------------------
// Budget meter — the two ceilings, both live
// ---------------------------------------------------------------------------

function Bar({
  used,
  limit,
  over,
}: {
  used: number;
  limit: number;
  over: boolean;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          over
            ? "bg-destructive"
            : pct > 80
              ? "bg-amber-500"
              : "bg-emerald-500",
        )}
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
    </div>
  );
}

interface BudgetMeterProps {
  reading: ReturnType<typeof readDecisionBudget>;
}

function BudgetMeter({ reading }: BudgetMeterProps) {
  const { limits } = reading;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5" title="The state is every other part of this message, plus every question.">
        <span>State + all questions</span>
        <Bar
          used={reading.totalTokens}
          limit={limits.totalTokens}
          over={reading.overTotal}
        />
        <span
          className={cn("font-mono", reading.overTotal && "text-destructive")}
        >
          {formatTokens(reading.totalTokens)}/{formatTokens(limits.totalTokens)}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5" title="A decision reads one question at a time against the whole state, so the longest single question is its own ceiling.">
        <span>State + longest question</span>
        <Bar
          used={reading.statePlusLongestTokens}
          limit={limits.statePlusLongestQuestionTokens}
          over={reading.overStatePlusLongest}
        />
        <span
          className={cn(
            "font-mono",
            reading.overStatePlusLongest && "text-destructive",
          )}
        >
          {formatTokens(reading.statePlusLongestTokens)}/
          {formatTokens(limits.statePlusLongestQuestionTokens)}
        </span>
      </span>
      <span className="opacity-70">
        estimate ·{" "}
        {limits.source === "catalog"
          ? "limits from the model catalog"
          : limits.source === "unloaded"
            ? "platform default limits — the model's own limits have not loaded yet"
            : "platform default limits — this model's catalog row declares none"}
      </span>
      {(reading.overTotal || reading.overStatePlusLongest) && (
        <span className="text-destructive">
          {reading.overTotal
            ? "Over the shared budget — shorten the state or remove questions."
            : "One question plus the state is over budget — shorten that question."}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score levels — ordered, drag-reorderable
// ---------------------------------------------------------------------------

function ScoreLevelRow({
  id,
  index,
  value,
  onChange,
  onRemove,
  canRemove,
  validVariables,
}: {
  id: string;
  index: number;
  value: string;
  onChange: (next: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  validVariables: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-1.5", isDragging && "opacity-60")}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground"
        aria-label={`Reorder level ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="w-4 text-right font-mono text-[10px] text-muted-foreground">
        {index + 1}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={index === 0 ? "Lowest level" : "Level description"}
        aria-label={`Score level ${index + 1}`}
        className="h-6 flex-1 text-[11px]"
      />
      {value.includes("{{") && (
        <span className="text-[10px]">
          <HighlightedText text={value} validVariables={validVariables} />
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove level ${index + 1}`}
        className="p-0.5 rounded text-muted-foreground hover:text-destructive disabled:opacity-30"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function ScoreCriteria({
  questionKey,
  levels,
  onChange,
  validVariables,
}: {
  questionKey: string;
  levels: string[];
  onChange: (next: string[]) => void;
  validVariables: string[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = levels.map((_, i) => `${questionKey}-level-${i}`);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(levels, from, to));
  };
  return (
    <div className="flex flex-col gap-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {levels.map((level, i) => (
            <ScoreLevelRow
              key={ids[i]}
              id={ids[i]}
              index={i}
              value={level}
              validVariables={validVariables}
              canRemove={levels.length > SCORE_LEVEL_MIN}
              onChange={(next) =>
                onChange(levels.map((v, idx) => (idx === i ? next : v)))
              }
              onRemove={() => onChange(levels.filter((_, idx) => idx !== i))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          disabled={levels.length >= SCORE_LEVEL_MAX}
          onClick={() => onChange([...levels, ""])}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add level
        </Button>
        <span className="text-[10px] text-muted-foreground">
          {levels.length} of {SCORE_LEVEL_MIN}–{SCORE_LEVEL_MAX}, lowest first
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criteria cell
// ---------------------------------------------------------------------------

function CriteriaCell({
  question,
  questionKey,
  onChange,
  validVariables,
}: {
  question: DecisionQuestionSpec;
  questionKey: string;
  onChange: (criteria: DecisionQuestionSpec["criteria"]) => void;
  validVariables: string[];
}) {
  if (question.type === "noul") {
    const criteria = asNoul(question.criteria);
    return (
      <div className="grid gap-1 sm:grid-cols-2">
        <Input
          value={criteria.true}
          onChange={(e) => onChange({ ...criteria, true: e.target.value })}
          placeholder="What makes it true (optional)"
          aria-label="True clarifier"
          className="h-6 text-[11px]"
        />
        <Input
          value={criteria.false}
          onChange={(e) => onChange({ ...criteria, false: e.target.value })}
          placeholder="What makes it false (optional)"
          aria-label="False clarifier"
          className="h-6 text-[11px]"
        />
      </div>
    );
  }

  if (question.type === "score") {
    return (
      <ScoreCriteria
        questionKey={questionKey}
        levels={asScore(question.criteria)}
        onChange={(levels) => onChange(levels)}
        validVariables={validVariables}
      />
    );
  }

  const options = asChoice(question.criteria);
  const setOptions = (next: Array<[string, string]>) => {
    const out: Record<string, string | null> = {};
    next.forEach(([key, description], i) => {
      const k = key.trim() || `option_${i + 1}`;
      out[k] = description.trim() ? description : null;
    });
    onChange(out);
  };
  return (
    <div className="flex flex-col gap-1">
      {options.map(([key, description], i) => (
        <div
          key={`${questionKey}-choice-${i}`}
          className="grid gap-1 sm:grid-cols-[minmax(6rem,0.4fr)_1fr_auto] items-center"
        >
          <Input
            value={key}
            onChange={(e) =>
              setOptions(
                options.map((o, idx) =>
                  idx === i ? [e.target.value, o[1]] : o,
                ),
              )
            }
            placeholder="option_name"
            aria-label={`Option ${i + 1} name`}
            className="h-6 text-[11px] font-mono"
          />
          <Input
            value={description}
            onChange={(e) =>
              setOptions(
                options.map((o, idx) =>
                  idx === i ? [o[0], e.target.value] : o,
                ),
              )
            }
            placeholder="When this option is the answer"
            aria-label={`Option ${i + 1} description`}
            className="h-6 text-[11px]"
          />
          <button
            type="button"
            onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
            disabled={options.length <= CHOICE_OPTION_MIN}
            aria-label={`Remove option ${i + 1}`}
            className="p-0.5 rounded text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 text-[11px] px-2"
          disabled={options.length >= CHOICE_OPTION_MAX}
          onClick={() => setOptions([...options, ["", ""]])}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add option
        </Button>
        <span className="text-[10px] text-muted-foreground">
          {options.length} of {CHOICE_OPTION_MIN}–{CHOICE_OPTION_MAX}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export interface DecisionQuestionsEditorProps {
  questions: DecisionQuestionSpec[];
  onChange: (next: DecisionQuestionSpec[]) => void;
  /** Text of every OTHER part of this message — the decision state. */
  stateText: string;
  model: AIModelRecord | null | undefined;
  validVariables?: string[];
  /** Verdict for the part as a whole; a refusal greys the whole editor. */
  compatibility?: PartCompatibility;
  /** Remove the whole part from the message. */
  onRemovePart?: () => void;
  className?: string;
}

export function DecisionQuestionsEditor({
  questions,
  onChange,
  stateText,
  model,
  validVariables = [],
  compatibility,
  onRemovePart,
  className,
}: DecisionQuestionsEditorProps) {
  const [manualNames, setManualNames] = useState<Set<number>>(new Set());
  const [openCriteria, setOpenCriteria] = useState<Set<number>>(
    () => new Set(questions.map((_, i) => i)),
  );

  const reading = useMemo(
    () => readDecisionBudget({ model, stateText, questions }),
    [model, stateText, questions],
  );

  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<number>();
    questions.forEach((q, i) => {
      const name = q.name.trim();
      if (!name) return;
      if (seen.has(name)) dupes.add(i);
      else seen.set(name, i);
    });
    return dupes;
  }, [questions]);

  const refused = compatibility?.verdict === "refused";

  const update = (index: number, patch: Partial<DecisionQuestionSpec>) => {
    onChange(
      questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) as DecisionQuestionSpec[],
    );
  };

  const setInstruction = (index: number, value: string) => {
    const question = questions[index];
    const shouldDerive =
      !manualNames.has(index) &&
      (!question.name.trim() ||
        question.name === "question" ||
        question.name.startsWith("question_") ||
        question.name === slugifyQuestionName(question.instructions ?? ""));
    const patch: Partial<DecisionQuestionSpec> = { instructions: value };
    if (shouldDerive) {
      const derived = slugifyQuestionName(value);
      if (derived) {
        patch.name = uniqueQuestionName(
          derived,
          questions.filter((_, i) => i !== index).map((q) => q.name),
        );
      }
    }
    update(index, patch);
  };

  const toggleCriteria = (index: number) =>
    setOpenCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div
      className={cn(
        "@container/dq flex flex-col gap-2 w-full rounded-lg border border-border bg-card p-2",
        refused && "opacity-50 grayscale",
        className,
      )}
    >
      {/* One row. The message header already says where we are. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium">Questions</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {questions.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <BudgetMeter reading={reading} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 text-[11px] px-2"
            onClick={() => onChange([...questions, newDecisionQuestion(questions)])}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add question
          </Button>
          {onRemovePart && (
            <button
              type="button"
              onClick={onRemovePart}
              aria-label="Remove questions part"
              className="p-1 rounded text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {compatibility && compatibility.verdict !== "native" && (
        <div
          className={cn(
            "flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px]",
            compatibility.verdict === "refused"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : compatibility.verdict === "unknown"
                ? "border-border bg-muted/50 text-muted-foreground"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{compatibility.reason}</span>
        </div>
      )}

      {/*
        The table is a GRID, and it collapses to one field per line when the
        panel is narrow — the agent builder's message column is ~400px, and a
        five-column table crammed into it is unreadable, which is worse than
        not being a table. Container query, not a viewport breakpoint: the
        same editor renders in a narrow builder panel and a wide full-screen
        editor on the same screen.
      */}
      <div className="text-xs">
        <div className="hidden @[46rem]/dq:grid grid-cols-[9rem_13rem_1fr_5.5rem_1.5rem] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground pb-1">
          <span>Name</span>
          <span>Type</span>
          <span>Instruction</span>
          <span>Threshold</span>
          <span />
        </div>

        {questions.map((question, index) => {
          const lint = lintQuestion(question);
          const duplicate = duplicateNames.has(index);
          const criteriaOpen = openCriteria.has(index);
          const tokens = reading.questionTokens[index] ?? 0;
          return (
            <div
              key={`q-${index}`}
              className="border-t border-border/60 py-1.5"
            >
              <div className="grid grid-cols-1 @[46rem]/dq:grid-cols-[9rem_13rem_1fr_5.5rem_1.5rem] gap-2 items-start">
                <div>
                  <Input
                    value={question.name}
                    onChange={(e) => {
                      setManualNames((prev) => new Set(prev).add(index));
                      update(index, {
                        name: normalizeQuestionName(e.target.value),
                      });
                    }}
                    aria-label={`Question ${index + 1} name`}
                    placeholder="field_name"
                    className={cn(
                      "h-6 text-[11px] font-mono",
                      duplicate && "border-destructive",
                    )}
                  />
                  {duplicate && (
                    <p className="mt-0.5 text-[10px] text-destructive">
                      Two questions cannot answer into the same field.
                    </p>
                  )}
                </div>

                <div>
                  <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
                    {TYPE_ORDER.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          update(index, {
                            type,
                            criteria: defaultCriteria(type),
                          })
                        }
                        aria-pressed={question.type === type}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                          question.type === type
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleCriteria(index)}
                    className="mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {criteriaOpen ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    Criteria
                  </button>
                </div>

                <div className="min-w-0">
                  <ProTextarea
                    value={question.instructions ?? ""}
                    onChange={(e) => setInstruction(index, e.target.value)}
                    placeholder="Ask exactly one thing about the state."
                    aria-label={`Question ${index + 1} instruction`}
                    autoGrow
                    minHeight={28}
                    maxHeight={140}
                    className="text-[11px]"
                  />
                  {(question.instructions ?? "").includes("{{") && (
                    <div className="mt-0.5 text-[10px] leading-snug">
                      <HighlightedText
                        text={question.instructions ?? ""}
                        validVariables={validVariables}
                      />
                    </div>
                  )}
                  {lint && (
                    <p className="mt-0.5 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                      <Scissors className="w-3 h-3 shrink-0 mt-px" />
                      <span>{lint.reason}</span>
                    </p>
                  )}
                  <span className="mt-0.5 block text-[10px] font-mono text-muted-foreground">
                    {formatTokens(tokens)} tokens
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <span className="@[46rem]/dq:hidden text-[10px] text-muted-foreground">
                    Threshold
                  </span>
                  <Input
                    value={
                      question.suggested_threshold == null
                        ? ""
                        : String(question.suggested_threshold)
                    }
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const parsed = raw === "" ? null : Number(raw);
                      update(index, {
                        suggested_threshold:
                          parsed != null && Number.isFinite(parsed)
                            ? parsed
                            : null,
                      });
                    }}
                    inputMode="decimal"
                    placeholder="0.7"
                    aria-label={`Question ${index + 1} suggested threshold`}
                    className="h-6 w-[4.5rem] text-[11px] font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onChange(questions.filter((_, i) => i !== index))
                  }
                  aria-label={`Remove question ${index + 1}`}
                  className="p-1 rounded text-muted-foreground hover:text-destructive justify-self-start"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {criteriaOpen && (
                <div className="mt-1.5 @[46rem]/dq:pl-[9.5rem]">
                  <CriteriaCell
                    question={question}
                    questionKey={`q-${index}`}
                    validVariables={validVariables}
                    onChange={(criteria) => update(index, { criteria })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {questions.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No questions yet. Each one becomes a named field in the answer.
        </p>
      )}
    </div>
  );
}
