// features/education/assessment/components/create/AssessmentCreate.tsx
//
// The generate-a-<quiz|practice test> surface. One component, kind-parameterized.
// Three grounded/ungrounded source modes:
//   • Topic     → the topic generator (confidence "inferred", no citations)
//   • Deck      → the from-source generator over a flashcard deck's cards (cited)
//   • Document  → the from-source generator over a Knowledge document's chunks (cited)
// Depth-on-demand + question-type mix + exam-type are first-class config on
// every path. Generation is metered via useEntitlement (permissive stub until P8
// enforcement flips) — the remaining count shows BEFORE the action (TRUST §6).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { recordToast, toast } from "@/lib/toast";
import {
  ArrowLeft,
  Layers,
  FileSearch,
  Type,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useLibrary } from "@/features/rag/hooks/useLibrary";
import type { LibraryDocSummary } from "@/features/rag/types/library";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { LiveRunDisplay } from "@ai-matrx/chat/agents/components/live-run/LiveRunDisplay";
import { createEducationAssessmentScope } from "@/features/surfaces/manifests/education-assessment.manifest";
import { ASSESSMENT_MANDATES } from "../../data/mandates";
import { useAssessmentGeneration } from "../../data/useAssessmentGeneration";
import {
  DEPTHS,
  DIFFICULTIES,
  QUESTION_TYPES,
  isDepth,
  isDifficulty,
  isQuestionType,
} from "../../data/types";
import type {
  AssessmentKind,
  Depth,
  Difficulty,
  QuestionType,
} from "../../data/types";
import { KIND_CONFIG, type KindConfig } from "../kindConfig";
import { ProTextarea } from "@/components/official/ProTextarea";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { ReadFailure } from "@ai-matrx/design-system";
import { SOURCES_PATH } from "@/features/knowledge/modulePaths";

const FIELD = "text-base"; // 16px+ prevents iOS zoom-on-focus

type SourceMode = "topic" | "deck" | "document";

// Presentation only — the VALUE vocabularies live in data/types.ts and are
// imported above, so these option lists cannot drift from what the surface's
// write targets advertise or what their handlers accept. The Records are keyed
// by the union, so adding a depth/question type fails to compile until it is
// given UI copy here.
const DEPTH_COPY: Record<Depth, { label: string; hint: string }> = {
  recall: { label: "Recall", hint: "Facts & definitions" },
  applied: { label: "Applied", hint: "Use the concept" },
  exam: { label: "Exam", hint: "Exam / clinical rigor" },
};
const DEPTH_OPTIONS = DEPTHS.map((value) => ({ value, ...DEPTH_COPY[value] }));

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  written_response: "Written response",
};
const QUESTION_TYPE_OPTIONS = QUESTION_TYPES.map((value) => ({
  value,
  label: QUESTION_TYPE_LABELS[value],
}));

/** Bounds the write handlers enforce (the form's own inputs are unbounded text). */
const TOPIC_MAX = 500;
const EXAM_TYPE_MAX = 100;
const USER_REQUEST_MAX = 2000;
const TIME_LIMIT_MAX_MIN = 600;

