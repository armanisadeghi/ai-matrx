/**
 * A menu's header follows the record's CURRENT name.
 *
 * THE DEFECT (G6B review, 2026-10-02, nightly clone): after a note was renamed,
 * its right-click menu still read "Note: New Note". The menu stays mounted
 * between opens, and the alchemy engine (`useMenuEngine`) rebuilds its model —
 * header included — only when `revision` moves; the header text is not one of
 * its dependencies. The host passed `revision = drawn` (the rows), so a rename
 * with the same rows never reached the header.
 *
 * Proof with the real engine: one mounted menu, the same rows, a new name.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createActionRegistry, createClickTarget } from "@ai-matrx/alchemy/actions";
import { AlchemyActionsProvider } from "@ai-matrx/alchemy/react/host";
import { ContextMenuPanel } from "@ai-matrx/alchemy/react/menu";
import { menuEngineRevision } from "@/features/context-menu-v3/alchemy-provider";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ports = {
  diagnostics: { capture: () => undefined },
} as unknown as Parameters<typeof createActionRegistry>[0]["ports"];

function Menu({ target, title, revision }: { target: unknown; title: string; revision: string }) {
  const registry = React.useMemo(() => createActionRegistry({ ports }), []);
  return (
    <AlchemyActionsProvider ports={ports} registry={registry}>
      <ContextMenuPanel
        target={target as never}
        point={{ x: 10, y: 10 }}
        open
        onOpenChange={() => undefined}
        content={title}
        contentLabel="Note"
        revision={revision}
      />
    </AlchemyActionsProvider>
  );
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("a menu header follows a rename", () => {
  it("the same mounted menu, the same rows, a new name → the new name", async () => {
    const target = createClickTarget({} as never);
    const drawn = "rows-v1";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (title: string) =>
      act(() => {
        root.render(
          <Menu
            target={target}
            title={title}
            revision={menuEngineRevision(drawn, { content: title, contentLabel: "Note" })}
          />,
        );
      });
    render("New Note");
    await flush();
    expect(document.body.textContent).toContain("New Note");
    render("Clinic intake checklist");
    await flush();
    expect(document.body.textContent).toContain("Clinic intake checklist");
    expect(document.body.textContent).not.toContain("New Note");
    act(() => root.unmount());
    container.remove();
  });
});
