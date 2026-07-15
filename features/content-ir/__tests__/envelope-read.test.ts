/**
 * core/envelope-read.ts — the PURE inbound-envelope gate (twin rider 1).
 *
 * Proves the three verdicts and the hook wiring without any host machinery:
 * absent → same reference back; valid → same reference back + seed hook;
 * malformed → stripped COPY + loud report hook. The frontend host shell
 * (redux/render-block-envelope.ts) and aidream's Workflow Studio both bind
 * these hooks — this suite is the shared contract.
 */

import {
  classifyInboundEnvelopeMetadata,
  readEnvelope,
  sanitizeInboundEnvelopeMetadata,
} from "../core/envelope-read";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import { envelopeFromCompleteValue } from "../core/normalize";

const VALID_ENVELOPE = envelopeFromCompleteValue(
  { __kind: "flashcard_set", title: "Cells", cards: [] },
  "flashcard_set",
);

const MALFORMED = { engine: "py-block-detector", nonsense: true };

describe("readEnvelope", () => {
  it("returns the envelope for valid metadata and null otherwise", () => {
    expect(readEnvelope({ [IR_ENVELOPE_KEY]: VALID_ENVELOPE })).toBe(
      VALID_ENVELOPE,
    );
    expect(readEnvelope({ [IR_ENVELOPE_KEY]: MALFORMED })).toBeNull();
    expect(readEnvelope({})).toBeNull();
    expect(readEnvelope(null)).toBeNull();
    expect(readEnvelope(undefined)).toBeNull();
  });
});

describe("classifyInboundEnvelopeMetadata", () => {
  it("passes __ir-less metadata through by reference", () => {
    const metadata = { other: 1 };
    const verdict = classifyInboundEnvelopeMetadata(metadata);
    expect(verdict.outcome).toBe("absent");
    expect(verdict.metadata).toBe(metadata);
  });

  it("returns valid envelopes with the SAME metadata reference (idempotence law)", () => {
    const metadata = { [IR_ENVELOPE_KEY]: VALID_ENVELOPE, other: 1 };
    const verdict = classifyInboundEnvelopeMetadata(metadata);
    expect(verdict).toMatchObject({ outcome: "valid" });
    expect(verdict.metadata).toBe(metadata);
    if (verdict.outcome === "valid") {
      expect(verdict.envelope).toBe(VALID_ENVELOPE);
    }
  });

  it("strips malformed __ir into a COPY, naming the engine", () => {
    const metadata = { [IR_ENVELOPE_KEY]: MALFORMED, keep: "me" };
    const verdict = classifyInboundEnvelopeMetadata(metadata);
    expect(verdict).toMatchObject({ outcome: "malformed", engine: "py-block-detector" });
    expect(verdict.metadata).not.toBe(metadata);
    expect(verdict.metadata).toEqual({ keep: "me" });
    // The original is untouched.
    expect(IR_ENVELOPE_KEY in metadata).toBe(true);
    if (verdict.outcome === "malformed") {
      expect(verdict.raw).toBe(MALFORMED);
    }
  });
});

describe("sanitizeInboundEnvelopeMetadata (pure, hook-injected)", () => {
  it("seeds valid envelopes and returns metadata by reference", () => {
    const seeded: CanonicalBlockIR[] = [];
    const metadata = { [IR_ENVELOPE_KEY]: VALID_ENVELOPE };
    const out = sanitizeInboundEnvelopeMetadata(
      metadata,
      { blockId: "b1" },
      { seedEnvelope: (e) => seeded.push(e) },
    );
    expect(out).toBe(metadata);
    expect(seeded).toEqual([VALID_ENVELOPE]);
  });

  it("reports malformed envelopes loudly and returns the stripped copy", () => {
    const reports: Array<{ blockId: string; engine: string; raw: unknown }> = [];
    const metadata = { [IR_ENVELOPE_KEY]: { engine: 42 }, keep: true };
    const out = sanitizeInboundEnvelopeMetadata(
      metadata,
      { blockId: "b2" },
      { reportMalformed: (info) => reports.push(info) },
    );
    expect(out).toEqual({ keep: true });
    expect(reports).toEqual([
      { blockId: "b2", engine: "unknown", raw: { engine: 42 } },
    ]);
  });

  it("passes envelope-less metadata through untouched, hooks silent", () => {
    const seeded: CanonicalBlockIR[] = [];
    const reports: unknown[] = [];
    const metadata = { plain: true };
    const out = sanitizeInboundEnvelopeMetadata(
      metadata,
      { blockId: "b3" },
      {
        seedEnvelope: (e) => seeded.push(e),
        reportMalformed: (info) => reports.push(info),
      },
    );
    expect(out).toBe(metadata);
    expect(seeded).toEqual([]);
    expect(reports).toEqual([]);
    expect(sanitizeInboundEnvelopeMetadata(null, { blockId: "b4" })).toBeUndefined();
  });
});
