"use client";

// features/flashcards/components/study/CardDetailLayers.tsx
//
// "MORE ON THIS CARD" — the surface that finally RENDERS card enrichment.
//
// The defect: `education.enrich_card` has been writing `fc_detail` layers
// (helper / example / detailed / hint / mnemonic / simplified) for months, and
// no surface ever displayed one. StudyDeck touched `details` only to find the
// `spoken_front` audio id; set detail turned helper/example into a boolean
// badge. The learner watched the text stream past in a dialog and could never
// get it back. This component is the missing half — and it is the reason the
// two enrich buttons are worth anything.
//
// Arman's first use case, verbatim: "when you are on a single card and you're
// struggling with it or you feel like you want more, you click the button there
// and from the card itself while studying, we build more on it." So the same
// affordance both SHOWS what this card already has and ADDS to it in place —
// new layers appear right here, in this list, the moment they are written.
//
// Deliberately NOT the registered `card_enrichment` kind component: that kind
// renders an agent PROPOSAL payload through the DB-routed dynamic renderer
// (`KindInstanceRender`, a three-state resolve with its own card chrome), which
// is right inside EnhanceSetDialog's preview and wrong for an always-mounted,
// collapsed-by-default strip under a flashcard on a phone. What we render here
// are STORED `fc_detail` rows, not a proposal. The kind component keeps its one
// job; this keeps its one job.
//
// Collapsed by default: an open panel would spoil the answer before the flip,
// and study surfaces earn their space.

