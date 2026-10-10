/**
 * @jest-environment jsdom
 */
/**
 * "THIS ADDRESS DOESN'T MATCH" IS SAID ONLY AGAINST A TREE THAT LOADED (lane SCOPES-READ-SWITCH-VALIDATE,
 * 2026-09-30).
 *
 * Walking the store read path on the dev clone, the owner of Castellano & Reyes opened her own Matters
 * page and was told "This address doesn't match a scope type you can open — 'matters' didn't resolve
 * for your account." The tree read had FAILED (a statement timeout), and every scope page shows
 * ScopeNotFound once the tree has "settled" — which a failure also counts as. A failed read is a failure
 * with its retry; a read in flight is a wait; only a loaded tree may say the address matched nothing.
 * RED on the HEAD copy of ScopeNotFound.tsx (it said "doesn't match" in all three states), GREEN after.
 */
import { renderToStaticMarkup } from "react-dom/server";

const state: { treeStatus: string; treeError: unknown } = { treeStatus: "ready", treeError: null };

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ scopesTree: state }),
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectTreeStatus: (s: { scopesTree: typeof state }) => s.scopesTree.treeStatus,
  selectTreeError: (s: { scopesTree: typeof state }) => s.scopesTree.treeError,
}));
jest.mock("@/features/scopes/redux/thunks/ensureScopeTree", () => ({ ensureScopeTree: () => ({ type: "noop" }) }));
jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual("@ai-matrx/design-system"),
  ReadFailure: ({ what }: { what: string }) => <div>Could not load {what}</div>,
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => <div>access gate</div> }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ScopeNotFound } = require("../ScopeNotFound");

const props = { token: "scope_type" as const, param: "matters", entityLabel: "scope type", backHref: "/organizations/castellano-reyes/scopes", backLabel: "Back to scopes" };
const NO_MATCH = /doesn.{1,6}t match a scope type you can open/;

describe("ScopeNotFound waits for a loaded tree", () => {
  it("a tree still loading is a wait, never 'doesn't match'", () => {
    state.treeStatus = "loading";
    state.treeError = null;
    const html = renderToStaticMarkup(<ScopeNotFound {...props} />);
    expect(html).not.toMatch(NO_MATCH);
    expect(html).toContain('role="status"');
  });

  it("a tree that failed is said as a failure, never 'doesn't match'", () => {
    state.treeStatus = "error";
    state.treeError = { code: "internal", message: "The database took too long to respond" };
    const html = renderToStaticMarkup(<ScopeNotFound {...props} />);
    expect(html).not.toMatch(NO_MATCH);
    expect(html).toContain("Could not load your scopes");
  });

  it("a loaded tree without the slug says the address matched nothing", () => {
    state.treeStatus = "ready";
    state.treeError = null;
    expect(renderToStaticMarkup(<ScopeNotFound {...props} />)).toMatch(/doesn&#x27;t match a scope type you can open/);
  });
});
