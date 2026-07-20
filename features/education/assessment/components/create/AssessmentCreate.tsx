// features/education/assessment/components/create/AssessmentCreate.tsx
//
// The generate-a-<quiz|practice test> surface. One component, kind-parameterized.
// Three grounded/ungrounded source modes:
//   • Topic     → the topic generator (confidence "inferred", no citations)
//   • Deck      → the from-source generator over a flashcard deck's cards (cited)
//   • Document  → the from-source generator over a RAG document's chunks (cited)
// Depth-on-demand + question-type mix + exam-type are first-class config on
// every path. Generation is metered via useEntitlement (permissive stub until P8
// enforcement flips) — the remaining count shows BEFORE the action (TRUST §6).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  ArrowLeft,
  Sparkles,
  Layers,
  FileSearch,
  Type,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useLibrary } from "@/features/rag/hooks/useLibrary";
import { useDocumentChunks } from "@/features/rag/hooks/useDocument";
import type { LibraryDocSummary } from "@/features/rag/types/library";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import { attachSourceRefs } from "@/features/education/trust/grounding";
import { assessmentService } from "../../data/assessmentService";
import { ASSESSMENT_AGENTS } from "../../data/agents";
import { useGenerateQuiz } from "../../data/useGenerateQuiz";
import type {
  AssessmentKind,
  AssessmentSourceKind,
  Depth,
  NewAssessmentItemInput,
  QuestionType,
} from "../../data/types";
import { KIND_CONFIG, type KindConfig } from "../kindConfig";

const FIELD = "text-base"; // 16px+ prevents iOS zoom-on-focus

type SourceMode = "topic" | "deck" | "document";

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  { value: "recall", label: "Recall", hint: "Facts & definitions" },
  { value: "applied", label: "Applied", hint: "Use the concept" },
  { value: "exam", label: "Exam", hint: "Exam / clinical rigor" },
];
const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
  { value: "fill_blank", label: "Fill in the blank" },
  { value: "short_answer", label: "Short answer" },
  { value: "written_response", label: "Written response" },
];
const CHUNK_FETCH_LIMIT = 800;

