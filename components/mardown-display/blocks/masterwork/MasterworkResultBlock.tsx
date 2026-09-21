"use client";

/**
 * MasterworkResultBlock — THE one renderer for the `masterwork_result` kind:
 * what a Masterwork run handed over, as the person reads it.
 *
 * Three markdown fields, in the order the builder emits them
 * (`aidream/services/masterworks/build.py`: "the deliverable FIRST, the
 * reasoning beside it — never the reasoning alone"): the work, the angle that
 * won, the expert's ruling.
 *
 * ## The one thing this component does that a markdown renderer cannot
 *
 * Walk 12, D14: the ruling cited the Expert's own rules by their stored ids,
 * and those ids are cut at 48 characters when they are minted — so a
 * non-technical Expert read `prohibit-head-adjustments-before-pressure-testin`
 * inline in her own verdict. Before resolving anything, each field goes
 * through `linkRuleCitations` against the rules the surface published
 * (`MasterworkRulesProvider`): an id that PROVABLY names a rule in that
 * Rulebook becomes the rule's name, linked to it on the Rulebook screen —
 * the same citation the Rulebook's own `RuleRelations` and `RuleFidelityTable`
 * draw. Everything else, including every id we cannot prove, survives
 * byte-for-byte. With no Rulebook in scope nothing resolves and nothing is
 * invented.
 *
 * The markdown itself is rendered by the platform primitive (`MarkdownStream`)
 * — this component owns no parser and no second renderer.
 *
 * ## Walk 18, D14's sibling: a field name is not a word either
 *
 * The walk's deliverable — 12,642 characters of otherwise flawless English —
 * printed `violations_not_fixed: []` at a residential plumber. Two halves, and
 * this component owns both ends of them:
 *
 *   · IN THE PROSE, where that one actually was: `linkRuleCitations` now
 *     resolves a machine field name the same way it resolves a rule id and
 *     `not_applicable` — the words it stood for, never inside a code fence.
 *   · IN THE STRUCTURE: a `masterwork_result` carrying a field beyond the
 *     three this kind declares used to be dropped here without a trace, which
 *     is law 4 broken quietly and a raw key waiting to happen the moment
 *     somebody renders it. Extra fields now render under their own name IN
 *     WORDS, with an empty list reading as a sentence rather than as `[]`.
 */

import MarkdownStream from "@/components/MarkdownStream";
import {
  collectExtras,
  plainFieldLabel,
} from "@/features/content-ir/kinds/kind-markdown-utils";
import type { MasterworkResultData } from "@/features/content-ir/kinds/masterwork-result";
import { linkRuleCitations } from "@/features/masterwork/ruleCitations";
import { useRuleCitationIndex } from "@/features/masterwork/rules-context/MasterworkRulesContext";

export interface MasterworkResultBlockProps {
  serverData?: unknown;
}

function readData(serverData: unknown): MasterworkResultData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<MasterworkResultData>;
  const ruling = typeof candidate.ruling === "string" ? candidate.ruling : "";
  const deliverable =
    typeof candidate.deliverable === "string" ? candidate.deliverable : null;
  if (ruling === "" && deliverable === null) return null;
  return {
    ...candidate,
    ruling,
    deliverable,
    approach:
      typeof candidate.approach === "string" ? candidate.approach : null,
  } as MasterworkResultData;
}

/** The keys this component renders itself; everything else is an extra. */
const DECLARED_FIELDS = ["deliverable", "approach", "ruling"];

/**
 * One structured extra, as a sentence rather than as a literal.
 *
 * An empty list is the case the walk caught — it says nothing was left, and
 * says it in words. A list with things in it reads as those things. Anything
 * structural falls back to what it is, because a shape we do not know is still
 * better shown than silently dropped.
 */
function plainFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    if (value.every((item) => typeof item !== "object" || item === null)) {
      return value.map(String).join(", ");
    }
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return "None";
    return keys.map(plainFieldLabel).join(", ");
  }
  return String(value);
}

export function MasterworkResultBlock({
  serverData,
}: MasterworkResultBlockProps) {
  const index = useRuleCitationIndex();
  const result = readData(serverData);
  if (!result) return null;
  const cite = (markdown: string) => linkRuleCitations(markdown, index);
  const extras = Object.entries(collectExtras(result, DECLARED_FIELDS));

  return (
    <div className="space-y-4" data-masterwork-result="block">
      {result.deliverable ? (
        <div data-masterwork-result="deliverable">
          <MarkdownStream content={cite(result.deliverable)} />
        </div>
      ) : null}

      {result.approach ? (
        <p
          className="text-xs text-muted-foreground"
          data-masterwork-result="approach"
        >
          <span className="font-medium text-foreground">
            The angle that won:
          </span>{" "}
          {result.approach}
        </p>
      ) : null}

      {result.ruling ? (
        <div data-masterwork-result="ruling">
          <MarkdownStream content={cite(result.ruling)} />
        </div>
      ) : null}

      {extras.length > 0 ? (
        <dl
          className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]"
          data-masterwork-result="extras"
        >
          {extras.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-medium text-foreground">
                {plainFieldLabel(key)}
              </dt>
              <dd className="text-muted-foreground">
                {plainFieldValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export default MasterworkResultBlock;
