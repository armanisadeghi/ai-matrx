/**
 * THE PUBLISH-NOTHING PRE-UPLOAD CHECK — the pure scoring rule (PLAN §4.11
 * Plane A; champions TubeBuddy and vidIQ).
 *
 * Nothing in this module touches the network, the clock or the DOM: it takes a
 * draft title, description, tags, target keyword and thumbnail facts and
 * returns a scored checklist. That is what makes "red then green" provable with
 * fixed inputs, and it is why the screen can promise it publishes nothing —
 * there is no writer here to publish with.
 *
 * WHAT THE CHAMPIONS DO, AND WHERE WE DIFFER.
 *   * TubeBuddy's SEO checklist and vidIQ's scorecard both grade a video
 *     against a CHOSEN KEYWORD and neither prints a score without one. Three of
 *     the seven rows below are keyword-dependent, so a score computed without a
 *     keyword quietly drops them and still reads as a verdict on the whole
 *     video. The knob `google.youtube.preview_target_keyword_required`
 *     (default true) decides which way this platform leans, and BOTH paths are
 *     honest: required → the check refuses to score and says why; not required
 *     → every keyword row comes back `not_measured` WITH its reason and the
 *     header prints how many of the seven were measured.
 *   * Neither champion can read the pixels of a thumbnail either, and both
 *     resort to "is there a custom thumbnail". We do the same and then go one
 *     further, which is the thing a creator actually needs: the thumbnail is
 *     RENDERED at the size it appears in the mobile feed
 *     (`ThumbnailAtMobileSize`) so a person judges legibility with their own
 *     eyes. This module never claims to have read it — that row says plainly
 *     that it is a human check.
 */

/** How a check came out. `not_measured` is never silently a pass. */
export type CheckState = "pass" | "warn" | "fail" | "not_measured";

export interface ScoredCheck {
  id: string;
  label: string;
  state: CheckState;
  /** One sentence: what we found, and what to do about it. */
  detail: string;
  /** Points earned, and the most this row could earn. */
  earned: number;
  possible: number;
  /** True when the row needs a target keyword to mean anything. */
  keywordDependent: boolean;
}

export interface PreUploadDraft {
  title: string;
  description: string;
  /** Free-typed tags, already split by the caller. */
  tags: readonly string[];
  targetKeyword: string;
  /** A thumbnail the person attached (data URL, object URL or https URL). */
  thumbnailUrl: string | null;
  /** The words ON the thumbnail, as the person typed them. Optional. */
  thumbnailText: string;
}

export type PreUploadVerdict =
  /** Scored: every measurable row was measured. */
  | { state: "scored"; checks: ScoredCheck[]; score: number; measured: number; total: number }
  /**
   * NOT scored, because the organization requires a target keyword and there is
   * none. `sentence` is what the screen prints INSTEAD of a number — never a
   * zero, which would read as "your video is bad".
   */
  | { state: "needs_keyword"; sentence: string; checks: ScoredCheck[] };

/** YouTube's own hard cap on a title. */
export const TITLE_MAX = 100;
/** Search and the mobile feed clip a title around here. */
export const TITLE_CLIP = 70;
/** The shortest title that can carry a keyword and a promise. */
export const TITLE_MIN = 30;
/** What YouTube shows above "…more" — the only description most people read. */
export const DESCRIPTION_SNIPPET = 150;
/** Below this, the description tells the ranking systems almost nothing. */
export const DESCRIPTION_MIN = 200;
export const TAGS_MIN = 5;
export const TAGS_MAX = 15;
/** More words than this on a thumbnail cannot be read at feed size. */
export const THUMBNAIL_TEXT_MAX_WORDS = 4;

const NOT_MEASURED_WITHOUT_KEYWORD =
  "Not measured: this check needs the keyword you want the video to rank for, and none was given.";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Does `haystack` contain the keyword, word-ish rather than substring-ish? */
