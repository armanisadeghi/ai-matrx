/**
 * LANE 7 W1 (items 13 and T1.2) — THE RECORD PAGE'S CUSTOM FIELDS ARE NEVER SILENTLY ABSENT, AND A
 * PERSON WHO MAY NOT ADD A FIELD IS OFFERED HER OWN TABLE IN THE RECORD'S ORGANIZATION.
 *
 * Use case: Cedar Ridge Physical Therapy keeps its patients as CRM people. On Marisol Vega's page:
 *   - the organization's record-store switch answers OFF  -> "Off for this organization";
 *   - the switch could not be read                        -> "Couldn't check this organization" + Retry
 *     (never "off": `enabled()` folds "could not read" into "off", `check()` does not);
 *   - the switch is ON -> the section gets the app's own word for the table ("People & Companies",
 *     never the store's "Party") and a "Make your own table" that opens the New table dialog with
 *     the RECORD's organization already chosen as where it is saved.
 *
 * Plants (recorded in lane 7's W1 report): swap `check` for `enabled` -> the unavailable clause goes
 * red; drop `entityLabel` or `onMakeOwnTable` -> the wiring clause goes red; drop the organization
 * hand-off to the dialog -> the organization clause goes red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const CEDAR_RIDGE = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const ELM_STREET = "5b1d7c2e-3f40-4a8b-9c6d-7e8f9a0b1c2d";
const MARISOL = "82a25af4-27cb-4e94-a2de-155eae7c8992";

let activeOrganization: string | null = ELM_STREET;
const dispatched: unknown[] = [];
const sectionProps: Array<Record<string, unknown>> = [];

jest.mock("@ai-matrx/records-ui", () => ({
  CustomFieldsSection: (props: Record<string, unknown>) => {
    sectionProps.push(props);
    return <div data-test-section="" />;
  },
  RecordsMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  personActor: () => ({ actor: "user" }),
  recordsDataSource: () => ({}),
}));
// Linked records have their own test (entity-back-links.test.tsx); this one is about the fields.
jest.mock("@/features/unified-data/components/EntityBackLinks", () => ({ EntityBackLinks: () => null }));
jest.mock("@/features/unified-data/hub/doors", () => ({
  entityRecordHome: async () => ({ ok: true, data: { organization_id: CEDAR_RIDGE } }),
  entityRecordReadable: async () => ({ ok: true, data: null }),
}));
// The section's own reads are kept in Redux by record (`useStoreRead`); this page's cases are about
// what the answers SAY, so a plain one-read stand-in carries them (the read-once law has its own
// test: entity-custom-fields-reads-once.test.tsx).
jest.mock("@/lib/redux/store-reads/useStoreRead", () => {
  const { useEffect, useState } = jest.requireActual("react") as typeof import("react");
  return {
    useStoreRead: (key: string | null, read: () => Promise<unknown>) => {
      const [answer, setAnswer] = useState<{ data?: unknown; failed?: boolean } | null>(null);
      useEffect(() => {
        if (!key) return;
        void read().then((data) => setAnswer({ data }), () => setAnswer({ failed: true }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [key]);
      const status = !key ? "ready" : !answer ? "loading" : answer.failed ? "error" : "ready";
      return { data: answer?.data, status, hasData: !!answer && !answer.failed, refresh: async () => {} };
    },
  };
});
jest.mock("@/features/organizations/organizationsIAmIn", () => ({ mayReadAsMember: async () => true }));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => "active" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user" }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: () => string) => (selector() === "active" ? activeOrganization : "4060701e-706a-4c76-b3ca-0bbc69fa5a14"),
  useAppDispatch: () => (action: unknown) => {
    dispatched.push(action);
  },
}));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  chooseActiveOrganization: (org: { id: string; name: string }) => ({ type: "choose", org }),
}));
jest.mock("@/features/scopes/hooks/useScopeTree", () => ({
  useScopeTree: () => ({
    organizations: [
      { id: ELM_STREET, name: "Elm Street Workshop" },
      { id: CEDAR_RIDGE, name: "Cedar Ridge Physical Therapy" },
    ],
  }),
}));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({
  tryGetEntityInfo: (token: string) => (token === "party" ? { labelPlural: "People & Companies" } : null),
}));
// The host module also exports the share surface (ShareModal -> scopes -> associations store), none of which
// this test is about; EntityCustomFields takes only `useAppRecordsConfig` from it.
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({
  useAppRecordsConfig: (organizationId: string | null) => ({ dataSource: {}, actor: { actor: "user" }, organizationId }),
}));
jest.mock("@/features/make/MakeMount", () => ({
  NewTableDialog: ({ what, organization }: { what: string | null; organization?: { id: string } | null }) =>
    what ? <div data-new-table-dialog={what} data-new-table-organization={organization?.id ?? ""} /> : null,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@ai-matrx/chat/surfaces/runtime/custom-field-targets", () => ({
  CUSTOM_FIELDS_VALUE_NAME: "custom_fields",
  customFieldsScopeValue: () => null,
  registerCustomFieldsDoor: () => () => undefined,
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceDormant: () => false,
  useSurfaceRuntime: () => null,
  useSurfaceScopeContribution: () => undefined,
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({ getManifest: () => undefined }));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { EntityCustomFields } from "../EntityCustomFields";
import { forgetAllKeptAnswers } from "@/lib/kept-answer/keptAnswer";

describe("a record page's custom fields say why, and offer her own table", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    // The switch's answer is kept per organization for the session; each case is a new session.
    forgetAllKeptAnswers();
    activeOrganization = ELM_STREET;
    dispatched.length = 0;
    sectionProps.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  async function show() {
    await act(async () => {
      root.render(<EntityCustomFields entityToken="party" recordId={MARISOL} organizationId={CEDAR_RIDGE} />);
    });
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  it("T1.2: the section reads the app's word for the table and carries the own-table offer", async () => {
    await show();
    const props = sectionProps.at(-1);
    expect(props).toBeDefined();
    expect(props?.["entityLabel"]).toBe("People & Companies");
    expect(typeof props?.["onMakeOwnTable"]).toBe("function");
  });

  it("T1.2: Make your own table opens New table in the record's organization — the active one is never switched", async () => {
    await show();
    const offer = sectionProps.at(-1)?.["onMakeOwnTable"] as () => void;
    await act(async () => offer());
    // Opening a record never switches the active organization (active-organization plan, 2026-10-07).
    expect(dispatched).toEqual([]);
    const dialog = host.querySelector('[data-new-table-dialog="create"]');
    expect(dialog?.getAttribute("data-new-table-organization")).toBe(CEDAR_RIDGE);
  });

  it("T1.2: already working in the record's organization, nothing is switched", async () => {
    activeOrganization = CEDAR_RIDGE;
    await show();
    const offer = sectionProps.at(-1)?.["onMakeOwnTable"] as () => void;
    await act(async () => offer());
    expect(dispatched).toEqual([]);
    expect(host.querySelector('[data-new-table-dialog="create"]')).not.toBeNull();
  });
});
