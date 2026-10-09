"use client";

// features/flashcards/components/create/CreateDeckPage.tsx
//
// THE one way to make a flashcard deck: /education/flashcards/new.
// Owner, 2026-09-27: "Create Deck · Choose source options, style options, and
// other details · Get results" — no secret buttons. Three steps on ONE page:
//
//   1. Sources — the one Source input (`features/resource-manager/source-input`)
//      with "Topic" as one of its tiles; beside it, "Import a deck file"
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
  ArrowRight,
  Clock,
  Loader2,
} from "lucide-react";
import { createSourceRef } from "@ai-matrx/agents/sources";
import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import { Button } from "@/components/ui/button";
import { Input, SegmentedControl } from "@ai-matrx/design-system/controls";
import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";
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
import {
  organizationRefusalMessage,
  presentOrganizationRefusal,
} from "@ai-matrx/chat/host/org";
import { selectKindEnvelope } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import type { Depth } from "@/features/education/assessment/data/types";
import type { ConvertProgress } from "@/features/education/convert/types";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { isArchivedSource } from "@/features/resource-manager/source-input/components/ArchivedSource";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { sourceSurfaceKey, useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import {
  ASSISTANT_MESSAGE_COLUMN_CLASS,
  ASSISTANT_MESSAGE_COLUMN_INSET_CLASS,
} from "@ai-matrx/chat/agents/components/shared/assistant-message-layout";
import { DEPTH_TIERS } from "../../data/enhanceCard";
import { FC_MANDATES } from "../../data/mandates";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
import { fcService } from "../../data/fcService";
import {
  generatedDeckName,
  generatedSetFromEnvelope,
} from "../../data/generated-set-from-envelope";
import { useGenerateCards } from "../../data/useGenerateCards";
import {
  MIN_CARDS_PER_RUN,
  clampCardCount,
  useMaxCardsPerRun,
} from "../../data/useMaxCardsPerRun";
import {
  backfillFileIds,
  FLASHCARD_SOURCE_DELIVERIES,
  generateDeckFromSources,
  plannedCardCount,
} from "../../data/generateDeckFromSources";
import { lateSourceIds, unreadableRestoredIds } from "../../data/draftSourceHonesty";
import { saveDeckSourceSet, sourceNamesOf } from "../../data/deckSourceSet";
import { useSuppressAmbientAssistant } from "@ai-matrx/chat/agents/components/ambient-assistant/ambientAssistantSuppression";
import { useWizardDraft } from "@/lib/wizard-draft/useWizardDraft";
import { WizardDraftRestored } from "@/lib/wizard-draft/WizardDraftRestored";
import { useTabBoundRun } from "@/lib/wizard-draft/useTabBoundRun";
import { RunStoppedNotice } from "@/lib/wizard-draft/RunStoppedNotice";
import {
  clearWizardDraft,
  patchWizardDraft,
  selectWizardDraft,
} from "@/lib/redux/slices/wizardDraftSlice";
import { MADE_DECK_DRAFT_ID, readMadeDeck } from "../../data/madeDeckMarker";
import {
  CREATE_DECK_RUN_KEY,
  cardRunRequest,
  restoreCardRunRequest,
} from "../../data/cardRunRequest";
import { cardCount, cardProgressLine } from "./cardProgressLine";
import { LiveGenerationPreview } from "./LiveGenerationPreview";
import { DeckFileImport } from "./DeckFileImport";

const EDU_BASE = "/education/flashcards";
/** Past this, "Opening your deck…" also offers the deck's own link. */
const SLOW_OPEN_MS = 8_000;
/** The Source input's key on this page — picks are held and kept under it. */
export const CREATE_DECK_SURFACE_KEY = "flashcards:new";

const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;
type Difficulty = (typeof DIFFICULTIES)[number]["value"];

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
    // The upper limit is a knob read after restore; an over-limit count is
    // clamped to it on screen (safeCount), never refused here.
    if (key === "count" && typeof v === "number" && Number.isInteger(v) && v >= MIN_CARDS_PER_RUN) values.count = v;
    else if (key === "difficulty" && DIFFICULTIES.some((d) => d.value === v)) values.difficulty = v as Difficulty;
    else if (key === "depth" && DEPTH_TIERS.some((t) => t.value === v)) values.depth = v as Depth;
    else if ((key === "gradeLevel" || key === "focus" || key === "deckName") && typeof v === "string") values[key] = v;
    else rejectedKeys.push(key);
  }
  return { values, rejectedKeys };
}
type Phase = "idle" | "reading" | "generating" | "saving";

