import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE_ID = "a1000000-0000-4000-8000-000000000001";
const ROW_ID = "b2000000-0000-4000-8000-000000000002";

const useRecordPage = jest.fn(
  (
    _tableId: string,
    options: { pageSize: number; page: number; search: string },
  ) => ({
    loading: false,
    error: null,
    reload: jest.fn(),
    data: {
      rows: [
        {
          id: ROW_ID,
          document: {
            patient_name: options.search ? "Needle Patient" : "Ada Lovelace",
          },
        },
      ],
      total: options.search ? 1 : 201,
    },
  }),
);

jest.mock("@ai-matrx/kit/hooks", () => ({
  ...jest.requireActual("@ai-matrx/kit/hooks"), useDebounce: (value: string) => value,
}));

jest.mock("@ai-matrx/records/react", () => ({
  useTable: () => ({
    loading: false,
    error: null,
    reload: jest.fn(),
    data: { title_field: "patient_name" },
  }),
  useFields: () => ({
    loading: false,
    error: null,
    reload: jest.fn(),
    data: [],
  }),
  useRecordPage: (...args: unknown[]) =>
    useRecordPage(
      ...(args as [
        string,
        {
          pageSize: number;
          page: number;
          search: string;
        },
      ]),
    ),
}));

jest.mock("@ai-matrx/records-ui", () => ({
  fieldName: (field: { key: string }) => field.key,
  rowNameIn: (_table: unknown, row: { document: { patient_name: string } }) =>
    row.document.patient_name,
  // The picker's one rule (records-ui tablePicking): tables only, the chosen one always kept.
  tablePickerEntries: (
    rows: Array<{ id: string; platform_owned?: boolean }>,
    { keep }: { keep?: string | null },
  ) => ({ entries: rows.filter((r) => !r.platform_owned || r.id === keep).map((table) => ({ table })) }),
}));

jest.mock("@/features/unified-data/hub/useTablesEverywhere", () => ({
  useTablesEverywhere: () => ({
    loading: false,
    error: null,
    reload: jest.fn(),
    rows: [
      {
        table_id: TABLE_ID,
        table_name: "Patients",
        organization_id: "c3000000-0000-4000-8000-000000000003",
        organization_name: "Harbor Dental",
        kind: "table",
      },
    ],
  }),
}));

jest.mock(
  "@/features/agents/components/variables-management/custom-data/CustomDataRecordsScope",
  () => ({
    CustomDataRecordsScope: ({ children }: { children: ReactNode }) => children,
  }),
);

jest.mock("@/components/ui/creatable-picker", () => ({
  CreatablePicker: ({
    options,
    onSelect,
  }: {
    options: Array<{ value: string; label: string }>;
    onSelect: (id: string) => void;
  }) => (
    <button type="button" onClick={() => onSelect(options[0]!.value)}>
      Choose {options[0]!.label}
    </button>
  ),
}));

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));

import MessagesCustomDataPicker from "../MessagesCustomDataPicker";

describe("MessagesCustomDataPicker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useRecordPage.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("uses bounded server pages/search and emits the canonical table-row fence", () => {
    const onPick = jest.fn();
    act(() => root.render(<MessagesCustomDataPicker onPick={onPick} />));

    const buttonNamed = (name: string): HTMLButtonElement => {
      const button = Array.from(container.querySelectorAll("button")).find(
        (candidate) =>
          candidate.getAttribute("aria-label") === name ||
          candidate.textContent === name,
      );
      if (!button) throw new Error(`Missing button: ${name}`);
      return button;
    };

    act(() => buttonNamed("Choose Patients").click());
    expect(useRecordPage).toHaveBeenLastCalledWith(TABLE_ID, {
      pageSize: 100,
      page: 0,
      search: "",
    });

    act(() => buttonNamed("Add Ada Lovelace").click());
    expect(onPick).toHaveBeenCalledWith({
      id: `${TABLE_ID}:${ROW_ID}`,
      label: "Ada Lovelace",
      content:
        '```matrx\n{"__kind":"directive_v1_reference_table_row","items":[{"table_id":"a1000000-0000-4000-8000-000000000001","row_id":"b2000000-0000-4000-8000-000000000002","label":"Ada Lovelace"}]}\n```',
    });

    act(() => buttonNamed("Next page").click());
    expect(useRecordPage).toHaveBeenLastCalledWith(TABLE_ID, {
      pageSize: 100,
      page: 1,
      search: "",
    });

    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search all records"]',
    );
    if (!search) throw new Error("Missing record search input");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "needle");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(useRecordPage).toHaveBeenLastCalledWith(TABLE_ID, {
      pageSize: 100,
      page: 0,
      search: "needle",
    });
  });
});
