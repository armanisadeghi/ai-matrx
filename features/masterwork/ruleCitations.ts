/**
 * THE RULE-CITATION RESOLVER — a stored rule id written in prose becomes the
 * rule's own name, linked to that rule on the Rulebook screen.
 *
 * ## The defect this closes (walk 12, D14, 2026-09-20)
 *
 * An Encore deliverable reached a commercial irrigation contractor carrying
 * `prohibit-head-adjustments-before-pressure-testin`,
 * `dynamic-pressure-drop-points-to-mainlinepoc-not` and two more like them,
 * inline in prose she was meant to read. They are not a rendering artefact and
 * the agent did not truncate them: they are EXACT stored rule ids, cut at 48
 * characters by `kebabRuleId`'s `.slice(0, 48)` at mint time. The agent cites
 * the handle it was given, verbatim, which is the correct behaviour for an
 * agent — a ruling that paraphrased its own citations would be worse.
 *
 * So the fix belongs on the READING side, and it is a resolution, never a
 * rewrite: an id we can PROVE names a rule in this Rulebook is replaced by
 * that rule's name with a door to it; anything else is left exactly as the
 * agent wrote it. Nothing is ever invented, guessed, prettified or dropped.
 *
 * ## Why exact-match only
 *
 * Fuzzy matching a truncated slug back to a rule would be a guess wearing a
 * link, and a wrong citation in an expert's ruling is worse than a raw slug —
 * the slug is at least honestly opaque. Two keys are therefore indexed and no
 * others: the stored `rule.id`, and its own 48-character head (`nextRuleId`
 * appends `-2`, `-3`… AFTER the slice, so a longer id has a 48-char twin the
 * minting run could equally have produced). A key two rules would both answer
 * to is dropped from the index entirely rather than resolved to either.
 *
 * ## Where it is applied
 *
 * ONE place: the registered `masterwork_result` kind component
 * (`components/mardown-display/blocks/masterwork/MasterworkResultBlock.tsx`),
 * which every surface that shows a `masterwork_result` reaches through the
 * kind registry — Encore, the Masterworks lane, a chat transcript months
 * later. The rules come from `MasterworkRulesProvider`; with no provider
 * mounted there is no Rulebook in hand, the index is null, and the text
 * renders exactly as it arrived.
 */

import type { RulebookRule } from "./types";
import { ruleAnchorId } from "./components/detail/RuleRelations";

/** The length `kebabRuleId` cuts a minted id to. Named once, never retyped. */
export const RULE_ID_MINT_LENGTH = 48;

export interface RuleCitationIndex {
  /** The Rulebook whose screen the links open. */
  rulebookId: string;
  /** Citable handle → the rule it names. Ambiguous handles are absent. */
  byHandle: ReadonlyMap<string, RulebookRule>;
}

/**
 * Index a Rulebook's rules by every handle a ruling could honestly carry.
 * A handle two rules would both answer to is dropped, not resolved.
 */
export function buildRuleCitationIndex(
  rulebookId: string,
  rules: readonly RulebookRule[],
): RuleCitationIndex {
  const byHandle = new Map<string, RulebookRule>();
  const ambiguous = new Set<string>();
  const claim = (handle: string, rule: RulebookRule) => {
    if (handle === "" || ambiguous.has(handle)) return;
    const held = byHandle.get(handle);
    if (held && held.id !== rule.id) {
      byHandle.delete(handle);
      ambiguous.add(handle);
      return;
    }
    byHandle.set(handle, rule);
  };
  for (const rule of rules) {
    if (typeof rule?.id !== "string" || rule.id === "") continue;
    claim(rule.id, rule);
    claim(rule.id.slice(0, RULE_ID_MINT_LENGTH), rule);
  }
  return { rulebookId, byHandle };
}

/**
 * Constructs whose insides are NOT prose and must never be rewritten: fenced
 * code, inline code, a markdown link (rewriting inside one nests links), an
 * autolink, and a bare URL. Ordered longest-construct-first so a fence wins
 * over the inline-code run inside it.
 */
const PROTECTED =
  /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|!?\[[^\]\n]*\]\([^)\n]*\)|<[^>\s]+>|https?:\/\/\S+/g;

/**
 * A kebab handle: three or more lowercase alphanumeric segments. Three is the
 * floor because a two-segment token is ordinary hyphenated English ("catch-can",
 * "pressure-drop") and a rule id never is. The floor only narrows the LOOKUP —
 * a token that clears it still has to name a real rule to be replaced.
 */
const HANDLE = /[a-z0-9]+(?:-[a-z0-9]+){2,}/g;

function escapeLinkText(name: string): string {
  return name.replace(/([[\]])/g, "\\$1");
}

function citationLink(rule: RulebookRule, rulebookId: string): string {
  return `[${escapeLinkText(rule.name)}](/masterwork/${rulebookId}#${ruleAnchorId(rule.id)})`;
}

function linkInProse(prose: string, index: RuleCitationIndex): string {
  return prose.replace(HANDLE, (token) => {
    const rule = index.byHandle.get(token);
    return rule ? citationLink(rule, index.rulebookId) : token;
  });
}

/**
 * Resolve every citable rule id in one markdown document.
 *
 * An inline code span whose WHOLE content is a known handle becomes the link
 * (a model that backticks its citation meant the same citation); a span with
 * anything else in it is code and is left alone. Unknown handles, code fences
 * and existing links come back byte-for-byte.
 *
 * `index` null — no Rulebook in hand — returns the markdown unchanged.
 */
export function linkRuleCitations(
  markdown: string,
  index: RuleCitationIndex | null,
): string {
  if (!index || index.byHandle.size === 0 || markdown === "") return markdown;
  let out = "";
  let cursor = 0;
  PROTECTED.lastIndex = 0;
  for (
    let match = PROTECTED.exec(markdown);
    match !== null;
    match = PROTECTED.exec(markdown)
  ) {
    out += linkInProse(markdown.slice(cursor, match.index), index);
    const construct = match[0];
    const inlineCode =
      construct.startsWith("`") &&
      !construct.startsWith("```") &&
      construct.endsWith("`");
    const rule = inlineCode
      ? index.byHandle.get(construct.slice(1, -1).trim())
      : undefined;
    out += rule ? citationLink(rule, index.rulebookId) : construct;
    cursor = match.index + construct.length;
  }
  return out + linkInProse(markdown.slice(cursor), index);
}
