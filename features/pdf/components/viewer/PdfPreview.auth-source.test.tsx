/**
 * PdfPreview never hands PDF.js a private file URL without the file's auth.
 *
 * Live 2026-09-26: /files/f/<id> and /files/all?file=<id> crashed to
 * "Unexpected server response (401) while retrieving PDF
 * https://files.matrxserver.com/files/<id>/download?inline=1". PreviewerSwitch
 * passes the durable private URL as `remoteUrl`; PdfPreview used it as a
 * fallback while its own auth was still resolving, with no headers and
 * `withCredentials` forced off — PDF.js fetched it bare and the files service
 * answered 401.
 *
 * The companion guard: PdfDocumentRenderer mounts react-pdf's <Document> with
 * `suspense={false}` (react-pdf 11 throws a load failure to the route error
 * boundary otherwise, turning one 401 into a whole-page "Something went wrong").
 */

import * as React from "react";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";

const FILE_ID = "c363eb51-3cc0-46e3-8490-6382fcac59de";
const PRIVATE_URL = `https://files.matrxserver.com/files/${FILE_ID}/download?inline=1`;
const CDN_URL = `https://cdn.matrxserver.com/${FILE_ID}.pdf`;

const mockUsePdfRemoteSource = jest.fn();
const rendererProps: Array<Record<string, unknown>> = [];

jest.mock("@/features/files/hooks/usePdfRemoteSource", () => ({
  usePdfRemoteSource: (...args: unknown[]) => mockUsePdfRemoteSource(...args),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => null }));
jest.mock("@/features/files/redux/selectors", () => ({ selectFileById: () => null }));
jest.mock("./PdfSourceUnavailable", () => ({
  __esModule: true,
  default: () => <div data-testid="unavailable" />,
}));
jest.mock("./PdfDocumentRenderer", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    rendererProps.push(props);
    return null;
  },
}));

import PdfPreview from "./PdfPreview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function hookState(over: Record<string, unknown>) {
  return {
    remoteUrl: null,
    headers: {},
    withCredentials: true,
    loading: true,
    error: null,
    sourceMissing: false,
    bytesLoaded: 0,
    bytesTotal: null,
    retry: jest.fn(),
    ...over,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(remoteUrl: string | null) {
  host = document.createElement("div");
  root = createRoot(host);
  act(() => {
    root!.render(<PdfPreview fileId={FILE_ID} remoteUrl={remoteUrl} />);
  });
  return rendererProps[rendererProps.length - 1];
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host = null;
  rendererProps.length = 0;
});

describe("PdfPreview auth source", () => {
  it("waits for auth instead of fetching a private durable URL bare", () => {
    mockUsePdfRemoteSource.mockReturnValue(hookState({}));
    const props = render(PRIVATE_URL);
    expect(props.remoteUrl).toBeNull();
    expect(props.loading).toBe(true);
  });

  it("loads the private URL once auth is ready, with headers and credentials", () => {
    mockUsePdfRemoteSource.mockReturnValue(
      hookState({
        remoteUrl: PRIVATE_URL,
        headers: { Authorization: "Bearer t" },
        loading: false,
      }),
    );
    const props = render(PRIVATE_URL);
    expect(props.remoteUrl).toBe(PRIVATE_URL);
    expect(props.remoteHeaders).toEqual({ Authorization: "Bearer t" });
    expect(props.withCredentials).toBe(true);
  });

  it("starts a public CDN URL immediately, with no credentials", () => {
    mockUsePdfRemoteSource.mockReturnValue(hookState({}));
    const props = render(CDN_URL);
    expect(props.remoteUrl).toBe(CDN_URL);
    expect(props.withCredentials).toBe(false);
    expect(props.loading).toBe(false);
  });

  it("surfaces the auth failure for a private URL instead of swallowing it", () => {
    mockUsePdfRemoteSource.mockReturnValue(
      hookState({ loading: false, error: "Please sign in to continue." }),
    );
    const props = render(PRIVATE_URL);
    expect(props.remoteUrl).toBeNull();
    expect(props.error).toBe("Please sign in to continue.");
  });
});

describe("PdfDocumentRenderer suspense contract", () => {
  it("mounts react-pdf's Document with suspense={false}", () => {
    const source = readFileSync(join(__dirname, "PdfDocumentRenderer.tsx"), "utf8");
    // Every JSX mount (`<Document` followed by its props), not prose in comments.
    const documents = source.match(/<Document\s+[a-z][\s\S]*?\/?>(?=\s*\n)|<Document\s*\n[\s\S]*?onLoad/g) ?? [];
    expect(documents.length).toBeGreaterThan(0);
    for (const tag of documents) expect(tag).toMatch(/suspense=\{false\}/);
  });
});
