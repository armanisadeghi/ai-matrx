// features/education/memory/types.ts
//
// Memory Tools (VISION §11) content model. A generated memory aid is a
// `study_media` row with `media_kind='memory_aid'`; its structured content (the
// `MemoryAidPayload`) rides the existing `ir_envelope` jsonb column — exactly
// like a mind map's diagram_spec. No new table, no new columns.
//
// The agent emits these shapes; the coercers below narrow raw agent output to
// the contract without ever throwing (same discipline as trust/types.ts).

/** A single mnemonic device for a hard list / sequence / term. */
export type MnemonicTechnique =
  | "acronym"
  | "acrostic"
  | "rhyme"
  | "sentence"
  | "keyword"
  | "chunking";

export interface Mnemonic {
  __kind: "mnemonic";
  technique: MnemonicTechnique;
  /** The exact list / term / sequence this device helps memorize. */
  target: string;
  /** The mnemonic itself (the acronym, sentence, rhyme, …). */
  device: string;
  /** How each part of the device maps back to the material. */
  explanation: string;
}

/** An analogy / memory bridge for an abstract concept. */
export interface Analogy {
  __kind: "analogy";
  concept: string;
  analogy: string;
  /** How the analogy corresponds to the concept (the named mapping). */
  mapping: string;
}

/** One placed item in a memory-palace (method-of-loci) journey. */
export interface PalaceLocus {
  __kind: "locus";
  place: string;
  item: string;
  /** The vivid, exaggerated image placed at this locus. */
  image: string;
}

/** Spatial memory scaffold for a large ordered set (or `applicable:false`). */
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

/** Techniques the per-card proactive hint can use (a superset of MnemonicTechnique). */
export type HintTechnique = MnemonicTechnique | "analogy" | "association";

/** One glanceable memory aid for a single flashcard (the proactive lane). */
export interface MemoryHintPayload {
  __kind: "memory_hint";
  technique: HintTechnique;
  aid: string;
  explanation: string;
}

/** Persisted memory-aid generation config (rides in study_media.config). */
export interface MemoryGenConfig {
  /** A short user prompt/hint appended to the source brief, if any. */
  focus?: string;
  /** Counts, cached for a glance in the library list. */
  mnemonicCount: number;
  analogyCount: number;
  hasPalace: boolean;
}

// ── Coercers (never throw; narrow unknown agent output → the contract) ────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

const MNEMONIC_TECHNIQUES: readonly MnemonicTechnique[] = [
  "acronym",
  "acrostic",
  "rhyme",
  "sentence",
  "keyword",
  "chunking",
];

const HINT_TECHNIQUES: readonly HintTechnique[] = [
  ...MNEMONIC_TECHNIQUES,
  "analogy",
  "association",
];

function coerceMnemonic(raw: unknown): Mnemonic | null {
  if (!isRecord(raw)) return null;
  const device = asStr(raw.device ?? raw.aid);
  const target = asStr(raw.target ?? raw.for);
  if (!device && !target) return null;
  const techRaw = asStr(raw.technique);
  const technique: MnemonicTechnique = MNEMONIC_TECHNIQUES.includes(
    techRaw as MnemonicTechnique,
  )
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
      return {
        __kind: "locus",
        place: asStr(l.place),
        item,
        image,
      };
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
 * Narrow an unknown agent-emitted value to a MemoryAidPayload. Returns null when
 * there's no usable memory-aid content at all (so callers can fail honestly).
 */
export function coerceMemoryAid(raw: unknown): MemoryAidPayload | null {
  if (!isRecord(raw)) return null;
  const mnemonics = (Array.isArray(raw.mnemonics) ? raw.mnemonics : [])
    .map(coerceMnemonic)
    .filter((m): m is Mnemonic => m !== null);
  const analogies = (Array.isArray(raw.analogies) ? raw.analogies : [])
    .map(coerceAnalogy)
    .filter((a): a is Analogy => a !== null);
  const memoryPalace = coercePalace(raw.memory_palace ?? raw.memoryPalace);
  // Nothing usable at all ⇒ not a valid aid.
  if (mnemonics.length === 0 && analogies.length === 0 && !memoryPalace.applicable) {
    return null;
  }
  return {
    __kind: "memory_aid",
    title: asStr(raw.title) || "Memory aids",
    strategyNote: asStr(raw.strategy_note ?? raw.strategyNote) || null,
    mnemonics,
    analogies,
    memoryPalace,
  };
}

/** Narrow an unknown agent-emitted value to a MemoryHintPayload (never throws). */
export function coerceMemoryHint(raw: unknown): MemoryHintPayload | null {
  if (!isRecord(raw)) return null;
  const aid = asStr(raw.aid ?? raw.device);
  if (!aid) return null;
  const techRaw = asStr(raw.technique);
  const technique: HintTechnique = HINT_TECHNIQUES.includes(
    techRaw as HintTechnique,
  )
    ? (techRaw as HintTechnique)
    : "association";
  return {
    __kind: "memory_hint",
    technique,
    aid,
    explanation: asStr(raw.explanation),
  };
}

/** Counts for the library list + config, derived from a payload. */
export function memoryAidCounts(payload: MemoryAidPayload): MemoryGenConfig {
  return {
    mnemonicCount: payload.mnemonics.length,
    analogyCount: payload.analogies.length,
    hasPalace: payload.memoryPalace.applicable,
  };
}