import { useState } from "react";
import { ChevronDown, Layers, Lightbulb, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import { LiveRunDisplay } from "@ai-matrx/chat/agents/components/live-run/LiveRunDisplay";
import { useLiveRunHandle } from "@ai-matrx/chat/agents/hooks/useLiveRunHandle";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { selectCardDetailLayers } from "../../data/cardDetailLayers";
import { enrichAndSaveCard } from "../../data/enrichCardLane";
import type { CardWithDetails, FcDetailRow } from "../../data/types";
import { useFlashcardMandates } from "../../data/mandate-disclosure";
import {
  STUDY_TOOL_BODY,
  STUDY_TOOL_BUTTON,
  STUDY_TOOL_BUTTON_ACTIVE,
} from "@/features/education/study/components/studyToolbar";

export function CardDetailLayers({
  card,
  canEnrich = false,
  onEnriched,
  variant = "stacked",
  className,
}: {
  card: CardWithDetails;
  /**
   * Whether the learner may spend on new layers here (the driver knows the
   * owning set and the user can edit it). Reading is always allowed.
   */
  canEnrich?: boolean;
  /** Fired after new layers land so the driver can refetch its own copy. */
  onEnriched?: () => void;
  /** `toolbar`: one "Explain" trigger in the host's study tool row, the layers
   *  list below it (see studyToolbar.ts). `stacked`: the standalone strip. */
  variant?: "stacked" | "toolbar";
  className?: string;
}) {
  useFlashcardMandates(canEnrich ? ["enrichCard"] : []);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const enrichGuard = useEntitlementGuard("education.card_enrichment");
  // COPPA before billing, and before any AI work.
  const coppa = useAiComplianceGate();
  const run = useLiveRunHandle();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Layers written in THIS session, shown immediately — the driver's refetch is
  // what makes them permanent on screen, but the learner must never watch their
  // own enrichment land and then wait for a round trip to see it.
  // The host mounts this with key={card.id}, so a card change clears it.
  const [added, setAdded] = useState<FcDetailRow[]>([]);

  const layers = selectCardDetailLayers([...(card.details ?? []), ...added]);
  const count = layers.length;

  const enrich = async (): Promise<void> => {
    if (!(await coppa.ensureAllowed())) return;
    await enrichGuard.guard(async () => {
      setBusy(true);
      setOpen(true);
      run.release();
      try {
        const outcome = await enrichAndSaveCard({
          card,
          depth: "applied",
          onConversationCreated: (conversationId) => run.claim(conversationId),
        })(dispatch, store.getState);
        if (outcome.status === "failed") {
          toast.error(outcome.error);
          return;
        }
        if (outcome.status === "empty") {
          toast.info("The AI had nothing new to add for this card.");
          return;
        }
        setAdded((prev) => [...prev, ...outcome.rows]);
        // The AI call happened and landed — record the metered unit.
        await enrichGuard.commit();
        toast.success(
          `Added ${outcome.rows.length} new layer${
            outcome.rows.length === 1 ? "" : "s"
          } to this card`,
        );
        onEnriched?.();
      } finally {
        setBusy(false);
      }
    });
  };

  // Nothing stored and nothing offerable — render nothing rather than an empty
  // shell under every card.
  if (count === 0 && !canEnrich) return null;

  const working = busy || enrichGuard.isChecking;

  const layerList = (
    <div className="space-y-2 px-2.5 py-2.5">
      {layers.map((layer) => (
        <div key={layer.id} className="min-w-0">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {layer.label}
          </div>
          <div className="text-sm leading-relaxed text-foreground">
            <ConfigurableMarkdownContent
              imagePolicy="ai"
              content={layer.text}
              isStreamActive={false}
              showCopyButton={false}
            />
          </div>
        </div>
      ))}
    </div>
  );

  if (variant === "toolbar") {
    // One trigger. With stored layers it toggles them open (Add more lives
    // inside); with none it asks the AI straight away.
    const showBody = (open && count > 0) || busy;
    return (
      <div className="contents">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(STUDY_TOOL_BUTTON, showBody && STUDY_TOOL_BUTTON_ACTIVE)}
          disabled={count === 0 && working}
          aria-expanded={count > 0 ? open : undefined}
          title={count > 0 ? "More on this card" : "Explain this card further"}
          aria-label="Explain"
          onClick={() =>
            count > 0 ? setOpen((o) => !o) : void enrich()
          }
        >
          {working && count === 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Lightbulb className="h-3.5 w-3.5" />
          )}
          Explain
          {count > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
              {/* read-gate-exempt: layers are the card prop's own details plus those this session's enrichment wrote; no read happens here */}
              {count}
            </span>
          )}
        </Button>

        <coppa.Gate />

        {showBody && (
          <div
            className={cn(
              "rounded-lg border border-border bg-card/60 text-left",
              STUDY_TOOL_BODY,
            )}
          >
            {busy && (
              <LiveRunDisplay
                conversationId={run.conversationId}
                pending={!run.conversationId}
                label="Building more on this card"
                className="m-2"
                bodyClassName="max-h-56"
              />
            )}
            {open && count > 0 && layerList}
            {open && count > 0 && canEnrich && !busy && (
              <div className="flex justify-end border-t border-border p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-xs"
                  disabled={working}
                  onClick={() => void enrich()}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  Add more
                </Button>
              </div>
            )}
          </div>
        )}

        <enrichGuard.Paywall />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/60 text-left",
        className,
      )}
    >
      <div className="flex items-center gap-1 p-1">
        {count > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
              "hover:bg-muted",
            )}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              More on this card
            </span>
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {/* read-gate-exempt: layers are the card prop's own details plus those this session's enrichment wrote; no read happens here */}
              {count}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        ) : null}
        {canEnrich && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2 text-xs"
            disabled={working}
            onClick={() => void enrich()}
            title="Explain this card further"
          >
            {working ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Lightbulb className="h-3.5 w-3.5" />
            )}
            {count === 0 ? "Explain more" : "Add more"}
          </Button>
        )}
      </div>

      <coppa.Gate />

      {/* No spinner while the AI works: the run streams in the spot the
          finished layers occupy, and the page only grows downward. */}
      {busy && (
        <LiveRunDisplay
          conversationId={run.conversationId}
          pending={!run.conversationId}
          label="Building more on this card"
          className="mx-2 mb-2"
          bodyClassName="max-h-56"
        />
      )}

      {open && count > 0 && (
        <div className="border-t border-border">{layerList}</div>
      )}

      {/* Respectful paywall — opens only on a real cap. */}
      <enrichGuard.Paywall />
    </div>
  );
}

export default CardDetailLayers;
