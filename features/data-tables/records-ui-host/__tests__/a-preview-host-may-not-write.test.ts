/**
 * THE PREVIEW'S RIGHTS (merged-grid review 2, fix lane F item 3): read, never write, and every
 * "may not" says it is a preview — through the real records-ui `tableRightsAt` ladder.
 */
jest.mock("@/features/files/components/pickers/cloudFilesPickerOpeners", () => ({ openFilePicker: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/hooks/useAgentLauncher", () => ({ useAgentLauncher: () => ({ launchMandate: jest.fn() }) }));
jest.mock("@/features/sharing/components/RecordStoreShareSurface", () => ({ recordStoreShare: () => null }));
jest.mock("@/features/unified-data/record-chat/RecordScopedChat", () => ({ RecordScopedChat: () => null }));
jest.mock("@/features/organizations/service", () => ({ getOrganizationMembers: jest.fn() }));
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => ({ organizations: [], loading: false }) }));
jest.mock("@ai-matrx/records/realtime", () => ({ createRecordsRealtimePort: jest.fn() }));
jest.mock("@/features/unified-data/row-agent-action/rowAgentAction", () => ({ runRowAgentAction: jest.fn() }));
jest.mock("@/features/unified-data/grid-agent-context/RecordStoreTableSurface", () => ({
  RecordStoreTableSurface: ({ children }: { children: unknown }) => children,
  useGridContextChannel: () => null,
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/utils/supabase/client", () => (require("@/tests/helpers/emptySupabaseClient") as typeof import("@/tests/helpers/emptySupabaseClient")).emptySupabaseClientModule());
jest.mock("./../mergedGridKnob", () => ({ useMergedGridKnob: () => false }));
jest.mock("@/features/unified-data/recordsReferences", () => ({ RECORDS_REFERENCES: {} }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { PREVIEW_RIGHTS, recordsUiHostFor, type RecordsUiPorts } from "../recordsUiHost";

const PORTS: RecordsUiPorts = {
  members: async () => [],
  onAskForOne: () => undefined,
  openRecords: () => undefined,
  runAgentAction: () => undefined,
  organizationId: "57f2a22b-5875-46c6-80df-437076421c28",
};

describe("the preview host", () => {
  it("binds rights that read and never write", () => {
    const host = recordsUiHostFor({ ports: PORTS, merged: true, rights: PREVIEW_RIGHTS });
    expect(host.rights).toBe(PREVIEW_RIGHTS);
    const r = PREVIEW_RIGHTS({} as never);
    expect(r).toMatchObject({ known: true, read: true, write: false, remove: false, structure: false, share: false, admin: false });
    expect(r.why("write")).toBe("This is a preview. Open the table to change it.");
  });

  it("an ordinary host leaves rights to the store", () => {
    expect(recordsUiHostFor({ ports: PORTS, merged: true })).not.toHaveProperty("rights");
  });
});
