/** @jest-environment jsdom */

// features/marketing/seo/topical-map/components/__tests__/no-sqlstate-in-page-text.test.tsx
//
// THE GUARD for lane NO-SQLSTATE (2026-09-25): a topical-map fault screen
// never prints the engine's own SQLSTATE as visible text — it shows the
// function's own sentence (`../errors.ts`) and keeps the code reachable only
// as a `data-topical-map-error-code` attribute / hover title, exactly the
// affordance `features/hr/time/shared/RefusalNotice.tsx` and
// `features/hr/shared/HrStates.tsx#HrError` already use.
//
// THE DEFECT THIS GUARDS (UI-FIX-19 census). `TopicalMapFault` used to render
// a line reading, verbatim, `SQLSTATE 23514` under the message — a database
// engine code with no remedy a person can act on. `hidden with --self-test`:
// reintroducing that line in memory must fail this test.
//
// Real: `TopicalMapFailed` / `TopicalMapFault`, `TopicalMapError`. Doubled:
// nothing — the component takes a plain thrown error.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { TopicalMapFailed } from "../TopicalMapStates";
import { TopicalMapError } from "../../errors";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function pgError(code: string, message: string, hint?: string) {
  return { code, message, hint };
}

describe("a topical-map fault screen never prints the SQLSTATE as page text", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each([
    ["22023", "Cannot merge: from_page_id must reference a page in this map."],
    ["23514", "Cannot retire topics with attachments: 3 pages still assigned."],
    ["42501", "retire_map_topics_denied"],
    ["P0002", "That topic is not in this map."],
  ])("code %s never appears as visible text", (code, message) => {
    const error = new TopicalMapError(
      "seo.retire_map_topics",
      pgError(code, message, "Move the pages first."),
    );

    act(() => {
      root.render(
        <TopicalMapFailed what="the topical map" error={error} />,
      );
    });

    const rendered = container.textContent ?? "";

    // The engine's own token is never page text …
    expect(rendered).not.toMatch(/SQLSTATE/i);
    expect(rendered).not.toContain(code);

    // … but it stays reachable for a support report, off the visible text.
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.getAttribute("data-topical-map-error-code")).toBe(code);
    expect(alert?.getAttribute("title")).toBe(`Reference: ${code}`);

    // The function's own sentence — the thing a person can act on — is what
    // actually renders.
    expect(rendered).toContain(message);
  });
});
