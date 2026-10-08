/**
 * A chain is ordered by `chain_version`, never by `version` (the row-revision
 * token every UPDATE bumps). Live shape, 2026-10-08: page v1 relinked to its
 * publication read `version` 4, its v2 read `version` 2 — "latest by version"
 * picked v1, so the canvas tab's Source showed v1 under a v2 preview.
 */
import { describe, expect, it } from "@jest/globals";
import { chainVersionOf, latestChainRow } from "../versionChainOwner";

const v1 = { id: "v1", version: 4, chain_version: 1 };
const v2 = { id: "v2", version: 2, chain_version: 2 };

describe("version chain order", () => {
  it("the latest is the highest chain_version, not the most-updated row", () => {
    expect(latestChainRow([v1, v2])?.id).toBe("v2");
    expect(latestChainRow([v2, v1])?.id).toBe("v2");
  });

  it("labels a row by its chain number", () => {
    expect(chainVersionOf(v1)).toBe(1);
    expect(chainVersionOf({ version: 3 })).toBe(3);
  });

  it("an empty chain has no latest", () => {
    expect(latestChainRow([])).toBeNull();
  });
});
