/**
 * 🚨 A REFERENCE IS A LINK — clicking it opens the record it names (2026-09-30).
 *
 * Every reference chip (```matrx {"__kind":"directive_v1_reference_<noun>"}```)
 * resolves its noun to an item type and calls `useOpenItemPresentation`, THE
 * ONE opener. Observed live 2026-09-30: a note chip opened the Note-info
 * STATS panel ("0 Words, 0 Characters" for an 88-character note) and never the
 * note. The note must open in the Notes window, in its own tab.
 *
 * The census below pins, for each type the reference picker offers first,
 * WHICH opener ran — not merely that one did — so a type silently re-routed to
 * an info-only surface fails here.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const openNotesWindow = jest.fn();
const openNoteInfo = jest.fn();
const openAgent = jest.fn();
const openFile = jest.fn();
const openDetail = jest.fn();

jest.mock("@/features/overlays/openers/notesWindow", () => ({
  useOpenNotesWindow: () => openNotesWindow,
}));
jest.mock("@/features/overlays/openers/noteInfoWindow", () => ({
  useOpenNoteInfoWindow: () => openNoteInfo,
}));
jest.mock("@/features/overlays/openers/agentRunWindow", () => ({
  useOpenAgentRunWindow: () => openAgent,
}));
jest.mock("@/features/overlays/openers/filePreviewWindow", () => ({
  useOpenFilePreviewWindow: () => openFile,
}));
jest.mock("@/features/overlays/openers/structuredListManagerV2Window", () => ({
  useOpenStructuredListManagerV2Window: () => jest.fn(),
}));
jest.mock("@/features/overlays/openers/siteQuickViewWindow", () => ({
  useOpenSiteQuickViewWindow: () => jest.fn(),
}));
jest.mock("@ai-matrx/detail/react", () => ({
  ...jest.requireActual("@ai-matrx/detail/react"),
  useOpenDetail: () => openDetail,
}));

import { useOpenItemPresentation } from "../useOpenItemPresentation";
import type { ItemType } from "../types";
import { REFERENCE_RESOLVERS } from "@/features/matrx-envelope/referenceResolvers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = "5c3b7d1e-2f4a-4b6c-8d9e-0a1b2c3d4e5f";

function openWith(type: ItemType): Promise<boolean | null> {
  let opened: boolean | null = null;
  function Probe() {
    const open = useOpenItemPresentation();
    React.useEffect(() => {
      opened = open(type, ID, { name: "Website colors" });
    }, [open]);
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return act(async () => {
    root.render(<Probe />);
  }).then(() => {
    act(() => root.unmount());
    container.remove();
    return opened;
  });
}

beforeEach(() => {
  for (const f of [openNotesWindow, openNoteInfo, openAgent, openFile, openDetail])
    f.mockClear();
});

describe("a note reference opens the note", () => {
  it("the note chip's noun resolves to the note item type", () => {
    expect(REFERENCE_RESOLVERS.note?.openItemType).toBe("note");
  });

  it("opens the Notes window ON the note — never the info/stats panel", async () => {
    expect(await openWith("note")).toBe(true);
    expect(openNotesWindow).toHaveBeenCalledWith({ initialNoteId: ID });
    expect(openNoteInfo).not.toHaveBeenCalled();
    expect(openDetail).not.toHaveBeenCalled();
  });
});

describe("census: each reference type the picker offers first opens its record", () => {
  // noun → the opener that must run
  const CASES: Array<[string, () => jest.Mock]> = [
    ["task", () => openDetail],
    ["project", () => openDetail],
    ["workbook", () => openDetail],
    ["udt_document", () => openDetail],
    ["transcript_session", () => openDetail],
    ["file", () => openFile],
    ["transcript", () => openFile],
    ["agent", () => openAgent],
  ];
  it.each(CASES)("%s", async (noun, expected) => {
    const openType = REFERENCE_RESOLVERS[noun]?.openItemType as ItemType;
    expect(openType).toBeTruthy();
    expect(await openWith(openType)).toBe(true);
    expect(expected()).toHaveBeenCalledTimes(1);
    expect(openNoteInfo).not.toHaveBeenCalled();
  });
});
