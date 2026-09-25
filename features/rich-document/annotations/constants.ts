// features/rich-document/annotations/constants.ts

/**
 * 🚨 PASSAGE WRITES ARE OFF until the association-visibility fix is applied.
 *
 * Every anchored write — a highlight's `annotates` edge, a passage link's
 * `anchored_to` edge, a passage comment, a suggestion — carries a copy of the
 * source's text (the quote, prefix and suffix). Until rich-content REGISTER row
 * RC-A5 ("association rows whose payload copies an endpoint's content are
 * readable only by someone who can read both ends") reads APPLIED, an edge's
 * quote from a personal document is readable by any member of its
 * organization. Chair ruling 2026-09-25: no client writes text anchors before
 * RC-A5. The comment door that accepts a passage (migrations/
 * rcb11_comment_collaboration_doors.sql, a chair step) is also not applied yet.
 *
 * Flip to `true` in the same commit that records RC-A5 AND the RC-B11 comment
 * doors as applied. A code constant, never an env toggle
 * (common-docs/policies/env-vars-are-values-not-toggles.md).
 *
 * While false the sidecar still captures, resolves and paints; a passage save
 * is refused BEFORE any request with the sentence below, and the draft is
 * kept so nothing the person typed is lost.
 */
export const ANCHOR_WRITES_ENABLED = false;

export const ANCHOR_WRITES_OFF_SENTENCE =
  "Saving to a passage is not switched on yet: it waits on a privacy update to how quoted passages are stored. Your draft is kept, and you can comment on or link to the whole document now.";

export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "purple"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "yellow";

/** Association roles the sidecar writes (registered in platform.association_types). */
export const ANNOTATES_ROLE = "annotates";
export const ANCHORED_TO_ROLE = "anchored_to";

/** The platform.categories slug of the private annotation document type. */
export const ANNOTATION_DOCUMENT_TYPE = "annotation";
