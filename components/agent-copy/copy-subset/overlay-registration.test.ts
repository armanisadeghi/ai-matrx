/**
 * THE OVERLAY REGISTRATION GUARD for `copySubsetWindow`.
 *
 * The overlay-system skill's three steps are catalogue entry → component →
 * controller block + opener. A missing step fails silently at runtime (the
 * dispatch fires, nothing renders). This test pins all three from source so
 * a refactor that drops one is loud in CI, not on Arman's screen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { OVERLAY_CATALOGUE } from "@/features/overlays/catalogue";

const ROOT = process.cwd();

describe("copySubsetWindow overlay registration", () => {
  it("is in the catalogue as a multi-instance window", () => {
    expect(OVERLAY_CATALOGUE).toHaveProperty("copySubsetWindow");
    const entry = (OVERLAY_CATALOGUE as Record<string, unknown>)
      .copySubsetWindow as { instanceMode: string; isWindow: boolean };
    expect(entry.instanceMode).toBe("multi");
    expect(entry.isWindow).toBe(true);
  });

  it("has a lazy import and a gated multi-instance block in the controller", () => {
    const controller = readFileSync(
      join(ROOT, "features/overlays/OverlayController.tsx"),
      "utf8",
    );
    expect(controller).toContain(
      'import("@/components/agent-copy/copy-subset/CopySubsetWindow")',
    );
    expect(controller).toContain('selectOpenInstances(s, "copySubsetWindow")');
    expect(controller).toContain("instancesById.copySubsetWindow.map(");
    expect(controller).toContain('overlayId: "copySubsetWindow"');
  });

  it("has a typed opener exporting the hook and the controller component", () => {
    const opener = readFileSync(
      join(ROOT, "features/overlays/openers/copySubsetWindow.tsx"),
      "utf8",
    );
    expect(opener).toContain("export function useOpenCopySubsetWindow");
    expect(opener).toContain("export function CopySubsetWindowController");
    expect(opener).toContain('const OVERLAY_ID = "copySubsetWindow" as const');
    // Rows and callbacks never enter Redux: only the session id travels.
    expect(opener).toContain("registerCopySubsetSession(");
    expect(opener).not.toMatch(/data:\s*\{[^}]*rows/);
  });
});
