"use client";

// features/flashcards/components/set-detail/AddMoreCardsButton.tsx
//
// "Add more cards" — the top-up, on the ONE Source input.
//
// The complaint this answers, verbatim: "there's no option that says, hey, we
// were just wasting your time and so we only made ten. So let us know if you
// want us to make the rest." A generated deck was a dead end.
//
// It opens the same Source input the Create deck page uses
// (`features/resource-manager/source-input`), already holding the material the
// deck was made from (its `source` lineage edges). The person can keep it, add
// more, or — for a deck that was IMPORTED and has no material at all — pick
// some for the first time (verify-1, 2026-09-28: the old button promised to
// "re-read your original material" on a CSV deck that had none, and never
// offered the Source input). The cards come from the same generator as a new
// deck (`generateCardsFromSources`): same grounding, same count law, and
// nothing the deck already has is made again. Every Source used is linked to
// the deck.
//
// React Compiler is on: no manual useMemo / useCallback.

import { emptyRunMessage } from "@/features/education/convert/segmentedGenerate";
import { cardCount, cardProgressLine, makeMoreCardsLabel } from "@/features/flashcards/components/create/cardProgressLine";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { createSourceRef } from "@ai-matrx/agents/sources";
import { ClampedNumberInput } from "@/components/official/ClampedNumberInput";
import { Button } from "@/components/ui/button";
import { Button as SurfaceButton } from "@ai-matrx/design-system";
import { Chip, ChipSet } from "@ai-matrx/design-system/controls";
import { ProTextarea } from "@/components/official/ProTextarea";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { newBatchId } from "@/features/education/convert/steering";
import { CARD_KIND, type CardKind } from "@/features/flashcards/utils/cardVariants";
import { undoCardBatch } from "@/features/flashcards/data/undoCardBatch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { readArtifactOrigins, type ArtifactOrigin } from "@/features/education/convert/lineage";
import { recordSourceLineage } from "@/features/education/convert/recordSourceLineage";
import type { ConvertProgress } from "@/features/education/convert/types";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import { ALL_SOURCE_KIND_IDS } from "@/features/resource-manager/source-input/sourceKinds";
import type { SourceDraft, SourceKindId } from "@ai-matrx/agents/sources/runtime";
import { useFlashcardMandates } from "@/features/flashcards/data/mandate-disclosure";
import { fcService } from "@/features/flashcards/data/fcService";
import {
  readDeckSourceDrafts,
  saveDeckSourceSet,
  sourceNamesOf,
  topUpSeed,
} from "@/features/flashcards/data/deckSourceSet";
import {
  FLASHCARD_SOURCE_DELIVERIES,
  backfillFileIds,
  plannedCardCount,
  deckLineageResult,
  generateCardsFromSources,
  lineageSourceOf,
} from "@/features/flashcards/data/generateDeckFromSources";
import {
  MIN_CARDS_PER_RUN,
  clampCardCount,
  useMaxCardsPerRun,
} from "@/features/flashcards/data/useMaxCardsPerRun";
import {
  addMoreRunKey,
  cardRunRequest,
  restoreCardRunRequest,
  type CardRunRequest,
} from "@/features/flashcards/data/cardRunRequest";
import { useTabBoundRun, type TabBoundRun } from "@/lib/wizard-draft/useTabBoundRun";

/** The top-up never offers "Just a topic": the cards come from material. */
const TOPUP_KINDS: readonly SourceKindId[] = ALL_SOURCE_KIND_IDS.filter((k) => k !== "topic");

/** The card types a top-up can ask for; none picked = the writer's own mix. */
const KIND_CHOICES: { kind: CardKind; label: string }[] = [
  { kind: CARD_KIND.basic, label: "Basic" },
  { kind: CARD_KIND.cloze, label: "Cloze" },
  { kind: CARD_KIND.matching, label: "Matching" },
  { kind: CARD_KIND.formula, label: "Formula" },
];

/** The agent surface the focus box is bound to. */
const FOCUS_SURFACE = "flashcards-add-more";

