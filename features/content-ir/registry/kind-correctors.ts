/**
 * Kind correctors — a registered kind's value made to agree with its own rules BEFORE any
 * renderer sees it. The client twin of aidream's
 * `matrx_ai/processing/blocks/kind_correctors.py`.
 *
 * `draft_critique` (the Tough Editor) is the first: "the scale mapping is applied by code
 * from the points, so the score can never disagree with the rubric". A renderer is never the
 * place to fix it — a kind can be drawn by a compiled bridge, a db component, or the generic
 * floor, and any one that forgot would show the model's arithmetic.
 *
 * THE ONE STEP. Every envelope this app builds comes from one of three kernel constructors —
 * `envelopeFromCompleteValue` (stored values: reload, partial, nested kinds, XML finalize,
 * progress data), `normalizeJsonRegion` (complete text: DB-loaded messages, the re-split) and
 * a `ParseSession`'s `buildEnvelope()` (the live stream, live previews). This module owns the
 * corrected form of all three, and `kind-correctors.guard.test.ts` refuses any host file that
 * calls a raw constructor — so a new render path inherits the correction or fails CI.
 * Direct-object renders (`KindInstanceRender`, the shape preview's "direct" path, every
 * kind-instance load) correct their value in the host binding, and the db-component reader
 * corrects whatever still reaches it uncorrected (a pasted block with no envelope).
 *
 * NEVER SILENT. A correction travels ON the envelope as a `residue.notices` entry with code
 * `kind_corrected` — the envelope's own structured-warning channel, so it survives
 * serialization, persistence and reload — and `kindCorrectionsOf(metadata)` reads those plus
 * the server's `metadata.kindCorrections`. A corrector that throws leaves the value as written
 * and says it could not be checked; it never blocks a render.
 */

import {
  envelopeFromCompleteValue as rawEnvelopeFromCompleteValue,
  normalizeJsonRegion as rawNormalizeJsonRegion,
  IR_ENVELOPE_KEY,
  isCanonicalBlockIR,
  type CanonicalBlockIR,
} from "@ai-matrx/content-ir";
import { correctDraftCritique, type DraftCritique } from "@/features/crm/draft-critique/draftCritique";

/** Block metadata key the SERVER uses for the corrections it made (same as aidream). */
export const KIND_CORRECTIONS_KEY = "kindCorrections";
/** The `residue.notices` code a client-side correction is recorded under. */
export const KIND_CORRECTED_NOTICE = "kind_corrected";

type KindCorrector = (value: Record<string, unknown>) => {
  value: Record<string, unknown>;
  corrections: string[];
};

const CORRECTORS: Record<string, KindCorrector> = {
  draft_critique: (value) => {
    const result = correctDraftCritique(value as DraftCritique);
    return { value: result.critique, corrections: result.corrections };
  },
};

export function hasKindCorrector(kind: string | null | undefined): boolean {
  return typeof kind === "string" && kind in CORRECTORS;
}

/**
 * The value made to agree with its kind's rules, plus one line per change. Returns the SAME
 * reference and no lines when there is no corrector or nothing to change.
 */
export function correctKindValue(
  kind: string | null | undefined,
  value: unknown,
): { value: unknown; corrections: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value, corrections: [] };
  const slug = kind ?? (value as Record<string, unknown>).__kind;
  const corrector = typeof slug === "string" ? CORRECTORS[slug] : undefined;
  if (!corrector) return { value, corrections: [] };
  try {
    const out = corrector(value as Record<string, unknown>);
    if (out.corrections.length === 0) return { value, corrections: [] };
    console.warn(`[content-ir] ${slug} corrected before render: ${out.corrections.join("; ")}`);
    return { value: out.value, corrections: out.corrections };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[content-ir] ${slug} corrector failed: ${reason} — shown as written`);
    return {
      value,
      corrections: [`${slug} could not be checked against its own rules (${reason}); shown as written`],
    };
  }
}

/**
 * The envelope with its COMPLETE root value corrected and each change recorded as a
 * `kind_corrected` notice. Idempotent (an envelope already carrying the notice, or with
 * nothing to change, comes back by reference); a streaming root is never touched — half a
 * value cannot be scored.
 */
export function correctKindEnvelope<T extends CanonicalBlockIR | null | undefined>(envelope: T): T {
  if (!envelope || !isCanonicalBlockIR(envelope)) return envelope;
  const root = envelope.root;
  if (root.status !== "complete" || !hasKindCorrector(root.kind)) return envelope;
  if (root.residue?.notices?.some((n) => n.code === KIND_CORRECTED_NOTICE)) return envelope;
  const { value, corrections } = correctKindValue(root.kind, root.value);
  if (corrections.length === 0) return envelope;
  const notices = [
    ...(root.residue?.notices ?? []),
    ...corrections.map((message) => ({ code: KIND_CORRECTED_NOTICE, message })),
  ];
  return {
    ...envelope,
    root: {
      ...root,
      value: value as Record<string, unknown>,
      residue: {
        extra: root.residue?.extra ?? null,
        optionalMissing: root.residue?.optionalMissing ?? null,
        notices,
      },
    },
  } as T;
}

/** `envelopeFromCompleteValue`, corrected. The only form host code may call. */
export function envelopeFromCompleteValue(
  ...args: Parameters<typeof rawEnvelopeFromCompleteValue>
): CanonicalBlockIR {
  return correctKindEnvelope(rawEnvelopeFromCompleteValue(...args));
}

/** `normalizeJsonRegion`, corrected. The only form host code may call. */
export function normalizeJsonRegion(
  ...args: Parameters<typeof rawNormalizeJsonRegion>
): CanonicalBlockIR {
  return correctKindEnvelope(rawNormalizeJsonRegion(...args));
}

/** A `ParseSession`'s envelope, corrected once it is complete. Wrap every `buildEnvelope()`. */
export function sessionEnvelope(session: { buildEnvelope(): CanonicalBlockIR } | null | undefined): CanonicalBlockIR | null {
  return session ? correctKindEnvelope(session.buildEnvelope()) : null;
}

/** Every correction a block carries: the server's list plus the envelope's own notices. */
export function kindCorrectionsOf(metadata: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  const server = metadata?.[KIND_CORRECTIONS_KEY];
  if (Array.isArray(server)) {
    for (const line of server) if (typeof line === "string" && line.trim()) out.push(line);
  }
  const envelope = metadata?.[IR_ENVELOPE_KEY];
  if (isCanonicalBlockIR(envelope)) {
    for (const n of envelope.root.residue?.notices ?? []) {
      if (n.code === KIND_CORRECTED_NOTICE && !out.includes(n.message)) out.push(n.message);
    }
  }
  return out;
}
