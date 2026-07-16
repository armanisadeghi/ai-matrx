/**
 * Generated kind-surface bootstrap (Wave 1 C2) — parity + integrity.
 *
 * 1. The typed compiled entries and the embedded canonical JSON payload are
 *    the same data (the generator writes both; this proves it without
 *    trusting the generator).
 * 2. The Python twin (aidream kind_surfaces_generated.py) embeds the
 *    byte-identical payload — cross-runtime detection semantics by
 *    construction. Skipped LOUDLY when aidream is not checked out.
 * 3. Every entry the registry floor serves is well-formed and unique.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GENERATED_SURFACE_ENTRIES,
  KIND_SURFACE_BOOTSTRAP_JSON,
  entriesFromBootstrapJson,
} from "../registry/system-surfaces.generated";
import { SYSTEM_SURFACE_ENTRIES } from "../registry/system-surfaces";

const AIDREAM_ROOT =
  process.env.AIDREAM_ROOT ?? resolve(__dirname, "..", "..", "..", "..", "aidream");
const PY_TWIN = resolve(
  AIDREAM_ROOT,
  "packages/matrx-ai/matrx_ai/processing/blocks/kind_surfaces_generated.py",
);

describe("kind-surface generated bootstrap", () => {
  it("typed entries are exactly the canonical payload", () => {
    expect(entriesFromBootstrapJson()).toEqual([...GENERATED_SURFACE_ENTRIES]);
  });

  it("the registry floor consumes the generated entries", () => {
    expect(SYSTEM_SURFACE_ENTRIES).toBe(GENERATED_SURFACE_ENTRIES);
  });

  it("entries are unique per (surfaceType, token) and well-formed", () => {
    expect(GENERATED_SURFACE_ENTRIES.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const e of GENERATED_SURFACE_ENTRIES) {
      const key = `${e.surfaceType} ${e.token}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(e.token).toBe(e.token.toLowerCase());
      expect(e.kind).not.toBe("");
      expect(e.parserStrategy).not.toBe("");
    }
  });

  it("Python twin embeds the byte-identical canonical payload", () => {
    if (!existsSync(PY_TWIN)) {
      // Loud skip — parity is unverifiable without the sibling repo.
      // eslint-disable-next-line no-console
      console.error(
        `SKIPPED LOUDLY: aidream twin not found at ${PY_TWIN} — cross-runtime kind-surface parity NOT verified (set AIDREAM_ROOT).`,
      );
      return;
    }
    const pyText = readFileSync(PY_TWIN, "utf8");
    const m = /KIND_SURFACE_BOOTSTRAP_JSON = '([^']*)'/.exec(pyText);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe(KIND_SURFACE_BOOTSTRAP_JSON);
  });
});
