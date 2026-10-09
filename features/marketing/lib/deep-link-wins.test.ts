/**
 * A deep link wins: an explicit /marketing/<brandSlug>/... URL is never
 * rewritten to another brand or section, and the sign-in bounce keeps the
 * whole destination. No "remembered brand" exists in the marketing tree; a
 * bare /marketing is the only entry point that may ever default one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalizePath } from "@/features/marketing/components/brand/CanonicalSegment";

describe("deep link wins", () => {
  it("canonical key address is left exactly as typed", () => {
    expect(
      canonicalizePath("/marketing/ai-matrx/socials/studio", "ai-matrx", "ai-matrx"),
    ).toBeNull();
  });

  it("a UUID address swaps only the brand segment, keeping section and page", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      canonicalizePath(`/marketing/${id}/socials/studio`, id, "ai-matrx"),
    ).toBe("/marketing/ai-matrx/socials/studio");
  });

  it("never lands on identity or another brand's segment", () => {
    const next = canonicalizePath("/marketing/ai-matrx/socials/studio", "ai-matrx", "ai-matrx-new");
    expect(next).toBe("/marketing/ai-matrx-new/socials/studio");
    expect(next).not.toContain("all-green-recycling");
    expect(next).not.toContain("/identity");
  });

  it("the signed-out bounce carries the full requested path, not the brand root", () => {
    const layout = readFileSync(
      join(process.cwd(), "app/(core)/marketing/[brandId]/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("currentRequestLoginHref");
    expect(layout).not.toMatch(/redirectTo=\$\{encodeURIComponent\(`\/marketing\/\$\{brandId\}`\)\}/);
  });
});
