/**
 * A search SNIPPET (a `ts_headline` window, a clipped preview) is a FRAGMENT of
 * a message: it may begin or end in the middle of kind JSON. `inlineKindText`
 * handles a kind that opens inside the fragment (complete or cut at the end);
 * this adds the one case it cannot — a fragment that STARTS inside a kind
 * object, so the `__kind` key has no opening brace before it. Everything from
 * the fragment's start to that object's closing brace becomes the kind's name.
 *
 * Plain text out (no markdown emphasis): a snippet is shown as a line of text.
 * A fragment with no kind key — kindless JSON included — comes back unchanged.
 * Destination transform only; never call it on stored text.
 */

import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { inlineKindText } from "@/features/content-ir/surfaces/kind-one-line";
import { firstKindSlug, hasKindKey, kindObjectProseBreak, normalizeKindSpellings } from "@/features/content-ir/surfaces/json-kind-signal";

const KIND_KEY = /(?<!\\)"(?:__kind|\\u005[fF]_kind)"\s*:/;

/** Index just past the `}`/`]` that closes the (unseen) object the fragment starts in, else the end. */
function unbalancedCloserEnd(text: string, from: number): number {
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      if (depth === 0) return i + 1;
      depth--;
    }
  }
  return text.length;
}

export function snippetKindText(raw: string): string {
  // A Python-repr or zero-width-spelled kind reads like any other (K4).
  const fragment = raw ? normalizeKindSpellings(raw) : raw;
  if (!fragment || !hasKindKey(fragment)) return fragment;
  let out = inlineKindText(fragment).replace(/\*\*/g, "");
  if (hasKindKey(out)) {
    const key = out.search(KIND_KEY);
    // Only a fragment that starts INSIDE an object (nothing before the key
    // but JSON punctuation) — prose that mentions the key is never cut (round 9).
    if (key >= 0 && out.lastIndexOf("{", key) < 0 && /(?:^|[,{[]|")\s*$/.test(out.slice(0, key))) {
      const name = (firstKindSlug(out.slice(key)) && humanizeIdentifier(firstKindSlug(out.slice(key))!)) || "Structured output";
      // Never past where the object breaks into prose (H-1, round 9).
      const closer = unbalancedCloserEnd(out, key);
      const proseBreak = closer === out.length ? kindObjectProseBreak(`{${out.slice(key)}`) : null;
      out = out.slice(0, key).replace(/[\s,"{[]*$/, "") + name + out.slice(proseBreak === null ? closer : key + proseBreak - 1);
    }
  }
  return out.replace(/\s+/g, " ").trim();
}