export function AssessmentCreate({ kind }: { kind: AssessmentKind }) {
  const config: KindConfig = KIND_CONFIG[kind];
  const router = useRouter();
  const base = `/education/${config.base}`;
  const { generate, isGenerating } = useGenerateQuiz();
  const entitlement = useEntitlementGuard(config.capability);
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();
  const [isNavigating, startNavigation] = useTransition();

  // Exam-hub deep links (P6 Phase B CTAs) seed the create surface:
  //   /education/{quizzes|practice-tests}/new?examType=<slug>&topic=<Exam Name>&depth=exam
  // Read once for the initial state below; the user can still edit every field.
  // Requires the route to wrap this component in a <Suspense> boundary.
  const searchParams = useSearchParams();
  const seedTopic = searchParams.get("topic")?.trim() ?? "";
  const seedExamType = searchParams.get("examType")?.trim() ?? "";
  const seedDepthRaw = searchParams.get("depth")?.trim() ?? "";
  const seedDepth: Depth = DEPTHS.some((d) => d.value === seedDepthRaw)
    ? (seedDepthRaw as Depth)
    : "applied";

  const [mode, setMode] = useState<SourceMode>("topic");
  const [topic, setTopic] = useState(seedTopic);
  const [count, setCount] = useState(config.defaultCount);
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("Medium");
  const [depth, setDepth] = useState<Depth>(seedDepth);
  const [types, setTypes] = useState<Set<QuestionType>>(new Set());
  const [examType, setExamType] = useState(seedExamType);
  const [timeLimitMin, setTimeLimitMin] = useState(config.timed ? 20 : 0);
  const [userRequest, setUserRequest] = useState("");
  const [selectedDeck, setSelectedDeck] = useState<FcSetRow | null>(null);
  const [decks, setDecks] = useState<FcSetRow[] | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<LibraryDocSummary | null>(null);

  const busy = isGenerating || isNavigating;
  const Icon = config.icon;

  // Deck list (lazy — only when the deck mode is chosen).
  const loadDecks = async () => {
    if (decks) return;
    const res = await fcService.listSets();
    setDecks(res.data ?? []);
  };

  const { docs, loading: docsLoading } = useLibrary({
    status: "ready",
    search: undefined,
  });
  const { data: docChunks } = useDocumentChunks(
    mode === "document" ? (selectedDoc?.id ?? null) : null,
    { limit: CHUNK_FETCH_LIMIT },
  );

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
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts a run.
    if (!(await coppa.ensureAllowed())) return;
    // Canonical guard: server-truth check BEFORE spending; a cap-hit opens the
    // respectful contextual paywall (not a toast) and never starts generation.
    await entitlement.guard(async () => {
    const safeCount = Math.min(config.countMax, Math.max(1, count || 1));
    const questionTypes = Array.from(types).join(",");
    const sharedVars = {
      count: safeCount,
      difficulty,
      depth,
      question_types: questionTypes,
      exam_type: examType.trim(),
      user_request: userRequest.trim(),
    };

    try {
      let generated;
      let sourceKind: AssessmentSourceKind;
      let sourceId: string | null = null;
      let sourceTitle: string | null = null;
      // Backfill hook for openable citations (document/deck modes).
      let attach: ((q: NewAssessmentItemInput) => NewAssessmentItemInput) | null =
        null;

      if (mode === "topic") {
        sourceKind = "topic";
        generated = await generate(ASSESSMENT_AGENTS.generateQuiz, {
          topic: topic.trim(),
          grade_level: "",
          ...sharedVars,
        });
      } else if (mode === "deck" && selectedDeck) {
        sourceKind = "deck";
        sourceId = selectedDeck.id;
        sourceTitle = selectedDeck.name;
        const setRes = await fcService.getSetWithCards(selectedDeck.id);
        const cards = setRes.data?.cards ?? [];
        if (cards.length === 0) {
          toast.error("That deck has no cards to build from.");
          return;
        }
        const sourceContent = cards
          .map((c) => `### Card ${c.id}\nQ: ${c.front}\nA: ${c.back}`)
          .join("\n\n");
        generated = await generate(ASSESSMENT_AGENTS.generateQuizFromSource, {
          source_content: sourceContent,
          source_label: selectedDeck.name,
          ...sharedVars,
        });
      } else if (mode === "document" && selectedDoc) {
        sourceKind = "source";
        sourceId = selectedDoc.id;
        sourceTitle = selectedDoc.name;
        const chunks = (docChunks ?? [])
          .slice()
          .sort((a, b) => a.chunk_index - b.chunk_index);
        if (chunks.length === 0) {
          toast.error("That document has no processed passages yet.");
          return;
        }
        const sourceContent = chunks
          .map((c) => {
            const pages = c.page_numbers?.length
              ? ` (page ${c.page_numbers.join(", ")})`
              : "";
            return `### Chunk ${c.chunk_id}${pages}\n${c.content_text}`;
          })
          .join("\n\n");
        const pageByChunk = new Map(
          chunks.map((c) => [
            c.chunk_id,
            c.page_numbers?.length ? c.page_numbers[0] : undefined,
          ]),
        );
        attach = (q) => ({
          ...q,
          trust: attachSourceRefs(q.trust, {
            documentId: selectedDoc.id,
            title: selectedDoc.name,
            pageForCitation: (cit) =>
              cit.sourceId ? pageByChunk.get(cit.sourceId) : undefined,
          }),
        });
        generated = await generate(ASSESSMENT_AGENTS.generateQuizFromSource, {
          source_content: sourceContent,
          source_label: selectedDoc.name,
          ...sharedVars,
        });
      } else {
        return;
      }

      const items = attach ? generated.questions.map(attach) : generated.questions;
      const timeLimitSeconds =
        config.timed && timeLimitMin > 0 ? timeLimitMin * 60 : null;

      const created = await assessmentService.createWithItems(
        {
          assessmentKind: config.kind,
          title: generated.title || topic.trim() || sourceTitle || config.label,
          description: generated.description,
          status: "ready",
          sourceKind,
          sourceId,
          sourceTitle,
          topic: mode === "topic" ? topic.trim() : sourceTitle,
          examType: examType.trim() || null,
          depth,
          timeLimitSeconds,
          config: {
            count: safeCount,
            difficulty,
            depth,
            questionTypes: Array.from(types),
            examType: examType.trim() || null,
            timeLimitSeconds,
            userRequest: userRequest.trim() || null,
          },
          metadata: { question_count: items.length },
        },
        items,
      );

      if (created.error || !created.data) {
        toast.error(created.error ?? `Could not save the ${config.noun}`);
        return;
      }
      // Metered action SUCCEEDED — record real usage so the meter decrements
      // (honest even while enforced:false; the capability is quiz_generate or
      // practice_test_generate per `config.capability`). Failed branches return
      // first, so a failed generation never burns quota.
      await entitlement.commit();
      toast.success(
        `Created "${created.data.assessment.title}" with ${items.length} question${items.length === 1 ? "" : "s"}`,
      );
      startNavigation(() =>
        router.push(`${base}/${created.data!.assessment.id}`),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to generate the ${config.noun}`);
    }
    });
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => !busy && startNavigation(() => router.push(base))}
            disabled={busy}
            aria-label={`Back to ${config.pluralLabel}`}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              New {config.label.toLowerCase()}
            </h1>
            <p className="text-sm text-muted-foreground">
              Generate graded questions from a topic, a deck, or a document.
            </p>
          </div>
        </div>

        {isGenerating ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Generating your {config.noun}…
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Writing {Math.min(config.countMax, Math.max(1, count || 1))}{" "}
                questions at {depth} depth. This can take a moment.
              </p>
            </div>
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
                {decks === null ? (
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
                    <a className="underline" href="/rag/library">
                      RAG library
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
                <Input
                  id="as-count"
                  type="number"
                  min={1}
                  max={config.countMax}
                  value={count}
                  onChange={(e) =>
                    setCount(Number.parseInt(e.target.value, 10) || 0)
                  }
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="as-diff">Difficulty</Label>
                <Select
                  value={difficulty}
                  onValueChange={(v) =>
                    setDifficulty(v as (typeof DIFFICULTIES)[number])
                  }
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
                {DEPTHS.map((d) => (
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
                {QUESTION_TYPES.map((t) => (
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
                  <Input
                    id="as-time"
                    type="number"
                    min={0}
                    value={timeLimitMin}
                    onChange={(e) =>
                      setTimeLimitMin(Number.parseInt(e.target.value, 10) || 0)
                    }
                    className={FIELD}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="as-req">Extra instructions (optional)</Label>
              <Textarea
                id="as-req"
                value={userRequest}
                onChange={(e) => setUserRequest(e.target.value)}
                placeholder="e.g. Emphasize mechanisms; one case study"
                className={cn(FIELD, "min-h-[60px]")}
              />
            </div>

            {/* Metering (visible BEFORE the action — TRUST §6), canonical primitive */}
            <EntitlementMeter capability={config.capability} showAllWindows />
            <entitlement.Paywall />
            <coppa.Gate />

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => startNavigation(() => router.push(base))}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleGenerate()}
                disabled={!canGenerate || entitlement.isChecking}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Generate
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
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
