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
import { getReferenceResolver } from "@/features/matrx-envelope/referenceResolvers";
import { referenceDoor } from "@/features/matrx-envelope/referenceDoor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = "5c3b7d1e-2f4a-4b6c-8d9e-0a1b2c3d4e5f";

async function openWith(type: ItemType): Promise<boolean | null> {
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
  await act(async () => {
    root.render(<Probe />);
  });
  act(() => root.unmount());
  container.remove();
  return opened;
}

beforeEach(() => {
  for (const f of [openNotesWindow, openNoteInfo, openAgent, openFile, openDetail])
    f.mockClear();
});

describe("a note reference opens the note", () => {
  it("the note chip's noun resolves to the note item type", () => {
    expect(getReferenceResolver("note")?.openItemType).toBe("note");
  });

  it("opens the Notes window ON the note — never the info/stats panel", async () => {
    expect(await openWith("note")).toBe(true);
    expect(openNotesWindow).toHaveBeenCalledWith({ initialNoteId: ID });
    expect(openNoteInfo).not.toHaveBeenCalled();
    expect(openDetail).not.toHaveBeenCalled();
  });
});

describe("census: each reference type the picker offers first opens its record", () => {
  // noun → the ref the picker emits → the opener that must run
  const CASES: Array<[string, Record<string, string>, () => jest.Mock]> = [
    ["task", { id: ID }, () => openDetail],
    ["project", { id: ID }, () => openDetail],
    ["workbook", { id: ID }, () => openDetail],
    ["udt_document", { id: ID }, () => openDetail],
    ["dataset", { id: ID }, () => openDetail],
    ["transcript", { id: ID }, () => openDetail],
    ["transcript_segment", { transcript_id: ID, segment_index: "0" }, () => openDetail],
    ["file", { file_id: ID }, () => openFile],
    ["agent", { id: ID }, () => openAgent],
  ];
  it.each(CASES)("%s", async (noun, ref, expected) => {
    const resolver = getReferenceResolver(noun);
    // The chip is DISABLED unless the resolver yields an id to open — a
    // resolver whose openId returns nothing is a dead chip (transcript, until
    // 2026-09-30).
    expect(resolver?.openId(ref)).toBe(ID);
    const openType = resolver?.openItemType as ItemType;
    expect(await openWith(openType)).toBe(true);
    expect(expected()).toHaveBeenCalledTimes(1);
    expect(openNoteInfo).not.toHaveBeenCalled();
  });

  it("a studio session opens its studio page — never a seed-only Detail panel", () => {
    const door = referenceDoor("transcript_session", { id: ID });
    expect(door).toEqual(
      expect.objectContaining({ kind: "address", href: `/transcripts/studio?session=${ID}` }),
    );
  });

  it("a transcript opens as a transcript record — never the file preview", async () => {
    expect(getReferenceResolver("transcript")?.openItemType).toBe("transcript");
    expect(getReferenceResolver("transcript_segment")?.openItemType).toBe("transcript");
    await openWith("transcript");
    expect(openFile).not.toHaveBeenCalled();
    expect(openDetail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "transcript", id: ID }),
    );
  });
});
