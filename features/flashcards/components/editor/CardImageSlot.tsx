"use client";

// CardImageSlot — the editor's per-card image affordance (closes the editor's
// declared "image attachments" fast-follow). One row per face: the current
// image (canonical FlashcardFaceImage), plus the three actions —
//   Find    → the web-sourcing lane (agent searches, judges the source, picks
//             or refuses) — aidream POST /education/images/source-card
//   Generate→ the verified generation lane (describe → generate →
//             adversarially judge → retry → refuse) — /generate-card
//   Remove  → soft-deletes the face's image rows (fcService.removeCardImage)
//
// Both AI lanes are METERED: guard() checks the plan BEFORE the spend and
// opens the respectful paywall on a cap; usage is recorded server-side. An
// agent is never forced to attach — a refusal shows its reasoning as a toast.
// Cross-repo contract: common-docs/systems/flashcard-images/VISION_AND_PLAN.md.

import { useState } from "react";
import { Globe, Image as ImageIcon, Loader2, Trash2, BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import {
  FlashcardFaceImage,
  type FaceImageRef,
} from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";
import { fcService } from "../../data/fcService";
import { getCardImages } from "../study/cardImages";
import type { CardWithDetails } from "../../data/types";

type Face = "front" | "back";

interface LaneEventPayload {
  refused?: boolean;
  reason?: string;
  result?: {
    attached?: boolean;
    refusal_reason?: string;
    judgment?: { reasoning?: string } | null;
    verdict?: { reasoning?: string } | null;
  };
}

function FaceRow({
  card,
  face,
  image,
  onChanged,
}: {
  card: CardWithDetails;
  face: Face;
  image: FaceImageRef | undefined;
  onChanged: () => void;
}) {
  const dispatch = useAppDispatch();
  const source = useEntitlementGuard("education.card_image_source");
  const generate = useEntitlementGuard("education.card_image_generate");
  const [busy, setBusy] = useState<"find" | "generate" | "remove" | null>(null);

  const runLane = async (
    lane: "find" | "generate",
    path: "/education/images/source-card" | "/education/images/generate-card",
  ) => {
    setBusy(lane);
    try {
      let payload: LaneEventPayload | null = null;
      const res = await dispatch(
        callApi({
          path,
          method: "POST",
          body: { card_id: card.id, face },
          stream: true,
          onStreamEvent: (event) => {
            const data = (event as { data?: LaneEventPayload }).data;
            if (data && (data.refused || data.result)) payload = data;
          },
        }),
      );
      if (res.error) {
        toast.error(
          `Couldn't ${lane === "find" ? "find" : "generate"} an image: ${res.error.message}`,
        );
        return;
      }
      if (payload?.refused) {
        // Cap/tier refusal decided server-side — show the paywall via a fresh
        // client-side check (same verdict source of truth).
        toast.info("Your plan's image limit was reached for now.");
        return;
      }
      const result = payload?.result;
      if (result?.attached) {
        (lane === "find" ? source : generate).commit();
        toast.success(lane === "find" ? "Expert image attached" : "Verified image attached");
        onChanged();
      } else {
        // The agent refused — a respected outcome, explained, never silent.
        const why =
          result?.refusal_reason ||
          result?.judgment?.reasoning ||
          result?.verdict?.reasoning ||
          "No image cleared the quality bar for this card.";
        toast.info(`No image attached: ${why}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      const res = await fcService.removeCardImage(card.id, face);
      if (res.error) toast.error(res.error);
      else onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
        {face}
      </span>
      {image ? (
        <FlashcardFaceImage image={image} size="thumb" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground/50">
          <ImageIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {image?.alt || (image ? "Card image" : "No image")}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={busy !== null || source.isChecking}
        onClick={() => void source.guard(() => runLane("find", "/education/images/source-card"))}
        title="An agent finds an expert image on the open web and judges the source"
      >
        {busy === "find" ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Globe className="mr-1 h-3.5 w-3.5" />
        )}
        Find
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={busy !== null || generate.isChecking}
        onClick={() =>
          void generate.guard(() => runLane("generate", "/education/images/generate-card"))
        }
        title="Generate an image and adversarially verify its accuracy before attaching"
      >
        {busy === "generate" ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <BrainCircuit className="mr-1 h-3.5 w-3.5" />
        )}
        Generate
      </Button>
      {image && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          title={`Remove ${face} image`}
          aria-label={`Remove ${face} image`}
          disabled={busy !== null}
          onClick={() => void remove()}
        >
          {busy === "remove" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      <source.Paywall />
      <generate.Paywall />
    </div>
  );
}

export function CardImageSlot({
  card,
  onChanged,
}: {
  card: CardWithDetails;
  onChanged: () => void;
}) {
  const images = getCardImages(card);
  return (
    <div className="mt-2 space-y-1.5 border-t border-border pt-2">
      <FaceRow card={card} face="front" image={images.front} onChanged={onChanged} />
      <FaceRow card={card} face="back" image={images.back} onChanged={onChanged} />
    </div>
  );
}

export default CardImageSlot;
