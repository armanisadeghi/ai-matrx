/**
 * THE ONE RECORDS-UI HOST BINDING HANDS THE GRID THE APP'S FILE WINDOW AND ITS MARKDOWN RENDERER
 * (records-ui ports `pickFiles` and `renderText` slot "cell").
 *
 * The use case: a veterinary front desk keeps each visit's X-rays in an attachment column and
 * writes its desk notes in markdown. Every record-store table in the app (the /data-v2 page, the
 * table window, the dataset overlay, a chat table artifact, the quick sheet, the picker, the chat
 * modal) takes its host from `recordsUiHostFor`, so the break each case names is one line away:
 *   · the binding never spreads `pickFiles` → the attachment cell offers no way to add a file the
 *     person already holds (the older grid's "Attach files…" is lost in the merge);
 *   · `pickFiles` opens the picker single-select for a many-file column, or answers `[]` for a
 *     closed window (records-ui would then write an empty change) instead of null;
 *   · `renderText` is unbound on the merged grid → the note shows `**Post-op**` asterisks;
 *     or it renders the form slots too, which must stay as written.
 * The picker window itself is the app's network-and-dialog host (`openFilePicker`), stubbed with
 * what a person picks; the binding and the port functions are real.
 */
import { isValidElement, type ReactElement } from "react";

jest.mock("@/features/files/components/pickers/cloudFilesPickerOpeners", () => ({ openFilePicker: jest.fn() }));
jest.mock("@/features/files/api/files", () => ({ downloadFile: jest.fn() }));
jest.mock("@/components/rich-content/RichContent", () => ({ RichContent: function RichContent() { return null; } }));
jest.mock("@/components/official/icons/IconInputWithValidation.dynamic", () => ({ IconInputCompact: () => null }));
jest.mock("@/lib/content-cleanup/clean-cells", () => ({ cleanValue: (t: string) => ({ after: t }) }));
jest.mock("@/lib/content-cleanup/value-operations", () => ({ DEFAULT_ENABLED_VALUE_OPERATIONS: [] }));
jest.mock("@/features/agents/hooks/useAgentLauncher", () => ({ useAgentLauncher: () => ({ launchMandate: jest.fn() }) }));
jest.mock("@/features/sharing/components/RecordStoreShareSurface", () => ({ recordStoreShare: () => null }));
jest.mock("@/features/unified-data/record-chat/RecordScopedChat", () => ({ RecordScopedChat: () => null }));
jest.mock("@/features/organizations/service", () => ({ getOrganizationMembers: jest.fn() }));
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => ({ organizations: [], loading: false }) }));
jest.mock("@/features/unified-data/realtime/recordsRealtimePort", () => ({ createRecordsRealtimePort: jest.fn() }));
jest.mock("@/features/unified-data/row-agent-action/rowAgentAction", () => ({ runRowAgentAction: jest.fn() }));
jest.mock("@/features/unified-data/recordsNotify", () => ({ RECORDS_NOTIFY: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/features/unified-data/grid-agent-context/RecordStoreTableSurface", () => ({
  RecordStoreTableSurface: ({ children }: { children: unknown }) => children,
  useGridContextChannel: () => null,
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@ai-matrx/agents/mandates", () => ({ MANDATE_KEYS: { data__page_guidance: "data.page_guidance" } }));
jest.mock("@ai-matrx/records-ui", () => ({
  RecordsMount: () => null,
  TablePage: () => null,
  personActor: () => ({}),
  recordsDataSource: () => ({}),
}));
jest.mock("./../mergedGridKnob", () => ({ useMergedGridKnob: () => false }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { openFilePicker } = require("@/features/files/components/pickers/cloudFilesPickerOpeners") as { openFilePicker: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RichContent } = require("@/components/rich-content/RichContent") as { RichContent: unknown };
import { recordsUiHostFor, type RecordsUiPorts } from "../recordsUiHost";

const PORTS: RecordsUiPorts = {
  members: async () => [],
  onAskForOne: () => undefined,
  openRecords: () => undefined,
  runAgentAction: () => undefined,
  organizationId: "c3d0a7b1-6e2f-4d5a-9b8c-0f1e2d3c4b5a",
};

/** Two films the front desk already uploaded for Maple's TPLO recheck. */
const CRANIAL = "f0000000-0000-4000-8000-000000000002";
const TIBIA = "f0000000-0000-4000-8000-000000000003";

beforeEach(() => openFilePicker.mockReset());

describe("pickFiles — the app's one file window for an attachment cell", () => {
  it.each([false, true])("is bound on every table (merged grid %s)", (merged) => {
    expect(typeof recordsUiHostFor({ ports: PORTS, merged }).pickFiles).toBe("function");
  });

  it("opens the window multi-select for a many-file column and hands back what was picked", async () => {
    openFilePicker.mockResolvedValue([CRANIAL, TIBIA]);
    const host = recordsUiHostFor({ ports: PORTS, merged: true });
    await expect(host.pickFiles!({ multiple: true })).resolves.toEqual([CRANIAL, TIBIA]);
    expect(openFilePicker).toHaveBeenCalledWith({ multi: true, title: "Attach files" });
  });

  it("single-select for a one-file column, filtered by the column's accept list", async () => {
    openFilePicker.mockResolvedValue([CRANIAL]);
    const host = recordsUiHostFor({ ports: PORTS, merged: true });
    await host.pickFiles!({ multiple: false, accept: ".pdf" });
    expect(openFilePicker).toHaveBeenCalledWith({ multi: false, title: "Attach a file", allowedExtensions: ["pdf"] });
  });

  it.each([[null], [[]]])("a closed window (%j) answers null, never an empty pick", async (answer) => {
    openFilePicker.mockResolvedValue(answer);
    const host = recordsUiHostFor({ ports: PORTS, merged: true });
    await expect(host.pickFiles!({ multiple: true })).resolves.toBeNull();
  });
});

describe('renderText — markdown cells (slot "cell")', () => {
  const NOTE = "**Post-op** check, TPLO — _no weight on the left hind_";

  it("the merged grid reads a note through the one rich-text renderer, inline", () => {
    const host = recordsUiHostFor({ ports: PORTS, merged: true });
    const drawn = host.renderText!(NOTE, "cell");
    expect(isValidElement(drawn)).toBe(true);
    const el = drawn as ReactElement<{ source: string; level: string }>;
    expect(el.type).toBe(RichContent);
    expect(el.props.source).toBe(NOTE);
    expect(el.props.level).toBe("inline");
  });

  it("a form's authored text stays as written", () => {
    const host = recordsUiHostFor({ ports: PORTS, merged: true });
    expect(host.renderText!(NOTE, "form-help")).toBe(NOTE);
  });

  it("the classic grid is left unbound", () => {
    expect(recordsUiHostFor({ ports: PORTS, merged: false }).renderText).toBeUndefined();
  });
});
