"use client";

// FlashcardFaceImage — the ONE way to render a flashcard face's image anywhere.
// Per THE CANONICAL COMPONENT LAW this is the per-field image child shared by
// every face-rendering surface (FlashcardItem flip faces, mobile slides,
// CardPeek, FastFire, editor, public deck pages).
//
// Data contract (education.fc_detail rows of kind front_image / back_image):
//  - image_file_id → our stored file: render via <InlineMediaRef>, which
//    self-re-mints signed URLs on error (media-durability doctrine).
//  - image_url     → a web-sourced HOTLINKED image (the primary lane per
//    common-docs/systems/flashcard-images/VISION_AND_PLAN.md §2.3). Hotlinks
//    rot — so the display contract is: try, and on failure disappear
//    gracefully (never a broken-image glyph, never a layout explosion) while
//    reporting the rot to the console so sweeps can re-source it.
//  - alt (fc_detail.text) → real alt text; accessibility is not optional in
//    education.

import { useState } from "react";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { fileIdToMediaRef, urlToMediaRef } from "@/features/files/redux/converters";
import { cn } from "@/lib/utils";

export interface FaceImageRef {
  /** cld_files UUID for stored images (upload / stock / generated lanes). */
  fileId?: string | null;
  /** Durable public or hotlinked web URL (web-sourced lane, anon pages, print). */
  url?: string | null;
  /** Alt text (fc_detail.text). */
  alt?: string;
}

/** True when the ref actually points at something renderable. */
export function hasFaceImage(ref: FaceImageRef | null | undefined): ref is FaceImageRef {
  return Boolean(ref && (ref.fileId || ref.url));
}

export function FlashcardFaceImage({
  image,
  size = "face",
  className,
}: {
  image: FaceImageRef | null | undefined;
  /**
   * "face"  — inside a flip-card / slide face: bounded height, contain.
   * "thumb" — list rows / CardPeek: small fixed square.
   */
  size?: "face" | "thumb";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!hasFaceImage(image) || failed) return null;

  const ref = image.fileId
    ? fileIdToMediaRef(image.fileId)
    : urlToMediaRef(image.url as string);

  const handleError = () => {
    // A dead hotlink is expected rot, not a crash — vanish gracefully, but
    // say so loudly enough that a re-source sweep can find it.
    console.warn("[FlashcardFaceImage] image failed to load (link rot?)", image);
    setFailed(true);
  };

  if (size === "thumb") {
    return (
      <InlineMediaRef
        ref={ref}
        alt={image.alt || "Card image"}
        size="sm"
        fit="cover"
        rounded="sm"
        fallback={null}
        errorFallback={null}
        onError={handleError}
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex justify-center w-full min-h-0", className)}>
      <InlineMediaRef
        ref={ref}
        alt={image.alt || "Card image"}
        size="fill"
        fit="contain"
        rounded="md"
        fallback={null}
        errorFallback={null}
        onError={handleError}
        className="max-h-full max-w-full"
      />
    </div>
  );
}

export default FlashcardFaceImage;
