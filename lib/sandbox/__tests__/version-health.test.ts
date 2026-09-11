import {
  buildSandboxVersionHealth,
  parseDriftBoxes,
} from "@/lib/sandbox/version-health";

describe("sandbox image freshness", () => {
  const base = {
    sandboxId: "sbx-owned",
    tier: "hosted" as const,
    instanceStatus: "running",
    canMigrate: true,
    migrationActionReason: null,
    managerVersion: "1.2.3",
  };

  it("does not call a malformed report current", () => {
    const health = buildSandboxVersionHealth({
      ...base,
      boxes: parseDriftBoxes({ boxes: [null, { sandbox_id: "sbx-owned" }] }),
    });

    expect(health.status).toBe("unknown");
    expect(health.can_migrate).toBe(false);
  });

  it("requires both exact image IDs before reporting current", () => {
    const health = buildSandboxVersionHealth({
      ...base,
      boxes: parseDriftBoxes({
        boxes: [
          {
            sandbox_id: "sbx-owned",
            current_image_available: true,
            drifted: false,
            current_image_id: "sha256:current",
          },
        ],
      }),
    });

    expect(health.status).toBe("unknown");
  });

  it("does not treat missing drift state or empty IDs as current", () => {
    const missingDrift = buildSandboxVersionHealth({
      ...base,
      boxes: parseDriftBoxes({
        boxes: [{ sandbox_id: "sbx-owned", current_image_available: true, running_image_id: "same", current_image_id: "same" }],
      }),
    });
    const emptyIds = buildSandboxVersionHealth({
      ...base,
      boxes: parseDriftBoxes({
        boxes: [{ sandbox_id: "sbx-owned", current_image_available: true, drifted: false, running_image_id: "", current_image_id: "" }],
      }),
    });

    expect(missingDrift.status).toBe("unknown");
    expect(emptyIds.status).toBe("unknown");
  });

  it("only offers migration for exact reported image drift", () => {
    const health = buildSandboxVersionHealth({
      ...base,
      boxes: parseDriftBoxes({
        boxes: [
          {
            sandbox_id: "sbx-owned",
            current_image_available: true,
            drifted: true,
            running_image_id: "sha256:old",
            current_image_id: "sha256:new",
          },
        ],
      }),
    });

    expect(health.status).toBe("outdated");
    expect(health.can_migrate).toBe(true);
  });
});
