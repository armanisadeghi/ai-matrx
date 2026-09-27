/**
 * GUARD — no menu row reads as a stray letter (2026-09-26: the Save submenu
 * showed a row reading only "F"; the cause was an icon that renders a letter —
 * menu-icons-are-glyphs.test.tsx pins that half).
 *
 * This pins the ROW: every registered action's label, as resolved for a real
 * chat message and as the row actually renders, is at least 3 characters.
 * A deliberately icon-only row must say so (`ICON_ONLY` below, with a reason).
 */
import "../../actions/handlers";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getAllActions } from "../../actions/provider";
import { resolveActionLabel } from "../../actions/utils";
import { chatContext } from "../../test-utils/chatContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Rows that are icon-only on purpose: id → reason. Empty today. */
const ICON_ONLY: Record<string, string> = {};
const MIN = 3;

describe("no menu row is a stray letter", () => {
  const ctx = chatContext("assistant");

  it.each(getAllActions().map((a) => [a.id, a] as const))("%s has a real label", (_id, action) => {
    if (ICON_ONLY[action.id]) return;
    const label = resolveActionLabel(action.label, ctx).trim();
    expect(label.length).toBeGreaterThanOrEqual(MIN);
  });

  it("every action's icon renders no text of its own (a row's words come only from its label)", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const offenders: string[] = [];
    for (const action of getAllActions()) {
      const Icon = action.icon;
      act(() => root.render(<Icon />));
      const text = (host.textContent ?? "").trim();
      if (text.length > 0) offenders.push(`${action.id}: "${text}"`);
    }
    act(() => root.unmount());
    expect(offenders).toEqual([]);
  });
});
