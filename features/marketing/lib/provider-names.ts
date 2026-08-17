/**
 * Canonical compact product names for external marketing data providers.
 *
 * Table cells, filters, cards, and navigation use the short label. Expand an
 * acronym only in explanatory onboarding copy where the reader is learning
 * what the connection is for.
 */
export const GOOGLE_SEARCH_CONSOLE_PROVIDER = {
  key: "gsc",
  label: "GSC",
  fullName: "Google Search Console",
  explainedLabel: "GSC (Google Search Console)",
} as const;

export const BING_PROVIDER = {
  key: "bing_webmaster",
  label: "Bing",
  fullName: "Bing Webmaster Tools",
  explainedLabel: "Bing (Bing Webmaster Tools)",
} as const;
