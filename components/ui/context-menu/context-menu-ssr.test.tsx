/**
 * The wrapper must never delete the content it wraps.
 *
 * `ContextMenuTrigger` wraps ALWAYS-VISIBLE page content — a row, a card, a
 * whole panel. This wrapper used to gate its Root on `useIsMounted` and return
 * `null`, which deleted that content from the server render and the first
 * client render: a list rendered EMPTY and filled in after hydration. The
 * stated justification ("Radix generates dynamic aria-controls ids that differ
 * between SSR and client") was false — a closed trigger renders only
 * `data-state` / `data-disabled`.
 *
 * These tests pin both halves of that so the gate cannot come back quietly:
 * the children survive `renderToString`, and no id-bearing attribute appears
 * while the menu is closed. The second one is the interesting guard — if a
 * future Radix version DOES start emitting an id here, this fails and tells
 * the next person that re-gating deserves a real look rather than a reflex.
 *
 * Context: FOUND_DEFECTS D144 (13 sibling wrappers still carry the gate).
 */

import React from "react";
import { renderToString } from "react-dom/server";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";

function Subject() {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div data-testid="row">ALWAYS VISIBLE ROW</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Never rendered while closed</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

describe("ui/context-menu — server render", () => {
  it("renders the wrapped children (the gate must not return null)", () => {
    const html = renderToString(<Subject />);
    expect(html).toContain("ALWAYS VISIBLE ROW");
  });

  it("keeps the trigger element itself, not just its text", () => {
    const html = renderToString(<Subject />);
    expect(html).toContain('data-testid="row"');
  });

  it("does not render the closed menu's content", () => {
    const html = renderToString(<Subject />);
    expect(html).not.toContain("Never rendered while closed");
  });

  it("emits no id-bearing attribute while closed — the premise of the deleted gate", () => {
    const html = renderToString(<Subject />);
    expect(html).not.toMatch(/aria-controls=/);
    expect(html).not.toMatch(/\bid="radix-/);
  });
});
