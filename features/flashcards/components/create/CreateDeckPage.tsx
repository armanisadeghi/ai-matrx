"use client";

// features/flashcards/components/create/CreateDeckPage.tsx
//
// THE one way to make a flashcard deck: /education/flashcards/new.
// Owner, 2026-09-27: "Create Deck · Choose source options, style options, and
// other details · Get results" — no secret buttons. Three steps on ONE page:
//
//   1. Sources — the one Source input (`features/resource-manager/source-input`)
//      with "Just a topic" as one of its tiles; beside it, "Import a deck file"
//      (the no-AI path, `DeckFileImport`).
//   2. Style and details — one set of controls for every way in.
//   3. Generate — the live card-by-card stream, then the deck.
//
// Sources go through `POST /sources/resolve` (useSourceSet().resolve) into the
// segmented generator (`data/generateDeckFromSources.ts`) with the existing
// `flashcards__generate_from_source` mandate; a topic alone uses the existing
// `flashcards__generate_cards` mandate (`useGenerateCards`). "Wait for the clean
// version" holds the run, visibly, until those Sources are ready.
//
// Replaced: CreateFromTopic (/new), CreateFromSource (/new/from-source) and
// ImportSetView (/new/import) — both old routes redirect here.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Clock,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { createSourceRef } from "@ai-matrx/agents/sources";
import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import { LoadingSpinner } from "@/components/ui/spinner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { recordToast, toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import {
  organizationRefusalMessage,
  presentOrganizationRefusal,
} from "@/lib/organizations/organizationRefusalToast";
import { selectKindEnvelope } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import type { Depth } from "@/features/education/assessment/data/types";
import type { ConvertProgress } from "@/features/education/convert/types";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import {
  ASSISTANT_MESSAGE_COLUMN_CLASS,
  ASSISTANT_MESSAGE_COLUMN_INSET_CLASS,
} from "@/features/agents/components/shared/assistant-message-layout";
import { DEPTH_TIERS } from "../../data/enhanceCard";
import { FC_MANDATES } from "../../data/mandates";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
import { fcService } from "../../data/fcService";
import { generatedSetFromEnvelope } from "../../data/generated-set-from-envelope";
import { useGenerateCards } from "../../data/useGenerateCards";
import {
  backfillFileIds,
  generateDeckFromSources,
} from "../../data/generateDeckFromSources";
import { useSuppressAmbientAssistant } from "@/features/agents/components/ambient-assistant/ambientAssistantSuppression";
import { useWizardDraft } from "@/lib/wizard-draft/useWizardDraft";
import { WizardDraftRestored } from "@/lib/wizard-draft/WizardDraftRestored";
import { LiveGenerationPreview } from "./LiveGenerationPreview";
import { DeckFileImport } from "./DeckFileImport";

const EDU_BASE = "/education/flashcards";
/** The Source input's key on this page — picks are held and kept under it. */
export const CREATE_DECK_SURFACE_KEY = "flashcards:new";

const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;
type Difficulty = (typeof DIFFICULTIES)[number]["value"];

const COUNT_MIN = 1;
const COUNT_MAX = 50;
/** How often a held run re-reads whether its Sources are clean yet. */
const WAIT_POLL_MS = 5_000;

type StartMode = "make" | "import";

/** The Style and details answers, kept across a reload like the Sources are. */
export const CREATE_DECK_STYLE_DRAFT_ID = "flashcards:new:style";
interface StyleDraft {
  count?: number;
  difficulty?: Difficulty;
  depth?: Depth;
  gradeLevel?: string;
  focus?: string;
  deckName?: string;
}

/** Map the stored bag back to the form — refusing (and naming) anything unknown. */
export function restoreStyleDraft(data: Record<string, unknown>): {
  values: StyleDraft;
  rejectedKeys: string[];
} {
  const values: StyleDraft = {};
  const rejectedKeys: string[] = [];
  for (const [key, v] of Object.entries(data)) {
    if (key === "count" && typeof v === "number" && v >= COUNT_MIN && v <= COUNT_MAX) values.count = v;
    else if (key === "difficulty" && DIFFICULTIES.some((d) => d.value === v)) values.difficulty = v as Difficulty;
    else if (key === "depth" && DEPTH_TIERS.some((t) => t.value === v)) values.depth = v as Depth;
    else if ((key === "gradeLevel" || key === "focus" || key === "deckName") && typeof v === "string") values[key] = v;
    else rejectedKeys.push(key);
  }
  return { values, rejectedKeys };
}
type Phase = "idle" | "reading" | "generating" | "saving";

