// features/flashcards/components/study/cardImages.ts
//
// Projects a card's front_image/back_image detail rows into the FaceImageRef
// props every face-rendering surface consumes — the image twin of
// voiceTestExtra.ts (the audio adapter). ONE place owns the "find the active
// detail row" idiom for images.

import type { FaceImageRef } from "@/components/mardown-display/blocks/flashcards/FlashcardFaceImage";
import type { CardWithDetails, FcDetailRow } from "../../data/types";

export interface CardFaceImages {
  front?: FaceImageRef;
  back?: FaceImageRef;
}

/**
 * Stock-photo attribution lives in `fc_detail.metadata.credit` ({name, url})
 * per common-docs/systems/education/flashcard-images/VISION_AND_PLAN.md §2.1. Unsplash's
 * guidelines require it to be DISPLAYED, so the adapter surfaces it to the
 * renderer instead of leaving it buried in the row.
 */
function toCredit(metadata: FcDetailRow["metadata"]): FaceImageRef["credit"] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const credit = (metadata as Record<string, unknown>).credit;
  if (!credit || typeof credit !== "object" || Array.isArray(credit)) return undefined;
  const { name, url } = credit as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) return undefined;
  return { name, url: typeof url === "string" && url ? url : undefined };
}

function toFaceImage(detail: FcDetailRow | undefined): FaceImageRef | undefined {
  if (!detail) return undefined;
  const fileId = detail.image_file_id;
  const url = detail.image_url;
  if (!fileId && !url) return undefined;
  return {
    fileId,
    url,
    alt: detail.text || undefined,
    credit: toCredit(detail.metadata),
  };
}

/** The active image detail row for one face, if any. */
export function getFaceImageDetail(
  card: Pick<CardWithDetails, "details">,
  face: "front" | "back",
): FcDetailRow | undefined {
  return card.details.find(
    (d) => d.kind === `${face}_image` && (!!d.image_file_id || !!d.image_url),
  );
}

/** Both faces' images for a loaded card — pass to FlashcardItem etc. */
export function getCardImages(
  card: Pick<CardWithDetails, "details">,
): CardFaceImages {
  return {
    front: toFaceImage(getFaceImageDetail(card, "front")),
    back: toFaceImage(getFaceImageDetail(card, "back")),
  };
}

/** True when the card has any active face image (badges, filters). */
export function cardHasImage(card: Pick<CardWithDetails, "details">): boolean {
  return Boolean(
    getFaceImageDetail(card, "front") || getFaceImageDetail(card, "back"),
  );
}
