/**
 * @jest-environment jsdom
 */
/*
 * The research screen's Edit → Save used to PATCH the research content route
 * with no JSON content type: the server answered 422, nothing was saved, the
 * editor closed and nobody was told. A page that is a Source is now saved
 * through the Source (`updateContentCurated` → POST /sources/{id}/edit); a
 * page not yet a Source through `saveResearchContentEdit`; every refusal is
 * shown in the server's own words and the editor stays open with the text.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockEditContent = jest.fn();
jest.mock("../../../hooks/useResearchApi", () => ({
  useResearchApi: () => ({ editContent: mockEditContent }),
}));
const mockUpdateCurated = jest.fn();
const mockSaveEdit = jest.fn();
jest.mock("../../../service", () => ({
  updateContentCurated: (...a: unknown[]) => mockUpdateCurated(...a),
  saveResearchContentEdit: (...a: unknown[]) => mockSaveEdit(...a),
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea aria-label="body" value={p.value} onChange={p.onChange} />
  ),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));
const mockEnsureOrgId = jest.fn(async () => "org1");
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: () => mockEnsureOrgId(),
}));
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    success: (...a: unknown[]) => mockToastSuccess(...a),
  },
}));

import { BackendApiError } from "@/lib/api/errors";
import { ContentViewer } from "../ContentViewer";
import type { ResearchContent } from "../../../types";

const base = {
  id: "c1",
  source_id: "s1",
  topic_id: "t1",
  content: "Old body",
  original_content: null,
  processed_document_id: null,
  content_hash: null,
  char_count: 8,
  content_type: "markdown",
  is_good_scrape: true,
  quality_override: null,
  capture_method: "auto",
  failure_reason: null,
  published_at: null,
  modified_at: null,
  is_current: true,
  capture_version: 1,
  linked_extraction_id: null,
  linked_transcript_id: null,
  extracted_links: null,
  extracted_images: null,
  scraped_at: null,
} as ResearchContent;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as
    | HTMLButtonElement
    | undefined;

async function editAndSave(content: ResearchContent, onSaved: () => void) {
  await act(async () => {
    root.render(<ContentViewer topicId="t1" content={content} onSaved={onSaved} />);
  });
  await act(async () => button("Edit")?.click());
  const area = host.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      area,
      "New body",
    );
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    button("Save")?.click();
    await new Promise((r) => setTimeout(r, 0));
  });
}

it("saves a page that is a Source through the Source, never the research PATCH", async () => {
  mockUpdateCurated.mockResolvedValue({ notices: [] });
  const onSaved = jest.fn();
  await editAndSave({ ...base, processed_document_id: "pd1" }, onSaved);
  expect(mockUpdateCurated).toHaveBeenCalledWith(
    expect.objectContaining({ id: "c1", processed_document_id: "pd1" }),
    "New body",
  );
  expect(mockEditContent).not.toHaveBeenCalled();
  expect(onSaved).toHaveBeenCalled();
});

it("saves a page not yet a Source through the research edit route", async () => {
  mockSaveEdit.mockResolvedValue({});
  const onSaved = jest.fn();
  await editAndSave(base, onSaved);
  expect(mockSaveEdit).toHaveBeenCalledWith("t1", "c1", "New body");
  expect(mockEditContent).not.toHaveBeenCalled();
  expect(onSaved).toHaveBeenCalled();
});

it("shows the server's sentence and keeps the editor open when the save is refused", async () => {
  mockSaveEdit.mockRejectedValue(
    new BackendApiError({
      code: "validation_error",
      detail: "The edited text is empty, so nothing was saved.",
      userMessage: "Invalid request. Please check your input and try again.",
      status: 422,
    }),
  );
  const onSaved = jest.fn();
  await editAndSave(base, onSaved);
  expect(mockToastError).toHaveBeenCalledWith(
    expect.stringContaining("The edited text is empty, so nothing was saved."),
  );
  expect(onSaved).not.toHaveBeenCalled();
  expect(host.querySelector("textarea")).not.toBeNull();
});
