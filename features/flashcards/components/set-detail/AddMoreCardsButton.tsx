"use client";

// features/flashcards/components/set-detail/AddMoreCardsButton.tsx
//
// "Add more cards from your material" — the top-up.
//
// The complaint this answers, verbatim: "there's no option that says, hey, we
// were just wasting your time and so we only made ten. So let us know if you
// want us to make the rest." A generated deck was a dead end: whatever the
// generator produced was all a student would ever get from that upload, and the
// only route to more was uploading the file again and getting a second,
// disconnected deck.
//
// It re-reads the ORIGINAL material through its lineage anchor
// (`reopenSource`), runs the same coverage-planned generator at THOROUGH depth,
// drops anything the deck already has, and appends the rest to THIS set. Same
// deck, same lineage, more cards.

import { useCallback, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { usePdfClient } from "@/features/pdf/api/client";
import { fcService } from "@/features/flashcards/data/fcService";
import type { NewCardInput } from "@/features/flashcards/data/types";
import { coerceCards } from "@/features/flashcards/data/coerce-card";
import { readArtifactOrigin } from "@/features/education/convert/lineage";
import { reopenSource } from "@/features/education/convert/reopenSource";
import { CONVERT_MANDATES } from "@/features/education/convert/mandates";
import {
  looseKey,
  segmentedGenerate,
} from "@/features/education/convert/segmentedGenerate";
import type { ConvertProgress } from "@/features/education/convert/types";

export function AddMoreCardsButton({
  setId,
  /** Fronts already in the deck — what a new card must not repeat. */
  existingFronts,
  onAdded,
}: {
  setId: string;
  existingFronts: string[];
  onAdded?: () => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const pdf = usePdfClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // A deck with no lineage anchor cannot be topped up from anything, so the
  // button removes itself rather than offering an action that always fails.
  const [unavailable, setUnavailable] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setStatus("Finding your original material…");
    try {
      const origin = await readArtifactOrigin("fc_set", setId);
      if (!origin || origin.entityType !== "file") {
        setUnavailable(true);
        toast.error(
          "This deck isn't linked to any uploaded material, so there's nothing to make more from.",
        );
        return;
      }

      setStatus("Re-reading your material…");
      const source = await reopenSource(origin.entityId, { pdf });
      const orgId = await ensureOrgId(undefined);

      const have = new Set(existingFronts.map(looseKey));
      const covered = await segmentedGenerate<NewCardInput>({
        ctx: {
          dispatch,
          store,
          orgId,
          onProgress: (p: ConvertProgress) =>
            setStatus(
              `Covering section ${Math.min(p.done + 1, p.total)} of ${p.total}${
                p.label ? ` · ${p.label}` : ""
              }`,
            ),
        },
        source,
        targetKind: "deck",
        // A top-up is a deliberate ask for MORE, so it always runs thorough:
        // asking again at the same depth would mostly regenerate what is
        // already in the deck and add almost nothing.
        options: { depth: "thorough" },
        mandateKey: CONVERT_MANDATES.deckFromSource,
        surfaceKey: "education-deck-add-more",
        sourceFeature: "education-ingest",
        // The provision's full offer (flashcards.generate_from_source).
        variables: (segment, plan) => ({
          source_content: segment.text,
          document_id: source.ref?.processedDocumentId ?? origin.entityId,
          title:
            plan.segments.length > 1
              ? `${source.title} - section ${segment.index} of ${segment.total}: ${segment.label}`
              : (source.title ?? ""),
          count: String(segment.items),
          difficulty: "Mixed",
          focus: "",
        }),
        extract: (value) =>
          coerceCards(value, {
            anchorFileId: origin.entityId,
            docId: source.ref?.processedDocumentId,
          }),
        identity: (card) => looseKey(card.front),
      });

      // Drop everything the deck already covers — a top-up that re-adds the
      // cards you already studied is worse than no top-up.
      const fresh = covered.items.filter((c) => !have.has(looseKey(c.front)));
      if (fresh.length === 0) {
        toast.info(
          "Nothing new to add — this deck already covers everything in your material.",
        );
        return;
      }

      const added = await fcService.addCards(setId, fresh, {
        orgId,
        startPosition: existingFronts.length,
      });
      if (added.error) throw new Error(added.error);

      toast.success(
        `Added ${fresh.length} new card${fresh.length === 1 ? "" : "s"} from your material.`,
      );
      onAdded?.();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Couldn't add more cards right now.",
      );
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }, [dispatch, existingFronts, onAdded, pdf, setId, store]);

  if (unavailable) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void run()}
        className="gap-1.5"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Add more cards
      </Button>
      {/* A multi-minute job never sits behind a bare spinner: it says which part
          of the student's material it is on. */}
      {status && (
        <span className="truncate text-xs text-muted-foreground">{status}</span>
      )}
    </div>
  );
}
