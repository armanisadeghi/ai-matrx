/**
 * AN ASK OPENS WITH THE WORDS IN THE BOX (BREAKER-2 B2-22, lane DATA-V2-VIEWS-1).
 *
 * THE USE CASE: Cedar Ridge's front desk presses Ask AI on a Calendar with no date column. The
 * assistant opened with an EMPTY box and three chips reading `records_ta…`, `records_w…`,
 * `records_su…` — the ask the screen had just shown her was nowhere to send, and the chips were
 * internal keys. RED on the prior bytes: no `buildAskRuntime`, bare context values, no userInput;
 * and the slice labelled an unlabelled chip with its raw key.
 */
jest.mock("@/features/files/components/pickers/cloudFilesPickerOpeners", () => ({ openFilePicker: jest.fn() }));
jest.mock("@/features/agents/hooks/useAgentLauncher", () => ({ useAgentLauncher: () => ({ launchMandate: jest.fn() }) }));
jest.mock("@/features/sharing/components/RecordStoreShareSurface", () => ({ recordStoreShare: () => null }));
jest.mock("@/features/unified-data/record-chat/RecordScopedChat", () => ({ RecordScopedChat: () => null }));
jest.mock("@/features/organizations/service", () => ({ getOrganizationMembers: jest.fn() }));
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => ({ organizations: [], loading: false }) }));
jest.mock("@/features/unified-data/realtime/recordsRealtimePort", () => ({ createRecordsRealtimePort: jest.fn() }));
jest.mock("@/features/unified-data/row-agent-action/rowAgentAction", () => ({ runRowAgentAction: jest.fn() }));
jest.mock("@/features/unified-data/grid-agent-context/RecordStoreTableSurface", () => ({
  RecordStoreTableSurface: ({ children }: { children: unknown }) => children,
  useGridContextChannel: () => null,
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("./../mergedGridKnob", () => ({ useMergedGridKnob: () => false }));
jest.mock("@/features/unified-data/recordsReferences", () => ({ RECORDS_REFERENCES: {} }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { buildAskRuntime } from "../recordsUiHost";
import instanceContextReducer, { keyWords, setContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";

const ASK = {
  kind: "column" as const,
  tableId: "9d4d652b-b3df-4574-86cc-fb39afebd180",
  suggestion: "Add a Date date column to this table, then lay the Calendar out by it.",
};

it("puts the ask in the box for her to send, and names every chip in words", () => {
  const runtime = buildAskRuntime(ASK);
  expect(runtime.userInput).toBe(ASK.suggestion);
  expect(runtime.context.records_table_id).toEqual({ content: ASK.tableId, label: "This table" });
  expect(runtime.context.records_wanted).toEqual({ content: "column", label: "A column" });
  expect(runtime.context.records_suggested_wording.label).toBe("The ask");
});

it("the chips read the labels the ask carried", () => {
  const state = instanceContextReducer(
    undefined,
    setContextEntries({
      conversationId: "c1",
      entries: Object.entries(buildAskRuntime(ASK).context).map(([key, value]) => ({ key, value })),
    }),
  );
  const labels = Object.values(state.byConversationId.c1).map((e) => e.label);
  expect(labels).toEqual(["This table", "A column", "The ask"]);
});

it("a chip nobody labelled reads as words, never its key", () => {
  expect(keyWords("records_table_id")).toBe("Records table");
  expect(keyWords("organization_timezone")).toBe("Organization timezone");
  const state = instanceContextReducer(
    undefined,
    setContextEntries({ conversationId: "c2", entries: [{ key: "records_wanted", value: "form" }] }),
  );
  expect(state.byConversationId.c2.records_wanted.label).toBe("Records wanted");
});
