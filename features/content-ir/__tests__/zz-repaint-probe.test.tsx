/**
 * @jest-environment jsdom
 *
 * Cold-start probe: BlockRenderer's exact route+repaint logic, in isolation.
 */
import React, { useMemo } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  getKindComponentBySlug,
  listKindComponentsFromTables,
  type KindComponentProjection,
} from "../registry/schema-source-kind-components";

jest.mock("../registry/schema-source-kind-components", () => {
  const actual = jest.requireActual<typeof import("../registry/schema-source-kind-components")>(
    "../registry/schema-source-kind-components",
  );
  return { ...actual, listKindComponentsFromTables: jest.fn(), getKindComponentBySlug: jest.fn() };
});
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));

import { normalizeJsonRegion } from "@ai-matrx/content-ir";
import { readEnvelope } from "../redux/render-block-envelope";
import { applyIrKindRoute } from "../react/kind-route";
import { useContentIrKindVersion } from "../react/use-registry-repaint";
import { useEnsureKindRenderable } from "../react/ensure-kind-renderable";
import { kindRegistry } from "../registry/kind-registry";

const mockList = listKindComponentsFromTables as jest.MockedFunction<typeof listKindComponentsFromTables>;
const mockBySlug = getKindComponentBySlug as jest.MockedFunction<typeof getKindComponentBySlug>;

const KIND = "agent_mandate_specification";
const row: KindComponentProjection = {
  kind: KIND,
  platform: "web",
  role: "output",
  componentKey: "agent_mandate_specification_workbench",
  source: "db",
  isActive: true,
  config: {},
  componentSource: "export default function C(){return null}",
  hasComponentSource: true,
  propsTransform: null,
  pinnedKindVersion: null,
  updatedAt: "2026-08-31T01:54:26.610Z",
  createdAt: "2026-08-31T01:54:26.610Z",
  createdBy: null,
  id: "c-2",
};

const PAYLOAD = JSON.stringify({
  __kind: KIND,
  goal: { __kind: "agent_goal", role: "Mandate architect awaiting task definition." },
  charge: "OK",
});

function Probe({ block }: { block: Record<string, unknown> }) {
  const kind = readEnvelope(block.metadata as Record<string, unknown>)?.root.kind || null;
  const version = useContentIrKindVersion(kind);
  useEnsureKindRenderable(kind);
  const routed = useMemo(() => {
    void version;
    return applyIrKindRoute(block as never) as { type: string };
  }, [block, version]);
  return <div data-testid="block-type">{routed.type}</div>;
}

describe("cold-start repaint (the /chat reload path)", () => {
  it("starts generic, then repaints to the author's component once the fetch lands", async () => {
    // Cold: warm list empty (as if this kind is new / not in the first payload),
    // per-kind cold fetch answers with the real row.
    mockList.mockResolvedValue([]);
    mockBySlug.mockResolvedValue([row]);

    const envelope = normalizeJsonRegion(PAYLOAD, { schemas: kindRegistry.resolver() });
    // eslint-disable-next-line no-console
    console.log("ENVELOPE kind/state:", envelope.root.kind, "/", envelope.root.kindState);

    const block = { type: "code", content: PAYLOAD, metadata: { __ir: envelope } };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<Probe block={block} />); });

    const readType = () => host.querySelector('[data-testid="block-type"]')?.textContent;
    // eslint-disable-next-line no-console
    console.log("FIRST PAINT:", readType());

    // Let the cold fetch land + repaint.
    for (let i = 0; i < 20; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
      if (readType() === "db_kind_component") break;
    }
    // eslint-disable-next-line no-console
    console.log("AFTER FETCH:", readType());
    expect(readType()).toBe("db_kind_component");
  });
});
