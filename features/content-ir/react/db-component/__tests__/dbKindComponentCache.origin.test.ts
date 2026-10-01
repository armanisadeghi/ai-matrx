/**
 * A DB kind component whose import the sandbox cannot supply is filed under
 * its kind row — `kind-component:<kind>:<platform>:<role>` — not the bare
 * family `kind-component`, which names no row to fix.
 */
import type { ComponentResolution } from "@ai-matrx/content-ir-react";
import { getOrCompileDbKindComponent } from "@/features/content-ir/react/db-component/dbKindComponentCache";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { resetUnresolvedImportCaptures } from "@/lib/diagnostics/captureUnresolvedImports";

beforeEach(() => {
  clearCapturedErrors();
  resetUnresolvedImportCaptures();
});

it("files an unresolved import under the kind, platform and role it compiled for", async () => {
  const resolution = {
    componentKey: "listing_scorecard_view",
    source: "db",
    config: {},
    isActive: true,
    resolvedBy: "db",
    componentSource: `
      import { ScoreDial } from "@/features/listings/ScoreDial";
      export default function Scorecard({ data }) {
        return <div><ScoreDial /> {String(data?.title ?? "")}</div>;
      }
    `,
    propsTransform: null,
    hasComponentSource: true,
    pinnedKindVersion: null,
    updatedAt: "2026-10-01T09:00:00Z",
    createdBy: null,
  } as unknown as ComponentResolution;

  const result = getOrCompileDbKindComponent("listing_scorecard", resolution);
  expect(result.ok).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const relations = getSnapshot()
    .filter((e) => e.source === "sandbox-unresolved-import")
    .map((e) => e.relation);
  expect(relations).toEqual(["kind-component:listing_scorecard:web:output"]);
});
