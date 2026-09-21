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
 ## THE MACHINE WORDS GO TOO
 *
 * Walk 13 also caught `not_applicable` printed with its underscore in the same
 * prose. That token is not the agent's invention either — it is a value we
 * declared (`aidream/services/masterworks/build.py`, the auditor's `status`
 * enum) and handed the model, so the model quoting it back is correct and the
 * READING side owns turning it into words. Only tokens from that closed,
 * declared set are touched, and only the ones that are not already English:
 * "violation" and "pass" read fine and are left alone.
 *
 * ## Where it is applied
 *
 * ONE resolver, two renderings. `linkRuleCitations` is the markdown one the
 * registered `masterwork_result` kind component
 * (`components/mardown-display/blocks/masterwork/MasterworkResultBlock.tsx`),
 * which every surface that shows a `masterwork_result` reaches through the
 * kind registry — Encore, the Masterworks lane, the build dialog, the run
 * permalink, a chat transcript months later. `plainRuleCitations` is the same
 * resolution without link syntax, for the one-line run previews where markdown
 * would be noise.
 *
 * The rules come from `MasterworkRulesProvider`; with no provider mounted there
 * is no Rulebook in hand, the index is null, and the text renders exactly as it
 * arrived.
 *
 * 🚨 WALK 13, N3 — WHY THE MOUNT MOVED. This resolver was correct and never
 * fired: it was fed by a provider mounted on two PAGES, while the deliverable
 * is shown by a COMPONENT that any page can mount. The build dialog and the
 * `/workflows/runs/<id>` permalink both rendered the same ruling with a null
 * index, and all twelve ids reached the Expert raw. A page-level mount is the
 * wrong seam for a registry-mounted renderer; the provider now rides with
 * `TryMasterworkBox` and with the run permalink itself.
 */

import {
  isMachineIdentifier,
  machineIdentifierWords,
} from "@/lib/progress/failureSentence";

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
 * A kebab handle: two or more lowercase alphanumeric segments.
 *
 * The floor was three until walk 13, on the reasoning that a two-segment token
 * is ordinary hyphenated English. Real Rulebooks disproved it — `repair-criteria`,
 * `reprogram-criteria` and `redesign-criteria` are all stored ids in the walk's
 * own Rulebook, and at a floor of three a ruling citing one of them would have
 * printed the raw id, which is the exact defect. The floor only narrows the
 * LOOKUP; a token that clears it still has to BE a stored rule id to be
 * replaced, so lowering it cannot invent a citation — it can only stop missing
 * one. English writes these as two words, not hyphenated.
 */
const HANDLE = /[a-z0-9]+(?:-[a-z0-9]+)+/g;

function escapeLinkText(name: string): string {
  return name.replace(/([[\]])/g, "\\$1");
}

/**
 * The auditor `status` values we DECLARE and hand the model
 * (`aidream/services/masterworks/build.py`, AUDIT_OUTPUT_SCHEMA). Only the one
 * that is not already English is listed: turning "violation" or "pass" into
 * something else would be editing the agent's words, not un-mangling ours.
 * Keyed by the exact token, so nothing else in prose is touched.
 */
const DECLARED_TOKEN_WORDS: Readonly<Record<string, string>> = {
  not_applicable: "not applicable",
};

const DECLARED_TOKEN = /\b(?:not_applicable)\b/g;

/**
 * 🚨 A FIELD NAME IS NOT A WORD (walk 18, defect D)
 *
 * The walk's finished deliverable — 12,642 characters of otherwise flawless
 * English, the document an Expert hands a customer or a new hire — carried
 * exactly one machine token, verbatim:
 *
 *   Editor's `violations_not_fixed: []` — OVERRULED as premature.
 *
 * It is the same shape as `not_applicable` above and has the same owner. The
 * key comes out of a schema WE declared and handed the model
 * (`aidream/services/masterworks/build.py`, the Editor's output shape); the
 * model quoted what it was given, which is the correct behaviour for an agent
 * citing its own input; and the READING side is where it becomes words. A
 * closed list was the right answer for one enum value and the wrong one for a
 * schema that grows — so the rule is now the SHAPE, shared with
 * `lib/progress/failureSentence.ts` so there is one definition of what an
 * identifier looks like, and it resolves rather than invents: underscores
 * become spaces, an empty collection becomes "none", nothing else changes.
 *
 * It never reaches a code fence (PROTECTED wins over everything) and never
 * reaches a rule citation (a span that resolves to a rule is rendered as that
 * rule BEFORE this runs).
 */

/** How an empty collection reads once it is no longer JSON. */
const EMPTY_COLLECTION_WORD = "none";

/**
 * A whole inline-code span that is nothing but a machine field: the key, and
 * optionally the value the model quoted with it (`violations_not_fixed: []`,
 * `word_count_after: 96`). Two segments are enough HERE — the backticks are a
 * delimiter the person can see, so there is no risk of mangling prose — and
 * the value must be a literal, so a real code span (`x = compute(y)`, a SQL
 * statement, a file path) is left exactly as the model wrote it.
 */
