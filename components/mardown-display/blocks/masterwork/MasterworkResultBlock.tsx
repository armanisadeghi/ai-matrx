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
 */

import MarkdownStream from "@/components/MarkdownStream";
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

export function MasterworkResultBlock({
  serverData,
}: MasterworkResultBlockProps) {
  const index = useRuleCitationIndex();
  const result = readData(serverData);
  if (!result) return null;
  const cite = (markdown: string) => linkRuleCitations(markdown, index);

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
    </div>
  );
}

export default MasterworkResultBlock;
