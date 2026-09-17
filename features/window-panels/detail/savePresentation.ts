// features/window-panels/detail/savePresentation.ts
//
// THE ONE WRITE of the Detail presentation setting, at the person's own rung.
// `forType` changes that record type's exception instead of the default.
//
// It lives beside `DetailHost` rather than inside it for the reason
// `singletonReplacement.ts` does: the host binding is wiring, and the one piece
// of judgement in this port — what happens when the CURRENT value cannot be
// read — is worth a test of its own that does not boot the whole host.

import {
  DETAIL_PRESENTATION_BY_TYPE_KNOB,
  type DetailPresentation,
} from "@/lib/detail/types";
import { sessionKnobPrincipals } from "@/lib/scoped-config/sessionKnob";
import {
  knobRefusalSentence,
  setKnobOverride,
  setUserKnobMapEntry,
} from "@/lib/scoped-config/service";

export type SavePresentationResult = { ok: true } | { ok: false; reason: string };

/**
 * A refusal comes back as a sentence the pane renders; nothing here re-states a
 * gate the door already owns.
 *
 * 🚨 THE PER-TYPE MAP IS MERGED, NEVER REPLACED, AND NEVER MERGED INTO A GUESS.
 * `ui.detail.presentation_by_type` holds every record type's exception in one
 * json map, and the write door replaces the whole value. This used to read the
 * current map with `.catch(() => undefined)` — the same catch the READ path uses
 * so an unregistered key cannot cost the base setting its answer — and then
 * merge into `{}`, so one transient `knob_resolve` miss wrote a one-entry map
 * over every other type the person had set, silently (Bugbot, frontend PR 228,
 * commit 4cbd9e45). Refusing instead of guessing, and the fresh read that makes
 * two tabs saving two different types both survive, are the ONE primitive
 * `setUserKnobMapEntry` — read its header before changing anything here; every
 * map-valued knob needs the same two behaviours and gets them there, not here.
 */
export async function savePresentation(args: {
  presentation: DetailPresentation;
  forType: string | null;
}): Promise<SavePresentationResult> {
  const { organizationId, userId } = sessionKnobPrincipals();
  if (!organizationId || !userId) {
    return {
      ok: false,
      reason:
        "This setting is saved against your account in the organization you are working in, and " +
        "this session has not resolved both yet. Reload the page and try again.",
    };
  }
  try {
    if (args.forType) {
      const [feature, key] = splitKnobKey(DETAIL_PRESENTATION_BY_TYPE_KNOB);
      return await setUserKnobMapEntry({
        feature,
        key,
        entryKey: args.forType,
        entryValue: args.presentation,
        userId,
        organizationId,
      });
    }
    const result = await setKnobOverride({
      feature: "ui.detail",
      key: "default_presentation",
      scopeKind: "user",
      scopeId: userId,
      organizationId,
      value: args.presentation,
    });
    return result.ok ? { ok: true } : { ok: false, reason: knobRefusalSentence(result) };
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** `ui.detail.presentation_by_type` → `["ui.detail", "presentation_by_type"]`. */
function splitKnobKey(fullKey: string): [string, string] {
  const at = fullKey.lastIndexOf(".");
  return [fullKey.slice(0, at), fullKey.slice(at + 1)];
}