const FIELD_SPAN =
  /^([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?:\s*[:=]\s*(\[\]|\{\}|null|true|false|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*'))?$/;

/**
 * The words an inline-code span of ours was standing for, or null when the
 * span is real code and must not be touched.
 */
function fieldSpanWords(inner: string): string | null {
  const match = FIELD_SPAN.exec(inner.trim());
  if (!match) return null;
  const [, key, literal] = match;
  if (!isMachineIdentifier(key, { minSegments: 2 })) return null;
  const words = machineIdentifierWords(key);
  if (literal === undefined) return words;
  const value =
    literal === "[]" || literal === "{}"
      ? EMPTY_COLLECTION_WORD
      : literal.replace(/^["']|["']$/g, "");
  return `${words}: ${value}`;
}

/**
 * A bare identifier standing loose in prose. The floor is three segments —
 * the same rule `personSentence` applies, for the same reason: with no
 * delimiter around it, a two-segment token occurs in ordinary technical
 * English and a false positive mangles a real sentence.
 */
const BARE_FIELD = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/g;

/** How a resolved rule is written out. */
type CiteRender = (rule: RulebookRule, rulebookId: string) => string;

const asLink: CiteRender = (rule, rulebookId) =>
  `[${escapeLinkText(rule.name)}](/masterwork/${rulebookId}#${ruleAnchorId(rule.id)})`;

const asName: CiteRender = (rule) => rule.name;

function resolveInProse(
  prose: string,
  index: RuleCitationIndex | null,
  render: CiteRender,
): string {
  const cited =
    index && index.byHandle.size > 0
      ? prose.replace(HANDLE, (token) => {
          const rule = index.byHandle.get(token);
          return rule ? render(rule, index.rulebookId) : token;
        })
      : prose;
  return plainDeclaredTokens(cited);
}

/**
 * A declared machine token printed at a person becomes the words we meant.
 * Runs even with no Rulebook in hand: it needs no rules, only the shapes we
 * ourselves declared, so `not_applicable` is never a reason to see an
 * underscore — and neither is `violations_not_fixed`.
 */
export function plainDeclaredTokens(text: string): string {
  return text
    .replace(DECLARED_TOKEN, (token) => DECLARED_TOKEN_WORDS[token] ?? token)
    .replace(BARE_FIELD, (token) =>
      isMachineIdentifier(token) ? machineIdentifierWords(token) : token,
    );
}

function resolveDocument(
  markdown: string,
  index: RuleCitationIndex | null,
  render: CiteRender,
): string {
  if (markdown === "") return markdown;
  let out = "";
  let cursor = 0;
  PROTECTED.lastIndex = 0;
  for (
    let match = PROTECTED.exec(markdown);
    match !== null;
    match = PROTECTED.exec(markdown)
  ) {
    out += resolveInProse(markdown.slice(cursor, match.index), index, render);
    const construct = match[0];
    const inlineCode =
      construct.startsWith("`") &&
      !construct.startsWith("```") &&
      construct.endsWith("`");
    const inner = inlineCode ? construct.slice(1, -1).trim() : null;
    // A span that names a rule is that rule — decided FIRST, so a citation is
    // never mistaken for a field name.
    const rule =
      inner !== null && index ? index.byHandle.get(inner) : undefined;
    // Otherwise: a span that is nothing but one of OUR field names becomes the
    // words it stood for. Anything else — real code, a path, a fence — is
    // handed back byte-for-byte.
    if (rule && index) {
      out += render(rule, index.rulebookId);
    } else {
      out += (inner === null ? null : fieldSpanWords(inner)) ?? construct;
    }
    cursor = match.index + construct.length;
  }
  return out + resolveInProse(markdown.slice(cursor), index, render);
}

/**
 * Resolve every citable rule id in one markdown document, as markdown links.
 *
 * An inline code span whose WHOLE content is a known handle becomes the link
 * (a model that backticks its citation meant the same citation); a span with
 * anything else in it is code and is left alone. Unknown handles, code fences
 * and existing links come back byte-for-byte.
 *
 * `index` null — no Rulebook in hand — still un-mangles the declared tokens we
 * handed the model, and changes nothing else.
 */
export function linkRuleCitations(
  markdown: string,
  index: RuleCitationIndex | null,
): string {
  return resolveDocument(markdown, index, asLink);
}

/**
 * The same resolution written as PLAIN words — the rule's name, no link
 * syntax. For the places a one-line preview is read rather than navigated:
 * a link in a row that is itself a link would be a door inside a door.
 */
export function plainRuleCitations(
  markdown: string,
  index: RuleCitationIndex | null,
): string {
  return resolveDocument(markdown, index, asName);
}

/**
 * ONE line of what a run said, as a person reads it — walk 13, N10.
 *
 * The Encore row was printing the deliverable's raw markdown at an Operator
 * (`## The Ruling This letter is a verdict rendered from a telephone…`), heading
 * marks and all, because the preview is built from the payload text and nothing
 * ever took the markdown off. Marks come off, rule ids resolve to names, the
 * declared tokens become words, and the result is collapsed to one line.
 *
 * Deliberately NOT a markdown renderer: this is a single line inside a row, and
 * a row that renders headings and bold is the shape the defect had.
 */
export function deliverableLine(
  markdown: string,
  index: RuleCitationIndex | null,
): string {
  return stripMarkdownMarks(plainRuleCitations(markdown, index))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip the marks a one-line preview cannot render. Conservative on purpose:
 * it removes SYNTAX and keeps every word, so nothing a person wrote is lost —
 * a link keeps its text, a heading keeps its words, a list keeps its item.
 */
export function stripMarkdownMarks(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*\*|___)(.+?)\1/g, "$2")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(?<![*\w])([*_])(?!\s)(.+?)(?<!\s)\1(?![*\w])/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, (row) =>
      /^[\s|:-]+$/.test(row) ? " " : row.replace(/\|/g, " "),
    );
}
