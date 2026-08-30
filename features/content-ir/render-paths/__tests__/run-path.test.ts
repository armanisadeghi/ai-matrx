/**
 * The preview must be able to FAIL.
 *
 * The old Preview tab handed a stored example straight to the component as an
 * object — no text, no recognition, no routing — so it showed green for kinds
 * that were rendering as key/value dumps in chat. These tests pin the property
 * that fixes that: each path reports what the route ACTUALLY returned, and a
 * kind with no component reaches the generic floor here exactly as it does in
 * production.
 */

import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import { runRenderPath } from "../run-path";
import { RENDER_PATHS } from "../paths";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));

const VALUE = {
  status: "complete",
  image_count_received: 5,
  products: [{ __kind: "product_entry", product_index: 1 }],
};

function seedComponent(kind: string) {
  componentRegistry.ingestDbRows([
    {
      kind,
      platform: "web",
      role: "output",
      componentKey: `${kind}_board`,
      source: "db",
      config: {},
      isActive: true,
      componentSource: "export default function B() { return null; }",
      propsTransform: null,
      pinnedKindVersion: null,
      updatedAt: "2026-08-29T00:00:00.000Z",
      createdBy: null,
    },
  ]);
}

const STREAMING = RENDER_PATHS.filter((p) => p.streams).map((p) => p.id);

describe("render paths report what the route actually did", () => {
  it("every streaming path recognizes the kind from raw text", () => {
    seedComponent("path_probe_kind");
    for (const id of STREAMING) {
      const run = runRenderPath(id, "path_probe_kind", VALUE);
      if (!run) throw new Error(`${id} produced no run`);
      if (!run.wire) throw new Error(`${id} streamed no text`);
      // The accumulator saw the shape — the recognition step the old preview
      // skipped entirely.
      const identified = run.records.some(
        (r) => r.envelope?.kind === "path_probe_kind",
      );
      if (!identified) throw new Error(`${id} never identified the kind`);
      expect(identified).toBe(true);
    }
  });

  it("a kind WITH a component reaches it on the chat paths", () => {
    seedComponent("path_ok_kind");
    for (const id of ["chat_fence", "chat_bare"] as const) {
      const run = runRenderPath(id, "path_ok_kind", VALUE)!;
      expect(run.verdict.reachedRealComponent).toBe(true);
      expect(run.verdict.resolvedAs).toBe("db_kind_component");
    }
  });

  it("a kind with NO component honestly reports the generic floor", () => {
    // THE PROPERTY THE OLD PREVIEW LACKED. A real failure, shown as one.
    const run = runRenderPath("chat_bare", "path_no_component_kind", VALUE)!;
    expect(run.verdict.reachedRealComponent).toBe(false);
    expect(run.verdict.resolvedAs).toBe("generic_structured");
    expect(run.verdict.fallbackReason).toBe("unregistered");
  });

  it("the reload path routes a stored value the way a rehydrated message does", () => {
    seedComponent("path_reload_kind");
    const run = runRenderPath("reload", "path_reload_kind", VALUE)!;
    expect(run.wire).toBeNull(); // nothing streams here, in production either
    expect(run.verdict.reachedRealComponent).toBe(true);
  });

  it("the server-partial path SAYS its input is synthesized", () => {
    seedComponent("path_partial_kind");
    const run = runRenderPath("server_partial", "path_partial_kind", VALUE)!;
    expect(
      run.verdict.notes.some((n) => /constructed in this browser/.test(n)),
    ).toBe(true);
  });
});