/** The Source input key for one deck's top-up — picks survive a reload. */
export function addMoreSurfaceKey(setId: string): string {
  return `flashcards:add-more:${setId}`;
}

/** What a top-up that stopped with its page says (toast and dialog). */
export function addMoreStoppedLine(count: number): string {
  return `Adding ${count} ${count === 1 ? "card" : "cards"} stopped when the page closed.`;
}

/** The run had sent its save: the cards may be in the deck — never redo blind. */
export function addMoreStoppedSavingLine(count: number): string {
  return `The page closed while saving ${count} ${count === 1 ? "card" : "cards"}. Check the deck.`;
}

/** A lineage origin as a ready Source draft (the deck's own material, preselected). */
export function originToDraft(origin: ArtifactOrigin): SourceDraft | null {
  const label = origin.title?.trim() || "Material this deck was made from";
  switch (origin.entityType) {
    case "file":
    case "cld_file":
      return {
        kind: "files",
        label,
        ref: createSourceRef("file", origin.entityId),
        fileId: origin.entityId,
      };
    case "processed_document":
      return {
        kind: "your_sources",
        label,
        ref: createSourceRef("processed_document", origin.entityId),
        processedDocumentId: origin.entityId,
      };
    case "note":
      return { kind: "notes", label, ref: createSourceRef("note", origin.entityId) };
    default:
      // Anything else the resolver reads by its own token (a record, a page).
      return { kind: "records", label, ref: createSourceRef(origin.entityType, origin.entityId) };
  }
}

