/** @jest-environment jsdom */

// Guard (2026-10-03): the CRM views bar showed only views made by me or living in my
// organizations, so a view shared with me directly never appeared. Views now come from
// public.saved_view_list_lanes in three sections — Mine, Shared with me, Organization —
// labelled inline in the bar's one row (no lane row of its own).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

function view(id: string, name: string, section: "mine" | "shared" | "orgs") {
  return {
    id,
    name,
    section,
    description: null,
    surface_key: "crm/parties",
    subject_id: null,
    definition: {},
    definition_version: 1,
    is_default: false,
    sort_order: null,
    organization_id: "22222222-2222-4222-8222-222222222222",
    created_by: null,
    updated_by: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    deleted_at: null,
    version: 1,
    metadata: {},
    visibility: "internal",
    last_used_at: null,
    custom_fields: {},
    shown_to: null,
    published_to_web: false,
    published_to_web_at: null,
    published_to_web_by: null,
  };
}

jest.mock("../../../saved-views/service", () => ({
  fetchSavedViews: jest.fn(async () => [
    view("11111111-1111-4111-8111-111111111111", "Untouched leads", "mine"),
    view("55555555-5555-4555-8555-555555555555", "Owed a callback", "shared"),
    view("77777777-7777-4777-8777-777777777777", "Companies with no phone", "orgs"),
  ]),
  createSavedView: jest.fn(),
  deleteSavedView: jest.fn(),
  touchSavedView: jest.fn(),
  updateSavedView: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  recordToast: { success: jest.fn() },
  dismissRecordToasts: jest.fn(),
}));
jest.mock("@ai-matrx/design-system/item", () => ({
  ...jest.requireActual("@ai-matrx/design-system/item"),
  ItemMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { SavedViewBar }: typeof import("../SavedViewBar") = require("../SavedViewBar");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CRM views bar sections", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("labels Mine, Shared with me and Organization inline, in that order", async () => {
    await act(async () =>
      root.render(
        <SavedViewBar
          ctx={{ userId: "33333333-3333-4333-8333-333333333333", orgIds: [] } as never}
          codec={{ listKey: "parties", parse: (raw: unknown) => raw }}
          current={null}
          matches={() => true}
          describe={() => ""}
          orgId={null}
          activeViewId={null}
          onActiveViewIdChange={() => {}}
          onApply={() => {}}
        />,
      ),
    );
    await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
    const sections = [...container.querySelectorAll("[data-saved-view-section]")].map((n) => n.textContent);
    expect(sections).toEqual(["Mine", "Shared with me", "Organization"]);
    const text = container.textContent ?? "";
    expect(text.indexOf("Shared with me")).toBeLessThan(text.indexOf("Owed a callback"));
    expect(text.indexOf("Owed a callback")).toBeLessThan(text.indexOf("Organization"));
  });
});