export function containsKeyword(haystack: string, keyword: string): boolean {
  const key = normalize(keyword);
  if (!key) return false;
  return normalize(haystack).includes(key);
}

function titleLengthCheck(title: string): ScoredCheck {
  const length = title.trim().length;
  if (length === 0) {
    return {
      id: "title_length",
      label: "Title length",
      state: "fail",
      detail: "There is no title yet. YouTube shows about the first 70 characters in search and in the mobile feed.",
      earned: 0,
      possible: 2,
      keywordDependent: false,
    };
  }
  if (length > TITLE_MAX) {
    return {
      id: "title_length",
      label: "Title length",
      state: "fail",
      detail: `${length} characters — YouTube cuts a title off at ${TITLE_MAX}, so the last ${length - TITLE_MAX} would never be seen by anyone.`,
      earned: 0,
      possible: 2,
      keywordDependent: false,
    };
  }
  if (length < TITLE_MIN) {
    return {
      id: "title_length",
      label: "Title length",
      state: "warn",
      detail: `${length} characters. Short titles leave room a viewer decides with — around ${TITLE_MIN}–${TITLE_CLIP} carries a keyword and a reason to watch.`,
      earned: 1,
      possible: 2,
      keywordDependent: false,
    };
  }
  if (length > TITLE_CLIP) {
    return {
      id: "title_length",
      label: "Title length",
      state: "warn",
      detail: `${length} characters. Everything past about ${TITLE_CLIP} is clipped in search and on phones — keep what matters in front of it.`,
      earned: 1,
      possible: 2,
      keywordDependent: false,
    };
  }
  return {
    id: "title_length",
    label: "Title length",
    state: "pass",
    detail: `${length} characters — inside the ${TITLE_CLIP} that survive clipping in search and on phones.`,
    earned: 2,
    possible: 2,
    keywordDependent: false,
  };
}

function titleKeywordCheck(title: string, keyword: string): ScoredCheck {
  const base = {
    id: "title_keyword",
    label: "Keyword in the title, early",
    possible: 3,
    keywordDependent: true,
  } as const;
  if (!keyword.trim()) {
    return { ...base, state: "not_measured", detail: NOT_MEASURED_WITHOUT_KEYWORD, earned: 0 };
  }
  const position = normalize(title).indexOf(normalize(keyword));
  if (position < 0) {
    return {
      ...base,
      state: "fail",
      detail: `"${keyword.trim()}" does not appear in the title at all. This is the single strongest signal of what the video is about.`,
      earned: 0,
    };
  }
  if (position === 0) {
    return {
      ...base,
      state: "pass",
      detail: `The title opens with "${keyword.trim()}" — the strongest position it can hold.`,
      earned: 3,
    };
  }
  if (position <= 40) {
    return {
      ...base,
      state: "pass",
      detail: `"${keyword.trim()}" appears ${position} characters in, still inside the part every viewer reads.`,
      earned: 2,
    };
  }
  return {
    ...base,
    state: "warn",
    detail: `"${keyword.trim()}" appears ${position} characters in, past the point search results and phones clip. Move it forward.`,
    earned: 1,
  };
}

function descriptionKeywordCheck(description: string, keyword: string): ScoredCheck {
  const base = {
    id: "description_keyword",
    label: `Keyword in the first ${DESCRIPTION_SNIPPET} characters`,
    possible: 2,
    keywordDependent: true,
  } as const;
  if (!keyword.trim()) {
    return { ...base, state: "not_measured", detail: NOT_MEASURED_WITHOUT_KEYWORD, earned: 0 };
  }
  const snippet = description.slice(0, DESCRIPTION_SNIPPET);
  if (containsKeyword(snippet, keyword)) {
    return {
      ...base,
      state: "pass",
      detail: `"${keyword.trim()}" is in the part YouTube shows above "…more" — the only description most people ever read.`,
      earned: 2,
    };
  }
  if (containsKeyword(description, keyword)) {
    return {
      ...base,
      state: "warn",
      detail: `"${keyword.trim()}" is in the description but below the first ${DESCRIPTION_SNIPPET} characters, which is where the visible snippet ends.`,
      earned: 1,
    };
  }
  return {
    ...base,
    state: "fail",
    detail: `"${keyword.trim()}" is nowhere in the description.`,
    earned: 0,
  };
}

