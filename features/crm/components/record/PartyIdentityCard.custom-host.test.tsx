/**
 * FTS-5d — the CRM contact's one form keeps what the old custom-fields mount did: it offers
 * "Make your own table" (started in the contact's organization, e.g. Cedar Ridge Physical Therapy),
 * and a dormant surface (a board tile that sleeps) registers the agent door as NOT live.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const CEDAR_RIDGE = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const ELM_STREET = "5b1d7c2e-3f40-4a8b-9c6d-7e8f9a0b1c2d";
let dormant = false;
const dispatched: unknown[] = [];
const formCustom: Array<Record<string, any>> = [];
const registered: Array<{ isLive: () => boolean }> = [];

jest.mock("@ai-matrx/records-ui", () => ({
  RecordsMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  StandardRecordForm: ({ custom, children }: { custom: Record<string, any>; children: React.ReactNode }) => {
    formCustom.push(custom);
    return <div>{children}</div>;
  },
  personActor: () => ({}),
  recordsDataSource: () => ({}),
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/custom-field-targets", () => ({
  registerCustomFieldsDoor: (door: { isLive: () => boolean }) => {
    registered.push(door);
    return () => undefined;
  },
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceDormant: () => dormant,
  useSurfaceWriteHandlers: () => undefined,
}));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => ({ labelPlural: "People & Companies" }) }));
jest.mock("@/features/make/MakeMount", () => ({
  NewTableDialog: ({ what }: { what: string | null }) => (what ? <div data-new-table-dialog={what} /> : null),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => "active" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user" }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: () => string) => (selector() === "active" ? ELM_STREET : "user"),
  useAppDispatch: () => (action: unknown) => {
    dispatched.push(action);
  },
}));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  chooseActiveOrganization: (org: unknown) => ({ type: "choose", org }),
}));
jest.mock("@/features/scopes/hooks/useScopeTree", () => ({
  useScopeTree: () => ({ organizations: [{ id: CEDAR_RIDGE, name: "Cedar Ridge Physical Therapy" }] }),
}));
jest.mock("@/features/scopes/hooks/useCategories", () => ({ useCategories: () => ({ categories: [] }) }));
jest.mock("@/features/scopes/hooks/useAssociations", () => ({ useAssociations: () => ({ edges: [], setTargets: jest.fn() }) }));
jest.mock("@ai-matrx/associations/react", () => ({ CategorySelect: () => null, CategoryTagPicker: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({
  useAppRecordsConfig: (organizationId: string | null) => ({ dataSource: {}, actor: null, organizationId }),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/components/ui/switch", () => ({ Switch: () => null }));
jest.mock("../../service", () => ({ allowPartyContact: jest.fn(), blockPartyContact: jest.fn(), updateParty: jest.fn() }));
jest.mock("../../agent-context/crmRecordSurfaceWrite", () => ({ parseIdentityFields: (v: unknown) => v }));
jest.mock("./CrmRecordCopyButtons", () => ({ CrmRecordCopyButtons: () => null }));
jest.mock("./SectionCard", () => ({ SectionCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("./record-copy", () => ({
  buildIdentityCopyView: () => ({}),
  formatIdentityCopy: () => "",
  identityAgentPayload: () => ({}),
}));
jest.mock("@/features/surfaces/manifests/crm-record.manifest", () => ({ CRM_RECORD_SURFACE_NAME: "crm_record" }));

import { PartyIdentityCard } from "./PartyIdentityCard";

const party = {
  id: "82a25af4-27cb-4e94-a2de-155eae7c8992",
  organization_id: CEDAR_RIDGE,
  party_kind: "person",
  display_name: "Marisol Vega",
  lifecycle_stage_id: null,
  rating_id: null,
  do_not_contact: false,
  do_not_contact_reason: null,
} as never;

describe("the CRM contact form keeps the old custom-fields host wiring", () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    dormant = false;
    dispatched.length = 0;
    formCustom.length = 0;
    registered.length = 0;
  });
  async function show() {
    const host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host).render(<PartyIdentityCard party={party} onChanged={async () => undefined} />);
    });
    return host;
  }

  it("offers Make your own table, started in the contact's organization", async () => {
    const host = await show();
    const custom = formCustom.at(-1)!;
    expect(custom["entityLabel"]).toBe("Contact");
    expect(typeof custom["onMakeOwnTable"]).toBe("function");
    await act(async () => custom["onMakeOwnTable"]());
    expect(dispatched).toEqual([{ type: "choose", org: { id: CEDAR_RIDGE, name: "Cedar Ridge Physical Therapy" } }]);
    expect(host.querySelector('[data-new-table-dialog="create"]')).not.toBeNull();
  });

  it("a dormant surface registers the agent door as not live", async () => {
    dormant = true;
    await show();
    registered.length = 0;
    formCustom.at(-1)!["agentDoor"]({ addField: jest.fn() });
    expect(registered.at(-1)!.isLive()).toBe(false);
    dormant = false;
    await show();
    formCustom.at(-1)!["agentDoor"]({});
    expect(registered.at(-1)!.isLive()).toBe(true);
  });
});
