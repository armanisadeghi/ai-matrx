import { act } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MarkdownPdfSection } from "./MarkdownPdfSection";

const mockMarkdownToPdfBlob = jest.fn(
  async () => new Blob(["pdf"], { type: "application/pdf" }),
);
const mockMarkdownToHtml = jest.fn((markdown: string) => `<p>${markdown}</p>`);
const mockGetMarkdownStylesheet = jest.fn(() => "body {}");

jest.mock("@ai-matrx/print/pdf", () => ({
  markdownToPdfBlob: mockMarkdownToPdfBlob,
}));
jest.mock("@ai-matrx/print/markdown", () => ({
  markdownToHtml: mockMarkdownToHtml,
  getMarkdownStylesheet: mockGetMarkdownStylesheet,
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
    return <div>{children}</div>;
  },
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
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
  SurfaceRuntimeProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("MarkdownPdfSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedMenuProps.extraSections = undefined;
    capturedMenuProps.getApplicationScope = undefined;
    capturedMenuProps.sourceFeature = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("routes the canonical menu Download PDF action through the real PDF workflow", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:markdown-pdf"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    act(() => root.render(<MarkdownPdfSection />));

    const download = capturedMenuProps.extraSections?.[0]?.items[0]?.onSelect;
    expect(download).toBeDefined();
    expect(capturedMenuProps.sourceFeature).toBe("print");
    const scope = capturedMenuProps.getApplicationScope?.();
    expect(scope?.content).toEqual(expect.any(String));
    expect(scope).not.toHaveProperty("markdown_content");

    await act(async () => {
      download?.();
    });

    expect(mockMarkdownToPdfBlob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        convertToHtml: mockMarkdownToHtml,
        loadCss: mockGetMarkdownStylesheet,
      }),
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("PDF downloaded");
    expect(toastError).not.toHaveBeenCalled();
    click.mockRestore();
  });
});
