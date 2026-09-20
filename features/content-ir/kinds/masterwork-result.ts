/**
 * `masterwork_result` — the finished Masterwork run, as the person reads it.
 *
 * The kind itself is PYTHON-OWNED (`aidream/aidream/kinds/masterwork.py`,
 * registry v2, family `masterwork`): three markdown fields, every one of them
 * prose a person reads and none of them machine-consumed. What was missing was
 * the RENDER leg — the kind was active with no `kind_component` row at all, so
 * the Encore deliverable reached the Expert through the shared `InvocationBody`
 * fallback, which has no text hook and no reach to the Rulebook.
 *
 * That absence is what made walk 12's D14 unfixable in place: the ruling's
 * exact stored rule ids (`prohibit-head-adjustments-before-pressure-testin`,
 * cut at 48 by `kebabRuleId` at mint time) had nowhere to be resolved. This
 * file is the seam. The component it routes to renders each field through the
 * platform's markdown primitive after `linkRuleCitations` turns every id it
 * can PROVE into that rule's name, linked to it on the Rulebook screen.
 *
 * Schema source: the compiled floor below mirrors the live
 * `emitted_json_schema` exactly (verified against the row 2026-09-20). The warm
 * registry's rows override it the moment they load, so a field Python adds
 * still validates and renders.
 *
 * COMPLETE bridge, deliberately: a half-written ruling is a half-written
 * sentence, and the readout already shows the arriving silhouette while a
 * declared-kind step streams. Nothing here competes with that.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";

import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { KIND_KEY } from "@ai-matrx/content-ir";

/** The registered kind slug — named once, never spelled by hand elsewhere. */
export const MASTERWORK_RESULT_KIND = "masterwork_result";
/** The render key `kind-route` sets `block.type` to (SHAPE_BLOCK_DISPATCH). */
export const MASTERWORK_RESULT_BLOCK_TYPE = "masterwork_result";

export const masterworkResultKindSchema: KindSchema = {
  kind: MASTERWORK_RESULT_KIND,
  fields: {
    deliverable: {
      type: "string",
      nullable: true,
      description:
        "The finished WORK — what the Expert asked the system to make, as markdown. Null on the edit shape, where the corrected text lives inside the ruling.",
    },
    approach: {
      type: "string",
      nullable: true,
      description:
        'Which angle won, in the Maker\'s words ("Security & Compliance Focus"). Null wherever there was nothing to choose between.',
    },
    ruling: {
      type: "string",
      required: true,
      description:
        "The expert's own verdict, in their voice, as markdown. Always present: a run with no ruling produced nothing worth showing.",
    },
  },
};

/** What `MasterworkResultBlock` receives. Every field is markdown. */
export interface MasterworkResultData extends Record<string, unknown> {
  deliverable: string | null;
  approach: string | null;
  ruling: string;
}

function markdownField(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export const masterworkResultServerDataFromEnvelope =
  makeCompleteEnvelopeBridge<MasterworkResultData>(
    MASTERWORK_RESULT_KIND,
    (value) => {
      const ruling = markdownField(value.ruling);
      const deliverable = markdownField(value.deliverable);
      const approach = markdownField(value.approach);
      // A result with neither a ruling nor a deliverable is not a result. The
      // bridge declines rather than drawing an empty card over the readout's
      // own honest account of what the step produced.
      if (ruling === null && deliverable === null) return undefined;
      return { ...value, deliverable, approach, ruling: ruling ?? "" };
    },
  );

const MD_KNOWN_KEYS = ["deliverable", "approach", "ruling", KIND_KEY];

export function masterworkResultMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const deliverable = markdownField(value.deliverable);
  const approach = markdownField(value.approach);
  const ruling = markdownField(value.ruling);
  return joinBlocks([
    deliverable,
    approach ? `**The angle that won:** ${approach}` : null,
    ruling,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

export const MASTERWORK_RESULT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: MASTERWORK_RESULT_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: MASTERWORK_RESULT_BLOCK_TYPE,
    toLegacyServerData: masterworkResultServerDataFromEnvelope,
    toMarkdown: masterworkResultMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: masterworkResultKindSchema,
  },
];
