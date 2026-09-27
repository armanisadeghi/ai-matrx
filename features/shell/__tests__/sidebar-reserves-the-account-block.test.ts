/**
 * NO NAV ITEM SITS UNDER THE ACCOUNT BLOCK (page-pass shared defects, 2026-09-27).
 *
 * The fixed bottom-left account block (`.shell-user-block`, `--shell-user-block-h`)
 * covered /user-settings' last item ("Text generation"). The height was reserved
 * on `.shell-sidebar-footer`, and the settings route hides that footer, so its
 * route menu scrolled to the bottom under the avatar. The reservation lives on
 * the sidebar column itself, so every nav inside it — main, route menu, footer —
 * ends above the block whether or not the footer shows.
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix shell.css the first case
 * is RED (no desktop `.shell-sidebar` padding-bottom) and the second too (the
 * footer carried the reservation).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "..", "..", "..", "styles/shell.css"), "utf8");

describe("the sidebar reserves the account block", () => {
  it("reserves --shell-user-block-h on the sidebar column at desktop widths", () => {
    expect(css).toMatch(
      /@media \(min-width: 1024px\)\s*\{\s*\.shell-sidebar\s*\{\s*padding-bottom:\s*var\(--shell-user-block-h\);/,
    );
  });

  it("never leaves the reservation on the footer alone, which a route can hide", () => {
    expect(css).not.toMatch(/\.shell-sidebar-footer\s*\{\s*padding-bottom:\s*calc\(var\(--shell-user-block-h\)/);
    // The route that hides it still does — which is exactly why the footer cannot hold it.
    expect(css).toMatch(/\[data-settings-route\] \.shell-sidebar-footer\s*\{\s*display:\s*none;/);
  });
});
