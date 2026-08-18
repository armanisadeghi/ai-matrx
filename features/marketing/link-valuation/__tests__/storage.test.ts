/**
 * Storage-layer invariants.
 *
 * These exist because the recovery path — the thing built to save a user from a
 * broken config — was itself capable of throwing away their other tuned configs.
 * A repair that destroys data is worse than the fault it repairs.
 */

import { MATRX_V1_CONFIG } from "../configs/matrx-v1";
import { SHEET_2018_CONFIG } from "../configs/sheet-2018";
import {
  hasLocalEdits,
  listConfigs,
  loadConfig,
  resetConfig,
  saveConfig,
} from "../storage";
import type { LinkValuationConfig } from "../types";

const tuned = (
  base: LinkValuationConfig,
  name: string,
): LinkValuationConfig => ({
  ...base,
  name,
  buckets: base.buckets.map((bucket) => ({
    ...bucket,
    weight: bucket.weight + 1,
  })),
});

describe("saved configs survive one another's repair", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps every other saved config when one is discarded", () => {
    saveConfig(tuned(MATRX_V1_CONFIG, "My tuned v1"));
    saveConfig(tuned(SHEET_2018_CONFIG, "My tuned sheet"));
    saveConfig({ ...tuned(MATRX_V1_CONFIG, "A custom one"), id: "custom-1" });

    resetConfig(MATRX_V1_CONFIG.id);

    const remaining = listConfigs();
    expect(loadConfig(SHEET_2018_CONFIG.id)?.name).toBe("My tuned sheet");
    expect(loadConfig("custom-1")?.name).toBe("A custom one");
    // ...and the discarded one is back to the version that ships with the code.
    expect(loadConfig(MATRX_V1_CONFIG.id)?.name).toBe(MATRX_V1_CONFIG.name);
    expect(remaining.map((entry) => entry.id)).toContain("custom-1");
  });

  it("reports local edits accurately after a reset", () => {
    saveConfig(tuned(MATRX_V1_CONFIG, "My tuned v1"));
    expect(hasLocalEdits(MATRX_V1_CONFIG.id)).toBe(true);
    resetConfig(MATRX_V1_CONFIG.id);
    expect(hasLocalEdits(MATRX_V1_CONFIG.id)).toBe(false);
  });

  it("falls back to the shipped configs when storage holds garbage", () => {
    window.localStorage.setItem(
      "matrx.link-valuation.configs.v1",
      "{ not json",
    );
    expect(listConfigs().map((entry) => entry.id)).toContain(
      MATRX_V1_CONFIG.id,
    );
  });
});
