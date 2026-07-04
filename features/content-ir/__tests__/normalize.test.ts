import { fingerprintText } from "../core/fingerprint";
import {
  isCanonicalBlockIR,
  normalizeJsonRegion,
  reuseEnvelopeIfCurrent,
} from "../core/normalize";
import {
  FLASHCARD_SCHEMAS,
  FLASHCARD_SET_JSON,
  FLASHCARD_SET_WITH_EXTRAS_JSON,
  UNKNOWN_KIND_JSON,
} from "./fixtures/flashcards-fixture";

describe("fingerprintText", () => {
  it("is stable for identical input", () => {
    expect(fingerprintText(FLASHCARD_SET_JSON)).toBe(
      fingerprintText(FLASHCARD_SET_JSON),
    );
  });

  it("changes when the input changes", () => {
    expect(fingerprintText(FLASHCARD_SET_JSON)).not.toBe(
      fingerprintText(FLASHCARD_SET_JSON + " "),
    );
  });
});

describe("normalizeJsonRegion", () => {
  it("produces a resolved envelope for a valid kind region", () => {
    const envelope = normalizeJsonRegion(FLASHCARD_SET_JSON, {
      schemas: FLASHCARD_SCHEMAS,
    });

    expect(isCanonicalBlockIR(envelope)).toBe(true);
    expect(envelope.engine).toBe("fe-kind-parser");
    expect(envelope.root.kind).toBe("flashcard_set");
    expect(envelope.root.kindState).toBe("resolved");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.value.set_title).toBe("Cell Biology");
    expect(Array.isArray(envelope.root.value.cards)).toBe(true);
    // Child card metadata is indexed by path.
    expect(envelope.nodeIndex?.["cards.0"]).toEqual({
      kind: "flashcard",
      kindState: "resolved",
      status: "complete",
    });
  });

  it("carries residue extras on the root node", () => {
    const envelope = normalizeJsonRegion(FLASHCARD_SET_WITH_EXTRAS_JSON, {
      schemas: FLASHCARD_SCHEMAS,
    });
    expect(envelope.root.residue?.extra?.audio_url).toBe(
      "https://example.com/set.mp3",
    );
  });

  it("degrades unknown kinds to a raw root without erroring", () => {
    const envelope = normalizeJsonRegion(UNKNOWN_KIND_JSON, {
      schemas: FLASHCARD_SCHEMAS,
    });
    expect(envelope.root.kindState).toBe("raw");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.value.title).toBe("nobody registered me");
    expect(
      envelope.root.residue?.notices?.some((n) => n.code === "raw_fallback"),
    ).toBe(true);
  });

  it("marks malformed input as status error, never throws", () => {
    const envelope = normalizeJsonRegion('{"__kind": "flashcard_set", "x": ', {
      schemas: FLASHCARD_SCHEMAS,
    });
    expect(envelope.root.status).toBe("error");
    expect(
      envelope.root.residue?.notices?.some((n) => n.code === "parse_error"),
    ).toBe(true);
  });
});

describe("THE IDEMPOTENCE LAW", () => {
  it("normalize(normalize(x)) === normalize(x) — by reference", () => {
    const first = normalizeJsonRegion(FLASHCARD_SET_JSON, {
      schemas: FLASHCARD_SCHEMAS,
    });
    const second = normalizeJsonRegion(FLASHCARD_SET_JSON, {
      schemas: FLASHCARD_SCHEMAS,
      existing: first,
    });
    expect(second).toBe(first); // reference equality — zero reprocessing
  });

  it("reuseEnvelopeIfCurrent returns the envelope only when fingerprints match", () => {
    const envelope = normalizeJsonRegion(FLASHCARD_SET_JSON, {
      schemas: FLASHCARD_SCHEMAS,
    });

    expect(reuseEnvelopeIfCurrent(FLASHCARD_SET_JSON, envelope)).toBe(envelope);
    expect(
      reuseEnvelopeIfCurrent(FLASHCARD_SET_WITH_EXTRAS_JSON, envelope),
    ).toBeNull();
    expect(reuseEnvelopeIfCurrent(FLASHCARD_SET_JSON, { v: 1 })).toBeNull();
    expect(reuseEnvelopeIfCurrent(FLASHCARD_SET_JSON, null)).toBeNull();
  });

  it("a stale envelope (edited source) forces a re-parse with a new fingerprint", () => {
    const original = normalizeJsonRegion(FLASHCARD_SET_JSON, {
      schemas: FLASHCARD_SCHEMAS,
    });
    const editedSource = FLASHCARD_SET_JSON.replace(
      "Cell Biology",
      "Molecular Biology",
    );
    const reparsed = normalizeJsonRegion(editedSource, {
      schemas: FLASHCARD_SCHEMAS,
      existing: original,
    });

    expect(reparsed).not.toBe(original);
    expect(reparsed.root.value.set_title).toBe("Molecular Biology");
    expect(reparsed.fingerprint).not.toBe(original.fingerprint);
  });
});