export function AddMoreCardsButton({
  setId,
  deckName,
  deckOrganizationId,
  existingCards,
  onAdded,
  label = "Add more cards",
  variant = "outline",
}: {
  setId: string;
  /** The trigger's words; the deck page's action bar uses "Add". */
  label?: string;
  variant?: "outline" | "default";
  /** The deck's name — what the new cards' sections are titled after. */
  deckName?: string;
  /** The deck's OWN organization — new cards, the agent run and lineage file under it, never the active org. */
  deckOrganizationId?: string | null;
  /** Cards already in the deck — what a new card must not repeat. */
  existingCards: { front: string; back: string }[];
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The top-up runs in this tab (segmented fan-out + save). A reload mid-run
  // stops it; the run's request is kept so the deck page says so and repeats
  // the same request in one click (useTabBoundRun).
  const tabRun = useTabBoundRun(addMoreRunKey(setId), restoreCardRunRequest);
  const [redo, setRedo] = useState<{ request: CardRunRequest; auto: boolean } | null>(null);
  const stopped = tabRun.stopped;
  const toastId = `fc-add-more-stopped:${setId}`;
  const openRedo = useEffectEvent((auto: boolean) => {
    if (!stopped) return;
    setRedo({ request: stopped.request, auto });
    setOpen(true);
    toast.dismiss(toastId);
    tabRun.dismiss();
  });
  const dismissStopped = useEffectEvent(() => tabRun.dismiss());
  const stoppedCount = stopped?.request.count ?? null;
  const stoppedWhileSaving = stopped?.whileSaving === true;
  useEffect(() => {
    if (stoppedCount === null || open) return;
    if (stoppedWhileSaving) {
      // The save may have landed: say so, offer no one-click redo.
      toast.info(addMoreStoppedSavingLine(stoppedCount), {
        id: toastId,
        duration: Infinity,
        onDismiss: () => dismissStopped(),
      });
      return;
    }
    toast.info(addMoreStoppedLine(stoppedCount), {
      id: toastId,
      duration: Infinity,
      action: { label: "Try again", onClick: () => openRedo(true) },
      onDismiss: () => dismissStopped(),
    });
  }, [stoppedCount, stoppedWhileSaving, open, toastId]);
  return (
    <>
      <SurfaceButton
        type="button"
        variant={variant}
        size="sm"
        onClick={() => {
          if (stopped && !stopped.whileSaving) openRedo(false);
          else {
            if (stopped) {
              toast.dismiss(toastId);
              tabRun.dismiss();
            }
            setOpen(true);
          }
        }}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        {label}
      </SurfaceButton>
      {open ? (
        <AddMoreCardsDialog
          setId={setId}
          deckName={deckName}
          deckOrganizationId={deckOrganizationId}
          existingCards={existingCards}
          tabRun={tabRun}
          redo={redo}
          onClose={() => {
            setOpen(false);
            setRedo(null);
          }}
          onAdded={onAdded}
        />
      ) : null}
    </>
  );
}

function AddMoreCardsDialog({
  setId,
  deckName,
  deckOrganizationId,
  existingCards,
  tabRun,
  redo,
  onClose,
  onAdded,
}: {
  setId: string;
  deckName?: string;
  deckOrganizationId?: string | null;
  existingCards: { front: string; back: string }[];
  tabRun: TabBoundRun<CardRunRequest>;
  /** A run that stopped with its page: repeat it (same count, same material). */
  redo: { request: CardRunRequest; auto: boolean } | null;
  onClose: () => void;
  onAdded?: () => void;
}) {
  useFlashcardMandates(["generateFromSource"]);
  // The most cards one run may make — the `flashcards.max_cards_per_run` knob.
  const cardLimit = useMaxCardsPerRun();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const surfaceKey = addMoreSurfaceKey(setId);
  const set = useSourceSet(surfaceKey);
  const cardGen = useEntitlementGuard("education.generate_cards");
  const coppa = useAiComplianceGate();

  // null = still reading which material the deck came from.
  const [origins, setOrigins] = useState<ArtifactOrigin[] | null>(null);
  const [count, setCount] = useState(10);
  const [cardKinds, setCardKinds] = useState<CardKind[]>([]);
  const [instruction, setInstruction] = useState("");
  const focusRef = useRef<HTMLTextAreaElement | null>(null);
  // What the count field shows (null while empty or out of range) — the button repeats it.
  const [shownCount, setShownCount] = useState<number | null>(10);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read the deck's own material once and put it in the input, picked —
  // EXACTLY as it was chosen (parts, form, limit) when the deck recorded it
  // (V2-F #2: a deck made from "Pages 65–68" reopened holding the whole PDF);
  // a deck made before that falls back to its lineage, whole, and says so.
  const seeded = useRef(false);
  const [wholeSourcesOnly, setWholeSourcesOnly] = useState(false);
  const seed = useEffectEvent((found: ArtifactOrigin[], saved: SourceDraft[] | null) => {
    setOrigins(found);
    if (seeded.current) return;
    seeded.current = true;
    if (redo) {
      // The stopped run's own request, exactly: its material and its count.
      for (const s of set.sources) set.remove(s.id);
      for (const draft of redo.request.drafts) set.addReady(draft);
      setCount(redo.request.count);
      setCardKinds(redo.request.cardKinds);
      setInstruction(redo.request.instruction);
      return;
    }
    const lineage = found.map(originToDraft).filter((d): d is SourceDraft => !!d?.ref);
    const start = topUpSeed(saved, lineage);
    setWholeSourcesOnly(start.wholeSourcesOnly);
    for (const draft of start.drafts) {
      if (draft.ref && !set.hasRef(draft.ref.resource_type, draft.ref.resource_id)) {
        set.addReady(draft);
      }
    }
  });
  useEffect(() => {
    let cancelled = false;
    void Promise.all([readArtifactOrigins("fc_set", setId), readDeckSourceDrafts(setId)]).then(
      ([found, saved]) => {
        if (!cancelled) seed(found, saved);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const ready = set.sources.filter((s) => s.status === "ready" && s.draft.ref);
  const landing = set.sources.filter((s) => s.status === "pending" || s.status === "resolving");
  const safeCount =
    cardLimit.max === null
      ? Math.max(MIN_CARDS_PER_RUN, count || 10)
      : clampCardCount(count, cardLimit.max);
  // The plan makes at least one card per Source: the count shown (status,
  // progress, button, hint) is the plan's, never the typed one.
  const plannedCount = plannedCardCount(safeCount, ready.length);
  const plannedShown = shownCount === null ? null : plannedCardCount(shownCount, ready.length);
  const hasMaterial = origins !== null && origins.length > 0;

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const orgId = await ensureOrgId(deckOrganizationId ?? undefined);
      setStatus(`Reading ${ready.length} ${ready.length === 1 ? "source" : "sources"}…`);
      const chosen = set.toSourceSet();
      const chosenNames = sourceNamesOf(set.sources);
      // The run lives in this tab: its request is kept until the cards are in
      // the deck, so a reload mid-run is reported and can be repeated.
      const batchId = newBatchId();
      await tabRun.track(cardRunRequest(plannedCount, chosen, chosenNames, "", { cardKinds, instruction }), async (settle, saving) => {
        const resolved = await backfillFileIds(await set.resolve());
        if (resolved.dropped.length) {
          toast.info(
            resolved.dropped
              .map((d) => d.detail ?? `One source was left out (${d.reason.replace("_", " ")}).`)
              .join(" "),
          );
        }
        setStatus(`Making ${cardCount(plannedCount, "new")}…`);
        const made = await generateCardsFromSources({
          resolved,
          count: safeCount,
          difficulty: "medium",
          depth: "recall",
          title: deckName?.trim() || "Your deck",
          existingCards,
          steer: { instruction, cardKinds },
          batchId,
          ctx: {
            dispatch,
            store,
            orgId,
            onProgress: (p: ConvertProgress) =>
              setStatus(cardProgressLine(p, plannedCount, "new") ?? `Making ${cardCount(plannedCount, "new")}…`),
          },
        });
        if (made.cards.length === 0) {
          throw new Error(
            emptyRunMessage(
              made,
              "cards",
              made.gapNote ??
                "Nothing new came out of this material — the deck already covers it. Add other material and try again.",
            ),
          );
        }
        setStatus("Adding them to your deck…");
        await saving();
        const added = await fcService.addCards(setId, made.cards, {
          orgId,
          startPosition: existingCards.length,
        });
        if (added.error) throw new Error(added.error);
        settle();
        // Every Source used is linked to the deck (the RPC is idempotent).
        const result = deckLineageResult(
          setId,
          deckName?.trim() || "Your deck",
          `${made.cards.length} more cards`,
        );
        await Promise.all(
          made.sources.map((s) => recordSourceLineage(result, lineageSourceOf(s), orgId)),
        );
        // The next top-up starts from what this one used (V2-F #2).
        const notRecorded = await saveDeckSourceSet(setId, chosen, chosenNames);
        if (notRecorded)
          toast.warning(
            `The cards were added, but the parts they came from could not be saved with the deck (${notRecorded}).`,
          );
        await cardGen.commit();
        toast.success(
          `Added ${made.cards.length} new card${made.cards.length === 1 ? "" : "s"}${
            made.gapNote ? ` — ${made.gapNote}` : ""
          }.`,
          {
            duration: 20_000,
            action: {
              label: "Undo",
              onClick: () => {
                void undoCardBatch(setId, batchId).then(({ removed, error: undoError }) => {
                  if (undoError) toast.error(undoError);
                  else toast.info(`Removed ${removed} ${removed === 1 ? "card" : "cards"}.`);
                  onAdded?.();
                });
              },
            },
          },
        );
        for (const s of set.sources) set.remove(s.id);
        onAdded?.();
        onClose();
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "More cards could not be made. Try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const start = async () => {
    if (!(await coppa.ensureAllowed())) return;
    await cardGen.guard(run);
  };

  const description =
    origins === null
      ? "Checking this deck's material…"
      : hasMaterial || set.sources.length > 0
        ? null
        : "Pick what the new cards come from.";

  const blocked = cardLimit.error
    ? cardLimit.error
    : cardLimit.max === null
      ? "Reading the most cards one run may make…"
      : landing.length
    ? "Wait until your new source has finished adding."
    : ready.length === 0
      ? "Pick at least one source."
      : null;

  // "Try again" on a stopped run starts it as soon as its material is back in
  // the input — one click, the same request.
  const [armed, setArmed] = useState(redo?.auto ?? false);
  const fire = useEffectEvent(() => {
    setArmed(false);
    void start();
  });
  const redoCount = redo?.request.count;
  useEffect(() => {
    if (armed && origins !== null && !blocked && !busy && count === redoCount) fire();
  }, [armed, origins, blocked, busy, count, redoCount]);

  const body = (
    <div className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto px-4 pb-4 sm:px-5">
      <SourceInput
        surfaceKey={surfaceKey}
        title="Sources"
        purpose="the new cards"
        kinds={TOPUP_KINDS}
        required
        deliveries={FLASHCARD_SOURCE_DELIVERIES}
        attachTo={{ entityType: "fc_set", entityId: setId, label: deckName }}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fc-add-count">How many new cards</Label>
        <ClampedNumberInput
          id="fc-add-count"
          min={MIN_CARDS_PER_RUN}
          max={cardLimit.max}
          value={count}
          onChange={setCount}
          onDraftChange={setShownCount}
          className="h-11 w-32 text-base sm:h-9"
          disabled={busy}
        />
        {cardLimit.error ? (
          <p role="alert" className="text-xs text-destructive">
            {cardLimit.error}
          </p>
        ) : plannedShown !== null && shownCount !== null && plannedShown > shownCount ? (
          <p className="text-xs text-muted-foreground">{`One card per source: ${cardCount(plannedShown)}`}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Card types</Label>
        <ChipSet aria-label="Card types">
          {KIND_CHOICES.map(({ kind, label }) => (
            <Chip key={kind} label={label} pressed={cardKinds.includes(kind)} asChild>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setCardKinds((cur) =>
                    cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind],
                  )
                }
              />
            </Chip>
          ))}
        </ChipSet>
        {cardKinds.length === 0 ? <p className="text-xs text-muted-foreground">Any</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fc-add-focus">What should the new cards focus on?</Label>
        <ProTextarea
          id="fc-add-focus"
          ref={focusRef}
          surfaceName={FOCUS_SURFACE}
          getApplicationScope={() => {
            const el = focusRef.current;
            const start = el?.selectionStart ?? 0;
            const end = el?.selectionEnd ?? 0;
            return buildApplicationScopeFromMenuContext({
              selectedText:
                el && start !== end ? el.value.slice(Math.min(start, end), Math.max(start, end)) : "",
              selectionRange: el ? { type: "editable", element: el, start, end } : null,
              contextData: { deckName: deckName ?? "", focus: instruction },
            });
          }}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. the Krebs cycle, harder questions"
          rows={2}
          autoGrow
          disabled={busy}
          className="text-base"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : redo && !busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          {addMoreStoppedLine(redo.request.count)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <coppa.Gate />
        {busy && status ? (
          <span className="mr-auto text-xs text-muted-foreground">{status}</span>
        ) : blocked ? (
          <span className="mr-auto text-xs text-muted-foreground">{blocked}</span>
        ) : null}
        <Button type="button" variant="quiet" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="button"
          disabled={busy || !!blocked || cardGen.isChecking}
          onClick={() => void start()}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <AGENT_ICON className="mr-1.5 h-4 w-4" />
          )}
          {makeMoreCardsLabel(plannedShown)}
        </Button>
      </div>
      <cardGen.Paywall />
    </div>
  );

  const onOpenChange = (next: boolean) => {
    if (!next && !busy) onClose();
  };

  // A plain Dialog: it becomes a bottom sheet on mobile by itself.
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="px-5 py-4">
          <DialogTitle className="text-base">Add more cards</DialogTitle>
          <DialogDescription className={description ? "text-xs" : "sr-only"}>
            {description ?? "Add cards to this deck"}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
