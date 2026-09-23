/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  MatrxDataTableProps,
  MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import KindInputsTab from "./KindInputsTab";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type DriftRow = {
  fieldKey: string;
  variableName: string;
  originalType: string;
  reconstructedType: string | null;
  changed: boolean;
};

let tableProps: MatrxDataTableProps<DriftRow> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<DriftRow>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("@/features/agents/components/inputs/input-components/VariableInputComponent", () => ({
  VariableInputComponent: () => null,
}));

jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => ({
  getKindSchemaBySlugFromTables: jest.fn(async () => ({
    kind: "example",
    fields: {
      title: { type: "string", required: true },
      cards: { type: "array", required: false, itemKinds: ["card"] },
    },
  })),
}));

jest.mock("@/features/content-ir/convert/kind-variable-bridge", () => ({
  kindFieldsToVariableDefinitions: jest.fn(() => [
    { name: "title", customComponent: { type: "textarea" } },
    { name: "cards", customComponent: { type: "textarea" } },
  ]),
  variableDefinitionsToKindFields: jest.fn(() => ({
    fields: {
      title: { type: "string", required: true },
      cards: { type: "string", required: false },
    },
    losses: [],
  })),
}));

jest.mock("@ai-matrx/content-ir", () => ({
  validateStructuralLeg: () => ({ ok: true }),
}));

describe("KindInputsTab type-drift table", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps every drift row and visibly marks only the lossy reconstructed cell", async () => {
    await act(async () => {
      root.render(<KindInputsTab kind="example" emittedJsonSchema={null} />);
    });

    if (!tableProps) throw new Error("Type-drift table did not render");
    expect(tableProps.data).toEqual([
      {
        fieldKey: "title",
        variableName: "title",
        originalType: "string",
        reconstructedType: "string",
        changed: false,
      },
      {
        fieldKey: "cards",
        variableName: "cards",
        originalType: "array(card)",
        reconstructedType: "string",
        changed: true,
      },
    ]);
    expect(tableProps.columns.map((column) => column.header)).toEqual([
      "Field",
      "Original",
      "Reconstructed",
    ]);
    expect(tableProps.getRowId(tableProps.data[1])).toBe("cards");
    expect(tableProps.toolbar?.title).toBeUndefined();
    expect(tableProps.density).toBe("condensed");
    expect(tableProps.pageSize).toBe(0);
    expect(tableProps.coverage).toEqual({ loaded: 2, total: 2, noun: "field" });
    expect(tableProps.cellClassName?.(tableProps.data[0], "reconstructedType", 0)).toBeUndefined();
    expect(tableProps.cellClassName?.(tableProps.data[1], "reconstructedType", 1)).toBe("bg-amber-500/5");

    const reconstructed = tableProps.columns[2] as MatrxColumnDef<DriftRow>;
    expect(reconstructed.cell?.(tableProps.data[1], 1)).toBeTruthy();
  });
});
