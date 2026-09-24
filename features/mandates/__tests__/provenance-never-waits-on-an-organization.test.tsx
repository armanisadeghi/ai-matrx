/**
 * READING A MANDATE'S PROVENANCE NEVER WAITS ON AN ORGANIZATION.
 *
 * Found live 2026-09-24 (admin@admin.com, no organization selected):
 * `/mandates/<key>` showed "Reading where this Mandate came from…" forever.
 * `useMandateProvenance` returned early while no org was selected, and
 * `loading` starts `true`, so the panel never left its loading line and the
 * request never left the browser — access belongs to the person
 * (common-docs/policies/access-belongs-to-the-person.md), so reading must go.
 *
 * Asserted on the wire (the `callApi` request) and on what the hook reports:
 * with NO organization the request is made, and the server's answer — a
 * refusal here — settles the hook with that sentence instead of spinning.
 */
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useMandateProvenance } from "../provenance";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const requests: Array<{ path: string }> = [];
let organizationId: string | null = null;

// A STABLE dispatch, as the real store's is — a fresh function per render
// would re-run the hook's effect on every render.
const dispatch = (action: unknown) => action;
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: () => organizationId,
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => organizationId,
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (args: { path: string }) => {
    requests.push({ path: args.path });
    return Promise.resolve({
      error: { message: "Choose an organization to read this report." },
    });
  },
}));

let container: HTMLDivElement;
let root: Root;
let seen: ReturnType<typeof useMandateProvenance> | null = null;

function Probe({ mandateKey }: { mandateKey: string }) {
  const state = useMandateProvenance(mandateKey);
  useEffect(() => {
    seen = state;
  }, [state]);
  return null;
}

beforeEach(() => {
  requests.length = 0;
  seen = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useMandateProvenance with no organization selected", () => {
  it("asks the server and settles on its answer instead of loading forever", async () => {
    organizationId = null;

    await act(async () => {
      root.render(<Probe mandateKey="messaging.summarize" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(requests.map((r) => r.path)).toEqual([
      "/mandates/{mandate_key}/provenance",
    ]);
    expect(seen?.loading).toBe(false);
    expect(seen?.error).toBe("Choose an organization to read this report.");
  });
});
