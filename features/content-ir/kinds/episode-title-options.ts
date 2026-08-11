/**
 * episode_title_options kind → EpisodeTitleOptionsBlock bridge (+ compiled
 * definitions).
 *
 * The second ACTION-CARRYING kind (after `video_prompt_options`), and the
 * first whose action is a WRITE rather than an agent launch: a title agent
 * emits ranked title candidates, and each rendered card carries a "Use this
 * title" button that persists the choice through the platform's surface
 * writeback seam. Canonical `__kind` JSON shape:
 *
 *   { __kind:"episode_title_options", working_title?,
 *     options: [
 *       { __kind:"episode_title_option", title, subtitle?, rationale? } ] }
 *
 * ## Why there is no `action` block in the payload
 *
 * `video_prompt_options` declares `action.agent_id` because the target agent
 * is data the component cannot know. Here the target is platform vocabulary,
 * not content: the block names the `episode_title` surface write target as a
 * constant, and the page that mounted the surface decides what that means
 * (`features/podcasts/studio/components/PodcastRunWriteTargets.tsx` →
 * `podcastService.updateEpisode`). Letting the MODEL name the write target
 * would let generated content aim a write at any target the mounted surface
 * declares — the exact hole `applyPolicy` exists to close. Content still only
 * DECLARES; execution stays platform-mediated, click-only, and gated by the
 * surface's own handler (which refuses mid-run and without an episode).
 *
 * Blocks rendered where no surface offers the target (chat, a share page)
 * degrade to read-only cards with Copy — never a dead button.
 *
 * STREAMING bridge (keyword-research precedent, NOT
 * makeCompleteEnvelopeBridge): serverData is derived from every partial
 * envelope flush, so each title card appears the instant its node parses.
 * That is what makes the floating live-run window worth watching.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

/**
 * The surface write target a rendered card applies through. Declared by
 * `matrx-user/podcast-run`; any surface that declares the same name and
 * registers a handler makes these cards interactive.
 */
export const EPISODE_TITLE_WRITE_TARGET = "episode_title";

/**
 * UI-state key a surface publishes so the cards can mark which option is the
 * episode's CURRENT title (and so a surface can offer read-only rendering by
 * publishing nothing at all).
 */
export const EPISODE_TITLE_UI_STATE_KEY = "episode_title_selection";

// ---------------------------------------------------------------------------
// Schemas — single source for storage rows + emitted JSON Schemas
// (kindSchemaToStorage / kindSchemaToJsonSchema), never hand-written twice.
// ---------------------------------------------------------------------------

export const episodeTitleOptionsKindSchema: KindSchema = {
  kind: "episode_title_options",
  fields: {
    working_title: {
      type: "string",
      description:
        "The episode's current title, echoed so the alternatives can be judged against it.",
    },
    options: {
      type: "array",
      itemKinds: ["episode_title_option"],
      required: true,
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const episodeTitleOptionKindSchema: KindSchema = {
  kind: "episode_title_option",
  fields: {
    title: {
      type: "string",
      required: true,
      description:
        "The full replacement episode title, exactly as it should be saved. One line, no surrounding quotes.",
    },
    subtitle: {
      type: "string",
      description:
        "Optional supporting line shown beside the title (a tagline or clarifier). Never part of the saved title.",
    },
    rationale: {
      type: "string",
      description:
        "One sentence on why this title works — the angle, search intent, or curiosity gap it serves.",
    },
  },
};

export const EPISODE_TITLE_OPTIONS_KIND_SCHEMAS: KindSchema[] = [
  episodeTitleOptionsKindSchema,
  episodeTitleOptionKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING: partial envelopes map to partial data.
// ---------------------------------------------------------------------------

export interface EpisodeTitleOptionData {
  title: string;
  subtitle: string | null;
  rationale: string | null;
  /** This option's own node finished parsing (or the whole set did). */
  complete: boolean;
}

export interface EpisodeTitleOptionsData {
  workingTitle: string | null;
  options: EpisodeTitleOptionData[];
  isComplete: boolean;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function episodeTitleOptionsServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (EpisodeTitleOptionsData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "episode_title_options") return undefined;

  const rawOptions = envelope.root.value.options;
  const setComplete = envelope.root.status === "complete";
  const options: EpisodeTitleOptionData[] = [];

  if (Array.isArray(rawOptions)) {
    for (let i = 0; i < rawOptions.length; i++) {
      const option = rawOptions[i];
      if (!isRecord(option)) continue;
      // A title that has not arrived yet is not a card — a blank row would
      // flicker in and out on every flush.
      const title = nonEmptyString(option.title);
      if (!title) continue;
      const meta = envelope.nodeIndex?.[`options.${i}`];
      options.push({
        title,
        subtitle: nonEmptyString(option.subtitle),
        rationale: nonEmptyString(option.rationale),
        complete: setComplete || meta?.status === "complete",
      });
    }
  }

  return {
    workingTitle: nonEmptyString(envelope.root.value.working_title),
    options,
    isComplete: setComplete,
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet — one section per option; unknown keys never vanish.
// ---------------------------------------------------------------------------

const MD_SET_KNOWN_KEYS = ["working_title", "options"];
const MD_OPTION_KNOWN_KEYS = ["title", "subtitle", "rationale"];

function optionMarkdown(
  option: Record<string, unknown>,
  index: number,
): string {
  const title = nonEmptyString(option.title) ?? `Option ${index + 1}`;
  const subtitle = nonEmptyString(option.subtitle);

  const blocks: Array<string | null> = [
    `## ${title}`,
    subtitle ? `*${subtitle}*` : null,
    nonEmptyString(option.rationale),
  ];

  const extrasBlock = additionalDetailsSection(
    collectExtras(option, MD_OPTION_KNOWN_KEYS),
  );
  if (extrasBlock) blocks.push(extrasBlock);

  return joinBlocks(blocks);
}

export function episodeTitleOptionsMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const options = Array.isArray(value.options)
    ? value.options.filter(isRecordValue)
    : [];
  const workingTitle = nonEmptyString(value.working_title);

  return joinBlocks([
    `# Title Options`,
    workingTitle ? `Current title: ${workingTitle}` : null,
    ...options.map(optionMarkdown),
    additionalDetailsSection(collectExtras(value, MD_SET_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const EPISODE_TITLE_OPTIONS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "episode_title_options",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "episode_title_options",
    toLegacyServerData: episodeTitleOptionsServerDataFromEnvelope,
    toMarkdown: episodeTitleOptionsMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: episodeTitleOptionsKindSchema,
  },
  {
    kind: "episode_title_option",
    schemaSource: "system",
    tier: "eager",
    schema: episodeTitleOptionKindSchema,
  },
];
