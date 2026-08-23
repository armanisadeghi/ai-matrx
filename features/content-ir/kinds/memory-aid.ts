/**
 * `memory_aid` (+ children `mnemonic`, `analogy`, `memory_palace`, `locus`)
 * and the sibling root `memory_hint` — the Education Memory Tools shapes
 * (VISION §11), as registered kinds.
 *
 * Canonical `__kind` JSON shapes:
 *   { "__kind":"memory_aid", "title":"…", "strategy_note":"…",
 *     "mnemonics":  [ { "__kind":"mnemonic", "technique":"acronym",
 *                       "target":"…", "device":"…", "explanation":"…" } ],
 *     "analogies":  [ { "__kind":"analogy", "concept":"…", "analogy":"…",
 *                       "mapping":"…" } ],
 *     "memory_palace": { "__kind":"memory_palace", "applicable":true,
 *       "theme":"…", "loci":[ { "__kind":"locus", "place":"…",
 *                               "item":"…", "image":"…" } ] } }
 *
 *   { "__kind":"memory_hint", "technique":"association",
 *     "aid":"…", "explanation":"…" }
 *
 * WHY TWO ROOTS. `memory_aid` is the full artifact (persisted to
 * `education.study_media.ir_envelope`, media_kind='memory_aid'); `memory_hint`
 * is the one-glance per-flashcard aid (persisted as an `fc_detail` layer).
 * They are produced by different agents with different cost profiles and are
 * consumed by different surfaces — folding the hint into the aid would force
 * the cheap per-card lane to emit a whole artifact envelope.
 *
 * HISTORY. Both shapes shipped 2026-07-13 UNREGISTERED — the education
 * feature hand-rolled their renderers (`MemoryAidView`, inline JSX in
 * `MemoryAidButton`) and the LiveRunWindow showed raw JSON while the agents
 * streamed them (the exact defect the registry exists to kill; logged in
 * docs/handoffs/canonical-component-sweep.md). This file is the registration;
 * the canonical components are `MemoryAidBlock` / `MemoryHintBlock`
 * (components/mardown-display/blocks/memory-aid/). The education feature's
 * `features/education/memory/types.ts` re-exports THESE types and coercers —
 * one contract, one implementation.
 *
 * The bridge is STREAMING (media-chapters precedent, NOT
 * makeCompleteEnvelopeBridge): `mnemonics` / `analogies` / `loci` are arrays
 * of child kinds, so the kernel commits them element-by-element and each aid
 * appears in the live run window as it parses. An empty section is a NORMAL
 * mid-stream state the component renders — never a spinner, never raw JSON.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { KIND_KEY } from "@ai-matrx/content-ir";

// ---------------------------------------------------------------------------
// Shared vocabulary — the technique enums both shapes draw from.
// ---------------------------------------------------------------------------

export const MNEMONIC_TECHNIQUES = [
  "acronym",
  "acrostic",
  "rhyme",
  "sentence",
  "keyword",
  "chunking",
] as const;

export type MnemonicTechnique = (typeof MNEMONIC_TECHNIQUES)[number];

export const HINT_TECHNIQUES = [
  ...MNEMONIC_TECHNIQUES,
  "analogy",
  "association",
] as const;

export type HintTechnique = (typeof HINT_TECHNIQUES)[number];

// ---------------------------------------------------------------------------
// Schemas — the single source the storage rows (`data[]` + kind_edge) and the
// emitted JSON Schemas are GENERATED from (kindSchemaToStorage /
// kindSchemaToJsonSchema), never hand-written twice.
// ---------------------------------------------------------------------------

export const mnemonicKindSchema: KindSchema = {
  kind: "mnemonic",
  fields: {
    technique: {
      type: "enum",
      values: [...MNEMONIC_TECHNIQUES],
      required: true,
      description:
        "Which mnemonic device family this is. Pick the one that genuinely fits the material — never force an acronym onto prose.",
    },
    target: {
      type: "string",
      required: true,
      description:
        "The exact list, term, or sequence this device helps memorize, quoted from the source material.",
    },
    device: {
      type: "string",
      required: true,
      description:
        "The mnemonic itself — the acronym, sentence, rhyme, keyword image, or chunking scheme.",
    },
    explanation: {
      type: "string",
      description:
        "How each part of the device maps back to the material, so the learner can decode it later.",
    },
  },
};

export const analogyKindSchema: KindSchema = {
  kind: "analogy",
  fields: {
    concept: {
      type: "string",
      required: true,
      description: "The abstract concept being bridged.",
    },
    analogy: {
      type: "string",
      required: true,
      description:
        "The relatable everyday thing the concept is like — one sentence.",
    },
    mapping: {
      type: "string",
      description:
        "The correspondence spelled out: which part of the analogy stands for which part of the concept.",
    },
  },
};

export const locusKindSchema: KindSchema = {
  kind: "locus",
  fields: {
    place: {
      type: "string",
      required: true,
      description:
        "One stop on the journey — a concrete location in the palace theme.",
    },
    item: {
      type: "string",
      required: true,
      description: "The material placed at this stop.",
    },
    image: {
      type: "string",
      description:
        "The vivid, exaggerated mental image binding the item to the place.",
    },
  },
};

export const memoryPalaceKindSchema: KindSchema = {
  kind: "memory_palace",
  fields: {
    applicable: {
      type: "boolean",
      required: true,
      description:
        "False when the material does not warrant a palace (small or unordered sets) — then theme is empty and loci is []. Never force a palace.",
    },
    theme: {
      type: "string",
      description:
        "The journey's setting (a house, a walk to school) — empty when not applicable.",
    },
    loci: {
      type: "array",
      itemKinds: ["locus"],
      required: true,
      description:
        "The ordered stops of the journey — [] when not applicable.",
    },
  },
};

export const memoryAidKindSchema: KindSchema = {
  kind: "memory_aid",
  fields: {
    title: {
      type: "string",
      required: true,
      description: "Short human title for this set of aids.",
    },
    strategy_note: {
      type: "string",
      description:
        "One or two sentences on how to use these aids together while studying.",
    },
    mnemonics: {
      type: "array",
      itemKinds: ["mnemonic"],
      required: true,
      description:
        "Mnemonic devices for the hard lists, sequences, and terms — [] when none fit.",
    },
    analogies: {
      type: "array",
      itemKinds: ["analogy"],
      required: true,
      description:
        "Analogies / memory bridges for the abstract concepts — [] when none fit.",
    },
    memory_palace: {
      type: "object",
      kind: "memory_palace",
      required: true,
      description:
        "Method-of-loci scaffold for a large ordered set, or applicable:false when the material doesn't warrant one.",
    },
  },
};

export const memoryHintKindSchema: KindSchema = {
  kind: "memory_hint",
  fields: {
    technique: {
      type: "enum",
      values: [...HINT_TECHNIQUES],
      required: true,
      description: "The aid family used for this one hint.",
    },
    aid: {
      type: "string",
      required: true,
      description:
        "The one glanceable memory aid itself — short enough to absorb without leaving the card.",
    },
    explanation: {
      type: "string",
      description: "One sentence on how the aid maps to the card.",
    },
  },
};

export const MEMORY_AID_KIND_SCHEMAS: KindSchema[] = [
  memoryAidKindSchema,
  mnemonicKindSchema,
  analogyKindSchema,
  memoryPalaceKindSchema,
  locusKindSchema,
  memoryHintKindSchema,
];

// ---------------------------------------------------------------------------
// Data contract + coercers — THE one implementation. The education feature
// (features/education/memory/types.ts) re-exports these; never fork a copy.
// Coercers never throw: they narrow raw agent output to the contract,
// tolerating the field aliases real runs have produced (aid/device,
// target/for, strategy_note/strategyNote, memory_palace/memoryPalace).
// ---------------------------------------------------------------------------

export interface Mnemonic {
  __kind: "mnemonic";
  technique: MnemonicTechnique;
  target: string;
  device: string;
  explanation: string;
}

export interface Analogy {
  __kind: "analogy";
  concept: string;
  analogy: string;
  mapping: string;
}

export interface PalaceLocus {
  __kind: "locus";
  place: string;
  item: string;
  image: string;
}

export interface MemoryPalace {
  __kind: "memory_palace";
  applicable: boolean;
  theme: string;
  loci: PalaceLocus[];
}

/** THE structured memory-aid artifact (persisted in study_media.ir_envelope). */
export interface MemoryAidPayload {
  __kind: "memory_aid";
  title: string;
  strategyNote: string | null;
  mnemonics: Mnemonic[];
  analogies: Analogy[];
  memoryPalace: MemoryPalace;
}