function descriptionLengthCheck(description: string): ScoredCheck {
  const length = description.trim().length;
  if (length === 0) {
    return {
      id: "description_length",
      label: "Description",
      state: "fail",
      detail: "There is no description. It is the one place to say what the video covers and where to go next.",
      earned: 0,
      possible: 2,
      keywordDependent: false,
    };
  }
  if (length < DESCRIPTION_MIN) {
    return {
      id: "description_length",
      label: "Description",
      state: "warn",
      detail: `${length} characters. Below about ${DESCRIPTION_MIN} there is not enough for a viewer or a ranking system to work with.`,
      earned: 1,
      possible: 2,
      keywordDependent: false,
    };
  }
  return {
    id: "description_length",
    label: "Description",
    state: "pass",
    detail: `${length} characters — enough to describe the video and carry its links.`,
    earned: 2,
    possible: 2,
    keywordDependent: false,
  };
}

function tagCountCheck(tags: readonly string[]): ScoredCheck {
  const count = tags.filter((tag) => tag.trim()).length;
  if (count === 0) {
    return {
      id: "tag_count",
      label: "Tags",
      state: "fail",
      detail: "No tags. They are how YouTube disambiguates a video whose title and description are ambiguous — most usefully for misspellings and synonyms.",
      earned: 0,
      possible: 2,
      keywordDependent: false,
    };
  }
  if (count < TAGS_MIN) {
    return {
      id: "tag_count",
      label: "Tags",
      state: "warn",
      detail: `${count} tag${count === 1 ? "" : "s"} — ${TAGS_MIN} to ${TAGS_MAX} is the range that covers a topic without turning into keyword stuffing.`,
      earned: 1,
      possible: 2,
      keywordDependent: false,
    };
  }
  if (count > TAGS_MAX) {
    return {
      id: "tag_count",
      label: "Tags",
      state: "warn",
      detail: `${count} tags. Past about ${TAGS_MAX} they dilute each other and start to read as stuffing.`,
      earned: 1,
      possible: 2,
      keywordDependent: false,
    };
  }
  return {
    id: "tag_count",
    label: "Tags",
    state: "pass",
    detail: `${count} tags — inside the ${TAGS_MIN}–${TAGS_MAX} range.`,
    earned: 2,
    possible: 2,
    keywordDependent: false,
  };
}

function tagCoverageCheck(tags: readonly string[], keyword: string): ScoredCheck {
  const base = {
    id: "tag_coverage",
    label: "A tag carries the keyword",
    possible: 2,
    keywordDependent: true,
  } as const;
  if (!keyword.trim()) {
    return { ...base, state: "not_measured", detail: NOT_MEASURED_WITHOUT_KEYWORD, earned: 0 };
  }
  const exact = tags.some((tag) => normalize(tag) === normalize(keyword));
  if (exact) {
    return {
      ...base,
      state: "pass",
      detail: `One tag is exactly "${keyword.trim()}".`,
      earned: 2,
    };
  }
  if (tags.some((tag) => containsKeyword(tag, keyword))) {
    return {
      ...base,
      state: "pass",
      detail: `A tag contains "${keyword.trim()}" — an exact tag as well would be stronger.`,
      earned: 1,
    };
  }
  return {
    ...base,
    state: "fail",
    detail: `No tag mentions "${keyword.trim()}".`,
    earned: 0,
  };
}