export function CreateDeckPage({
  embedded = false,
  onMade,
}: {
  /** Shown inside a host that is not its own page (a Board tile): no shell header or offset, no Cancel. */
  embedded?: boolean;
  /** The deck was made and saved: the host takes it from here (the page itself opens the deck). */
  onMade?: (setId: string, name: string) => void;
} = {}) {
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
  // The deck this page made, kept until the deck page opens it: a reload or a
  // navigation that never lands still says the deck exists, with its link.
  const madeEntry = useAppSelector(selectWizardDraft(MADE_DECK_DRAFT_ID));
  const madeDeck = readMadeDeck(madeEntry?.data);
  // Opening the deck is taking long: offer its link instead of only waiting.
  const [slowOpen, setSlowOpen] = useState(false);
  useEffect(() => {
    if (!isNavigating) {
      setSlowOpen(false);
      return;
    }
    const t = setTimeout(() => setSlowOpen(true), SLOW_OPEN_MS);
    return () => clearTimeout(t);
  }, [isNavigating]);
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
  // The count the plan actually uses, fixed once the Sources are read (a Source
  // with no text earns no card), so progress never moves with later edits.
  const [runPlanned, setRunPlanned] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  // The run lives in this tab (fan-out + save): a reload mid-run stops it. Its
  // request is kept so the page says so and repeats it in one click.
  const tabRun = useTabBoundRun(CREATE_DECK_RUN_KEY, restoreCardRunRequest);
  const [redoCount, setRedoCount] = useState<number | null>(null);
  // One run, one deck: Try again hands the stopped run's conversations to the
  // next run, whose save continues a deck already made for them.
  const continuesRef = useRef<readonly string[]>([]);
  // The Sources a run was started from. A Source added after that moment is not
  // in the deck: it stays in the draft, marked, and the finish says so.
  const usedIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [usedIds, setUsedIds] = useState<ReadonlySet<string>>(new Set());
  const [leftOutIds, setLeftOutIds] = useState<ReadonlySet<string>>(new Set());

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

  // ── Sources kept from before a reload that cannot be read ────────────────
  // Taken once, when the draft has been read back: only these are ever dropped.
  const restoredIds = useRef<ReadonlySet<string> | null>(null);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const dropUnreadable = useEffectEvent(() => {
    if (restoredIds.current === null) {
      if (!set.restoring) restoredIds.current = new Set(set.sources.map((s) => s.id));
      return;
    }
    const goneIds = new Set(
      unreadableRestoredIds(
        set.sources.map((s) => ({
          id: s.id,
          status: s.status,
          archived: isArchivedSource(s.manifest),
          state: s.manifest?.state,
        })),
        restoredIds.current,
      ),
    );
    const gone = set.sources.filter((s) => goneIds.has(s.id));
    if (gone.length === 0) return;
    for (const s of gone) set.remove(s.id);
    const names = gone.map((s) => s.draft.label).join(", ");
    setDropNotice(`Taken out of your draft, nothing to read: ${names.length > 90 ? `${names.slice(0, 90)}…` : names}`);
  });
  useEffect(() => {
    dropUnreadable();
  }, [set.sources, set.restoring]);

  const ready = set.sources.filter((s) => s.status === "ready" && s.draft.ref);
  const landing = set.sources.filter(
    (s) => s.status === "pending" || s.status === "resolving",
  );
  const topic = set.topic.trim();
  const hasSources = ready.length > 0;
  const waitingForClean = ready.filter(
    (s) => s.draft.waitForClean && s.manifest?.state !== "ready",
  );
  // The most cards one run may make — the `flashcards.max_cards_per_run` knob.
  const cardLimit = useMaxCardsPerRun();
  const countMax = cardLimit.max;
  // What the count field shows (null while empty or out of range) — the summary repeats it.
  const [shownCount, setShownCount] = useState<number | null>(count);
  const safeCount =
    countMax === null
      ? Math.max(MIN_CARDS_PER_RUN, count || 10)
      : clampCardCount(count, countMax);

  // The plan makes at least one card per Source, so the count shown (field
  // hint, summary, progress, stopped notice) is the plan's, never the typed one.
  const plannedCount = plannedCardCount(safeCount, ready.length);
  const plannedShown = shownCount === null ? null : plannedCardCount(shownCount, ready.length);

  // Stays on the progress view through the hand-off to the new deck, so the
  // cleared picks never flash "pick a source" while the deck opens.
  const running = phase !== "idle" || topicRun.isGenerating || isNavigating;
  const busy = running || isNavigating || cardGen.isChecking || holding;
  const blockedReason = cardLimit.error
    ? cardLimit.error
    : countMax === null
      ? "Reading the most cards one run may make…"
      : landing.length
    ? `Wait until ${landing.length === 1 ? "your new source has" : `${landing.length} new sources have`} finished adding.`
    : !hasSources && !topic
      ? "Add a source or a topic."
      : null;
  const canGenerate = !blockedReason && !busy;

  // After a deck is made only the Sources it used leave the draft; one added
  // while it was being made stays, marked "Not in this deck".
  const clearDraft = () => {
    const used = usedIdsRef.current;
    // Read the draft as it is NOW — this runs long after the render that started the run.
    const live = Object.values(
      store.getState().instanceResources.byConversationId[sourceSurfaceKey(CREATE_DECK_SURFACE_KEY)] ?? {},
    ).filter((r) => r.blockType === "source_ref");
    const late = new Set(lateSourceIds(live.map((r) => r.resourceId), used));
    for (const r of live) if (!late.has(r.resourceId)) set.remove(r.resourceId);
    set.setTopic("");
    styleDraft.clear();
    setLeftOutIds(late);
    return late.size;
  };

  const finish = async (setId: string, name: string, cards: number, gap: string | null) => {
    // Metered action SUCCEEDED (generated AND saved) — record real usage.
    await cardGen.commit();
    recordToast.success(
      { type: "flashcard_set", id: setId, title: name },
      `Created "${name}" with ${cards} ${cards === 1 ? "card" : "cards"}${gap ? ` — ${gap}` : ""}`,
    );
    const leftOut = clearDraft();
    if (leftOut > 0) {
      toast.info(
        `${leftOut === 1 ? "A source you added" : `${leftOut} sources you added`} while the deck was being made ${leftOut === 1 ? "is" : "are"} not in it. Use “Add more cards” on the deck.`,
      );
    }
    if (onMade) {
      onMade(setId, name);
      return;
    }
    // Recorded BEFORE the draft-less page navigates: if the opening never
    // lands, this page still names the deck (the deck page clears it).
    dispatch(clearWizardDraft(MADE_DECK_DRAFT_ID));
    dispatch(
      patchWizardDraft({
        wizardId: MADE_DECK_DRAFT_ID,
        patch: { setId, name, madeAt: Date.now() },
      }),
    );
    startNavigation(() => router.push(`${EDU_BASE}/${setId}`));
  };

  const runFromTopic = async (
    saving: () => Promise<void>,
    attach: (conversationId: string) => void,
    continues: readonly string[],
  ) => {
    setPhase("generating");
    const extracted = await topicRun.generate(
      FC_MANDATES.generateCards,
      {
        topic,
        count: safeCount,
        difficulty,
        grade_level: gradeLevel.trim() || undefined,
        user_request: focus.trim() || undefined,
        depth,
      },
      { onConversationCreated: attach },
    );
    setPhase("saving");
    // The envelope that drove the live preview is the persistence source.
    const fromEnvelope = envelopeRef.current
      ? generatedSetFromEnvelope(envelopeRef.current)
      : null;
    const result =
      fromEnvelope && fromEnvelope.cards.length > 0 ? fromEnvelope : extracted;
    await saving();
    // Single-writer contract (D-WP3): adopt the stream's own set or create one.
    const saved = await fcService.createGeneratedSetForConversation(
      extracted.conversationId,
      {
        name: generatedDeckName({
          typedName: deckName,
          generatedTitle: result.title,
          topic,
        }),
        topic,
        difficulty,
      },
      result.cards,
      { continues },
    );
    if (saved.error || !saved.data) {
      throw new Error(saved.error ?? "The cards were made but the deck could not be saved. Try again.");
    }
    await finish(saved.data.set.id, saved.data.set.name, saved.data.cards.length, null);
  };

  const runFromSources = async (
    saving: () => Promise<void>,
    attach: (conversationId: string) => void,
    continues: readonly string[],
  ) => {
    setRunPlanned(null);
    setPhase("reading");
    // What the deck is made from, exactly as chosen (parts, form, limit) and as
    // named on the cards — recorded on the deck so "Add more cards" starts
    // from the same material (V2-F #2). Fixed in this one moment, before any
    // wait, so a Source added later is never half in.
    const chosen = set.toSourceSet();
    const chosenNames = sourceNamesOf(set.sources);
    const used = new Set(set.sources.filter((s) => s.status === "ready" && s.draft.ref).map((s) => s.id));
    usedIdsRef.current = used;
    setUsedIds(used);
    setLeftOutIds(new Set());
    const resolving = set.resolve();
    resolving.catch(() => undefined);
    const orgId = await ensureOrgId(undefined);
    // Citations open the real file only through its file id.
    const resolved = await backfillFileIds(await resolving);
    setRunPlanned(
      plannedCardCount(safeCount, resolved.sources.filter((src) => src.text.trim().length > 0).length),
    );
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
        onConversationCreated: attach,
        onProgress: setProgress,
      },
      beforeSave: saving,
      continues,
    });
    setPhase("saving");
    const notRecorded = await saveDeckSourceSet(outcome.setId, chosen, chosenNames);
    if (notRecorded)
      toast.warning(
        `The deck was made, but the parts it came from could not be saved with it (${notRecorded}). "Add more cards" will start from the whole Sources — narrow them again there.`,
      );
    await finish(outcome.setId, outcome.name, outcome.cardCount, outcome.gapNote);
  };

  const run = async () => {
    usedIdsRef.current = new Set();
    setUsedIds(new Set());
    setLeftOutIds(new Set());
    setRunError(null);
    setNotes([]);
    setProgress(null);
    setLiveRequestId(null);
    const continues = continuesRef.current;
    continuesRef.current = [];
    try {
      await tabRun.track(
        cardRunRequest(plannedCount, set.toSourceSet(), sourceNamesOf(set.sources), topic),
        async (_settle, saving, attach) => {
          if (hasSources) await runFromSources(saving, attach, continues);
          else await runFromTopic(saving, attach, continues);
        },
        { continues },
      );
    } catch (e) {
      // "Not now" at the organization picker: nothing happened, nothing to say.
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

  // ── A run that stopped with its page: the same request, one click ───────
  const stoppedRun = tabRun.stopped;
  const redoStopped = () => {
    const req = stoppedRun?.request;
    if (!req) return;
    continuesRef.current = stoppedRun?.conversationIds ?? [];
    tabRun.dismiss();
    for (const s of set.sources) set.remove(s.id);
    for (const draft of req.drafts) set.addReady(draft);
    set.setTopic(req.topic);
    setCount(req.count);
    keep({ count: req.count });
    setMode("make");
    setRedoCount(req.count);
  };
  const fireRedo = useEffectEvent(() => {
    setRedoCount(null);
    handleGenerate();
  });
  useEffect(() => {
    if (redoCount !== null && canGenerate && count === redoCount) fireRedo();
  }, [redoCount, canGenerate, count]);

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
  // A Source added while the deck was being made: still in the draft, marked.
  const marks: Record<string, string> = {};
  for (const s of set.sources) {
    if (leftOutIds.has(s.id) || (phase !== "idle" && usedIds.size > 0 && !usedIds.has(s.id))) marks[s.id] = "Not in this deck";
  }

  return (
    <>
      {embedded ? null : <EducationToolHeader title="New flashcard deck" />}
      <div className="min-h-full w-full bg-textured">
        <div
          className={cn(
            ASSISTANT_MESSAGE_COLUMN_CLASS,
            ASSISTANT_MESSAGE_COLUMN_INSET_CLASS,
            "matrx-touch-targets flex flex-col gap-4 pb-safe sm:gap-5",
            embedded ? "pt-3" : "pt-[var(--shell-header-h)]",
          )}
        >
          {/* How to start: make cards, or bring a deck you already have. */}
          <SegmentedControl aria-label="How to start"
            value={mode}
            onValueChange={(v) => {
              if (!busy) setMode(v === "import" ? "import" : "make");
            }}
            data={[
              { value: "make", label: "Make cards" },
              { value: "import", label: "Import a deck file" },
            ]}
            fill
          />

          {mode === "import" ? (
            <Step n={1} title="Your deck file">
              <DeckFileImport />
            </Step>
          ) : (
            <>
              <Step n={1} title="What should the cards come from?">
                {dropNotice ? (
                  <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 flex-1">{dropNotice}</span>
                    <Button type="button" variant="quiet" onClick={() => setDropNotice(null)}>
                      Dismiss
                    </Button>
                  </p>
                ) : null}
                <SourceInput
                  surfaceKey={CREATE_DECK_SURFACE_KEY}
                  title="Sources"
                  purpose="your flashcard deck"
                  required
                  attachTo={undefined}
                  deliveries={FLASHCARD_SOURCE_DELIVERIES}
                  marks={marks}
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
                      <ClampedNumberInput
                        id="fc-count"
                        min={MIN_CARDS_PER_RUN}
                        max={countMax}
                        value={count}
                        onChange={(n) => {
                          setCount(n);
                          keep({ count: n });
                        }}
                        onDraftChange={setShownCount}
                        className="h-11 text-base sm:h-9"
                        disabled={busy}
                      />
                      {cardLimit.error ? (
                        <p role="alert" className="text-[11px] text-destructive">
                          {cardLimit.error}
                        </p>
                      ) : countMax === null ? (
                        <p className="text-[11px] text-muted-foreground">Reading the most cards one run may make…</p>
                      ) : plannedShown !== null && shownCount !== null && plannedShown > shownCount ? (
                        <p className="text-[11px] text-muted-foreground">
                          {`One card per source: ${cardCount(plannedShown)}`}
                        </p>
                      ) : null}
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
                        <SelectTrigger id="fc-difficulty">
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
                              : (cardProgressLine(progress, runPlanned ?? plannedCount) ??
                                `Making ${cardCount(runPlanned ?? plannedCount)}${hasSources ? "" : ` about “${topic}”`}`)}
                        </p>
                      </div>
                    </div>
                    {isNavigating && slowOpen && madeDeck ? (
                      // A full page load: the in-app navigation is what is stuck.
                      <Button
                        type="button"
                        variant="outline"
                        className="self-start"
                        icon={<ArrowRight />}
                        onClick={() => window.location.assign(`${EDU_BASE}/${madeDeck.setId}`)}
                      >
                        Open “{madeDeck.name}”
                      </Button>
                    ) : null}
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
                        {waitingForClean.map((s) => `“${s.draft.label}”`).join(", ")} — the deck starts by itself.
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setHolding(false);
                          void start();
                        }}
                      >
                        Start now with what is ready
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        onClick={() => setHolding(false)}
                      >
                        Stop waiting
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {madeDeck && !embedded ? (
                      // The deck was made but its page never opened (a reload,
                      // a navigation that did not land): never a silent blank form.
                      <RunStoppedNotice
                        message={`Your deck “${madeDeck.name}” was made. It did not open.`}
                        redoLabel="Open the deck"
                        redoIcon={ArrowRight}
                        onRedo={() => startLeaving(() => router.push(`${EDU_BASE}/${madeDeck.setId}`))}
                        onDismiss={() => dispatch(clearWizardDraft(MADE_DECK_DRAFT_ID))}
                      />
                    ) : null}
                    {stoppedRun?.whileSaving ? (
                      // The save had been sent and may have landed: never redo it blind.
                      <RunStoppedNotice
                        message="The page closed while saving your deck. Check your decks."
                        redoLabel="Your decks"
                        redoIcon={ArrowRight}
                        onRedo={() => {
                          tabRun.dismiss();
                          startLeaving(() => router.push(EDU_BASE));
                        }}
                        onDismiss={tabRun.dismiss}
                      />
                    ) : stoppedRun ? (
                      <RunStoppedNotice
                        message={`Making ${stoppedRun.request.count} cards stopped when the page closed.`}
                        onRedo={redoStopped}
                        onDismiss={tabRun.dismiss}
                      />
                    ) : null}
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
                          ? `${plannedShown === null ? "Cards" : cardCount(plannedShown)} from ${ready.length} ${ready.length === 1 ? "source" : "sources"}${topic ? `, focused on “${topic}”` : ""}`
                          : `${shownCount === null ? "Cards" : cardCount(shownCount)} about “${topic}”.`)}
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <coppa.Gate />
                      <EntitlementMeter capability="education.generate_cards" className="mr-auto" />
                      {embedded ? null : (
                        <Button
                          type="button"
                          variant="quiet"
                          onClick={() => startLeaving(() => router.push(EDU_BASE))}
                          disabled={busy || isLeaving}
                        >
                          Cancel
                        </Button>
                      )}
                      <IntelligenceIndicator
                        feature="flashcards"
                        mandateKeys={[FC_MANDATES.generateCards, FC_MANDATES.generateFromSource]}
                        label="The AI jobs behind Make the deck"
                      />
                      <Button
                        variant="primary"
                        type="button"
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
        <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-2 text-xs text-primary-foreground">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