/** One glanceable memory aid for a single flashcard (the proactive lane). */
export interface MemoryHintPayload {
  __kind: "memory_hint";
  technique: HintTechnique;
  aid: string;
  explanation: string;
}

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function coerceMnemonic(raw: unknown): Mnemonic | null {
  if (!isRecord(raw)) return null;
  const device = asStr(raw.device ?? raw.aid);
  const target = asStr(raw.target ?? raw.for);
  if (!device && !target) return null;
  const techRaw = asStr(raw.technique);
  const technique: MnemonicTechnique = (
    MNEMONIC_TECHNIQUES as readonly string[]
  ).includes(techRaw)
    ? (techRaw as MnemonicTechnique)
    : "sentence";
  return {
    __kind: "mnemonic",
    technique,
    target,
    device,
    explanation: asStr(raw.explanation),
  };
}

function coerceAnalogy(raw: unknown): Analogy | null {
  if (!isRecord(raw)) return null;
  const analogy = asStr(raw.analogy);
  const concept = asStr(raw.concept);
  if (!analogy && !concept) return null;
  return {
    __kind: "analogy",
    concept,
    analogy,
    mapping: asStr(raw.mapping),
  };
}

function coercePalace(raw: unknown): MemoryPalace {
  if (!isRecord(raw)) {
    return { __kind: "memory_palace", applicable: false, theme: "", loci: [] };
  }
  const rawLoci = Array.isArray(raw.loci) ? raw.loci : [];
  const loci: PalaceLocus[] = rawLoci
    .map((l): PalaceLocus | null => {
      if (!isRecord(l)) return null;
      const image = asStr(l.image);
      const item = asStr(l.item);
      if (!image && !item) return null;
      return { __kind: "locus", place: asStr(l.place), item, image };
    })
    .filter((l): l is PalaceLocus => l !== null);
  const applicable = raw.applicable === true && loci.length > 0;
  return {
    __kind: "memory_palace",
    applicable,
    theme: asStr(raw.theme),
    loci,
  };
}

