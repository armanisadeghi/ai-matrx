/**
 * @jest-environment jsdom
 */
/**
 * G11C → G13 (2026-10-07): a fresh load of a note fell to "This page stopped
 * working" — "Cannot access 'matrxDirectiveHost' before initialization".
 * `ContentIrHostBoundary` imported `directiveHost`, whose door graph reaches the
 * host again. The cut: the host reads a leaf slot the directive host fills.
 *
 * Proved here in a fresh module registry: evaluating the host boundary must not
 * evaluate `directiveHost` at all (its mock throws on evaluation), and the host
 * hands out whatever the directive host provided, read at use. The graph-wide
 * half is `pnpm check:host-cycles`.
 */
jest.mock("@/features/matrx-envelope/directiveHost", () => {
  throw new Error("ContentIrHostBoundary evaluated directiveHost — the G13 cycle is back");
});
jest.mock("@ai-matrx/rich-content/display/chat-markdown/internal-handlers/SafeBlockRenderer", () => ({
  SafeBlockRenderer: () => null,
}));
jest.mock("@/components/official/structured-value/StructuredValueView", () => ({
  StructuredValueView: () => null,
}));

describe("the content host reads its directive host from a slot, never from an import", () => {
  it("evaluates without evaluating directiveHost, then reads what was provided", () => {
    jest.isolateModules(() => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      let mod: typeof import("../ContentIrHostBoundary") | undefined;
      expect(() => {
        mod = jest.requireActual("../ContentIrHostBoundary");
      }).not.toThrow();
      const slot: typeof import("../directiveHostSlot") = jest.requireActual("../directiveHostSlot");
      // An empty read is loud, never silent.
      expect(mod!.matrxContentIrHost.directives).toBeUndefined();
      expect(errSpy).toHaveBeenCalledTimes(1);
      const realHost = { confirm: jest.fn() } as unknown as Parameters<typeof slot.provideDirectiveHost>[0];
      slot.provideDirectiveHost(realHost);
      expect(mod!.matrxContentIrHost.directives).toBe(realHost);
      errSpy.mockRestore();
    });
  });
});
