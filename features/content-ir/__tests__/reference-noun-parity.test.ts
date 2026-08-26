/**
 * REFERENCE_TYPES ↔ server registry parity (adversarial finding A-10.2).
 *
 * The FE offers every noun in `REFERENCE_TYPES` to authoring surfaces (the
 * messaging attach button, context-value pickers), and `buildReferenceFence`
 * mints `directive_v1_reference_<noun>` for whichever the user picks. A noun
 * the server registry does not carry is therefore a fence the server cannot
 * resolve — exactly what happened with `url`, minted live by the attach flow
 * while the registry had no such shape.
 *
 * This asserts every FE noun against the committed registry mirror
 * (`docs/protocol/kind_directive_registry.generated.json`, byte-synced from
 * aidream by `pnpm check:protocol-sync`), offline, so it runs in CI. Adding a
 * noun to REFERENCE_TYPES now REQUIRES registering the shape server-side and
 * syncing the mirror first.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REFERENCE_TYPES } from "@/features/matrx-envelope/envelope";

interface RegistryShape {
  class: string;
  noun: string;
  slug: string;
}

const registry = JSON.parse(
  readFileSync(
    join(process.cwd(), "docs/protocol/kind_directive_registry.generated.json"),
    "utf8",
  ),
) as { shapes: RegistryShape[] };

const serverReferenceNouns = new Set(
  registry.shapes.filter((s) => s.class === "reference").map((s) => s.noun),
);

describe("REFERENCE_TYPES ↔ kind directive registry parity", () => {
  it("every FE reference noun is a registered server shape", () => {
    const missing = REFERENCE_TYPES.filter(
      (noun) => !serverReferenceNouns.has(noun),
    );
    expect(missing).toEqual([]);
  });

  it("the registry actually loaded (guard cannot pass on an empty mirror)", () => {
    expect(serverReferenceNouns.size).toBeGreaterThan(30);
    expect(serverReferenceNouns.has("url")).toBe(true);
  });
});