/**
 * Narrow an unknown value to the parts of a MemoryAidPayload that are present.
 * Never null: mid-stream the arrays are simply short (or empty), which the
 * component renders as sections filling in. Persistence callers that need
 * "was anything usable produced at all?" use `coerceMemoryAid` below.
 */
export function coerceMemoryAidPartial(raw: unknown): MemoryAidPayload {
  const rec = isRecord(raw) ? raw : {};
  const mnemonics = (Array.isArray(rec.mnemonics) ? rec.mnemonics : [])
    .map(coerceMnemonic)
    .filter((m): m is Mnemonic => m !== null);
  const analogies = (Array.isArray(rec.analogies) ? rec.analogies : [])
    .map(coerceAnalogy)
    .filter((a): a is Analogy => a !== null);
  return {
    __kind: "memory_aid",
    title: asStr(rec.title) || "Memory aids",
    strategyNote: asStr(rec.strategy_note ?? rec.strategyNote) || null,
    mnemonics,
    analogies,
    memoryPalace: coercePalace(rec.memory_palace ?? rec.memoryPalace),
  };
}

/**
 * Narrow an unknown agent-emitted value to a MemoryAidPayload. Returns null
 * when there's no usable memory-aid content at all (so callers can fail
 * honestly instead of persisting an empty artifact).
 */
export function coerceMemoryAid(raw: unknown): MemoryAidPayload | null {
  if (!isRecord(raw)) return null;
  const payload = coerceMemoryAidPartial(raw);
  if (
    payload.mnemonics.length === 0 &&
    payload.analogies.length === 0 &&
    !payload.memoryPalace.applicable
  ) {
    return null;
  }
  return payload;
}

