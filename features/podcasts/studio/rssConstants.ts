// features/podcasts/studio/rssConstants.ts
//
// Canonical reference data for podcast RSS / directory distribution settings.
// Pure data (no JSX) so it can be imported by client UI and the feed route alike.
//
// PC_APPLE_CATEGORIES is the real Apple Podcasts top-level category list. Apple
// requires a feed to declare one of these exact strings in <itunes:category>.
// (Sub-categories exist too; we expose only the top level for now — the JSONB
// settings shape can grow a sub-category field without a migration.)

/**
 * Apple Podcasts top-level categories. These strings must match Apple's
 * published taxonomy exactly — they are emitted verbatim into the feed's
 * <itunes:category text="…"/>.
 */
export const PC_APPLE_CATEGORIES = [
  "Arts",
  "Business",
  "Comedy",
  "Education",
  "Fiction",
  "Government",
  "History",
  "Health & Fitness",
  "Kids & Family",
  "Leisure",
  "Music",
  "News",
  "Religion & Spirituality",
  "Science",
  "Society & Culture",
  "Sports",
  "Technology",
  "True Crime",
  "TV & Film",
] as const;

export type PcAppleCategory = (typeof PC_APPLE_CATEGORIES)[number];

/** Common podcast feed language codes. Owners can pick the closest match. */
export const PC_FEED_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "en-us", label: "English (US)" },
  { code: "en-gb", label: "English (UK)" },
  { code: "es-es", label: "Spanish (Spain)" },
  { code: "es-mx", label: "Spanish (Mexico)" },
  { code: "fr-fr", label: "French" },
  { code: "de-de", label: "German" },
  { code: "pt-br", label: "Portuguese (Brazil)" },
  { code: "it-it", label: "Italian" },
  { code: "nl-nl", label: "Dutch" },
  { code: "ja-jp", label: "Japanese" },
  { code: "ko-kr", label: "Korean" },
  { code: "zh-cn", label: "Chinese (Simplified)" },
  { code: "hi-in", label: "Hindi" },
  { code: "ar", label: "Arabic" },
];

export const PC_DEFAULT_LANGUAGE = "en-us";

/** Basic RFC-5322-ish email validation for the owner-email field. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
