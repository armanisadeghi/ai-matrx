/** @jest-environment node */

import { resolvePersistedOrchestrator } from "@/lib/sandbox/orchestrator-routing";

describe("resolvePersistedOrchestrator", () => {
  test.each([
    ["hosted", { tier: "hosted" }, "hosted"],
    ["ec2", { tier: "ec2" }, "ec2"],
    [null, { tier: "hosted" }, "hosted"],
  ])(
    "uses the only valid persisted tier combination %p",
    (tier, config, expected) => {
      const result = resolvePersistedOrchestrator(tier, config);
      expect(result).toMatchObject({
        ok: true,
        orchestrator: { tier: expected },
      });
    },
  );

  test.each([
    ["unknown", { tier: "hosted" }],
    ["hosted", { tier: "ec2" }],
    ["ec2", { tier: "unknown" }],
    [null, { tier: "unknown" }],
    [null, null],
  ])(
    "refuses unsafe tier data before an operation can choose a host",
    (tier, config) => {
      expect(resolvePersistedOrchestrator(tier, config)).toMatchObject({
        ok: false,
      });
    },
  );
});
