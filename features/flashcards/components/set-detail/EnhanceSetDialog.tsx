// features/flashcards/components/set-detail/EnhanceSetDialog.tsx
//
// "Make this deeper" — the per-card depth-on-demand surface. Opened from the
// set detail view's Enhance button (owner/editor only). Pick a depth tier
// (recall → applied → exam, the SAME vocabulary P1 quizzes use) and, per card,
// either ENRICH it (add helper/example/mnemonic detail layers) or DEEPEN it
// (split into atomic sub-cards linked by an `expands_into` edge). The chosen
// items preview first, then persist on confirm — nothing is written silently.
//
// Data: enrichCard / expandCard thunks (data/enhanceCard.ts) drive the live
// agents; fcService.addDetail / addSubCards persist. React Compiler is on.

"use client";

import { useState } from "react";
import { Lightbulb, GitBranch, Loader2, Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import type { Depth } from "@/features/education/assessment/data/types";
import { fcService } from "../../data/fcService";
import type { CardWithDetails } from "../../data/types";
import {
  DEPTH_TIERS,
  enrichCard,
  expandCard,
  type EnrichedDetail,
  type ExpandedSubCard,
} from "../../data/enhanceCard";

type Mode = "enrich" | "deepen";

/** Per-card working state: what's running, and the pending (un-persisted) preview. */
interface CardWork {
  running: Mode | null;
  preview:
    | { mode: "enrich"; details: EnrichedDetail[] }
    | { mode: "deepen"; subCards: ExpandedSubCard[] }
    | null;
  saving: boolean;
}

const EMPTY_WORK: CardWork = { running: null, preview: null, saving: false };

export function EnhanceSetDialog({
  open,
  onOpenChange,
  setId,
  cards,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  cards: CardWithDetails[];
  /** Called after a card is enriched/deepened so the parent can refetch. */
  onChanged: () => void;
}) {
  const dispatch = useAppDispatch();
  const enrichGuard = useEntitlementGuard("education.card_enrichment");
  const [depth, setDepth] = useState<Depth>("applied");
  const [work, setWork] = useState<Record<string, CardWork>>({});

  const workFor = (cardId: string): CardWork => work[cardId] ?? EMPTY_WORK;
  const patchWork = (cardId: string, patch: Partial<CardWork>): void =>
    setWork((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] ?? EMPTY_WORK), ...patch },
    }));

  const run = async (card: CardWithDetails, mode: Mode): Promise<void> => {
    // Meter the card_enrichment capability: server-truth check BEFORE the agent
    // runs; a cap opens the respectful paywall and never starts the work.
    await enrichGuard.guard(() => runAgent(card, mode));
  };

  const runAgent = async (card: CardWithDetails, mode: Mode): Promise<void> => {
    patchWork(card.id, { running: mode, preview: null });
    if (mode === "enrich") {
      const details = await dispatch(enrichCard({ card, depth }));
      if (!details) {
        toast.error("Couldn't enrich this card. Please try again.");
        patchWork(card.id, { running: null });
        return;
      }
      if (details.length === 0) {
        toast.info("The agent had nothing new to add for this card.");
        patchWork(card.id, { running: null });
        return;
      }
      patchWork(card.id, { running: null, preview: { mode: "enrich", details } });
      // Metered action SUCCEEDED (one model call for this card) — record real
      // usage regardless of whether the user later saves or discards the
      // preview; the AI call already happened. Failed/empty branches above
      // return first, so a failed generation never burns quota.
      await enrichGuard.commit();
    } else {
      const subCards = await dispatch(expandCard({ card, depth }));
      if (!subCards) {
        toast.error("Couldn't deepen this card. Please try again.");
        patchWork(card.id, { running: null });
        return;
      }
      if (subCards.length === 0) {
        toast.info("The agent didn't produce any sub-cards for this card.");
        patchWork(card.id, { running: null });
        return;
      }
      patchWork(card.id, {
        running: null,
        preview: { mode: "deepen", subCards },
      });
      // Same one-model-call-per-card metering as the enrich branch above.
      await enrichGuard.commit();
    }
  };

  const save = async (card: CardWithDetails): Promise<void> => {
    const preview = workFor(card.id).preview;
    if (!preview) return;
    patchWork(card.id, { saving: true });
    try {
      if (preview.mode === "enrich") {
        const base = card.details.length;
        const results = await Promise.all(
          preview.details.map((d, i) =>
            fcService.addDetail(card.id, d.kind, d.text, {
              generated_by: "agent",
              position: base + i,
            }),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed) {
          toast.error("Couldn't save the detail layers", {
            description: failed.error ?? undefined,
          });
          return;
        }
        toast.success(
          `Added ${preview.details.length} detail ${
            preview.details.length === 1 ? "layer" : "layers"
          }`,
        );
      } else {
        const res = await fcService.addSubCards(
          setId,
          card.id,
          preview.subCards.map((s) => ({ front: s.front, back: s.back })),
        );
        if (res.error) {
          toast.error("Couldn't save the sub-cards", {
            description: res.error,
          });
          return;
        }
        toast.success(
          `Added ${preview.subCards.length} sub-${
            preview.subCards.length === 1 ? "card" : "cards"
          }`,
        );
      }
      patchWork(card.id, { preview: null });
      onChanged();
    } finally {
      patchWork(card.id, { saving: false });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Make cards deeper
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add richer detail layers or split a card into atomic sub-cards —
            grounded in this card&apos;s own content, at the depth you choose.
          </DialogDescription>
        </DialogHeader>

        {/* Depth tier selector — shared vocabulary with quizzes (P1). */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="text-xs font-medium text-muted-foreground">
            Depth
          </span>
          <div className="flex items-stretch gap-1">
            {DEPTH_TIERS.map((tier) => (
              <button
                key={tier.value}
                type="button"
                onClick={() => setDepth(tier.value)}
                title={tier.blurb}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  depth === tier.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {tier.label}
              </button>
            ))}
          </div>
          {/* Limit shown BEFORE the action (TRUST mandate). */}
          <EntitlementMeter
            capability="education.card_enrichment"
            className="ml-auto"
          />
        </div>

        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-2.5 px-5 py-4">
            {cards.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                This set has no cards to enhance yet.
              </p>
            ) : (
              cards.map((card, i) => {
                const w = workFor(card.id);
                const busy = w.running !== null || w.saving;
                return (
                  <div
                    key={card.id}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                          Card {i + 1}
                          {card.details.length > 0
                            ? ` · ${card.details.length} detail${
                                card.details.length === 1 ? "" : "s"
                              }`
                            : ""}
                        </span>
                        <p className="mt-0.5 line-clamp-2 text-sm font-medium text-foreground">
                          {card.front}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={busy}
                          onClick={() => void run(card, "enrich")}
                        >
                          {w.running === "enrich" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Lightbulb className="h-3.5 w-3.5" />
                          )}
                          Enrich
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 px-2 text-xs"
                          disabled={busy}
                          onClick={() => void run(card, "deepen")}
                        >
                          {w.running === "deepen" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <GitBranch className="h-3.5 w-3.5" />
                          )}
                          Deepen
                        </Button>
                      </div>
                    </div>

                    {/* Preview + confirm — nothing persists until Save. */}
                    {w.preview && (
                      <div className="mt-3 rounded-md border border-border bg-muted/40 p-2.5">
                        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {w.preview.mode === "enrich"
                            ? "New detail layers"
                            : "New sub-cards"}
                        </div>
                        <div className="space-y-1.5">
                          {w.preview.mode === "enrich"
                            ? w.preview.details.map((d, di) => (
                                <div key={di} className="text-xs">
                                  <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium uppercase text-primary">
                                    {d.kind}
                                  </span>{" "}
                                  <span className="text-foreground">
                                    {d.text}
                                  </span>
                                </div>
                              ))
                            : w.preview.subCards.map((s, si) => (
                                <div
                                  key={si}
                                  className="rounded border border-border bg-card px-2 py-1 text-xs"
                                >
                                  <p className="font-medium text-foreground">
                                    {s.front}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {s.back}
                                  </p>
                                </div>
                              ))}
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={w.saving}
                            onClick={() =>
                              patchWork(card.id, { preview: null })
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                            Discard
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={w.saving}
                            onClick={() => void save(card)}
                          >
                            {w.saving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Save
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        {/* Respectful paywall — opens only on a real cap; self-controls visibility. */}
        <enrichGuard.Paywall />
      </DialogContent>
    </Dialog>
  );
}
