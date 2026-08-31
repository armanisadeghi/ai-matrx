/** DB-reload channel probe: real splitter → real route, real payload. */
import * as fs from "node:fs";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));

import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { applyIrKindRoute, readIrRouteMarker } from "@/features/content-ir/react/kind-route";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import type { KindComponentProjection } from "@/features/content-ir/registry/schema-source-kind-components";

const PAYLOAD_PATH = "/tmp/payload.json";
const describeWithPayload = fs.existsSync(PAYLOAD_PATH) ? describe : describe.skip;

const liveRow: KindComponentProjection = {
  kind: "agent_mandate_specification",
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

describeWithPayload("db-reload channel", () => {
  it("split → envelope → route", () => {
    const payload = fs.readFileSync(PAYLOAD_PATH, "utf8").trim();
    const blocks = splitContentIntoBlocksV2(payload);
    console.log("BLOCKS:", blocks.map((b: any) => ({
      type: b.type,
      hasIr: !!(b.metadata as any)?.__ir,
      irKind: (b.metadata as any)?.__ir?.root?.kind ?? null,
      irState: (b.metadata as any)?.__ir?.root?.kindState ?? null,
      contentHead: String(b.content ?? "").slice(0, 40),
    })));

    // COLD route (fresh tab first paint)
    for (const b of blocks) {
      const routedCold = applyIrKindRoute(b as any) as any;
      console.log("COLD ROUTE:", b.type, "->", routedCold.type, "marker:", JSON.stringify(readIrRouteMarker(routedCold.metadata)));
    }

    // SETTLED route (list landed with the real row)
    componentRegistry.replaceDbRows([liveRow]);
    for (const b of blocks) {
      const routed = applyIrKindRoute(b as any) as any;
      console.log("SETTLED ROUTE:", b.type, "->", routed.type, "marker:", JSON.stringify(readIrRouteMarker(routed.metadata)));
    }
  });
});
