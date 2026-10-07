/**
 * @jest-environment jsdom
 */
/**
 * G11C (2026-10-07): a fresh load of a note fell to "This page stopped working"
 * — "Cannot access 'matrxDirectiveHost' before initialization". `directiveHost`
 * reaches `ContentIrHostBoundary` back through its own import graph, so the
 * host object was built while `matrxDirectiveHost` was still in its TDZ.
 *
 * This reproduces that order: the directive host's export THROWS until its
 * module has finished, exactly like a `const` in its TDZ. Building the content
 * host must not touch it; reading `directives` later must find it.
 */
let initialized = false;
const realHost = { confirm: jest.fn() };

jest.mock("@/features/matrx-envelope/directiveHost", () => ({
  get matrxDirectiveHost() {
    if (!initialized) throw new ReferenceError("Cannot access 'matrxDirectiveHost' before initialization");
    return realHost;
  },
}));
jest.mock("@ai-matrx/rich-content/display/chat-markdown/internal-handlers/SafeBlockRenderer", () => ({
  SafeBlockRenderer: () => null,
}));
jest.mock("@/components/official/structured-value/StructuredValueView", () => ({
  StructuredValueView: () => null,
}));

describe("the content host reads its directive host at use, never at module evaluation", () => {
  it("importing the host boundary while the directive host is mid-evaluation does not throw", () => {
    let mod: typeof import("../ContentIrHostBoundary") | undefined;
    expect(() => {
      mod = jest.requireActual("../ContentIrHostBoundary");
    }).not.toThrow();
    initialized = true;
    expect(mod!.matrxContentIrHost.directives).toBe(realHost);
  });
});
