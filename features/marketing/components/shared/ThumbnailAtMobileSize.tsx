"use client";

/**
 * THE THUMBNAIL AT MOBILE SIZE — an image rendered at exactly the size it will
 * be seen at, so a person can judge legibility with their own eyes.
 *
 * WHY THIS EXISTS. Nobody — not us, not TubeBuddy, not vidIQ — can read the
 * text inside a creator's thumbnail. Every tool therefore grades "is there a
 * custom thumbnail" and stops, which answers a question no creator is asking.
 * The question is "can anyone read this on a phone", and the honest answer is
 * not a score: it is the image, at 168×94 CSS pixels, which is what the YouTube
 * mobile feed gives a 16:9 thumbnail on a typical phone. A creator looks at it
 * for one second and knows.
 *
 * It lives in the shared marketing layer, not beside the YouTube panel that
 * needed it first (law 5): "show me this image at the size my audience sees it"
 * is equally the question for an Open Graph card, a Google Business Profile
 * photo and an ad creative. Every caller passes its own size and its own words.
 *
 * It never claims to have read the image. The caption says what it is.
 */

import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

/** 16:9 at the width the YouTube mobile feed gives a thumbnail. */
export const MOBILE_FEED_THUMBNAIL_WIDTH = 168;
export const MOBILE_FEED_THUMBNAIL_HEIGHT = 94;

export interface ThumbnailAtMobileSizeProps {
  /** Any image the browser can load: an https URL, a blob URL, a data URL. */
  src: string | null;
  /** What this image is, for people who cannot see it. Never decorative. */
  alt: string;
  /** The sentence under the image. The caller owns the words. */
  caption?: string;
  width?: number;
  height?: number;
  /** What to say when there is no image at all. */
  emptySentence?: string;
  className?: string;
}

export function ThumbnailAtMobileSize({
  src,
  alt,
  caption,
  width = MOBILE_FEED_THUMBNAIL_WIDTH,
  height = MOBILE_FEED_THUMBNAIL_HEIGHT,
  emptySentence = "No image yet — this is the size it will be seen at.",
  className,
}: ThumbnailAtMobileSizeProps) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-1", className)}>
      {src ? (
        // A plain <img>: the source is usually a blob or data URL the person
        // just picked, which the Next image loader cannot optimize, and the
        // whole point is that the browser draws it at exactly these pixels.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          style={{ width, height }}
          className="rounded-md border border-border object-cover"
        />
      ) : (
        <div
          style={{ width, height }}
          className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/30 p-1 text-center"
        >
          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-[10px] leading-3 text-muted-foreground">
            {emptySentence}
          </span>
        </div>
      )}
      {caption ? (
        <figcaption
          style={{ maxWidth: Math.max(width, 168) }}
          className="text-[10px] leading-3 text-muted-foreground"
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
