/**
 * ALC-15 verifier finding 1: a bar with NO enclosing right-click menu (a note's
 * preview at phone width, every RichDocumentActions host) opened a ⋯ of the
 * rich-document rows only — no clipboard verbs, agents, Quick Actions or page
 * rows — so ⋯ and right-click disagreed. Break it names: a ⋯ that is not backed
 * by the ONE context-menu engine → red.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/features/rich-document/RegistryContextMenu", () => ({
  RegistryContextMenu: (p: { source: { type: string }; children: React.ReactNode }) =>
    require("react").createElement("div", { "data-testid": "one-engine", "data-source": p.source.type }, p.children),
}));
jest.mock("@ai-matrx/alchemy/react/host", () => ({ useAlchemyActions: () => ({ registry: {} }) }));
jest.mock("@ai-matrx/alchemy/react/bar", () => ({ ActionBar: () => null }));
jest.mock("@ai-matrx/alchemy/react/overflow", () => ({ OverflowMenu: () => require("react").createElement("div", { "data-testid": "package-overflow" }) }));
jest.mock("../../actions/provider", () => ({ ensureRichDocumentProvider: () => undefined }));
jest.mock("../shared/AlchemyDocumentMenu", () => ({ AlchemyDocumentMenu: () => null }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

import { ActionBar } from "../ActionBar";
import { MenuVariant } from "../MenuVariant";
import type { RichDocumentActionContext } from "../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ctx = {
  content: "Kiln firing schedule",
  source: { type: "note", mode: "identity", noteId: "n-1", sourceId: "s-1" },
  metadata: null,
  isCreator: false,
  surfaceKey: null,
} as unknown as RichDocumentActionContext;
const target = { excludedActionIds: new Set<string>(), host: { kind: "rich-document", extra: [] } } as never;

function renderInto(el: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(el));
  return { host, done: () => { act(() => root.unmount()); host.remove(); } };
}

it.each([
  ["bar", <ActionBar key="b" actions={[]} getCtx={() => ctx} target={target} sourceId="s" />],
  ["menu", <MenuVariant key="m" getCtx={() => ctx} target={target} />],
])("%s: with no enclosing menu, ⋯ is backed by the one context-menu engine", (_name, el) => {
  const { host, done } = renderInto(el);
  const engine = host.querySelector('[data-testid="one-engine"]');
  expect(engine?.getAttribute("data-source")).toBe("note");
  expect(engine?.querySelector('button[aria-label="More actions"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="package-overflow"]')).toBeNull();
  done();
});
