/**
 * Fingerprint parity vectors — pins the TS implementation against refactors.
 *
 * `fingerprint-vectors.json` is the SHARED cross-language contract: its twin
 * (aidream `packages/matrx-ai/tests/fixtures/fingerprint_vectors.json`) must
 * stay byte-identical, and the Python implementation
 * (`packages/matrx-ai/matrx_ai/processing/blocks/fingerprint.py`) asserts the
 * same vectors. This is the hard gate for aidream emitting `metadata.__ir`
 * envelopes (see docs/PYTHON_ENVELOPE_CONTRACT.md): a fingerprint mismatch
 * silently degrades every server envelope to an FE re-parse.
 *
 * If this test fails after a fingerprint change, the algorithm changed —
 * that is a WIRE FORMAT break. Never regenerate the vectors to make it pass
 * without porting the identical change to Python and regenerating BOTH twins.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { createFingerprinter, fingerprintText } from "../core/fingerprint";

interface FingerprintVector {
  name: string;
  input: string;
  fingerprint: string;
}

interface VectorFile {
  _comment: string;
  vectors: FingerprintVector[];
}

const vectorFile = JSON.parse(
  readFileSync(join(__dirname, "fingerprint-vectors.json"), "utf8"),
) as VectorFile;

describe("fingerprint parity vectors", () => {
  it("loads a non-empty vector set", () => {
    expect(vectorFile.vectors.length).toBeGreaterThanOrEqual(16);
  });

  it("covers the surrogate-pair trap classes", () => {
    const names = new Set(vectorFile.vectors.map((v) => v.name));
    for (const required of [
      "empty",
      "emoji_single",
      "astral_clef",
      "lone_high_surrogate",
      "lone_low_surrogate",
      "large_kind_region_10kb",
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });

  it.each(vectorFile.vectors.map((v) => [v.name, v] as const))(
    "fingerprintText reproduces vector %s",
    (_name, vector) => {
      expect(fingerprintText(vector.input)).toBe(vector.fingerprint);
    },
  );

  it.each(vectorFile.vectors.map((v) => [v.name, v] as const))(
    "incremental fingerprinter matches one-shot for %s",
    (_name, vector) => {
      // Chunk at 3-unit boundaries: for astral inputs this deliberately
      // SPLITS surrogate pairs across push() calls — the incremental form
      // must still equal the one-shot fingerprint of the concatenation.
      const hasher = createFingerprinter();
      for (let i = 0; i < vector.input.length; i += 3) {
        hasher.push(vector.input.slice(i, i + 3));
      }
      expect(hasher.current()).toBe(vector.fingerprint);
    },
  );
});
