/**
 * A web page picked from Use existing shows its address on its card (verify-6 item 9).
 *
 * 2026-10-01: a page added by its link carried its address (`draft.origin`, set by the door), but
 * the same page picked from Use existing → Websites arrived as a bare `processed_document` pointer
 * and its card said only "Web page". The address is the Source row's `canonical_identity`; the
 * card set reads it for every Source pointer that has none, whatever path added it.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rows: { id: string; source_kind: string | null; canonical_identity: string | null }[] = [];
const inCalls: unknown[][] = [];

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          in: (...args: unknown[]) => {
            inCalls.push(args);
            return Promise.resolve({ data: rows, error: null });
          },
        }),
      }),
    }),
  },
}));

import { sourceAddress, sourceDraftPatch, useSourceDraftAddresses } from "./sourceAddress";

beforeEach(() => {
  rows.length = 0;
  inCalls.length = 0;
});

describe("sourceAddress", () => {
  it("shows a web link and a YouTube video's link, never a machine key", () => {
    expect(sourceAddress("https://en.wikipedia.org/wiki/Mitochondrion")).toBe(
      "https://en.wikipedia.org/wiki/Mitochondrion",
    );
    expect(sourceAddress("youtube:qgVFkRn8f10")).toBe("https://www.youtube.com/watch?v=qgVFkRn8f10");
    expect(sourceAddress("pasted-text:32311f951c6fcfcf78c6ca0b770c05aedc1bd15a")).toBeNull();
    expect(sourceAddress("2836848be386391a9ebfd5c6c13e3d752088b31f6d59e8bf7910aab4d67f")).toBeNull();
    expect(sourceAddress(null)).toBeNull();
  });

  it("never replaces an address the door already gave", () => {
    expect(
      sourceDraftPatch(
        { origin: "https://typed.example.org/page", sourceKind: "web_page" },
        { id: "a", source_kind: "web_page", canonical_identity: "https://other.example.org/" },
      ),
    ).toBeNull();
  });
});

describe("useSourceDraftAddresses", () => {
  it("gives a picked web page its address and kind, and reads each Source once", async () => {
    rows.push({
      id: "pd-1",
      source_kind: "scrape_parsed_page",
      canonical_identity: "https://en.wikipedia.org/wiki/Mitochondrion",
    });
    const updateDraft = jest.fn();
    const sources = [
      { id: "card-1", draft: { processedDocumentId: "pd-1" } },
      { id: "card-2", draft: {} },
    ];
    type Cards = Parameters<typeof useSourceDraftAddresses>[0];
    function Probe({ s }: { s: Cards }) {
      useSourceDraftAddresses(s, updateDraft);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<Probe s={sources} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft).toHaveBeenCalledWith("card-1", {
      origin: "https://en.wikipedia.org/wiki/Mitochondrion",
      sourceKind: "scrape_parsed_page",
    });
    expect(inCalls).toEqual([["id", ["pd-1"]]]);
    await act(async () => {
      root.render(<Probe s={[...sources]} />);
    });
    expect(inCalls).toHaveLength(1);
    act(() => root.unmount());
  });
});
