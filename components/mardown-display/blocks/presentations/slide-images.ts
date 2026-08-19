/**
 * Slide image resolution — turns a slide's `extra.imagePrompt` into a real
 * Unsplash photo when no explicit `image_url` was provided.
 *
 * The mechanics (server proxy, cache + in-flight dedup, attribution, ToS
 * download tracking) live in THE shared primitive `lib/media/unsplash.ts` —
 * this module is the slide-deck entry point onto it. Do not fork a second
 * Unsplash client here.
 */

export { resolveUnsplashImage } from "@/lib/media/unsplash";
export type { ResolvedImage } from "@/lib/media/unsplash";
