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

function toFaceImage(detail: FcDetailRow | undefined): FaceImageRef | undefined {
  if (!detail) return undefined;
  const fileId = detail.image_file_id;
  const url = detail.image_url;
  if (!fileId && !url) return undefined;
  return { fileId, url, alt: detail.text || undefined };
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
