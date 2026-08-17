import {
  deriveAgentFieldChangeMoments,
  findAgentVersionMoment,
  type AgentVersionFieldSnapshot,
} from "../field-change-history";

function version(
  versionNumber: number,
  changedAt: string,
  values: Record<string, unknown>,
): AgentVersionFieldSnapshot {
  return { versionNumber, changedAt, values };
}

describe("deriveAgentFieldChangeMoments", () => {
  const snapshots = [
    version(4, "2026-08-14T16:00:00Z", {
      name: "Writer",
      settings: { temperature: 0.7, top_p: 0.9 },
    }),
    version(3, "2026-08-12T15:00:00Z", {
      name: "Writer",
      settings: { temperature: 0.7, top_p: 0.9 },
    }),
    version(2, "2026-08-10T14:00:00Z", {
      name: "Writer",
      settings: { temperature: 0.3, top_p: 0.9 },
    }),
    version(1, "2026-08-01T13:00:00Z", {
      name: "Original",
      settings: { temperature: 0.3, top_p: 0.9 },
    }),
  ];

  it("attributes a field to the oldest snapshot in its current uninterrupted run", () => {
    const result = deriveAgentFieldChangeMoments(
      { name: "Writer", settings: { temperature: 0.7, top_p: 0.9 } },
      snapshots,
      ["name", "settings"],
    );

    expect(result.name).toEqual({
      versionNumber: 2,
      changedAt: "2026-08-10T14:00:00Z",
    });
    expect(result.settings).toEqual({
      versionNumber: 3,
      changedAt: "2026-08-12T15:00:00Z",
    });
  });

  it("attributes a reverted value to the reversion, not its first appearance", () => {
    const result = deriveAgentFieldChangeMoments(
      { name: "Original" },
      [
        version(3, "2026-08-13T00:00:00Z", { name: "Original" }),
        version(2, "2026-08-12T00:00:00Z", { name: "Temporary" }),
        version(1, "2026-08-11T00:00:00Z", { name: "Original" }),
      ],
      ["name"],
    );

    expect(result.name?.versionNumber).toBe(3);
  });

  it("refuses to invent an exact date when history lacks the field", () => {
    const result = deriveAgentFieldChangeMoments(
      { ragAwarenessMode: "full" },
      [version(2, "2026-08-13T00:00:00Z", { name: "Agent" })],
      ["ragAwarenessMode"],
    );

    expect(result.ragAwarenessMode).toBeUndefined();
  });

  it("refuses a stale history whose newest snapshot differs from current", () => {
    const result = deriveAgentFieldChangeMoments(
      { name: "Current" },
      [version(2, "2026-08-13T00:00:00Z", { name: "Older" })],
      ["name"],
    );

    expect(result.name).toBeUndefined();
  });
});

describe("findAgentVersionMoment", () => {
  it("returns the exact date belonging to the compared numeric version", () => {
    expect(
      findAgentVersionMoment(
        [version(7, "2026-08-15T12:00:00Z", { name: "Agent" })],
        7,
      ),
    ).toEqual({
      versionNumber: 7,
      changedAt: "2026-08-15T12:00:00Z",
    });
  });
});
