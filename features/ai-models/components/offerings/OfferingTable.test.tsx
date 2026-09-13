/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  MatrxDataTableProps,
  MatrxDataTableRecordControls,
} from "@ai-matrx/design-system/data-table";
import type { AiApi, AiEndpoint, AiModel, AiOffering } from "../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<AiOffering> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<AiOffering>) => {
    tableProps = props;
    const offering = props.data[0];
    return (
      <div>
        {offering
          ? props.columns.map((column) => (
              <div key={column.id ?? column.accessorKey}>
                {column.cell?.(offering, 0)}
              </div>
            ))
          : null}
        {offering && props.rowActions
          ? props.rowActions(offering, {} as MatrxDataTableRecordControls)
          : null}
      </div>
    );
  },
}));

jest.mock("@ai-matrx/tap-target/buttons", () => ({
  TrashTapButton: ({
    ariaLabel,
    onClick,
  }: {
    ariaLabel: string;
    onClick: () => void;
  }) => <button aria-label={ariaLabel} onClick={onClick}>Delete</button>,
}));

jest.mock("@/components/matrx/buttons/CopyButton", () => ({
  CopyButton: ({ content }: { content: string }) => (
    <button data-copy-content={content}>Copy</button>
  ),
}));

jest.mock("@/components/official/entity-ref/AiIdentityRef", () => ({
  AiModelRef: ({ name }: { name: string | null }) => <span>{name}</span>,
}));

jest.mock("../ProviderPriceCell", () => ({
  ProviderPriceCell: ({
    value,
    usageBasis,
    field,
  }: {
    value: number | null;
    usageBasis: string | null;
    field: string;
  }) => (
    <span
      data-price-field={field}
      data-price-value={value ?? ""}
      data-usage-basis={usageBasis ?? ""}
    />
  ),
}));

jest.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import OfferingTable from "./OfferingTable";

const offering = {
  id: "offering-1",
  model_id: "model-1",
  endpoint_id: "endpoint-1",
  api_id: "api-1",
  provider_model_id: "provider-model-1",
  priority: 15,
  is_available: true,
  usage_basis: "million_tokens",
  pricing: [
    {
      input_price: 1.5,
      cached_input_price: 0.5,
      output_price: 6,
      usage_basis: "million_characters",
    },
  ],
} as AiOffering;

const models = [
  { id: "model-1", name: "model-internal", common_name: "Model One" },
] as AiModel[];
const endpoints = [
  { id: "endpoint-1", display_name: "Endpoint One" },
] as AiEndpoint[];
const apis = [{ id: "api-1", display_name: "API One" }] as AiApi[];

describe("OfferingTable", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onCreate = jest.fn();
  const onRetry = jest.fn();
  const onSelect = jest.fn();
  const onDelete = jest.fn();

  beforeEach(async () => {
    tableProps = null;
    jest.clearAllMocks();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <OfferingTable
          offerings={[offering]}
          models={models}
          endpoints={endpoints}
          apis={apis}
          loading={false}
          onCreate={onCreate}
          onRetry={onRetry}
          onSelect={onSelect}
          onDelete={onDelete}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses one canonical local table with resolved sort/filter values and price values", () => {
    if (!tableProps) throw new Error("Offering table did not render");

    expect(tableProps.detail).toEqual({ enabled: false });
    expect(tableProps.onRowOpen).toBe(onSelect);
    expect(tableProps.pageSize).toBe(25);
    expect(tableProps.localPagination).toEqual({ mode: "progressive" });
    expect(tableProps.tableId).toBe("ai/offerings");
    expect(tableProps.columns.map((column) => column.id ?? column.accessorKey)).toEqual([
      "model",
      "endpoint",
      "api",
      "provider_model_id",
      "priority",
      "input_price",
      "cached_input_price",
      "output_price",
      "is_available",
      "usage_basis",
    ]);
    for (const id of [
      "priority",
      "input_price",
      "cached_input_price",
      "output_price",
    ]) {
      expect(
        tableProps.columns.find(
          (column) => column.id === id || column.accessorKey === id,
        )?.align,
      ).toBe("right");
    }

    const byId = (id: string) => {
      const column = tableProps?.columns.find((item) => item.id === id);
      if (!column?.accessorFn) throw new Error(`Missing accessor for ${id}`);
      return column.accessorFn;
    };
    expect(byId("model")(offering)).toBe("Model One");
    expect(byId("endpoint")(offering)).toBe("Endpoint One");
    expect(byId("api")(offering)).toBe("API One");
    expect(byId("input_price")(offering)).toBe(1.5);
    expect(byId("cached_input_price")(offering)).toBe(0.5);
    expect(byId("output_price")(offering)).toBe(6);
    expect(byId("usage_basis")(offering)).toBe("million_tokens");
    expect(host.querySelector("[data-copy-content='provider-model-1']")).not.toBeNull();
    expect(host.querySelector("[data-price-field='input_price']")?.getAttribute("data-usage-basis")).toBe("million_characters");
  });

  it("keeps toolbar callbacks, row open, and confirmed deletion attached to the offering", async () => {
    if (!tableProps) throw new Error("Offering table did not render");

    await act(async () => {
      tableProps?.toolbar?.refresh?.onRefresh();
      tableProps?.toolbar?.add?.onAdd();
      tableProps?.onRowOpen?.(offering);
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(offering);

    const deleteButton = host.querySelector(
      "button[aria-label='Delete offering for Endpoint One']",
    ) as HTMLButtonElement;
    await act(async () => deleteButton.click());
    expect(host.querySelector("[role='dialog']")).not.toBeNull();

    const cancelButton = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancel",
    );
    await act(async () => cancelButton?.click());
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => deleteButton.click());
    const confirmButton = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete Offering",
    );
    await act(async () => confirmButton?.click());
    expect(onDelete).toHaveBeenCalledWith(offering);
  });
});
