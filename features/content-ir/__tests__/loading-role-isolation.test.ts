/**
 * A `loading`-role component is the kind's LOADING face and must NEVER be
 * dispatched as its OUTPUT component.
 *
 * `content_ir.kind_component_role_check` accepts `loading` since 2026-08-25.
 * The Matrix resolver adapter coerces unrecognized roles to "output" so one
 * bad row cannot blank a kind — which, for a loading row, would pin the
 * skeleton in place of the finished shape forever. This pins the exclusion.
 */

import { ComponentRegistry } from "../registry/component-registry";

const KIND = "loading_role_isolation_kind";

function row(role: string, componentKey: string) {
  return {
    kind: KIND,
    platform: "web",
    role,
    componentKey,
    source: "db",
    isActive: true,
    config: {},
    componentSource: "export default function C(){return null}",
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-08-25T00:00:00Z",
  };
}

describe("loading-role isolation", () => {
  it("a loading row never becomes the kind's output component", () => {
    const registry = new ComponentRegistry(() => []);
    registry.ingestDbRows([row("loading", "my_loading_face")] as never);
    expect(registry.resolve(KIND, "web", "output")).toBeNull();
    expect(registry.resolve(KIND, "web", "input")).toBeNull();
  });

  it("output rows still resolve, alongside a loading row for the same kind", () => {
    const registry = new ComponentRegistry(() => []);
    registry.ingestDbRows([
      row("loading", "my_loading_face"),
      row("output", "my_real_component"),
    ] as never);
    expect(registry.resolve(KIND, "web", "output")?.componentKey).toBe(
      "my_real_component",
    );
  });

  it("replaceDbRows applies the same exclusion", () => {
    const registry = new ComponentRegistry(() => []);
    registry.replaceDbRows([row("loading", "my_loading_face")] as never);
    expect(registry.resolve(KIND, "web", "output")).toBeNull();
  });
});
