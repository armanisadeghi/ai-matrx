/**
 * A custom slot whose import the sandbox cannot supply is filed under the
 * app ROW, not its display name: `agent-app:<id>:slot:<slot>`. An app with no
 * name used to file as `agent-app:unnamed:slot:…`, which names no row to fix.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SlotRenderer } from "@/features/agent-apps/components/shells/SlotRenderer";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { resetUnresolvedImportCaptures } from "@/lib/diagnostics/captureUnresolvedImports";

function DefaultHeader() {
  return createElement("h1", null, "Default header");
}

beforeEach(() => {
  clearCapturedErrors();
  resetUnresolvedImportCaptures();
});

it("files an unresolved import in an unnamed app's slot under the app id", async () => {
  const markup = renderToStaticMarkup(
    createElement(SlotRenderer, {
      slot: "header",
      appId: "4e8d1c2a-9b7f-4f61-8a3e-2d5c6b7a8f90",
      overrides: { header: "custom" },
      code: {
        header: `
          import { TidePill } from "@/features/marine/TidePill";
          export default function Header() {
            return <h2><TidePill /> Newport Beach tides</h2>;
          }
        `,
      },
      allowedImports: ["react"],
      props: {},
      fallback: DefaultHeader,
    } as never),
  );
  expect(markup).toContain("Newport Beach tides");
  await new Promise((resolve) => setTimeout(resolve, 0));

  const relations = getSnapshot()
    .filter((e) => e.source === "sandbox-unresolved-import")
    .map((e) => e.relation);
  expect(relations).toEqual([
    "agent-app:4e8d1c2a-9b7f-4f61-8a3e-2d5c6b7a8f90:slot:header",
  ]);
});
