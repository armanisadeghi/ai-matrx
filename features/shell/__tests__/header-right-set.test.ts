/**
 * THE HEADER RIGHT SET — the same three controls, always mounted, never hidden.
 *
 * THE RULING this pins (owner, 2026-09-19):
 *   *"we need to create a consistent set of things for that top-right section
 *   so that desktop has a consistent feel and so does mobile. One critical part
 *   of consistency is never hiding things and only disabling when inactive."*
 *
 * Source-text half of the law (the rendered halves are
 * `features/canvas/__tests__/canvas-header-slot-reserved.test.tsx` and the
 * Playwright gate `features/shell/layout-gate/canvas-one-presentation.spec.ts`):
 *
 *   1. `Header.tsx` mounts exactly Agents → Canvas → Inbox, in that order,
 *      each unconditionally (no `isAuthenticated &&` in front of them).
 *   2. The avatar is not in the header: no `UserMenuTrigger`, no
 *      `.shell-user-menu-wrapper`; it lives in `ShellUserBlock`, which both
 *      shells (`AppShell`, the dev layout) mount.
 *   3. A guest gets the same buttons — Agents and Inbox each carry an auth-gate
 *      branch rather than a hidden one.
 *   4. The canvas control is disabled when empty, never an inert spacer.
 *
 * PROVEN FAILING BEFORE PASSING: wrap `<SurfaceAgentsHeaderButton …/>` in
 * `{isAuthenticated && …}` again → case 1 goes RED; put `UserMenuTrigger` back
 * in `Header.tsx` → case 2 goes RED; delete `GuestInboxButton` → case 3 RED.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");

describe("the header right set", () => {
  const header = read("features/shell/components/header/Header.tsx");

  it("mounts Agents, Canvas and Inbox in that order, unconditionally", () => {
    const agents = header.indexOf("<SurfaceAgentsHeaderButton");
    const canvas = header.indexOf("<CanvasShellHeaderToggle");
    const inbox = header.indexOf("<InboxHeaderButton");
    expect(agents).toBeGreaterThan(-1);
    expect(canvas).toBeGreaterThan(agents);
    expect(inbox).toBeGreaterThan(canvas);
    for (const control of [
      "<SurfaceAgentsHeaderButton",
      "<CanvasShellHeaderToggle",
      "<InboxHeaderButton",
    ]) {
      const line = header
        .split("\n")
        .find((candidate) => candidate.includes(control));
      expect(line).toBeDefined();
      expect(line).not.toMatch(/&&\s*</);
    }
  });

  it("holds no avatar — the profile menu lives bottom-left", () => {
    expect(header).not.toContain("UserMenuTrigger");
    expect(header).not.toContain("UserMenuPanel");
    expect(header).not.toContain("shell-user-menu-wrapper");
    for (const shell of [
      "features/shell/components/AppShell.tsx",
      "app/(dev)/layout.dev.tsx",
    ]) {
      const text = read(shell);
      expect(text).toContain("<ShellUserBlock");
      expect(text).toContain("<Header isAuthenticated={isAuthenticated} />");
    }
  });

  it("gives a guest the same buttons, gated rather than hidden", () => {
    const agents = read(
      "features/surfaces/components/chrome/SurfaceAgentsHeaderButton.tsx",
    );
    const inbox = read(
      "features/notifications/components/InboxHeaderButton.tsx",
    );
    for (const text of [agents, inbox]) {
      expect(text).toContain("useOpenAuthGateDialog");
      expect(text).toMatch(/isAuthenticated \? <\w+ \/> : <Guest\w+ \/>/);
    }
  });

  it("keeps one copy of the profile menu — no canvas or glass-layer twins", () => {
    const css = read("styles/shell.css");
    expect(css).not.toContain("canvas-shell-user-menu");
    expect(css).not.toContain("elevated-shell-user-menu");
    expect(css).not.toContain("dynamic-panel-avatar-cover");
    expect(css).toContain(".shell-user-block {");
  });
});
