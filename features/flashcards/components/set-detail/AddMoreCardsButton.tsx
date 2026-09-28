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

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { createSourceRef } from "@ai-matrx/agents/sources";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { readArtifactOrigins, type ArtifactOrigin } from "@/features/education/convert/lineage";
import { recordSourceLineage } from "@/features/education/convert/recordSourceLineage";
import type { ConvertProgress } from "@/features/education/convert/types";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import { ALL_SOURCE_KIND_IDS } from "@/features/resource-manager/source-input/sourceKinds";
import type { SourceDraft, SourceKindId } from "@/features/resource-manager/source-input/types";
import { useFlashcardMandates } from "@/features/flashcards/data/mandate-disclosure";
import { fcService } from "@/features/flashcards/data/fcService";
import {
  backfillFileIds,
  deckLineageResult,
  generateCardsFromSources,
  lineageSourceOf,
} from "@/features/flashcards/data/generateDeckFromSources";

const COUNT_MIN = 1;
const COUNT_MAX = 50;
/** The top-up never offers "Just a topic": the cards come from material. */
const TOPUP_KINDS: readonly SourceKindId[] = ALL_SOURCE_KIND_IDS.filter((k) => k !== "topic");

/** The Source input key for one deck's top-up — picks survive a reload. */
export function addMoreSurfaceKey(setId: string): string {
  return `flashcards:add-more:${setId}`;
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
  existingCards,
  onAdded,
}: {
  setId: string;
  /** The deck's name — what the new cards' sections are titled after. */
  deckName?: string;
  /** Cards already in the deck — what a new card must not repeat. */
  existingCards: { front: string; back: string }[];
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Add more cards
      </Button>
      {open ? (
        <AddMoreCardsDialog
          setId={setId}
          deckName={deckName}
          existingCards={existingCards}
          onClose={() => setOpen(false)}
          onAdded={onAdded}
        />
      ) : null}
    </>
  );
}

