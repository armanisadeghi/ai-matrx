"use client";

// features/flashcards/components/set-detail/GenerateCardsDialog.tsx
//
// "Generate cards" INTO this deck (page-pass 2026-09-28). An empty deck said
// "Generate cards for this deck in chat" and offered no button; the Create
// deck page makes a NEW deck. This runs the same generator
// (FC_MANDATES.generateCards, via useGenerateCards) and appends the cards to
// THIS deck.
//
// Single-writer contract (D-WP3, features/flashcards/FEATURE.md): the run's
// stream also materializes a flashcard render block. The moment the run's
// conversation exists, this deck is stamped with it
// (`metadata.source_system = "cx_conversation"`), so the adapter LINKS to this
// deck instead of creating a twin; the cards are written here with addCards.

import { useState } from "react";
import { Loader2, Wand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProInput } from "@/components/official/ProInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { fcService } from "../../data/fcService";
import { FC_MANDATES } from "../../data/mandates";
import { useGenerateCards } from "../../data/useGenerateCards";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
import { LiveGenerationPreview } from "../create/LiveGenerationPreview";
import { isNearDuplicateQA, looseKey } from "@/features/education/convert/segmentedGenerate";
import { newBatchId } from "@/features/education/convert/steering";
import { BATCH_KEY } from "@/features/education/kits/outline/types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const COUNTS = [5, 10, 20, 30] as const;

export function GenerateCardsDialog({
  open,
  onOpenChange,
  setId,
  defaultTopic,
  difficulty,
  existingCards = [],
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  /** The deck's topic, else its name — what the cards are about. */
  defaultTopic: string;
  difficulty: string | null;
  /** Cards the deck already has — a new card never repeats one, and lands after them. */
  existingCards?: { front: string; back: string }[];
  onAdded: (count: number) => void;
}) {
  useFlashcardMandates(["generateCards"]);
  const run = useGenerateCards();
  const guard = useEntitlementGuard("education.generate_cards");
  const coppa = useAiComplianceGate();
  const [topic, setTopic] = useState(defaultTopic);
  const [count, setCount] = useState<number>(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const about = topic.trim();
    if (!about || busy) return;
    if (!(await coppa.ensureAllowed())) return;
    setError(null);
    await guard.guard(async () => {
      setBusy(true);
      try {
        const result = await run.generate(
          FC_MANDATES.generateCards,
          { topic: about, count, difficulty: difficulty ?? "medium" },
          {
            onConversationCreated: (cid) => {
              // Never discarded: a refused link is said, with its remedy.
              void fcService
                .mergeSetMetadata(setId, (current) => ({
                  ...current,
                  source_system: "cx_conversation",
                  source_id: cid,
                  conversation_id: cid,
                }))
                .then((res) => {
                  if (res.error)
                    toast.warning(
                      `The deck could not record which conversation made these cards. ${res.error}`,
                    );
                });
            },
          },
        );
        // Never repeat a card the deck already has; the person still sees what was added.
        const haveKeys = new Set(existingCards.map((c) => looseKey(c.front)));
        const batchId = newBatchId();
        const fresh = result.cards
          .filter(
            (c) =>
              !haveKeys.has(looseKey(c.front)) &&
              !existingCards.some((h) =>
                isNearDuplicateQA(
                  { question: h.front, answer: h.back },
                  { question: c.front, answer: c.back },
                ),
              ),
          )
          .map((c) => ({ ...c, metadata: { ...(c.metadata ?? {}), [BATCH_KEY]: batchId } }));
        if (fresh.length === 0) {
          throw new Error("Nothing new came out — the deck already has these. Try another topic.");
        }
        const saved = await fcService.addCards(setId, fresh, {
          startPosition: existingCards.length,
        });
        if (saved.error || !saved.data) {
          throw new Error(
            saved.error ?? "The cards were made but could not be saved. Try again.",
          );
        }
        await guard.commit();
        const n = saved.data.length;
        toast.success(`Added ${n} ${n === 1 ? "card" : "cards"} to this deck`);
        onAdded(n);
        onOpenChange(false);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "The cards could not be made. Try again.";
        setError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="matrx-touch-targets sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate cards</DialogTitle>
          <DialogDescription>
            AI writes cards on this topic and adds them to this deck. Uses AI
            generation credits.
          </DialogDescription>
        </DialogHeader>
        {/* The stream stays on screen while it runs — never a bare spinner. */}
        {busy ? (
          <div className="max-h-[50dvh] overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm">
            {run.activeRequestId ? (
              <LiveGenerationPreview requestId={run.activeRequestId} />
            ) : (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting the card writer…
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generate-cards-topic">Topic</Label>
              <ProInput
                id="generate-cards-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What should the cards cover?"
                className="text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>How many cards</Label>
              <div className="flex flex-wrap gap-2">
                {COUNTS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant={count === n ? "primary" : "outline"}
                    aria-pressed={count === n}
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p>}
            <EntitlementMeter capability="education.generate_cards" />
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            icon={busy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Wand />
            )}
            variant="primary"
            onClick={() => void generate()}
            disabled={busy || !topic.trim() || guard.isChecking}
          >
            {busy ? "Generating…" : `Generate ${count} cards`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
