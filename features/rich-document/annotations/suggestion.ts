// features/rich-document/annotations/suggestion.ts
//
// SUGGESTIONS / TRACK CHANGES. A suggestion is a passage comment carrying
// proposed replacement text (platform.comments.suggested_text). Accepting it
// replaces exactly the resolved passage in the CURRENT body and persists the
// result through the source's own save adapter as a SPLICE: the change is
// reduced to the block(s) it touches (features/rich-document/review/
// proposedEdit.ts → @ai-matrx/content-ir/source spliceSave), so every other
// byte — kinds, XML sections, other paragraphs — is written back untouched,
// and an island the edit did not name refuses the save instead of being
// damaged. The returned change set carries every OTHER anchor to the new
// version (resolve.ts mapAnchorThroughChanges).

import type { SpliceResult } from "@ai-matrx/content-ir/source";
import { spliceProposal } from "@/features/rich-document/review/proposedEdit";
import { resolveAnchor } from "./resolve";
import type { TextAnchor } from "./anchor";

export class SuggestionApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuggestionApplyError";
  }
}

export interface AppliedSuggestion {
  nextBody: string;
  splice: SpliceResult;
}

/**
 * The body with `anchor`'s passage replaced by `replacement`, as a splice.
 * Throws SuggestionApplyError with a plain sentence when the passage can no
 * longer be found exactly, or when the edit would disturb protected content.
 */
export function applySuggestion(
  body: string,
  contentVersion: number,
  anchor: TextAnchor,
  replacement: string,
): AppliedSuggestion {
  const at = resolveAnchor({ anchor, body, contentVersion });
  if (at.status === "orphaned" || at.start16 == null || at.end16 == null) {
    throw new SuggestionApplyError(
      "The text this suggestion changes has been edited since, so it cannot be applied as written. Reattach it or make the change by hand.",
    );
  }
  const proposed = body.slice(0, at.start16) + replacement + body.slice(at.end16);
  let splice: SpliceResult | null;
  try {
    splice = spliceProposal(body, proposed);
  } catch (e) {
    throw new SuggestionApplyError(
      `Applying this suggestion would change protected content in the document, so it was not applied (${e instanceof Error ? e.message : String(e)}).`,
    );
  }
  if (!splice) {
    throw new SuggestionApplyError("This suggestion does not change anything — the text already reads that way.");
  }
  return { nextBody: splice.text, splice };
}
