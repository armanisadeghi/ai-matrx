import {
  sandboxDisplayName,
  sandboxShortId,
  splitIdentifyingName,
  formatSandboxTimestamp,
} from "@/lib/sandbox/format";

describe("sandbox timestamps", () => {
  // Live fleet contains expires_at='infinity', a valid PostgreSQL timestamp.
  it("renders unlimited expiry without JavaScript Invalid Date", () => {
    expect(formatSandboxTimestamp("infinity")).toBe("No expiry");
  });
  it("distinguishes missing and malformed timestamps", () => {
    expect(formatSandboxTimestamp(null)).toBe("—");
    expect(formatSandboxTimestamp("invalid")).toBe("Invalid timestamp");
  });
});

describe("one identity per box, and a real name for an unnamed one", () => {
  /**
   * The defects these pin (owner, seen live 2026-09-13):
   *   - The SAME box read "Unnamed · 7942bd" in one place and
   *     "Sandbox · 2c23df07" in another: two formatters slicing two different
   *     identifiers (the orchestrator id vs the Postgres row uuid).
   *   - "Unnamed · <6 hex>" is not a name, and the `+` menu clipped it to
   *     "Unname…" — hiding the only characters that identify the box.
   *
   * Proven failing before passing:
   *   - restored `Unnamed · ${sandbox_id.slice(-6)}`; the derived-name and
   *     same-short-id-before-and-after-load cases went RED.
   *   - made `splitIdentifyingName` return the whole label as `head`; the
   *     "identity survives truncation" case went RED.
   */
  it("uses the stored name when the user set one", () => {
    expect(
      sandboxDisplayName({
        name: "  AI Matrx Development  ",
        id: "2c23df07-aaaa-bbbb-cccc-dddddddddddd",
        sandbox_id: "sbx-123",
      }),
    ).toBe("AI Matrx Development");
  });

  it("gives an unnamed box a name that says what it IS", () => {
    expect(
      sandboxDisplayName({
        name: null,
        id: "5515aabb-ccdd-eeff-0011-223344556677",
        sandbox_id: "sbx-7712966b8cb5",
        tier: "hosted",
        config: { template: "bare" },
      }),
    ).toBe("bare · hosted · 5515aa");
  });

  it("drops what it does not know, and never drops the identifying part", () => {
    expect(
      sandboxDisplayName({
        name: null,
        id: "5515aabb-ccdd-eeff-0011-223344556677",
        tier: "hosted",
      }),
    ).toBe("hosted · 5515aa");
    expect(
      sandboxDisplayName({
        name: null,
        id: "5515aabb-ccdd-eeff-0011-223344556677",
      }),
    ).toBe("Sandbox · 5515aa");
  });

  it("shows the SAME short id before and after the row has loaded", () => {
    const rowId = "2c23df07-1111-2222-3333-444444444444";
    // What a canvas pointer / a binding knows before any fetch.
    const beforeLoad = sandboxDisplayName({ id: rowId });
    // What the loaded row renders.
    const afterLoad = sandboxDisplayName({
      id: rowId,
      name: null,
      sandbox_id: "sbx-7712966b7942bd",
      tier: "hosted",
      config: { template: "bare" },
    });
    expect(sandboxShortId({ id: rowId })).toBe("2c23df");
    expect(beforeLoad).toContain("2c23df");
    expect(afterLoad).toContain("2c23df");
    // And the orchestrator id is NEVER the thing on screen — that divergence
    // is what made one box look like two.
    expect(afterLoad).not.toContain("7942bd");
  });

  it("still names a row read without its uuid", () => {
    expect(
      sandboxDisplayName({ name: null, sandbox_id: "sbx-123456789abc" }),
    ).toBe("Sandbox · 789abc");
  });

  it("keeps the identity out of the truncating half of a chip", () => {
    const { head, tail } = splitIdentifyingName("bare · hosted · 5515aa");
    expect(head).toBe("bare · hosted · ");
    expect(tail).toBe("5515aa");
    // A user-chosen name has no identifying tail to protect.
    expect(splitIdentifyingName("My dev box")).toEqual({
      head: "My dev box",
      tail: "",
    });
  });
});
