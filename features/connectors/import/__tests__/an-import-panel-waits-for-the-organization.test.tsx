/**
 * 🚨 VERIFY-R7-FIX-WAVE NEW-1, the same class one window in — the Google Tasks
 * import PANEL.
 *
 * The panel receives the organization the opener read at open time. A window
 * opened while boot was still resolving therefore carried `null` forever — and
 * the panel rendered its terminal sentence ("Choose the organization these tasks
 * belong to first") at a person who had already chosen one, and went on
 * rendering it after boot settled, because a prop does not change.
 *
 * This proves the repair:
 *
 *   resolving → a CHECKING state, never the refusal, and no Google call;
 *   settled with nothing → the honest sentence with the remedy, and no call;
 *   settled with a selection → the panel loads, with the selected organization,
 *     even though the prop it was opened with is still null.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = {
  organization_id: null as string | null,
  orgBootstrapResolved: false,
};
const listCalls: { organizationId: string }[] = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (s: unknown) => unknown) => selector({ appContext: store }),
}));
jest.mock("@/features/connectors/import/service", () => ({
  listGoogleTasks: async (args: { organizationId: string }) => {
    listCalls.push({ organizationId: args.organizationId });
    return { task_lists: [], warnings: [] };
  },
  importGoogleTasks: async () => ({ results: [], warnings: [] }),
}));
jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => null,
}));
jest.mock("@/lib/toast", () => ({
  toast: { warning: () => {}, error: () => {}, success: () => {}, info: () => {} },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GoogleTasksImportPanel } = require("@/features/connectors/import/GoogleTasksImportPanel") as {
  GoogleTasksImportPanel: React.ComponentType<{ organizationId: string | null }>;
};

function render(): { text: string; html: string; unmount: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<GoogleTasksImportPanel organizationId={null} />);
  });
  const text = host.textContent ?? "";
  const html = host.innerHTML;
  return {
    text,
    html,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("the Google Tasks import panel and the three organization states", () => {
  beforeEach(() => {
    store.organization_id = null;
    store.orgBootstrapResolved = false;
    listCalls.length = 0;
  });

  it("while boot is RESOLVING: the checking state, no refusal, and no Google call", () => {
    const view = render();
    try {
      expect(view.text).not.toMatch(/Choose the organization/);
      expect(view.text).toMatch(/Checking which organization/i);
      expect(view.html).toContain("organization-resolving-notice");
      expect(listCalls).toEqual([]);
    } finally {
      view.unmount();
    }
  });

  it("boot SETTLED with nothing: the honest sentence, and still no Google call", () => {
    store.orgBootstrapResolved = true;
    const view = render();
    try {
      expect(view.text).toMatch(/Choose the organization these tasks belong to first/);
      expect(view.html).toContain("organization-required-notice");
      expect(listCalls).toEqual([]);
    } finally {
      view.unmount();
    }
  });

  it("boot settled WITH a selection: it loads, even though the prop is null", () => {
    store.organization_id = "11111111-2222-3333-4444-555555555555";
    store.orgBootstrapResolved = true;
    const view = render();
    try {
      expect(view.text).not.toMatch(/Choose the organization/);
      expect(listCalls).toEqual([
        { organizationId: "11111111-2222-3333-4444-555555555555" },
      ]);
    } finally {
      view.unmount();
    }
  });
});
