import { parseReferenceFence } from "@/features/matrx-envelope/referenceFence";
import type { PickNode } from "@/features/scopes/components/active-context/quick-pick/engine";
import { contextValueResourceFromNode } from "../context-value-resource";

describe("contextValueResourceFromNode", () => {
  it("builds a live context_value fence from a Drill Deck item", () => {
    const node: PickNode = {
      kind: "item",
      id: "scope-1::item-1",
      label: "QME Report",
      path: ["Acme", "Doe v. CSV"],
      orgId: "org-1",
      typeId: "type-1",
      scopeId: "scope-1",
      contextItemId: "item-1",
    };

    const resource = contextValueResourceFromNode(node);

    expect(resource?.data.label).toBe("Doe v. CSV · QME Report");
    const parsed = parseReferenceFence(resource?.data.referenceFence ?? "");
    expect(parsed?.envelope.type).toBe("context_value");
    expect(parsed?.items[0]).toMatchObject({
      scope_id: "scope-1",
      context_item_id: "item-1",
    });
  });

  it("refuses non-cell nodes", () => {
    expect(
      contextValueResourceFromNode({
        kind: "scope",
        id: "scope-1",
        label: "Doe v. CSV",
        path: ["Acme", "Matters"],
        orgId: "org-1",
        typeId: "type-1",
        scopeId: "scope-1",
      }),
    ).toBeNull();
  });
});
