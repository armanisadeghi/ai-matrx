/**
 * THERE IS ONE CANVAS PRESENTATION, AND NO ROUTE OWNS ONE OF ITS OWN.
 *
 * THE REJECTION (owner, 2026-09-16, review row 34bfd1e8-1cc2-441b-a8a9-42d78c1b6111):
 *   *"The canvas system set up for the sandboxes completely breaks the core
 *   systems for how these canvases work. It adds an unnecessary layer, causes
 *   a shift in the top header buttons and creates a mess that clearly shows it
 *   is not properly built to be identical to the way the canvas actually
 *   works. FOLLOW established patterns."*
 *
 * Between 2026-09-14 and 2026-09-17 the chat route wrapped its own body in a
 * `CanvasDock` — a parallel presentation with its own Redux state
 * (`dockHosts`, `dockRatio`), its own availability source, its own
 * `--shell-header-h` offset, and its own mount point. Documents, artifacts and
 * the browser kept the canonical one. Two presentations of one canvas is the
 * layer this file makes impossible to re-add quietly.
 *
 * THE RULE: the canvas is the globally mounted `CanvasSideSheet` and nothing
 * else. A route never mounts, wraps, docks or otherwise presents the canvas.
 * A capability one route needs is added to the ONE surface, for every route.
 *
 * These are static assertions over the real source, deliberately: the defect
 * is a component existing and a route importing it, which no render test sees.
 * Geometry is measured in a real engine by
 * `features/shell/layout-gate/canvas-one-presentation.spec.ts`.
 *
 * Each case is proven failing by restoring the thing it forbids — re-add
 * `features/canvas/core/CanvasDock.tsx`, or `dockHosts` to the slice, or the
 * `<CanvasDock>` wrapper in `ChatRoomClient`, and the matching case goes RED.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8");

/** Every tracked source file, so a census can never miss a new offender. */
function trackedSources(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--", "*.ts", "*.tsx", "*.css"],
    { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean)
    // Other agents' worktrees live inside this checkout and are not ours.
    .filter((f) => !f.startsWith(".wt/"));
}

