// F-20 item 5 (VERIFY-B1-B2-R2 N5): the ONE task provenance chip rendered any
// non-`/` `source_url` as "Open source", including the Google Tasks API resource
// the import writes — which answers HTTP 401 with a JSON body. A non-page URL is
// never a link.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { provenanceDoorFor } from "../provenance-door";

describe("provenanceDoorFor", () => {
  it("refuses a door to the Google Tasks API resource the import writes", () => {
    const door = provenanceDoorFor(
      "https://tasks.googleapis.com/tasks/v1/lists/MTIz/tasks/NDU2",
    );
    expect(door.kind).toBe("not-a-page");
    if (door.kind !== "not-a-page") return;
    expect(door.reason).toContain("data address");
  });

  it("still opens an in-app route and a real web page", () => {
    expect(provenanceDoorFor("/hr/workflows/123")).toEqual({
      kind: "internal",
      href: "/hr/workflows/123",
    });
    expect(provenanceDoorFor("https://example.com/handbook/onboarding")).toEqual({
      kind: "external",
      href: "https://example.com/handbook/onboarding",
    });
  });

  it("refuses any api host or api path, not just this one URL", () => {
    for (const value of [
      "https://api.stripe.com/v1/invoices/in_1",
      "https://people.googleapis.com/v1/people/c123",
      "https://example.com/api/tasks/9",
      "https://example.com/data/tasks.json",
      "mailto:someone@example.com",
      "urn:google:task:123",
      "",
    ]) {
      expect(provenanceDoorFor(value).kind).toBe("not-a-page");
    }
  });
});

describe("the chip consumes the decision", () => {
  it("never builds its own link rule", () => {
    const source = readFileSync(
      join(__dirname, "..", "components", "TaskProvenanceChip.tsx"),
      "utf8",
    );
    expect(source).toContain("provenanceDoorFor");
    // The old rule: any non-`/` url became an <a target="_blank">.
    expect(source).not.toContain('sourceUrl.startsWith("/")');
    expect(source).toContain("not-a-page");
  });
});
