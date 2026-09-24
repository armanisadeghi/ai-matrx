/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import type { RichMember } from "@/features/rag/hooks/useDataStores";
import { RichMemberTable } from "./RichMemberTable";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<RichMember> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<RichMember>) => {
    tableProps = props;
    const row = props.data[0];
    return (
      <div>
        {row
          ? props.columns.map((column) => (
              <div key={column.id}>{column.cell?.(row, 0)}</div>
            ))
          : props.emptyState?.action}
        {row ? props.rowActions?.(row, {} as never) : null}
      </div>
    );
  },
}));

jest.mock("@ai-matrx/tap-target/buttons", () => ({
  SearchTapButton: (props: {
    ariaLabel: string;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      Search
    </button>
  ),
  ExternalLinkTapButton: (props: {
    ariaLabel: string;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      Preview
    </button>
  ),
  TrashTapButton: (props: { ariaLabel: string; onClick: () => void }) => (
    <button aria-label={props.ariaLabel} onClick={props.onClick}>
      Remove
    </button>
  ),
}));

jest.mock("@/features/rag/components/library/QuickSearchDialog", () => ({
  QuickSearchDialog: ({
    open,
    processedDocumentId,
  }: {
    open: boolean;
    processedDocumentId: string | null;
  }) =>
    open ? (
      <div data-testid="quick-search" data-document-id={processedDocumentId} />
    ) : null,
}));

// The remove confirmation is an AlertDialog (it blocks — policy ai-reachable-everywhere).
jest.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

jest.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const member: RichMember = {
  sourceKind: "cld_file",
  sourceId: "file-1",
  addedAt: "2026-09-21T12:00:00.000Z",
  notes: null,
  name: "Research brief.pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  processedDocumentId: "document-1",
  pages: 4,
  chunks: 8,
  embeddingsOai: 8,
  status: "ready",
};

describe("RichMemberTable", () => {
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

  it("hands complete rows and independent member fields to MatrxDataTable", async () => {
    const refresh = jest.fn();
    await act(async () => {
      root.render(
        <RichMemberTable
          members={[member]}
          loading={false}
          error={null}
          onRefresh={refresh}
          onRemove={jest.fn()}
        />,
      );
    });

    if (!tableProps) throw new Error("Rich member table did not render");
    expect(tableProps.tableId).toBe("rag-data-store-members");
    expect(tableProps.data).toEqual([member]);
    expect(tableProps.getRowId(member)).toBe("cld_file/file-1");
    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "name",
      "sourceKind",
      "mimeType",
      "sourceId",
      "status",
      "pages",
      "chunks",
      "embeddingsOai",
      "fileSize",
      "addedAt",
    ]);
    expect(
      tableProps.columns.find((column) => column.id === "embeddingsOai")
        ?.hidden,
    ).toBe(true);
    expect(
      tableProps.columns.find((column) => column.id === "pages")?.filter,
    ).toBe("number");
    expect(
      tableProps.columns.find((column) => column.id === "addedAt")?.filter,
    ).toBe("date");
    const sourceId = tableProps.columns.find(
      (column) => column.id === "sourceId",
    );
    expect(sourceId?.cellKind).toBe("fk");
    expect(typeof sourceId?.fk?.token).toBe("function");
    if (typeof sourceId?.fk?.token === "function") {
      expect(sourceId.fk.token(member)).toBe("file");
      expect(
        sourceId.fk.token({ ...member, sourceKind: "processed_document" }),
      ).toBe("processed_document");
    }
    expect(tableProps.toolbar?.title).toBe("Members");
    const zeroMember = {
      ...member,
      pages: 0,
      chunks: 0,
      embeddingsOai: 0,
      fileSize: null,
    };
    const pages = tableProps.columns.find((column) => column.id === "pages");
    const chunks = tableProps.columns.find((column) => column.id === "chunks");
    const embeddings = tableProps.columns.find(
      (column) => column.id === "embeddingsOai",
    );
    const fileSize = tableProps.columns.find(
      (column) => column.id === "fileSize",
    );
    expect(renderToStaticMarkup(<>{pages?.cell?.(zeroMember, 0)}</>)).toContain(
      "—",
    );
    expect(
      renderToStaticMarkup(<>{chunks?.cell?.(zeroMember, 0)}</>),
    ).toContain("—");
    expect(embeddings?.accessorKey).toBe("embeddingsOai");
    expect(
      renderToStaticMarkup(<>{fileSize?.cell?.(zeroMember, 0)}</>),
    ).toContain("—");
  });

  it("preserves Search, Preview, and the exact remove confirmation without removing until confirmed", async () => {
    const remove = jest.fn();
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    await act(async () => {
      root.render(
        <RichMemberTable
          members={[member]}
          loading={false}
          error={null}
          onRemove={remove}
        />,
      );
    });

    await act(async () => {
      (
        host.querySelector(
          '[aria-label="Search inside Research brief.pdf"]',
        ) as HTMLButtonElement
      ).click();
    });
    expect(
      host
        .querySelector('[data-testid="quick-search"]')
        ?.getAttribute("data-document-id"),
    ).toBe("document-1");
    await act(async () => {
      (
        host.querySelector(
          '[aria-label="Open preview for Research brief.pdf"]',
        ) as HTMLButtonElement
      ).click();
    });
    expect(open).toHaveBeenCalledWith(
      "/knowledge/library/document-1/preview",
      "_blank",
      "noopener,noreferrer",
    );
    await act(async () => {
      (
        host.querySelector(
          '[aria-label="Remove Research brief.pdf from this store"]',
        ) as HTMLButtonElement
      ).click();
    });
    expect(host.textContent).toContain("Remove from store?");
    expect(host.textContent).toContain("The file itself, its pages");
    await act(async () => {
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Cancel")
        ?.click();
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("hides Remove for read-only stores, retries errors, and filters status by its displayed value", async () => {
    const refresh = jest.fn();
    await act(async () => {
      root.render(
        <RichMemberTable
          members={[member]}
          loading={false}
          error={null}
          onRefresh={refresh}
          onRemove={jest.fn()}
          readOnly
        />,
      );
    });
    expect(
      host.querySelector(
        '[aria-label="Remove Research brief.pdf from this store"]',
      ),
    ).toBeNull();
    if (!tableProps) throw new Error("Rich member table did not render");
    const status = tableProps.columns.find((column) => column.id === "status");
    expect(status?.accessorFn?.({ ...member, status: "no_processing" })).toBe(
      "pending",
    );
    expect(status?.accessorFn?.({ ...member, status: "unknown" })).toBe(
      "unknown",
    );

    await act(async () => {
      root.render(
        <RichMemberTable
          members={[]}
          loading={false}
          error="Could not load members"
          onRefresh={refresh}
          onRemove={jest.fn()}
        />,
      );
    });
    await act(async () => {
      (
        Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === "Retry",
        ) as HTMLButtonElement
      ).click();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