/** Narrow an unknown agent-emitted value to a MemoryHintPayload (never throws). */
export function coerceMemoryHint(raw: unknown): MemoryHintPayload | null {
  if (!isRecord(raw)) return null;
  const aid = asStr(raw.aid ?? raw.device);
  if (!aid) return null;
  const techRaw = asStr(raw.technique);
  const technique: HintTechnique = (
    HINT_TECHNIQUES as readonly string[]
  ).includes(techRaw)
    ? (techRaw as HintTechnique)
    : "association";
  return {
    __kind: "memory_hint",
    technique,
    aid,
    explanation: asStr(raw.explanation),
  };
}

// ---------------------------------------------------------------------------
// serverData bridges — STREAMING: a partial envelope maps to partial data.
// ---------------------------------------------------------------------------

export interface MemoryAidData {
  aid: MemoryAidPayload;
  isComplete: boolean;
}

export interface MemoryHintData {
  hint: MemoryHintPayload | null;
  isComplete: boolean;
}

export function memoryAidServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (MemoryAidData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "memory_aid") return undefined;
  return {
    aid: coerceMemoryAidPartial(envelope.root.value),
    isComplete: envelope.root.status === "complete",
  };
}

export function memoryHintServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (MemoryHintData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "memory_hint") return undefined;
  return {
    hint: coerceMemoryHint(envelope.root.value),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facets — the aids as readable text.
// ---------------------------------------------------------------------------

const AID_MD_KNOWN_KEYS = [
  "title",
  "strategy_note",
  "strategyNote",
  "mnemonics",
  "analogies",
  "memory_palace",
  "memoryPalace",
  KIND_KEY,
];

export function memoryAidMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const aid = coerceMemoryAidPartial(value);
  const mnemonics =
    aid.mnemonics.length > 0
      ? aid.mnemonics
          .map(
            (m) =>
              `- **${m.device}** (${m.technique}${m.target ? ` — for ${m.target}` : ""})${m.explanation ? `\n  ${m.explanation}` : ""}`,
          )
          .join("\n")
      : null;
  const analogies =
    aid.analogies.length > 0
      ? aid.analogies
          .map(
            (a) =>
              `- **${a.concept}** is like ${a.analogy}${a.mapping ? `\n  ${a.mapping}` : ""}`,
          )
          .join("\n")
      : null;
  const palace = aid.memoryPalace.applicable
    ? aid.memoryPalace.loci
        .map(
          (l, i) =>
            `${i + 1}. **${l.place}** — ${l.item}${l.image ? ` (${l.image})` : ""}`,
        )
        .join("\n")
    : null;

  return joinBlocks([
    `# ${aid.title}`,
    aid.strategyNote,
    mnemonics ? joinBlocks(["## Mnemonics", mnemonics]) : null,
    analogies ? joinBlocks(["## Analogies & memory bridges", analogies]) : null,
    palace
      ? joinBlocks([
          `## Memory palace${aid.memoryPalace.theme ? ` — ${aid.memoryPalace.theme}` : ""}`,
          palace,
        ])
      : null,
    additionalDetailsSection(collectExtras(value, AID_MD_KNOWN_KEYS)),
  ]);
}

const HINT_MD_KNOWN_KEYS = ["technique", "aid", "explanation", KIND_KEY];

export function memoryHintMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const hint = coerceMemoryHint(value);
  if (!hint) return "_(no memory aid yet)_";
  return joinBlocks([
    `**${hint.aid}** (${hint.technique})`,
    hint.explanation || null,
    additionalDetailsSection(collectExtras(value, HINT_MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const MEMORY_AID_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "memory_aid",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "memory_aid",
    toLegacyServerData: memoryAidServerDataFromEnvelope,
    toMarkdown: memoryAidMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: memoryAidKindSchema,
  },
  {
    kind: "mnemonic",
    schemaSource: "system",
    tier: "eager",
    schema: mnemonicKindSchema,
  },
  {
    kind: "analogy",
    schemaSource: "system",
    tier: "eager",
    schema: analogyKindSchema,
  },
  {
    kind: "memory_palace",
    schemaSource: "system",
    tier: "eager",
    schema: memoryPalaceKindSchema,
  },
  {
    kind: "locus",
    schemaSource: "system",
    tier: "eager",
    schema: locusKindSchema,
  },
  {
    kind: "memory_hint",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "memory_hint",
    toLegacyServerData: memoryHintServerDataFromEnvelope,
    toMarkdown: memoryHintMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "card",
    schema: memoryHintKindSchema,
  },
];