export function AssessmentCreate({ kind }: { kind: AssessmentKind }) {
  const config: KindConfig = KIND_CONFIG[kind];
  const router = useRouter();
  const base = `/education/${config.base}`;
  // THE one generation path (COPPA gate → plan check → generator → save →
  // usage), shared with the list's generate_<plural> agent target.
  const generation = useAssessmentGeneration(config);
  const { isGenerating, conversationId } = generation;

  const [isNavigating, startNavigation] = useTransition();

  // Exam-hub deep links (P6 Phase B CTAs) seed the create surface:
  //   /education/{quizzes|practice-tests}/new?examType=<slug>&topic=<Exam Name>&depth=exam
  // Read once for the initial state below; the user can still edit every field.
  // Requires the route to wrap this component in a <Suspense> boundary.
  const searchParams = useSearchParams();
  const seedTopic = searchParams.get("topic")?.trim() ?? "";
  const seedExamType = searchParams.get("examType")?.trim() ?? "";
  const seedDepthRaw = searchParams.get("depth")?.trim() ?? "";
  const seedDepth: Depth = isDepth(seedDepthRaw) ? seedDepthRaw : "applied";

  const [mode, setMode] = useState<SourceMode>("topic");
  const [topic, setTopic] = useState(seedTopic);
  const [count, setCount] = useState(config.defaultCount);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [depth, setDepth] = useState<Depth>(seedDepth);
  const [types, setTypes] = useState<Set<QuestionType>>(new Set());
  const [examType, setExamType] = useState(seedExamType);
  const [timeLimitMin, setTimeLimitMin] = useState(config.timed ? 20 : 0);
  const [userRequest, setUserRequest] = useState("");
  const [selectedDeck, setSelectedDeck] = useState<FcSetRow | null>(null);
  const [decks, setDecks] = useState<FcSetRow[] | null>(null);
  const [decksError, setDecksError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<LibraryDocSummary | null>(null);

  const busy = isGenerating || isNavigating;
  const Icon = config.icon;

  // Deck list (lazy — only when the deck mode is chosen).
  const loadDecks = async () => {
    if (decks) return;
    const res = await fcService.listSets();
    // A failed read is said, never "You have no decks yet" (RC-B12).
    if (res.error) {
      setDecksError(res.error);
      return;
    }
    setDecksError(null);
    setDecks(res.data ?? []);
  };

  const { docs, loading: docsLoading } = useLibrary({
    status: "ready",
    search: undefined,
  });

  const toggleType = (t: QuestionType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const canGenerate =
    !busy &&
    ((mode === "topic" && topic.trim().length > 0) ||
      (mode === "deck" && !!selectedDeck) ||
      (mode === "document" && !!selectedDoc));

  const handleGenerate = async () => {
    if (!canGenerate) return;
    const source =
      mode === "topic"
        ? ({ mode: "topic", topic } as const)
        : mode === "deck" && selectedDeck
          ? ({ mode: "deck", deck: { id: selectedDeck.id, name: selectedDeck.name } } as const)
          : mode === "document" && selectedDoc
            ? ({ mode: "document", document: { id: selectedDoc.id, name: selectedDoc.name } } as const)
            : null;
    if (!source) return;
    const outcome = await generation.run({
      source,
      count,
      difficulty,
      depth,
      questionTypes: Array.from(types),
      examType,
      userRequest,
      timeLimitMinutes: timeLimitMin,
    });
    // A blocked run already showed its own dialog (COPPA / paywall) or toast.
    if (outcome.status === "failed") {
      toast.error(outcome.error);
      return;
    }
    if (outcome.status !== "created") return;
    const { assessment, questionCount } = outcome;
    recordToast.success(
      { type: "assessment", id: assessment.id, title: assessment.title },
      `Created "${assessment.title}" with ${questionCount} question${questionCount === 1 ? "" : "s"}`,
    );
    startNavigation(() => router.push(`${base}/${assessment.id}`));
  };

  // Live surface scope for the Agents chrome (matrx-user/education-assessment,
  // create view). Plain function reading the live render values at Run time.
  const getScope = () =>
    createEducationAssessmentScope({
      assessment_kind: config.kind,
      view: "create",
      source_mode: mode,
      ...(topic.trim() ? { topic: topic.trim() } : {}),
      question_count: count,
      difficulty,
      depth,
      question_types: Array.from(types),
      ...(examType.trim() ? { exam_type: examType.trim() } : {}),
      ...(config.timed ? { time_limit_minutes: timeLimitMin } : {}),
      ...(userRequest.trim() ? { user_request: userRequest.trim() } : {}),
      ...(selectedDeck
        ? { selected_deck: { id: selectedDeck.id, name: selectedDeck.name } }
        : {}),
      ...(selectedDoc
        ? { selected_document: { id: selectedDoc.id, name: selectedDoc.name } }
        : {}),
      is_generating: isGenerating,
    });

  // Write half of the assessment surface (manifest `writeTargets`). Every
  // target is draft-mode: it stages through the SAME setters the user's own
  // typing uses, so the value shows up in the form and the user still presses
  // Generate — which is where the COPPA gate, the entitlement guard and the
  // canonical assessmentService write path run. Nothing here spends quota or
  // writes a row. Handlers validate against the canonical vocabularies
  // (data/types.ts) and THROW on a bad shape; the writeback seam turns a throw
  // into a safe error envelope the agent reads. Fresh closures per call
  // (getWriteHandlers contract). The detail/take mount of this same surface
  // registers NO handlers — see the manifest's writeTargets docblock.
  const getSurfaceWriteHandlers = () => ({
    generation_topic: (value: unknown) => {
      if (typeof value !== "string" || !value.trim() || value.length > TOPIC_MAX)
        throw new Error(
          `generation_topic expects a non-empty string of at most ${TOPIC_MAX} characters.`,
        );
      setTopic(value.trim());
      // The topic field only feeds topic-mode generation; staging it while the
      // form sits in deck/document mode would be invisible and would not reach
      // the generator. Switching is reversible — the picked deck/document stays
      // in state and returns if the user switches back.
      setMode("topic");
    },
    generation_difficulty: (value: unknown) => {
      if (typeof value !== "string" || !isDifficulty(value))
        throw new Error(
          `generation_difficulty expects exactly one of: ${DIFFICULTIES.join(", ")} (case-sensitive).`,
        );
      setDifficulty(value);
    },
    generation_depth: (value: unknown) => {
      if (typeof value !== "string" || !isDepth(value))
        throw new Error(
          `generation_depth expects exactly one of: ${DEPTHS.join(", ")}.`,
        );
      setDepth(value);
    },
    generation_question_types: (value: unknown) => {
      if (!Array.isArray(value))
        throw new Error(
          `generation_question_types expects an array of strings drawn from: ${QUESTION_TYPES.join(", ")}. It replaces the full set; [] means an automatic mix.`,
        );
      const bad = value.filter((t) => typeof t !== "string" || !isQuestionType(t));
      if (bad.length > 0)
        throw new Error(
          `generation_question_types rejected — unsupported question type(s): ${bad.map((t) => JSON.stringify(t)).join(", ")}. Allowed: ${QUESTION_TYPES.join(", ")}.`,
        );
      setTypes(new Set(value as QuestionType[]));
    },
    generation_question_count: (value: unknown) => {
      if (!Number.isInteger(value) || (value as number) < 1)
        throw new Error(
          "generation_question_count expects a whole number of at least 1.",
        );
      if ((value as number) > config.countMax)
        throw new Error(
          `generation_question_count of ${value} exceeds the maximum for a ${config.noun} (${config.countMax}).`,
        );
      setCount(value as number);
    },
    generation_exam_type: (value: unknown) => {
      if (typeof value !== "string" || value.length > EXAM_TYPE_MAX)
        throw new Error(
          `generation_exam_type expects a string of at most ${EXAM_TYPE_MAX} characters (the empty string clears it).`,
        );
      setExamType(value.trim());
    },
    generation_user_request: (value: unknown) => {
      if (typeof value !== "string" || value.length > USER_REQUEST_MAX)
        throw new Error(
          `generation_user_request expects a string of at most ${USER_REQUEST_MAX} characters (the empty string clears it).`,
        );
      setUserRequest(value);
    },
    generation_time_limit_minutes: (value: unknown) => {
      if (!config.timed)
        throw new Error(
          `generation_time_limit_minutes does not apply to a ${config.noun} — only timed kinds (practice tests) have a time limit, and this form has no such control.`,
        );
      if (
        !Number.isInteger(value) ||
        (value as number) < 0 ||
        (value as number) > TIME_LIMIT_MAX_MIN
      )
        throw new Error(
          `generation_time_limit_minutes expects a whole number of minutes between 0 and ${TIME_LIMIT_MAX_MIN} (0 means untimed).`,
        );
      setTimeLimitMin(value as number);
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-assessment"
      isEditable
      getScope={getScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            icon={<ArrowLeft />}
            variant="quiet"
            className="shrink-0"
            onClick={() => !busy && startNavigation(() => router.push(base))}
            disabled={busy}
            aria-label={`Back to ${config.pluralLabel}`}
          />
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 title="Generate graded questions from a topic, a deck, or a document." className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
              New {config.label.toLowerCase()}
              <IntelligenceIndicator
                feature="education"
                mandateKeys={[ASSESSMENT_MANDATES.generateQuiz, ASSESSMENT_MANDATES.generateQuizFromSource]}
              />
            </h1>
          </div>
        </div>

        {isGenerating ? (
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Generating your {config.noun}…
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Writing {Math.min(config.countMax, Math.max(1, count || 1))}{" "}
                  questions at {depth} depth — watch them arrive below.
                </p>
              </div>
            </div>
            {/* The generator's stream renders live — never a bare spinner. */}
            <LiveRunDisplay
              conversationId={conversationId}
              label={`Writing your ${config.noun}`}
              pending
              bodyClassName="max-h-80 overflow-y-auto px-2.5 py-2 text-sm"
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-6">
            {/* Source mode */}
            <div className="flex flex-col gap-2">
              <Label>Source</Label>
              <div className="grid grid-cols-3 gap-2">
                <ModeButton
                  active={mode === "topic"}
                  icon={Type}
                  label="Topic"
                  onClick={() => setMode("topic")}
                />
                <ModeButton
                  active={mode === "deck"}
                  icon={Layers}
                  label="Deck"
                  onClick={() => {
                    setMode("deck");
                    void loadDecks();
                  }}
                />
                <ModeButton
                  active={mode === "document"}
                  icon={FileSearch}
                  label="Document"
                  onClick={() => setMode("document")}
                />
              </div>
            </div>

            {mode === "topic" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="as-topic">Topic</Label>
                <Input
                  id="as-topic"
                  autoFocus
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Cellular respiration, The French Revolution"
                  className={FIELD}
                />
              </div>
            )}

            {mode === "deck" && (
              <div className="flex flex-col gap-1.5">
                <Label>Flashcard deck</Label>
                {decks === null && decksError ? (
                  <ReadFailure
                    error={decksError}
                    what="your flashcard decks"
                    onRetry={() => void loadDecks()}
                    className="m-0"
                  />
                ) : decks === null ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : decks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You have no decks yet. Create one in Flashcards first.
                  </p>
                ) : (
                  <Select
                    value={selectedDeck?.id ?? ""}
                    onValueChange={(id) =>
                      setSelectedDeck(decks.find((d) => d.id === id) ?? null)
                    }
                  >
                    <SelectTrigger className={FIELD}>
                      <SelectValue placeholder="Pick a deck to build from" />
                    </SelectTrigger>
                    <SelectContent>
                      {decks.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {mode === "document" && (
              <div className="flex flex-col gap-1.5">
                <Label>Document</Label>
                {docsLoading ? (
                  <Skeleton className="h-10 w-full rounded-md" />
                ) : docs.filter((d) => d.chunks > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No processed documents. Upload one in your{" "}
                    <a className="underline" href={SOURCES_PATH}>
                      Knowledge library
                    </a>{" "}
                    first.
                  </p>
                ) : (
                  <Select
                    value={selectedDoc?.id ?? ""}
                    onValueChange={(id) =>
                      setSelectedDoc(docs.find((d) => d.id === id) ?? null)
                    }
                  >
                    <SelectTrigger className={FIELD}>
                      <SelectValue placeholder="Pick a document to build from" />
                    </SelectTrigger>
                    <SelectContent>
                      {docs
                        .filter((d) => d.chunks > 0)
                        .map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedDoc && (
                  <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    Every question will cite the passage it came from.
                  </p>
                )}
              </div>
            )}

            {/* Count + difficulty */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="as-count">Questions</Label>
                <ClampedNumberInput
                  id="as-count"
                  min={1}
                  max={config.countMax}
                  value={count}
                  onChange={setCount}
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="as-diff">Difficulty</Label>
                <Select
                  value={difficulty}
                  onValueChange={(v) => setDifficulty(v as Difficulty)}
                >
                  <SelectTrigger id="as-diff" className={FIELD}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Depth-on-demand */}
            <div className="flex flex-col gap-1.5">
              <Label>Depth</Label>
              <div className="grid grid-cols-3 gap-2">
                {DEPTH_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDepth(d.value)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors",
                      depth === d.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/40",
                    )}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {d.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {d.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Question type mix */}
            <div className="flex flex-col gap-1.5">
              <Label>Question types</Label>
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPE_OPTIONS.map((t) => (
                  <label
                    key={t.value}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                      types.has(t.value)
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    <Checkbox
                      checked={types.has(t.value)}
                      onCheckedChange={() => toggleType(t.value)}
                      className="h-3.5 w-3.5"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Leave all unchecked for a smart automatic mix.
              </p>
            </div>

            {/* Exam type + time limit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="as-exam">Exam type (optional)</Label>
                <Input
                  id="as-exam"
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                  placeholder="e.g. AP Biology, SAT"
                  className={FIELD}
                />
              </div>
              {config.timed && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="as-time">Time limit (minutes)</Label>
                  <ClampedNumberInput
                    id="as-time"
                    min={0}
                    value={timeLimitMin}
                    onChange={setTimeLimitMin}
                    className={FIELD}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="as-req">Extra instructions (optional)</Label>
              <ProTextarea
                id="as-req"
                value={userRequest}
                onChange={(e) => setUserRequest(e.target.value)}
                placeholder="e.g. Emphasize mechanisms; one case study"
                className={cn(FIELD, "min-h-[60px]")}
              />
            </div>

            {/* Metering (visible BEFORE the action — TRUST §6), canonical primitive */}
            <EntitlementMeter capability={config.capability} showAllWindows />
            <generation.Gates />

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="quiet"
                onClick={() => startNavigation(() => router.push(base))}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleGenerate()}
                disabled={!canGenerate || generation.isChecking}
              >
                <AGENT_ICON className="mr-1.5 h-4 w-4" />
                Generate
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Type;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent/40",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