function thumbnailCheck(draft: PreUploadDraft): ScoredCheck {
  if (!draft.thumbnailUrl) {
    return {
      id: "thumbnail",
      label: "Custom thumbnail",
      state: "fail",
      detail: "No thumbnail. An auto-picked frame is the single biggest avoidable loss of clicks on YouTube.",
      earned: 0,
      possible: 2,
      keywordDependent: false,
    };
  }
  const words = draft.thumbnailText.trim() ? draft.thumbnailText.trim().split(/\s+/).length : 0;
  if (words > THUMBNAIL_TEXT_MAX_WORDS) {
    return {
      id: "thumbnail",
      label: "Custom thumbnail",
      state: "warn",
      detail: `You said the thumbnail carries ${words} words. At the size it appears in the mobile feed, more than ${THUMBNAIL_TEXT_MAX_WORDS} cannot be read — the preview beside this list is that exact size, so judge it there.`,
      earned: 1,
      possible: 2,
      keywordDependent: false,
    };
  }
  return {
    id: "thumbnail",
    label: "Custom thumbnail",
    state: "pass",
    detail:
      words > 0
        ? `A custom thumbnail with ${words} word${words === 1 ? "" : "s"} on it. We cannot read your image — the preview beside this list is rendered at mobile feed size so you can.`
        : "A custom thumbnail is attached. We cannot read your image — the preview beside this list is rendered at mobile feed size so you can.",
    earned: 2,
    possible: 2,
    keywordDependent: false,
  };
}

/** Every check, in the order the checklist prints them. */
export function preUploadChecks(draft: PreUploadDraft): ScoredCheck[] {
  return [
    titleLengthCheck(draft.title),
    titleKeywordCheck(draft.title, draft.targetKeyword),
    descriptionLengthCheck(draft.description),
    descriptionKeywordCheck(draft.description, draft.targetKeyword),
    tagCountCheck(draft.tags),
    tagCoverageCheck(draft.tags, draft.targetKeyword),
    thumbnailCheck(draft),
  ];
}

export const NEEDS_KEYWORD_SENTENCE =
  "No score yet: your organization asks for the keyword you want this video to rank for before it is graded. " +
  "Three of the seven checks — where the keyword sits in the title, whether it survives into the visible part of the description, and whether a tag carries it — have nothing to measure without one, and a score that quietly leaves them out would still read as a verdict on the whole video.";

/**
 * Score a draft.
 *
 * 🚨 THE DENOMINATOR IS WHAT WAS MEASURED, AND THE HEADER SAYS SO. A percentage
 * over all seven rows while three of them were never measured is the same lie
 * the analytics coverage judge refuses next door: it reads as a verdict on the
 * whole video. So unmeasured rows leave the denominator AND the count of
 * measured rows is returned with the number, for the surface to print.
 */
export function scorePreUpload(
  draft: PreUploadDraft,
  options: { targetKeywordRequired: boolean },
): PreUploadVerdict {
  const checks = preUploadChecks(draft);
  const total = checks.length;
  if (options.targetKeywordRequired && !draft.targetKeyword.trim()) {
    return { state: "needs_keyword", sentence: NEEDS_KEYWORD_SENTENCE, checks };
  }
  const measuredChecks = checks.filter((check) => check.state !== "not_measured");
  const possible = measuredChecks.reduce((sum, check) => sum + check.possible, 0);
  const earned = measuredChecks.reduce((sum, check) => sum + check.earned, 0);
  return {
    state: "scored",
    checks,
    score: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    measured: measuredChecks.length,
    total,
  };
}

/**
 * The block a person pastes into YouTube Studio. Plain text, exactly what is on
 * screen — no footer, no tracking, nothing added that the person did not see.
 */
export function studioClipboardText(draft: PreUploadDraft): string {
  const tags = draft.tags.map((tag) => tag.trim()).filter(Boolean);
  return [
    `Title: ${draft.title.trim()}`,
    "",
    "Description:",
    draft.description.trim(),
    "",
    `Tags: ${tags.join(", ")}`,
  ].join("\n");
}
