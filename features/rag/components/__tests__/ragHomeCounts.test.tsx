/**
 * THE HOME COUNTS (2026-09-27). The Knowledge home showed "Documents 1902 /
 * Ready 473 / Embedding / Extracted / Pending" from the retired library
 * summary endpoint while the Sources page said "Saved 937 / All captures
 * 1,851" — two screens, two answers for one library. The home now reads the
 * Sources page's own count read (`readSourcesCounts`, through
 * `useSourcesCounts`), labels the numbers in the Sources page's words, links
 * each card to the Sources page with that filter, and no longer describes the
 * retired "drag a PDF onto a store" flow.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const countsCall = jest.fn();
jest.mock("@/features/sources/hooks/useSources", () => ({
  useSourcesCounts: (...a: unknown[]) => {
    countsCall(...a);
    return { savedTotal: 937, allTotal: 1851, loading: false, failed: false };
  },
}));
// The retired endpoint answers with different numbers: if they render, the
// home is still reading the wrong thing.
jest.mock("@/features/rag/hooks/useLibrary", () => ({
  useLibrarySummary: () => ({
    summary: {
      documentsTotal: 1902,
      documentsReady: 473,
      documentsEmbedding: 11,
      documentsExtracted: 22,
      documentsPending: 33,
      chunks: 44,
      dataStores: 55,
    },
    loading: false,
    error: null,
  }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "user-1",
}));
jest.mock("@/features/rag/hooks/useLibraryCatalog", () => ({
  useLibraryCatalog: () => ({ items: [] }),
}));
jest.mock("@/features/rag/components/data-stores/LibraryCatalogPane", () => ({
  LibraryCatalogPane: () => null,
}));
jest.mock("@/features/rag/components/shell/RagHubHeader", () => ({
  RagHubHeader: () => null,
}));
jest.mock("@/components/errors/ErrorNotice", () => ({
  ErrorNotice: () => null,
}));
jest.mock("@ai-matrx/design-system", () => ({ Skeleton: () => null }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { RagHomePage } from "@/features/rag/components/RagHomePage";

function render(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<RagHomePage />);
  });
  return host;
}

describe("Knowledge home counts", () => {
  it("shows the Sources page's Saved / All captures counts, from its own read", () => {
    const host = render();
    const text = host.textContent ?? "";
    expect(countsCall).toHaveBeenCalledWith({ kind: "mine" }, "user-1");
    expect(text).toContain("Saved");
    expect(text).toContain("937");
    expect(text).toContain("All captures");
    expect(text).toContain("1,851");
    // Nothing from the retired summary endpoint.
    expect(text).not.toContain("1902");
    expect(text).not.toContain("473");
  });

  it("each count links to the Sources page with its filter", () => {
    const host = render();
    const hrefs = [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/knowledge/library?show=saved");
    expect(hrefs).toContain("/knowledge/library?show=all");
  });

  it("no longer describes the retired flow or names the old endpoint", () => {
    const text = render().textContent ?? "";
    expect(text).not.toMatch(/drag a PDF onto a store/i);
    expect(text).not.toContain("/knowledge/library/summary/totals");
    expect(text).toMatch(/Upload a file/);
    expect(text).toMatch(/Paste a web address/);
    expect(text).toMatch(/Paste text/);
    expect(text).toMatch(/Import a transcript/);
  });
});
