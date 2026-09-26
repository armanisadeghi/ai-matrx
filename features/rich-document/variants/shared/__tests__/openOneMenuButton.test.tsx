/**
 * ALC-15 exit proof finding: a note's preview bar renders BESIDE its content,
 * so ⋯ bubbled to the EDITOR's outer menu (14 rows) instead of the preview's
 * own (30 rows) — ⋯ and right-click disagreed on the same note.
 * Break it names: ⋯ dispatching on itself (bubbling to the outer menu) → red.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { OpenOneMenuButton } from "../OpenOneMenuButton";
import { contentSourceKey } from "@/features/context-menu-v3/menu-presence";
import type { ContentSource } from "../../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("⋯ beside the content opens the content's own menu, not the outer one", () => {
  const source = { type: "note", mode: "identity", noteId: "n-1", sourceId: "s-1" } as ContentSource;
  const key = contentSourceKey(source);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const hits: string[] = [];
  const root = createRoot(host);
  act(() => {
    root.render(
      <div data-alchemy-trigger="context" data-content-source={key} onContextMenu={() => hits.push("outer-editor")}>
        <div>
          <div data-alchemy-trigger="context" data-content-source={key} onContextMenu={(e) => { e.stopPropagation(); hits.push("preview"); }}>
            <p>Kiln firing schedule</p>
          </div>
          <OpenOneMenuButton source={source} />
        </div>
      </div>,
    );
  });
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
  act(() => button?.click());
  expect(hits).toEqual(["preview"]);
  act(() => root.unmount());
  host.remove();
});
