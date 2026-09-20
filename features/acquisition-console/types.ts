// features/acquisition-console/types.ts
//
// THE ACQUISITION CONSOLE — the row shapes the three tables render, and the
// label vocabularies that turn database words into the words an expert reads.
//
// Every one of these rows is DERIVED from data that already exists. Nothing here
// has a table of its own, nothing here is written by this screen, and no number
// on it is stored anywhere: the console is a reading of five existing registers
// (media.source_library, platform.masterwork_source, users.integration_connections,
// media.capture_handoff, platform.acquisition_block).
//
// A value nobody listed still renders — as itself. A vocabulary that silently
// drops an unfamiliar word is worse than one with an unfamiliar word in it.

/** Which of the three sections a row belongs to. Used by the tests and the copy. */
export type ConsoleSection = "have" | "connected" | "blocked";

// ── Section 1: What we have ────────────────────────────────────────────────

/**
 * ONE ROW PER SOURCE KIND, not per Library.
 *
 * A person onboarding an expert does not want to scroll 33 Libraries; they want
 * to know "we have their YouTube, their podcast and their Gmail, and here is what
 * each produced". The Library-level list already exists at /libraries and this
 * row deep-links into it.
 */
export interface HaveRow {
  /** `library:<adapter>` or `rulebook-sources:<medium>` — stable across reloads. */
  id: string;
  /** Which register this kind was counted in. */
  origin: "library" | "rulebook";
  /** The adapter key (`youtube`, `gmail_mbox`, …) or the Rulebook medium. */
  kind: string;
  /**
   * WHICH LANE these sit in — never a flat list.
   *
   * `media.source_library.visibility` is the platform's four-lane enum
   * (personal · internal · link · public), and in the live database 32 of AI
   * Matrx's 33 Libraries are `personal`: they belong to the person who added
   * them, and a colleague in the same workspace genuinely cannot see them.
   * A console that printed one undifferentiated "what we have" would tell two
   * people in one workspace two different numbers under one word.
   */
  lane: string;
  /** How many Libraries / Sources of this kind the workspace holds. */
  count: number;
  /** Items inside them — videos, episodes, posts, messages. Null when unknown. */
  items: number | null;
  /** The newest thing of this kind, by the register's own clock. */
  lastAdded: string | null;
  /**
   * THE YIELD — what this kind actually produced, as a sentence.
   *
   * Transcripts for a catalogued Library, kept turns for a Rulebook Source. It is
   * the only column on this screen that answers "was any of this worth it".
   */
  yield: string;
  /** Machine-readable half of `yield`, so the column can sort on a number. */
  yieldCount: number;
  /** Where the row goes when a person clicks it. An existing screen, always. */
  href: string;
}

/** Adapter keys → the words a person uses. Unknown keys answer with themselves. */
export const ADAPTER_LABELS: Record<string, string> = {
  youtube: "YouTube channel",
  podcast_rss: "Podcast feed",
  blog_feed: "Blog or newsletter",
  slide_deck: "Slide decks",
  gmail_mbox: "Gmail export",
  slack_export: "Slack export",
  linkedin_export: "LinkedIn export",
  chatgpt_export: "ChatGPT export",
  facebook_export: "Facebook export",
  whatsapp_txt: "WhatsApp chat",
  kindle_clippings: "Kindle highlights",
};

/**
 * The four lanes, in the words a person uses, plus the one a Rulebook Source sits in.
 *
 * `platform.masterwork_source` has no `visibility` column: what a Source reaches is
 * whatever its RULEBOOK reaches. So it gets its own honest label rather than being
 * assigned one of the four it does not actually carry.
 */
export const LANE_LABELS: Record<string, string> = {
  personal: "Yours only",
  internal: "This workspace",
  link: "Anyone with the link",
  public: "Everyone",
  rulebook: "On a Rulebook",
};

/** Rulebook Source mediums → the words a person uses. */
export const MEDIUM_LABELS: Record<string, string> = {
  turns: "Conversation turns",
  text: "Written text",
  file: "Uploaded file",
  transcript: "Transcript",
  url: "Web page",
  audio: "Audio",
  video: "Video",
};

// ── Section 2: What is connected ───────────────────────────────────────────

export interface ConnectedRow {
  id: string;
  provider: string;
  /** "This workspace" or "You" — a connection belongs to one or the other. */
  ownerScope: "organization" | "user";
  status: string;
  account: string | null;
  lastSync: string | null;
  /** The ONE thing to do about this row, in plain English. */
  action: string;
  href: string;
  /** The provider's own refusal, verbatim, when there is one. */
  note: string | null;
}

export const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  microsoft: "Microsoft",
  slack: "Slack",
  notion: "Notion",
  linkedin: "LinkedIn",
  dropbox: "Dropbox",
};

export const CONNECTION_STATUS_LABELS: Record<string, string> = {
  connected: "Connected",
  needs_attention: "Needs attention",
  revoked: "Disconnected",
  expired: "Expired",
  pending: "Finishing",
  error: "Failed",
};

/**
 * The one action, decided here rather than in the cell, so the test can assert
 * it and the table can sort and filter on it.
 *
 * 🚨 A connection that is fine gets an action too. "Nothing to do" is a real
 * answer and an empty cell is not: a blank in an action column reads as a
 * control that failed to render.
 */
export function connectionAction(status: string): string {
  switch (status) {
    case "connected":
      return "Nothing to do";
    case "needs_attention":
    case "expired":
    case "revoked":
      return "Reconnect it";
    case "pending":
      return "Finish connecting it";
    case "error":
      return "Reconnect it";
    default:
      return "Open it and check";
  }
}

// ── Section 3: What is blocked ─────────────────────────────────────────────

export interface BlockedRow {
  id: string;
  /** Which register the row came out of — they read differently and say so. */
  origin: "block" | "handoff";
  /** What we could not get. */
  what: string;
  /** Where it was being got — the engine, or the rung of the capture ladder. */
  where: string;
  since: string;
  /** How many times the same wall was hit. Hand-offs count attempts. */
  times: number;
  /** The ONE thing that would unblock it. Never empty. */
  action: string;
  href: string;
}

export const HANDOFF_REASON_LABELS: Record<string, string> = {
  login_required: "Needs your sign-in",
  paywall: "Behind a paywall",
  bot_wall: "Bot wall",
  asked_by_a_person: "You asked for it",
  captcha: "CAPTCHA",
};

/** Unknown values answer with themselves rather than with a blank. */
export function labelFor(
  table: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return table[value] ?? value;
}

/** A count and its noun, singular when it should be. Used by every yield cell. */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}