describe("the canvas has exactly one presentation", () => {
  it("no dock module exists anywhere in the tree", () => {
    expect(existsSync(path.join(REPO, "features/canvas/core/CanvasDock.tsx"))).toBe(
      false,
    );
    expect(
      existsSync(path.join(REPO, "features/canvas/core/CanvasDockBody.tsx")),
    ).toBe(false);

    const offenders = trackedSources().filter((f) =>
      /CanvasDock(Body)?\.(tsx|ts)$/.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it("no source anywhere names the dock component or its state", () => {
    const banned = [
      "CanvasDock",
      "dockHosts",
      "dockRatio",
      "registerCanvasDock",
      "unregisterCanvasDock",
      "setCanvasDockRatio",
      "selectCanvasIsDocked",
      "selectCanvasDockRatio",
      "CANVAS_DOCK_PANEL_ID",
      "matrx.canvas.dock.ratio",
    ];
    const hits: string[] = [];
    for (const file of trackedSources()) {
      // This guard, and the layout gate that reproduces the rejected shape to
      // prove itself RED, are allowed to spell the names they forbid.
      if (
        file.endsWith("features/canvas/__tests__/one-canvas-presentation.test.ts") ||
        file.endsWith("features/shell/layout-gate/canvas-one-presentation.spec.ts")
      ) {
        continue;
      }
      const text = readFileSync(path.join(REPO, file), "utf8");
      for (const token of banned) {
        if (text.includes(token)) hits.push(`${file}: ${token}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the canvas slice carries no per-route presentation state", () => {
    const slice = read("features/canvas/redux/canvasSlice.ts");
    expect(slice).not.toMatch(/\bdock/i);
    // Availability has ONE source: the flag the global front door raises.
    expect(slice).toContain(
      "export const selectCanvasIsAvailable = (state: WithCanvas) =>\n  state.canvas?.isAvailable ?? false;",
    );
  });

  it("the chat route mounts no canvas presentation — same component tree as every other route", () => {
    const chat = read("features/agents/components/chat/ChatRoomClient.tsx");
    // It may open things INTO the canvas (the headless openers) but it may not
    // present the canvas itself.
    expect(chat).not.toMatch(/<Canvas(Dock|SideSheet|Surface|Pane)\b/);
    expect(chat).not.toMatch(/from "@\/features\/canvas\/core\//);
    // What it legitimately keeps: the headless openers that make records
    // reachable in the ONE canvas.
    expect(chat).toContain("<SandboxCanvasOpener");
    expect(chat).toContain("<ToolResultCanvasOpener");
  });

  it("no route or feature imports a canvas presentation — only the shell mounts it", () => {
    const allowed = new Set([
      // The two global mount points: the authenticated shell's idle island and
      // the public layout. Both mount the SAME front door.
      "features/shell/islands/DeferredIslands.tsx",
      "app/(public)/layout.tsx",
      // The front door itself and its own implementation.
      "features/canvas/core/CanvasSideSheet.tsx",
      "features/canvas/core/CanvasSideSheetImpl.tsx",
    ]);
    const mounters = trackedSources().filter((file) => {
      if (allowed.has(file)) return false;
      if (file.includes("__tests__") || file.endsWith(".test.tsx")) return false;
      const text = readFileSync(path.join(REPO, file), "utf8");
      return /<CanvasSideSheet\s*\/?>/.test(text);
    });
    expect(mounters).toEqual([]);
  });

  it("the shell header's canvas slot is reserved whenever the canvas is available", () => {
    // The control belongs to the canvas pane's header while the canvas is
    // open, but its BOX must stay in the shell header. The 2026-09-17 version
    // of this case asserted `if (!isAvailable || itemCount === 0) return null;`
    // — which WAS the defect: the slot only existed once an item did, so the
    // first canvas item both created the box and pulled every button to its
    // left 44px sideways, and folding never gave it back. Measured live on
    // production 2026-09-18 (review row 34bfd1e8): Records 1043.39 → 999.39.
    // The rule now: availability alone reserves the slot.
    const toggle = read("features/canvas/core/CanvasHeaderToggle.tsx");
    expect(toggle).toContain('data-canvas-header-slot="reserved"');
    expect(toggle).toContain('data-canvas-header-slot="control"');
    // Availability is the ONLY thing that can remove the slot.
    expect(toggle).toContain("if (!isAvailable) return null;");
    expect(toggle).not.toContain("!isAvailable || itemCount === 0");
    // Both empty and open reserve the same box, from the same constant.
    expect(toggle).toContain('<CanvasHeaderSlotSpacer reason="empty" />');
    expect(toggle).toContain('<CanvasHeaderSlotSpacer reason="open" />');
    expect(toggle).toContain(
      'width: "var(--matrx-tap-target-size, 2.75rem)"',
    );
    // The spacer is inert and honest — a box, never a dead-looking button.
    const spacer = toggle.slice(toggle.indexOf("function CanvasHeaderSlotSpacer"));
    expect(spacer.slice(0, spacer.indexOf("}\n"))).not.toContain("TapButton");
    expect(spacer).toContain("aria-hidden");
    // The behavioural half of this law (rendered DOM, not source text):
    expect(
      existsSync(
        path.join(
          REPO,
          "features/canvas/__tests__/canvas-header-slot-reserved.test.tsx",
        ),
      ),
    ).toBe(true);
  });

  it("the surface card marks exactly one presentation", () => {
    const surface = read("features/canvas/core/CanvasSurface.tsx");
    expect(surface).toContain('data-canvas-surface="sheet"');
    // No `presentation` prop, no second value to pass it.
    expect(surface).not.toMatch(/presentation[?]?:\s*"/);
    expect(surface).not.toContain('"docked"');
  });
});
