// features/marketing/seo/ai-visibility/brand-lookup/types.ts — the `data` of
// each `seo_ai_visibility` action's envelope, as aidream's
// `aidream/services/seo/ai_mentions.py` builds it. A figure the provider did
// not give is `null` (no data), never 0.

export const SEO_AI_VISIBILITY_TOOL = "seo_ai_visibility";

/** The two platforms DataForSEO's AI-mentions index covers. */
export type MentionsPlatform = "google" | "chat_gpt";

export const MENTIONS_PLATFORM_LABEL: Record<string, string> = {
  google: "Google AI Overviews",
  chat_gpt: "ChatGPT",
};

export interface MentionsMarket {
  location_code: number;
  language_code: string;
}

export interface MentionsTarget {
  type: "domain" | "keyword";
  value: string;
}

export interface PlatformMentions {
  platform: string;
  status: "ok" | "partial" | "failed";
  mentions: number | null;
  ai_search_volume: number | null;
  errors?: string[];
}

export interface CitedPage {
  url: string;
  platform: string;
  mentions: number | null;
  ai_search_volume: number | null;
}

export interface CitedDomain {
  domain: string;
  mentions: number | null;
  ai_search_volume: number | null;
}

export interface MentioningPrompt {
  platform: string;
  question: string;
  ai_search_volume: number | null;
  last_seen: string | null;
  cited_urls: string[];
  brands_mentioned: string[];
}

export interface BrandMentionsData {
  target: MentionsTarget;
  market: MentionsMarket;
  total_mentions: number | null;
  total_ai_search_volume: number | null;
  platforms: PlatformMentions[];
  top_cited_pages: CitedPage[];
  top_cited_domains: Record<string, CitedDomain[]>;
  mentioning_prompts: MentioningPrompt[];
}

export interface ShareOfVoiceEntry {
  name: string;
  is_target: boolean;
  mentions: number | null;
  share_pct: number | null;
}

export interface ShareOfVoiceData {
  target: MentionsTarget;
  market?: MentionsMarket;
  entries: ShareOfVoiceEntry[] | null;
  platforms?: { platform: string; status: string; error?: string }[];
}

/** The four engines `try_prompt` can ask. */
export type AnswerEngine = "chat_gpt" | "claude" | "gemini" | "perplexity";

export interface TryPromptResult {
  model: AnswerEngine;
  model_name?: string;
  answer: string | null;
  answer_truncated?: boolean;
  mentioned: boolean | null;
  cited_urls: string[];
  run_id?: string;
  reused?: boolean;
  observed_at?: string | null;
  error?: string;
}

export interface TryPromptData {
  prompt: string;
  highlight_brand: string | null;
  brand_terms: string[];
  results: TryPromptResult[];
}