function AddMoreCardsDialog({
  setId,
  deckName,
  existingCards,
  onClose,
  onAdded,
}: {
  setId: string;
  deckName?: string;
  existingCards: { front: string; back: string }[];
  onClose: () => void;
  onAdded?: () => void;
}) {
  useFlashcardMandates(["generateFromSource"]);
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const surfaceKey = addMoreSurfaceKey(setId);
  const set = useSourceSet(surfaceKey);
  const cardGen = useEntitlementGuard("education.generate_cards");
  const coppa = useAiComplianceGate();

  // null = still reading which material the deck came from.
  const [origins, setOrigins] = useState<ArtifactOrigin[] | null>(null);
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read the deck's own material once and put it in the input, picked.
  const seeded = useRef(false);
  const seed = useEffectEvent((found: ArtifactOrigin[]) => {
    setOrigins(found);
    if (seeded.current) return;
    seeded.current = true;
    for (const origin of found) {
      const draft = originToDraft(origin);
      if (draft?.ref && !set.hasRef(draft.ref.resource_type, draft.ref.resource_id)) {
        set.addReady(draft);
      }
    }
  });
  useEffect(() => {
    let cancelled = false;
    void readArtifactOrigins("fc_set", setId).then((found) => {
      if (!cancelled) seed(found);
    });
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const ready = set.sources.filter((s) => s.status === "ready" && s.draft.ref);
  const landing = set.sources.filter((s) => s.status === "pending" || s.status === "resolving");
  const safeCount = Math.min(COUNT_MAX, Math.max(COUNT_MIN, count || 10));
  const hasMaterial = origins !== null && origins.length > 0;

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const orgId = await ensureOrgId(undefined);
      setStatus(`Reading ${ready.length} ${ready.length === 1 ? "source" : "sources"}…`);
      const resolved = await backfillFileIds(await set.resolve());
      if (resolved.dropped.length) {
        toast.info(
          resolved.dropped
            .map((d) => d.detail ?? `One source was left out (${d.reason.replace("_", " ")}).`)
            .join(" "),
        );
      }
      setStatus(`Making ${safeCount} new cards…`);
      const made = await generateCardsFromSources({
        resolved,
        count: safeCount,
        difficulty: "medium",
        depth: "recall",
        title: deckName?.trim() || "Your deck",
        existingCards,
        ctx: {
          dispatch,
          store,
          orgId,
          onProgress: (p: ConvertProgress) =>
            setStatus(
              p.total > 1
                ? `Section ${Math.min(p.done + 1, p.total)} of ${p.total} — ${p.items} cards so far`
                : `Making ${safeCount} new cards…`,
            ),
        },
      });
      if (made.cards.length === 0) {
        throw new Error(
          made.gapNote ??
            "Nothing new came out of this material — the deck already covers it. Add other material and try again.",
        );
      }
      setStatus("Adding them to your deck…");
      const added = await fcService.addCards(setId, made.cards, {
        orgId,
        startPosition: existingCards.length,
      });
      if (added.error) throw new Error(added.error);
      // Every Source used is linked to the deck (the RPC is idempotent).
      const result = deckLineageResult(
        setId,
        deckName?.trim() || "Your deck",
        `${made.cards.length} more cards`,
      );
      await Promise.all(
        made.sources.map((s) => recordSourceLineage(result, lineageSourceOf(s), orgId)),
      );
      await cardGen.commit();
      toast.success(
        `Added ${made.cards.length} new card${made.cards.length === 1 ? "" : "s"}${
          made.gapNote ? ` — ${made.gapNote}` : ""
        }.`,
      );
      for (const s of set.sources) set.remove(s.id);
      onAdded?.();
      onClose();
    } catch (e) {
      if (isOrganizationSelectionCancelled(e)) return;
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
      ? "Checking which material this deck was made from…"
      : hasMaterial
        ? "The material this deck was made from is already picked. Keep it, add more, or remove any — new cards are added to this deck and every card you have is kept."
        : "This deck was not made from any material (it was imported or written by hand). Pick what the new cards should come from — new cards are added to this deck and every card you have is kept.";

  const blocked = landing.length
    ? "Wait until your new source has finished adding."
    : ready.length === 0
      ? "Pick at least one source."
      : null;

  const body = (
    <div className="flex max-h-[75dvh] flex-col gap-4 overflow-y-auto px-4 pb-4 sm:px-5">
      <SourceInput
        surfaceKey={surfaceKey}
        title="Sources"
        purpose="the new cards"
        kinds={TOPUP_KINDS}
        required
        attachTo={{ entityType: "fc_set", entityId: setId, label: deckName }}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fc-add-count">How many new cards</Label>
        <Input
          id="fc-add-count"
          type="number"
          inputMode="numeric"
          min={COUNT_MIN}
          max={COUNT_MAX}
          value={count}
          onChange={(e) => setCount(Number.parseInt(e.target.value, 10) || 0)}
          className="h-11 w-32 text-base sm:h-9"
          disabled={busy}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <coppa.Gate />
        {busy && status ? (
          <span className="mr-auto text-xs text-muted-foreground">{status}</span>
        ) : blocked ? (
          <span className="mr-auto text-xs text-muted-foreground">{blocked}</span>
        ) : null}
        <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 sm:h-9"
          disabled={busy || !!blocked || cardGen.isChecking}
          onClick={() => void start()}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <AGENT_ICON className="mr-1.5 h-4 w-4" />
          )}
          Make {safeCount} more cards
        </Button>
      </div>
      <cardGen.Paywall />
    </div>
  );

  const onOpenChange = (next: boolean) => {
    if (!next && !busy) onClose();
  };

  if (isMobile) {
    return (
      <Drawer open onOpenChange={onOpenChange}>
        <DrawerContent className="pb-safe">
          <DrawerHeader>
            <DrawerTitle className="text-base">Add more cards</DrawerTitle>
            <DrawerDescription className="text-xs">{description}</DrawerDescription>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="px-5 py-4">
          <DialogTitle className="text-base">Add more cards</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
