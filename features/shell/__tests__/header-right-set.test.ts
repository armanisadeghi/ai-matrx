/**
 * THE HEADER CONTROL SET — the same five controls, always mounted, never hidden.
 *
 * THE RULINGS this pins:
 *   owner, 2026-09-19: *"a consistent set of things for that top-right
 *   section … never hiding things and only disabling when inactive."*
 *   owner, 2026-09-30, right to left: Notifications (without DMs), Messages
 *   (their own count), Canvas (always clickable), the Intelligence dropdown,
 *   Search — tap targets rendered touching, no padding or space between them;
 *   nothing else built into the header.
 *
 * Source-text half of the law (the rendered half is
 * `features/shell/components/header/HeaderPhoneOverflow.test.tsx`, which runs
 * the Canvas row on the real `@ai-matrx/canvas` controller):
 *
 *   1. `HeaderControlSet.tsx` mounts Search → Intelligence → Canvas →
 *      Messages → Notifications, each unconditionally, in a wrapper with no
 *      gap / padding / margin utility; the shell `Header` and the canvas
 *      workspace header both mount THAT set (one copy).
 *   2. Nothing else is built into the header: no avatar, no organization
 *      control (it lives in the sidebar's account rail).
 *   3. A guest gets the same buttons — Intelligence, Messages and
 *      Notifications each carry an auth-gate branch rather than a hidden one.
 *
 * The Canvas control is the package's own `<CanvasToggle />` from
 * `@ai-matrx/canvas/react` — never a host-built twin (the retired
 * `CanvasShellHeaderToggle` / `CanvasPanePutAwayToggle`).
 *
 * PROVEN FAILING BEFORE PASSING: wrap `<MessagesHeaderButton …/>` in
 * `{isAuthenticated && …}` → case 1 RED; put `HeaderChooseOrgButton` back in
 * `Header.tsx` → case 2 RED; add `gap-1` to the set's wrapper → case 1 RED; import `CanvasToggle` from
 * anywhere but `@ai-matrx/canvas/react` → the toggle case RED (planted
 * 2026-10-01).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");

describe("the header right set", () => {
  const header = read("features/shell/components/header/Header.tsx");
  const set = read("features/shell/components/header/HeaderControlSet.tsx");

  it("mounts Search, Intelligence, Messages, Notifications and Canvas in that order, unconditionally", () => {
    const order = [
      "<CommandBarHeaderButton",
      "<SurfaceAgentsHeaderButton",
      "<MessagesHeaderButton",
      "<InboxHeaderButton",
      "<CanvasToggle",
    ];
    let last = -1;
    for (const control of order) {
      const at = set.indexOf(control);
      expect(at).toBeGreaterThan(last);
      last = at;
      const line = set.split("\n").find((candidate) => candidate.includes(control));
      expect(line).toBeDefined();
      expect(line).not.toMatch(/&&\s*</);
    }
  });

  it("the Canvas control is the package's CanvasToggle, never a host twin", () => {
    expect(set).toMatch(/import\s*\{[^}]*\bCanvasToggle\b[^}]*\}\s*from\s*"@ai-matrx\/canvas\/react"/);
    for (const text of [header, set]) {
      expect(text).not.toContain("CanvasShellHeaderToggle");
      expect(text).not.toContain("CanvasPanePutAwayToggle");
    }
    expect(read("components/matrx/PublicHeader.tsx")).toContain("<CanvasToggle");
  });

  it("renders the set touching — no gap, padding or margin on its wrapper", () => {
    const wrapper = set.split("\n").find((line) => line.includes('className="shell-header-secondary"'));
    expect(wrapper).toBeDefined();
    expect(wrapper).not.toMatch(/\b(gap|space-x|p[xlr]?|m[xlr]?)-\d/);
  });

  it("is ONE set: the shell header and the canvas workspace header both mount it", () => {
    expect(header).toContain("<HeaderControlSet isAuthenticated={isAuthenticated} />");
    const workspace = read("../aidream/apps/shared/chat/src/canvas/workspace/ChatCanvasWorkspace.tsx");
    expect(workspace).toContain("<HeaderControlSet");
    for (const text of [header, workspace]) {
      expect(text).not.toContain("<InboxHeaderButton");
      expect(text).not.toContain("<SurfaceAgentsHeaderButton");
    }
  });

  it("builds nothing else into the header — the organization lives in the account rail", () => {
    expect(header).not.toContain("HeaderChooseOrgButton");
    expect(header).not.toContain("shell-header-org-slot");
    expect(read("styles/shell.css")).not.toContain(".shell-header-org-slot");
    expect(read("features/shell/components/user-block/ShellUserBlock.tsx")).toContain("<ShellOrgSwitcher />");
  });

  it("holds no avatar — the profile menu lives bottom-left", () => {
    expect(header).not.toContain("UserMenuTrigger");
    expect(header).not.toContain("UserMenuPanel");
    expect(header).not.toContain("shell-user-menu-wrapper");
    const shell = read("features/shell/components/AppShell.tsx");
    expect(shell).toContain("<ShellUserBlock");
    expect(shell).toContain("<Header isAuthenticated={isAuthenticated} />");
    // ONE shell: every route group that draws chrome renders AppShell itself,
    // never a hand-wired copy of its parts (the demo site's copy had drifted).
    for (const layout of [
      "app/(core)/layout.tsx",
      "app/(admin)/layout.tsx",
      "app/(transitional)/layout.tsx",
      "app/(dev)/layout.dev.tsx",
    ]) {
      const text = read(layout);
      expect(text).toContain("<AppShell");
      expect(text).not.toContain("<Sidebar ");
      expect(text).not.toContain("ResponsiveLayout");
    }
  });

  it("gives a guest the same buttons, gated rather than hidden", () => {
    const agents = read(
      "../aidream/apps/shared/chat/src/surfaces/components/chrome/SurfaceAgentsHeaderButton.tsx",
    );
    const inbox = read(
      "features/notifications/components/InboxHeaderButton.tsx",
    );
    const messages = read(
      "features/messaging/components/shell/MessagesHeaderButton.tsx",
    );
    for (const text of [agents, inbox, messages]) {
      expect(text).toContain("useOpenAuthGateDialog");
      expect(text).toMatch(/isAuthenticated \? <\w+ \/> : <Guest\w+ \/>/);
    }
  });

  it("keeps one IMPLEMENTATION of the profile menu — the canvas-pane twin is gone", () => {
    const css = read("styles/shell.css");
    // The canvas pane's own avatar chrome was deleted with the header set
    // (edbdcfe551) and has no stand-in: nothing draws a second avatar there.
    expect(css).not.toContain("canvas-shell-user-menu");
    expect(css).toContain(".shell-user-block {");
  });

  it("keeps the retired top-right profile stand-in absent", () => {
    expect(read("app/(public)/layout.tsx")).not.toContain("ElevatedShellUserMenuRoot");
    expect(read("features/shell/components/AppShell.tsx")).not.toContain("ElevatedShellUserMenuRoot");
    expect(read("components/matrx/resizable/MatrxDynamicPanel.tsx")).not.toContain("claimDynamicPanelAvatarCover");
    expect(existsSync(path.join(REPO, "components/matrx/resizable/ElevatedShellUserMenu.tsx"))).toBe(false);
    expect(existsSync(path.join(REPO, "components/matrx/resizable/elevatedShellUserMenuStore.ts"))).toBe(false);
    expect(read("styles/shell.css")).not.toContain(".elevated-shell-user-menu-root");
  });
});
