import { act } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MarkdownPdfSection, withDocumentDefaults } from "./MarkdownPdfSection";

const mockExportDocument = jest.fn(async (_markdown: string, format: string) => ({
  format,
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  mime: "application/pdf",
  fileName: "Quarterly Field Report.pdf",
  tree: {},
  notices: [],
}));
const mockDownload = jest.fn();

jest.mock("@ai-matrx/print/document", () => ({
  exportDocument: (...args: [string, string]) => mockExportDocument(...args),
  downloadDocumentExport: (...args: unknown[]) => mockDownload(...args),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

jest.mock("next/dynamic", () => () => {
  const Preview = ({ markdown }: { markdown: string }) => (
    <div data-testid="document-print-preview">{markdown.length}</div>
  );
  return Preview;
});

jest.mock("@/features/notes/service/notesApi", () => ({
  NotesAPI: { getById: jest.fn() },
}));

const capturedMenuProps: {
  extraSections?: Array<{ items: Array<{ onSelect: () => void }> }>;
  getApplicationScope?: () => Record<string, unknown>;
  sourceFeature?: string;
} = {};

jest.mock("@/features/context-menu-v3/EditableContextMenu", () => ({
  EditableContextMenu: ({
    children,
    extraSections,
    getApplicationScope,
    sourceFeature,
  }: {
    children: ReactNode;
    extraSections?: typeof capturedMenuProps.extraSections;
    getApplicationScope?: typeof capturedMenuProps.getApplicationScope;
    sourceFeature?: typeof capturedMenuProps.sourceFeature;
  }) => {
    capturedMenuProps.extraSections = extraSections;
    capturedMenuProps.getApplicationScope = getApplicationScope;
    capturedMenuProps.sourceFeature = sourceFeature;
    return <>{children}</>;
  },
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  }) => <textarea value={value} onChange={onChange} />,
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("MarkdownPdfSection (Documents)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("mounts the package print preview over the sample document", () => {
    act(() => root.render(<MarkdownPdfSection />));
    expect(container.querySelector('[data-testid="document-print-preview"]')).not.toBeNull();
    expect(container.querySelector("textarea")?.value).toContain("toc: true");
  });

  it("routes the canonical menu Download PDF action through the one document export", async () => {
    act(() => root.render(<MarkdownPdfSection />));
    const download = capturedMenuProps.extraSections?.[0]?.items[0]?.onSelect;
    expect(download).toBeDefined();
    expect(capturedMenuProps.sourceFeature).toBe("print");
    const scope = capturedMenuProps.getApplicationScope?.();
    expect(scope?.content).toEqual(expect.any(String));

    await act(async () => {
      download?.();
    });

    expect(mockExportDocument).toHaveBeenCalledWith(expect.stringContaining("# Summary"), "pdf", { title: "Document" });
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("PDF downloaded");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("gives a plain note document settings, and leaves a note that has its own alone", () => {
    const plain = withDocumentDefaults("# Plan\n\nbody", 'The "Q3" plan');
    expect(plain).toMatch(/^---\ntitle: "The 'Q3' plan"\ntoc: true\n/);
    expect(plain).toContain("footer: \"Page {page} of {pages}\"");
    const own = "---\ntitle: Mine\n---\n# Hi";
    expect(withDocumentDefaults(own, "x")).toBe(own);
  });
});