export function CreateDeckPage() {
  useFlashcardMandates(["generateCards", "generateFromSource"]);
  const router = useRouter();
  const params = useSearchParams();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const set = useSourceSet(CREATE_DECK_SURFACE_KEY);
  const topicRun = useGenerateCards();
  const cardGen = useEntitlementGuard("education.generate_cards");
  // COPPA before billing, and before any AI work.
  const coppa = useAiComplianceGate();
  const [isNavigating, startNavigation] = useTransition();
  const [isLeaving, startLeaving] = useTransition();
  // A form page: the floating ask-anything bar sat on top of Deck name and
  // Grade (verify-1, 2026-09-28). The page keeps it away, as FastFire does.
  useSuppressAmbientAssistant(true);
  const styleDraft = useWizardDraft<StyleDraft>(CREATE_DECK_STYLE_DRAFT_ID, {
    restore: restoreStyleDraft,
  });

  const [mode, setMode] = useState<StartMode>(
    params.get("start") === "import" ? "import" : "make",
  );
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [depth, setDepth] = useState<Depth>("recall");
  const [gradeLevel, setGradeLevel] = useState("");
  const [focus, setFocus] = useState("");
  const [deckName, setDeckName] = useState("");

  // Never lose input: the Style and details answers come back after a reload,
  // said out loud (the Sources and topic are kept by the Source input itself).
  const applyStyleDraft = useEffectEvent(() =>
    styleDraft.applyOnce((v) => {
      if (v.count !== undefined) setCount(v.count);
      if (v.difficulty) setDifficulty(v.difficulty);
      if (v.depth) setDepth(v.depth);
      if (v.gradeLevel !== undefined) setGradeLevel(v.gradeLevel);
      if (v.focus !== undefined) setFocus(v.focus);
      if (v.deckName !== undefined) setDeckName(v.deckName);
    }),
  );
  const styleDraftStatus = styleDraft.status;
  useEffect(() => {
    if (styleDraftStatus === "found") applyStyleDraft();
  }, [styleDraftStatus]);
  const keep = (fields: StyleDraft) => styleDraft.patch({ ...fields });

  const [phase, setPhase] = useState<Phase>("idle");
  const [liveRequestId, setLiveRequestId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);

  // ── A Source handed over in the link (old "from a document" links) ───────
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const doc =
      params.get("source") ?? params.get("document") ?? params.get("documentId");
    const file = params.get("file") ?? params.get("fileId");
    const topic = params.get("topic");
    if (doc && !set.hasRef("processed_document", doc)) {
      set.addReady({
        kind: "your_sources",
        label: params.get("name") ?? "The document you opened",
        ref: createSourceRef("processed_document", doc),
        processedDocumentId: doc,
      });
    }
    if (file && !set.hasRef("file", file)) {
      set.addReady({
        kind: "files",
        label: params.get("name") ?? "The file you opened",
        ref: createSourceRef("file", file),
        fileId: file,
      });
    }
    if (topic && !set.topic.trim()) set.setTopic(topic);
  }, [params, set]);

  // ── The topic-only run's live envelope (the one parser, via Redux) ───────
  const topicEnvelope = useAppSelector((state) =>
    topicRun.activeRequestId
      ? selectKindEnvelope(topicRun.activeRequestId, "flashcard_set")(state)
      : null,
  );
  const envelopeRef = useRef<CanonicalBlockIR | null>(null);
  useEffect(() => {
    envelopeRef.current = topicEnvelope;
  }, [topicEnvelope]);

  const ready = set.sources.filter((s) => s.status === "ready" && s.draft.ref);
  const landing = set.sources.filter(
    (s) => s.status === "pending" || s.status === "resolving",
  );
  const topic = set.topic.trim();
  const hasSources = ready.length > 0;
  const waitingForClean = ready.filter(
    (s) => s.draft.waitForClean && s.manifest?.state !== "ready",
  );
  const safeCount = Math.min(COUNT_MAX, Math.max(COUNT_MIN, count || 10));

  // Stays on the progress view through the hand-off to the new deck, so the
  // cleared picks never flash "pick a source" while the deck opens.
  const running = phase !== "idle" || topicRun.isGenerating || isNavigating;
  const busy = running || isNavigating || cardGen.isChecking || holding;
  const blockedReason = landing.length
    ? `Wait until ${landing.length === 1 ? "your new source has" : `${landing.length} new sources have`} finished adding.`
    : !hasSources && !topic
      ? "Pick at least one source, or choose Just a topic and type one."
      : null;
  const canGenerate = !blockedReason && !busy;

  const clearDraft = () => {
    for (const s of set.sources) set.remove(s.id);
    set.setTopic("");
    styleDraft.clear();
  };

  const finish = async (setId: string, name: string, cards: number, gap: string | null) => {
    // Metered action SUCCEEDED (generated AND saved) — record real usage.
    await cardGen.commit();
    recordToast.success(
      { type: "flashcard_set", id: setId, title: name },
      `Created "${name}" with ${cards} ${cards === 1 ? "card" : "cards"}${gap ? ` — ${gap}` : ""}`,
    );
    clearDraft();
    startNavigation(() => router.push(`${EDU_BASE}/${setId}`));
  };

  const runFromTopic = async () => {
    setPhase("generating");
    const extracted = await topicRun.generate(FC_MANDATES.generateCards, {
      topic,
      count: safeCount,
      difficulty,
      grade_level: gradeLevel.trim() || undefined,
      user_request: focus.trim() || undefined,
      depth,
    });
    setPhase("saving");
    // The envelope that drove the live preview is the persistence source.
    const fromEnvelope = envelopeRef.current
      ? generatedSetFromEnvelope(envelopeRef.current)
      : null;
    const result =
      fromEnvelope && fromEnvelope.cards.length > 0 ? fromEnvelope : extracted;
    // Single-writer contract (D-WP3): adopt the stream's own set or create one.
    const saved = await fcService.createGeneratedSetForConversation(
      extracted.conversationId,
      {
        name: deckName.trim() || result.title?.trim() || topic,
        topic,
        difficulty,
      },
      result.cards,
    );
    if (saved.error || !saved.data) {
      throw new Error(saved.error ?? "The cards were made but the deck could not be saved. Try again.");
    }
    await finish(saved.data.set.id, saved.data.set.name, saved.data.cards.length, null);
  };

  const runFromSources = async () => {
    setPhase("reading");
    const orgId = await ensureOrgId(undefined);
    // Citations open the real file only through its file id.
    const resolved = await backfillFileIds(await set.resolve());
    const dropped = resolved.dropped.map(
      (d) =>
        d.detail ??
        `One source was left out (${d.reason.replace("_", " ")}).`,
    );
    const standIns = resolved.sources.flatMap((s) =>
      s.notes.map((n) => `${s.label}: ${n}`),
    );
    setNotes([...dropped, ...standIns]);
    if (dropped.length) toast.info(dropped.join(" "));
    setPhase("generating");
    const outcome = await generateDeckFromSources({
      resolved,
      count: safeCount,
      difficulty,
      depth,
      gradeLevel,
      focus: [topic ? `Focus on: ${topic}` : "", focus.trim()]
        .filter(Boolean)
        .join("\n\n"),
      name: deckName,
      ctx: {
        dispatch,
        store,
        orgId,
        onRequestId: setLiveRequestId,
        onProgress: setProgress,
      },
    });
    setPhase("saving");
    await finish(outcome.setId, outcome.name, outcome.cardCount, outcome.gapNote);
  };

  const run = async () => {
    setRunError(null);
    setNotes([]);
    setProgress(null);
    setLiveRequestId(null);
    try {
      if (hasSources) await runFromSources();
      else await runFromTopic();
    } catch (e) {
      // "Not now" at the organization picker: nothing happened, nothing to say.
      if (isOrganizationSelectionCancelled(e)) return;
      // A deck is filed in an organization; with none selected, say so with the remedy.
      if (presentOrganizationRefusal(e, { subject: "The deck", act: "made" })) {
        setRunError(organizationRefusalMessage({ subject: "The deck", act: "made" }));
        return;
      }
      const message =
        e instanceof Error ? e.message : "The deck could not be made. Try again.";
      setRunError(message);
      toast.error(message);
    } finally {
      setPhase("idle");
    }
  };

  const start = async () => {
    if (!(await coppa.ensureAllowed())) return;
    // Server-truth check BEFORE any work; a cap opens the paywall.
    await cardGen.guard(run);
  };

  const handleGenerate = () => {
    if (!canGenerate) return;
    if (waitingForClean.length > 0) {
      setHolding(true);
      return;
    }
    void start();
  };

  // ── "Wait for the clean version": hold, re-read, start when ready ─────────
  const poll = useEffectEvent(() => void set.manifest());
  const release = useEffectEvent(() => {
    setHolding(false);
    void start();
  });
  const waitingCount = waitingForClean.length;
  useEffect(() => {
    if (!holding) return;
    if (waitingCount === 0) {
      release();
      return;
    }
    const t = setInterval(poll, WAIT_POLL_MS);
    return () => clearInterval(t);
  }, [holding, waitingCount]);

  const previewId = topicRun.activeRequestId ?? liveRequestId;

  return (
    <>
      <EducationToolHeader title="New flashcard deck" />
      <div className="min-h-full w-full bg-textured">
        <div
          className={cn(
            ASSISTANT_MESSAGE_COLUMN_CLASS,
            ASSISTANT_MESSAGE_COLUMN_INSET_CLASS,
            "matrx-touch-targets flex flex-col gap-4 pb-safe pt-[var(--shell-header-h)] sm:gap-5",
          )}
        >
          {/* How to start: make cards, or bring a deck you already have. */}
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="How do you want to start?">
            <StartTile
              selected={mode === "make"}
              disabled={busy}
              icon={<AGENT_ICON className="h-4 w-4" />}
              label="Make cards"
              helper="From your material, a web page, a video — or just a topic."
              onSelect={() => setMode("make")}
            />
            <StartTile
              selected={mode === "import"}
              disabled={busy}
              icon={<FileSpreadsheet className="h-4 w-4" />}
              label="Import a deck file"
              helper="Quizlet, CSV, Anki or a pasted list — exactly as it is."
              onSelect={() => setMode("import")}
            />
          </div>

          {mode === "import" ? (
            <Step n={1} title="Your deck file">
              <DeckFileImport />
            </Step>
          ) : (
            <>
              <Step n={1} title="What should the cards come from?">
                <SourceInput
                  surfaceKey={CREATE_DECK_SURFACE_KEY}
                  title="Sources"
                  purpose="your flashcard deck"
                  required
                  attachTo={undefined}
                />
              </Step>

              <Step n={2} title="Style and details">
                <div className="flex flex-col gap-4">
                  {styleDraft.didRestore ? (
                    <WizardDraftRestored
                      what="your style and details"
                      onDismiss={styleDraft.acknowledge}
                      onStartFresh={() => {
                        styleDraft.discard();
                        setCount(10);
                        setDifficulty("medium");
                        setDepth("recall");
                        setGradeLevel("");
                        setFocus("");
                        setDeckName("");
                      }}
                    />
                  ) : null}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="fc-count">Number of cards</Label>
                      <Input
                        id="fc-count"
                        type="number"
                        inputMode="numeric"
                        min={COUNT_MIN}
                        max={COUNT_MAX}
                        value={count}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10) || 0;
                          setCount(n);
                          if (n >= COUNT_MIN && n <= COUNT_MAX) keep({ count: n });
                        }}
                        className="h-11 text-base sm:h-9"
                        disabled={busy}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {hasSources
                          ? `Spread across everything you picked (${COUNT_MIN}–${COUNT_MAX}).`
                          : `Between ${COUNT_MIN} and ${COUNT_MAX}.`}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="fc-difficulty">Difficulty</Label>
                      <Select
                        value={difficulty}
                        onValueChange={(v) => {
                          setDifficulty(v as Difficulty);
                          keep({ difficulty: v as Difficulty });
                        }}
                        disabled={busy}
                      >
                        <SelectTrigger id="fc-difficulty" className="h-11 text-base sm:h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DIFFICULTIES.map((d) => (
                            <SelectItem key={d.value} value={d.value}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>How deep</Label>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                      {DEPTH_TIERS.map((tier) => (
                        <button
                          key={tier.value}
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setDepth(tier.value);
                            keep({ depth: tier.value });
                          }}
                          aria-pressed={depth === tier.value}
                          className={cn(
                            "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
                            depth === tier.value
                              ? "border-primary bg-primary/5"
                              : "border-border bg-background hover:bg-accent",
                          )}
                        >
                          <div className="text-sm font-medium text-foreground">{tier.label}</div>
                          <div className="text-xs leading-tight text-muted-foreground">{tier.blurb}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="fc-grade">
                        Grade or level <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="fc-grade"
                        value={gradeLevel}
                        onChange={(e) => {
                          setGradeLevel(e.target.value);
                          keep({ gradeLevel: e.target.value });
                        }}
                        placeholder="e.g. 9th grade, first-year nursing"
                        className="h-11 text-base sm:h-9"
                        disabled={busy}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="fc-name">
                        Deck name <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="fc-name"
                        value={deckName}
                        onChange={(e) => {
                          setDeckName(e.target.value);
                          keep({ deckName: e.target.value });
                        }}
                        placeholder="We name it for you if you leave this empty"
                        className="h-11 text-base sm:h-9"
                        disabled={busy}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fc-focus">
                      Focus or emphasis <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <ProTextarea
                      id="fc-focus"
                      value={focus}
                      onChange={(e) => {
                        setFocus(e.target.value);
                        keep({ focus: e.target.value });
                      }}
                      placeholder="Anything to cover or skip — e.g. key vocabulary only, skip the dates."
                      className="min-h-20 resize-y text-base"
                      disabled={busy}
                    />
                  </div>
                </div>
              </Step>

              <Step n={3} title="Make the deck">
                {running ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <LoadingSpinner size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {/* read-gate-exempt: counts of the sources the person added to this form and the card count they chose, not a read's rows */}
                          {phase === "reading"
                            ? `Reading ${ready.length} ${ready.length === 1 ? "source" : "sources"}…`
                            : phase === "saving" || isNavigating
                              ? isNavigating
                                ? "Opening your deck…"
                                : "Saving your deck…"
                              : progress && progress.total > 1
                                ? `Section ${Math.min(progress.done + 1, progress.total)} of ${progress.total} — ${progress.items} cards so far`
                                : `Making ${safeCount} cards${hasSources ? " from your sources" : ` about “${topic}”`}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {progress && progress.total > 1
                            ? `Every part of your material gets its own pass — last finished: ${progress.label}.`
                            : "Cards appear below as they are written, each citing where it came from."}
                        </p>
                      </div>
                    </div>
                    {notes.length ? (
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    ) : null}
                    <LiveGenerationPreview requestId={previewId} />
                  </div>
                ) : holding ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
                    <p className="flex items-start gap-2 text-sm text-foreground">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>
                        Waiting for the clean version of{" "}
                        {waitingForClean.map((s) => `“${s.draft.label}”`).join(", ")}. Your deck
                        starts by itself the moment it is ready — you can leave this page open.
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 sm:h-9"
                        onClick={() => {
                          setHolding(false);
                          void start();
                        }}
                      >
                        Start now with what is ready
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 sm:h-9"
                        onClick={() => setHolding(false)}
                      >
                        Stop waiting
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {runError ? (
                      <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{runError}</span>
                        <ErrorAlchemyMenu error={runError} operation="Make a flashcard deck" />
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      {/* read-gate-exempt: counts of the sources the person added to this form and the card count they chose, not a read's rows */}
                      {blockedReason ??
                        (hasSources
                          ? `${safeCount} cards from ${ready.length} ${ready.length === 1 ? "source" : "sources"}${topic ? `, focused on “${topic}”` : ""}. Every card cites the part it came from.`
                          : `${safeCount} cards about “${topic}”.`)}
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <coppa.Gate />
                      <EntitlementMeter capability="education.generate_cards" className="mr-auto" />
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 sm:h-9"
                        onClick={() => startLeaving(() => router.push(EDU_BASE))}
                        disabled={busy || isLeaving}
                      >
                        Cancel
                      </Button>
                      <IntelligenceIndicator
                        feature="flashcards"
                        mandateKeys={[FC_MANDATES.generateCards, FC_MANDATES.generateFromSource]}
                        label="The AI jobs behind Make the deck"
                      />
                      <Button
                        type="button"
                        className="h-11 sm:h-9"
                        disabled={!canGenerate}
                        onClick={handleGenerate}
                      >
                        {busy ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <AGENT_ICON className="mr-1.5 h-4 w-4" />
                        )}
                        {isNavigating ? "Opening…" : "Make the deck"}
                      </Button>
                    </div>
                  </div>
                )}
              </Step>
            </>
          )}
        </div>
      </div>
      <cardGen.Paywall />
    </>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-border bg-card p-3 sm:p-5"
    >
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function StartTile({
  selected,
  disabled,
  icon,
  label,
  helper,
  onSelect,
}: {
  selected: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  helper: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group flex min-h-11 w-full flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all disabled:opacity-60",
        selected
          ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/30 hover:bg-accent/40",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="text-sm font-medium leading-tight text-foreground">{label}</span>
      <span className="text-xs leading-snug text-muted-foreground">{helper}</span>
    </button>
  );
}
