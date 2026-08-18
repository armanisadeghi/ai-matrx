// features/flashcards/components/set-detail/MergeCardsDialog.tsx
//
// WP3 gap 5 — card MERGE (Arman asked for it by name). Two or more near-
// duplicate cards become one: the learner picks which card survives, sees the
// proposed merged faces rendered exactly as a card face renders them
// (CardFaceContent — markdown + LaTeX), edits either side, and confirms.
//
// The composition is deliberately naive-but-visible: fronts/backs are joined,
// exact duplicates dropped. The learner is looking at the result before it
// lands, so a smart-but-wrong AI merge would be worse than an obvious one they
// can fix. (An AI "merge these properly" action is a later mandate-backed
// upgrade — WP2's IC-1 — not a reason to withhold merge now.)

"use client";

import { useEffect, useState } from "react";
import { Merge, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import CardFaceContent from "@/components/mardown-display/blocks/flashcards/CardFaceContent";
import { fcService } from "../../data/fcService";
import { studyFaces } from "../../utils/cardVariants";
import type { CardWithDetails } from "../../data/types";

/** Join distinct face texts; identical faces collapse to one. */
export function composeMergedFace(values: string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
  }
  return kept.join("\n\n");
}

export function MergeCardsDialog({
  open,
  onOpenChange,
  cards,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected cards, in set order. Two or more. */
  cards: CardWithDetails[];
  onMerged: () => void;
}) {
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-propose whenever the selection (or the survivor) changes: the survivor's
  // own face leads, the others follow.
  useEffect(() => {
    if (!open || cards.length === 0) return;
    const primary =
      cards.find((c) => c.id === primaryId)?.id ?? cards[0]?.id ?? null;
    if (primary !== primaryId) {
      setPrimaryId(primary);
      return;
    }
    const ordered = [
      ...cards.filter((c) => c.id === primary),
      ...cards.filter((c) => c.id !== primary),
    ];
    setFront(composeMergedFace(ordered.map((c) => c.front)));
    setBack(composeMergedFace(ordered.map((c) => c.back)));
  }, [open, cards, primaryId]);

  const merge = async (): Promise<void> => {
    if (!primaryId || front.trim().length === 0) return;
    setSaving(true);
    try {
      const res = await fcService.mergeCards({
        primaryCardId: primaryId,
        front: front.trim(),
        back: back.trim(),
        mergedCardIds: cards.map((c) => c.id),
      });
      if (res.error) {
        toast.error(`Merge failed — ${res.error}`);
        return;
      }
      toast.success(`Merged ${cards.length} cards into one`);
      onOpenChange(false);
      onMerged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge {cards.length} cards</DialogTitle>
          <DialogDescription>
            One card survives and keeps this set&apos;s history; the others are
            removed and their extras (audio, examples, images) move onto it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Which card survives
            </p>
            <div className="flex flex-col gap-1.5">
              {cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPrimaryId(c.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    c.id === primaryId
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {/* F3 — composed face, never raw markup: a cloze picker row
                      shows its blanked front, not literal {{c1::…}}. */}
                  <CardFaceContent
                    content={studyFaces(c).front}
                    variant="inline"
                    className="line-clamp-2"
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Merged front
            </p>
            <Textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <div className="mt-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <CardFaceContent content={front} variant="inline" />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Merged back
            </p>
            <Textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              rows={4}
              className="text-sm"
            />
            <div className="mt-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <CardFaceContent content={back} variant="inline" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void merge()}
            disabled={saving || !primaryId || front.trim().length === 0}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Merge className="mr-1.5 h-4 w-4" />
            )}
            Merge into one card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
