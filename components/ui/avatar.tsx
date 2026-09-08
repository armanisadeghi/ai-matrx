"use client";

/**
 * HOST RE-EXPORT ONLY — Avatar lives in `@ai-matrx/design-system`. Its default
 * `size` is `lg`, the `h-10 w-10` box this repo has always used, so nothing is
 * bound here. The package's fallback also carries defined type
 * (`text-muted-foreground`, sized with the avatar) instead of inheriting
 * whatever the surrounding row happened to set.
 */

export { Avatar, AvatarFallback, AvatarImage } from "@ai-matrx/design-system";
export type { AvatarProps, AvatarSize } from "@ai-matrx/design-system";
