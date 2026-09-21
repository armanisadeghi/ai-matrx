/**
 * A first-time Expert clicks "Add more → New document" inside her own Rulebook,
 * names it, and lands — in a NEW TAB — on Bold/Italic/Arial/11pt and a page
 * ruler, with, in cold walk 18's words, "not one sentence saying what this is
 * or how what she types gets back into her rules", and no way back.
 *
 * The connection is real: `AssociationCaptureToolbar` attaches the new
 * document to the Rulebook (role `distillation_source`) BEFORE it opens the
 * tab. So the screen has the truth available and simply never said it. These
 * assert it now does, and that it says it only when it is true.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RULEBOOK_ID = "3b12f1fd-526b-45c4-a201-1c47c9063e81";
const DOCUMENT_ID = "0a4f9f2e-1c0a-4f6b-9a21-6b6b0d3a77cc";

/** What the association store hands back, shaped like `AssociationEdge`. */
const edge = (over: Record<string, unknown> = {}) => ({
  id: "edge-1",
  direction: "outgoing" as const,
  otherType: "rulebook",
  otherId: RULEBOOK_ID,
  role: "distillation_source",
  label: "Warranty and permit notes",
  position: null,
  metadata: null,
  orgId: null,
  createdAt: "2026-09-21T00:00:00Z",
  ...over,
});

let edges: ReturnType<typeof edge>[] = [];
let titlesLoading = false;

jest.mock("@/features/scopes/hooks/useAssociations", () => ({
  useAssociations: () => ({
    edges,
    status: "ready",
    error: null,
    fetchedAt: 1,
    add: jest.fn(),
    remove: jest.fn(),
    setTargets: jest.fn(),
    reload: jest.fn(),
  }),
}));

jest.mock("@/features/scopes/hooks/useEntityTitles", () => ({
  useEntityTitles: () => ({
    titleFor: () => "Drain and Heater Verdict",
    isUnresolved: () => false,
    loading: titlesLoading,
  }),
}));

import {
  DocumentRulebookNotice,
  rulebooksLearningFrom,
} from "../components/DocumentRulebookNotice";
import { DUMP_ROLE } from "../sourceLinks";

let container: HTMLDivElement;
let root: Root;

function render(documentId: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<DocumentRulebookNotice documentId={documentId} />);
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  edges = [];
  titlesLoading = false;
});

describe("a document that a Rulebook learns from says so", () => {
  it("names the Rulebook, says the writing is saved, and offers the way back", () => {
    edges = [edge()];
    render(DOCUMENT_ID);

    const row = container.querySelector('[role="status"]');
    expect(row).not.toBeNull();
    const text = row!.textContent ?? "";
    expect(text).toMatch(/Drain and Heater Verdict/);
    expect(text).toMatch(/becomes material/i);
    expect(text).toMatch(/saves as you type/i);

    const back = container.querySelector("a");
    expect(back?.textContent).toMatch(/back to the rulebook/i);
    expect(back?.getAttribute("href")).toBe(`/masterwork/${RULEBOOK_ID}`);
  });

  it("still says the true thing before the Rulebook's name has resolved", () => {
    // A row that waits for a name is absent exactly when she needs it.
    edges = [edge()];
    titlesLoading = true;
    render(DOCUMENT_ID);
    expect(container.textContent).toMatch(/your Rulebook/i);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      `/masterwork/${RULEBOOK_ID}`,
    );
  });

  it("says nothing on an ordinary document", () => {
    edges = [];
    render(DOCUMENT_ID);
    expect(container.innerHTML).toBe("");
  });

  it("says nothing before the document itself has loaded", () => {
    edges = [edge()];
    render(null);
    expect(container.innerHTML).toBe("");
  });
});

describe("rulebooksLearningFrom", () => {
  it("uses the role the Rulebook actually attaches its sources with", () => {
    // Never a hand-typed string: if `DUMP_ROLE` moves, this test moves with it.
    expect(edge().role).toBe(DUMP_ROLE);
  });

  it("takes only source edges to Rulebooks, once each", () => {
    expect(
      rulebooksLearningFrom([
        edge(),
        // The same Rulebook reached through a second edge is one Rulebook.
        edge({ id: "edge-2" }),
        // A Rulebook edge with another role is not "material it learns from".
        edge({ id: "edge-3", otherId: "other", role: "theme" }),
        // A folder, a tag, a conversation: not Rulebooks.
        edge({ id: "edge-4", otherType: "note", otherId: "n1" }),
      ]),
    ).toEqual([{ token: "rulebook", id: RULEBOOK_ID }]);
  });

  it("names every Rulebook when a document feeds more than one", () => {
    expect(
      rulebooksLearningFrom([edge(), edge({ id: "e2", otherId: "second" })]),
    ).toHaveLength(2);
  });
});
