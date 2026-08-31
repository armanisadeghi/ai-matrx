/**
 * V2-6 — A WRONG MANDATE ADDRESS NEVER OFFERS A RETRY THAT CAN ONLY FAIL.
 *
 * The defect, walked on production 2026-08-31: `/mandates/zzz.definitely_not_a
 * _mandate_x9` and `/mandates/new` both answered "No mandate "…" — it may have
 * been retired, or the link is stale." with a Retry button. The sentence
 * asserts a history the address never had, and the button re-runs a read whose
 * answer cannot change — present, enabled, incapable of working.
 *
 * FIX-6 item 4 closed this exact class on the shortcut routes and stopped
 * there. THE CENSUS IS THE DELIVERABLE: one module (`mandate-address.ts`) used
 * by the ONE workspace loader every mandate host renders — the (core) route,
 * the org route, the admin route and the window panel — plus the admin
 * controls fold. This guard walks the verdicts and then reads the SOURCE of
 * every one of those doors, because "no door offers Retry here" is a claim
 * about all of them at once.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  loadFailedFailure,
  noSuchMandateFailure,
  notAnAddressFailure,
  readMandateAddress,
} from "../mandate-address";

describe("what can be at a mandate address", () => {
  it("a well-formed key is an address", () => {
    expect(readMandateAddress("podcast.solo_script")).toBe("key");
    expect(readMandateAddress("zzz.definitely_not_a_mandate_x9")).toBe("key");
    expect(readMandateAddress("a.b.c")).toBe("key");
  });

  it("a row uuid is an address", () => {
    expect(readMandateAddress("c840d4f4-1111-4222-8333-444444444444")).toBe(
      "id",
    );
  });

  it("a reserved or malformed segment is NOT an address", () => {
    // The two the walk actually hit, plus the shapes the server's own
    // validator refuses.
    expect(readMandateAddress("new")).toBe("not-an-address");
    expect(readMandateAddress("categories")).toBe("not-an-address");
    expect(readMandateAddress("Podcast.Solo")).toBe("not-an-address");
    expect(readMandateAddress("podcast.")).toBe("not-an-address");
    expect(readMandateAddress(".solo_script")).toBe("not-an-address");
    expect(readMandateAddress("podcast solo")).toBe("not-an-address");
  });
});

describe("only a read that broke may offer Retry", () => {
  it("a wrong address is not retryable and claims no history", () => {
    const failure = notAnAddressFailure("new");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain("no mandate at this address");
    expect(failure.message).not.toContain("retired");
    expect(failure.message).not.toContain("stale");
  });

  it("a well-formed key nothing answers to is not retryable", () => {
    const failure = noSuchMandateFailure("zzz.definitely_not_a_mandate_x9");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toContain("zzz.definitely_not_a_mandate_x9");
    // It must not assert the thing WAS there — it may never have been.
    expect(failure.message).toContain("removed or never created");
  });

  it("a broken read IS retryable and keeps the server's words", () => {
    const failure = loadFailedFailure("The connection dropped.");
    expect(failure.retryable).toBe(true);
    expect(failure.message).toBe("The connection dropped.");
  });
});

describe("every mandate door is censused, not just the one that was reported", () => {
  const loader = readFileSync(
    join(process.cwd(), "features/mandates/workspace/useMandateWorkspaceData.ts"),
    "utf8",
  );
  const workspace = readFileSync(
    join(process.cwd(), "features/mandates/workspace/MandateWorkspace.tsx"),
    "utf8",
  );
  const adminPage = readFileSync(
    join(process.cwd(), "features/mandates/admin/AdminMandateWorkspacePage.tsx"),
    "utf8",
  );

  it("is reading the doors it means to guard", () => {
    expect(loader).toContain("useMandateWorkspaceData");
    expect(workspace).toContain("export function MandateWorkspace");
    expect(adminPage).toContain("AdminControls");
  });

  it("the loader classifies the address instead of throwing one sentence", () => {
    expect(loader).toContain("readMandateAddress");
    expect(loader).toContain("notAnAddressFailure");
    expect(loader).toContain("noSuchMandateFailure");
  });

  it("the retired/stale sentence is gone from every door", () => {
    for (const [name, source] of [
      ["useMandateWorkspaceData.ts", loader],
      ["MandateWorkspace.tsx", workspace],
      ["AdminMandateWorkspacePage.tsx", adminPage],
    ] as const) {
      expect(`${name}: ${source.includes("it may have been retired")}`).toBe(
        `${name}: false`,
      );
    }
  });

  it("the workspace renders Retry only when the failure says it can work", () => {
    expect(/verdict\.retryable \?/.test(workspace)).toBe(true);
    // And nowhere else: a second unconditional Retry would restore the defect.
    expect((workspace.match(/>\s*Retry\s*</g) ?? []).length).toBe(1);
  });

  it("the admin controls fold uses the same two sentences", () => {
    expect(adminPage).toContain("notAnAddressFailure");
    expect(adminPage).toContain("noSuchMandateFailure");
    expect(adminPage).not.toContain("No mandate row matches");
  });
});
