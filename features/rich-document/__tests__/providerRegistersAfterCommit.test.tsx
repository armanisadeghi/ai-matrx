/**
 * Registering the rich-document provider notifies every registry subscriber
 * (the selection toolbar's menu engine bumps its state). Done during render it
 * was React's "Cannot update a component (SelectionToolbar) while rendering a
 * different component (AlchemyMenuContent)" on /notes — double-click a word,
 * right-click (2026-09-27). Break it names: any host calling
 * `ensureRichDocumentProvider` outside the one after-commit hook → red.
 */
import * as fs from "fs";
import * as path from "path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const listeners = new Set<() => void>();
const registry = {
  register: () => {
    listeners.forEach((l) => l());
    return () => undefined;
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
jest.mock("@ai-matrx/alchemy/react/host", () => ({ useAlchemyActions: () => ({ registry }) }));
jest.mock("@ai-matrx/rich-content/rich-document/actions/provider", () => {
  const seen = new WeakSet<object>();
  return {
    ensureRichDocumentProvider: (r: { register(p: unknown): unknown }) => {
      if (seen.has(r)) return;
      seen.add(r);
      r.register({});
    },
  };
});

import { useRichDocumentProvider } from "@ai-matrx/rich-content/rich-document/actions/useRichDocumentProvider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Subscriber() {
  const [, setTick] = React.useState(0);
  React.useEffect(() => registry.subscribe(() => setTick((t) => t + 1)), []);
  return null;
}
function Menu() {
  useRichDocumentProvider();
  return null;
}

describe("rich-document provider registration", () => {
  it("never updates a subscriber while another component renders", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Subscriber />));
    await act(async () =>
      root.render(
        <>
          <Subscriber />
          <Menu />
        </>,
      ),
    );
    const renderPhaseUpdates = errors.mock.calls.filter((c) => String(c[0]).includes("while rendering a different component"));
    errors.mockRestore();
    await act(async () => root.unmount());
    expect(renderPhaseUpdates).toEqual([]);
  });

  it("is registered only through the after-commit hook", () => {
    const repo = path.resolve(__dirname, "../../..");
    const roots = ["features", "../aidream/apps/shared/chat/src", "components", "app", "lib"].map((d) => path.join(repo, d));
    const allowed = new Set([
      path.join(repo, "features/rich-document/actions/provider.ts"),
      path.join(repo, "features/rich-document/actions/useRichDocumentProvider.ts"),
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== "__tests__") walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !allowed.has(full)) {
          if (/\bensureRichDocumentProvider\s*\(/.test(fs.readFileSync(full, "utf8"))) offenders.push(path.relative(repo, full));
        }
      }
    };
    roots.filter((r) => fs.existsSync(r)).forEach(walk);
    expect(offenders).toEqual([]);
  });
});
