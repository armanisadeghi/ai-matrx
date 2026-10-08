/**
 * The board's Document item: which saved sources it renders (both the current
 * entity form and the older `{ kind: "document" }` shape, so no tile shows
 * "Unavailable"), what "New document" places, where Open goes — and that the
 * document is created only when the person presses Create, through the
 * /documents create path and `ensureOrgId` (which never prompts).
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  DOCUMENT_ITEM_KEY,
  currentDocumentSource,
  documentHref,
  documentIdOf,
  matchesDocument,
  newDocumentItem,
  pickedDocumentItem,
} from "../document-items.logic";

const createDocument = jest.fn();
const ensureOrgId = jest.fn();

jest.mock("@/features/documents/document-service", () => ({
  createDocument: (...args: unknown[]) => createDocument(...args),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: (...args: unknown[]) => ensureOrgId(...args),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "org-active",
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => "org-active" }));
jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual("@ai-matrx/design-system"),
  ErrorNotice: ({ title, message }: { title: string; message: string }) => (
    <div role="alert">
      {title}: {message}
    </div>
  ),
}));

// Imported after the mocks it depends on.
import { DocumentDraftBody } from "../DocumentDraftBody";

describe("which tiles the Document item renders", () => {
  it("matches the registry key and the older document shape, nothing else", () => {
    expect(matchesDocument({ kind: "entity", entity: DOCUMENT_ITEM_KEY, id: "d1" })).toBe(true);
    expect(matchesDocument({ kind: "entity", entity: DOCUMENT_ITEM_KEY, id: null })).toBe(true);
    expect(matchesDocument({ kind: "document", documentId: "d1" })).toBe(true);
    expect(matchesDocument({ kind: "entity", entity: "note", id: "d1" })).toBe(false);
    expect(matchesDocument({ kind: "entity", entity: "data-table", id: "d1" })).toBe(false);
    expect(DOCUMENT_ITEM_KEY).toBe("udt_document");
  });

  it("reads the id from either shape and saves the older one in the current form", () => {
    expect(documentIdOf({ kind: "document", documentId: "d1" })).toBe("d1");
    expect(documentIdOf({ kind: "entity", entity: DOCUMENT_ITEM_KEY, id: null })).toBeNull();
    expect(currentDocumentSource({ kind: "document", documentId: "d1" })).toEqual({
      kind: "entity",
      entity: DOCUMENT_ITEM_KEY,
      id: "d1",
    });
    expect(currentDocumentSource({ kind: "entity", entity: DOCUMENT_ITEM_KEY, id: "d1" })).toBeNull();
  });

  it("opens the document's own page, and nothing for a document not created yet", () => {
    const door = (id: string) => `/documents/${id}`;
    expect(documentHref({ kind: "entity", entity: DOCUMENT_ITEM_KEY, id: "d1" }, door)).toBe("/documents/d1");
    expect(documentHref({ kind: "entity", entity: DOCUMENT_ITEM_KEY, id: null }, door)).toBeNull();
  });

  it("places a new document with no record, and a picked one under its own name", () => {
    expect(newDocumentItem()).toEqual({
      title: "Untitled document",
      source: { kind: "entity", entity: DOCUMENT_ITEM_KEY, id: null },
    });
    expect(pickedDocumentItem({ id: "d9", document_name: "Q3 memo" })).toEqual({
      title: "Q3 memo",
      source: { kind: "entity", entity: DOCUMENT_ITEM_KEY, id: "d9" },
    });
  });
});

describe("starting a new document on the board", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    createDocument.mockReset();
    ensureOrgId.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const createButton = () =>
    [...container.querySelectorAll("button")].find((b) => /Create document|Try again/.test(b.textContent ?? ""));

  it("creates nothing on mount, then one document on Create through ensureOrgId", async () => {
    ensureOrgId.mockResolvedValue("org-chosen");
    createDocument.mockResolvedValue({ success: true, data: { id: "doc-new", document_name: "Untitled document" } });
    const onSource = jest.fn();

    act(() => root.render(<DocumentDraftBody onSource={onSource} />));
    expect(ensureOrgId).not.toHaveBeenCalled();
    expect(createDocument).not.toHaveBeenCalled();

    await act(async () => {
      createButton()?.click();
    });

    expect(ensureOrgId).toHaveBeenCalledWith("org-active");
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(createDocument).toHaveBeenCalledWith({ name: "Untitled document", organizationId: "org-chosen" });
    expect(onSource).toHaveBeenCalledWith(
      { kind: "entity", entity: DOCUMENT_ITEM_KEY, id: "doc-new" },
      "Untitled document",
    );
  });

  it("says why when there is no organization to act in (it never asks), and creates nothing", async () => {
    ensureOrgId.mockRejectedValue(new Error("You don't belong to an organization yet. Create one to continue."));
    const onSource = jest.fn();
    act(() => root.render(<DocumentDraftBody onSource={onSource} />));
    await act(async () => {
      createButton()?.click();
    });
    expect(createDocument).not.toHaveBeenCalled();
    expect(onSource).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/could not be created: You don't belong to an organization yet/);
    expect(createButton()?.textContent).toMatch(/Try again/);
  });

  it("shows the create failure instead of swallowing it", async () => {
    ensureOrgId.mockResolvedValue("org-chosen");
    createDocument.mockResolvedValue({ success: false, error: "permission denied" });
    const onSource = jest.fn();
    act(() => root.render(<DocumentDraftBody onSource={onSource} />));
    await act(async () => {
      createButton()?.click();
    });
    expect(onSource).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/could not be created: permission denied/);
  });
});
