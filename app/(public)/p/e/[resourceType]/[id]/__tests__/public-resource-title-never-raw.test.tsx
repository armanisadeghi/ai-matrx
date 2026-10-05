/**
 * K7 (kind-never-raw round 7): the public note / template page drew a
 * resource's label and description as written — in the <h1>, the <title>
 * and the Open Graph / Twitter meta. A note titled with kind JSON put the
 * JSON in a search result and a link preview. Plain-text slots read
 * `kindTextLabel(displayTitle(…))`; the rich description body keeps its
 * pipeline.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const KIND = JSON.stringify({ __kind: "flashcard_set", title: "Cell biology", cards: [] });
const RESOURCE = {
  resourceType: "note",
  resourceId: "6a1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e",
  displayLabel: "Note",
  title: KIND,
  description: `Study set: ${KIND}`,
  row: { content: "Mitochondria make ATP." },
};

jest.mock("../../../loadPublicResource", () => ({ loadPublicResource: async () => RESOURCE }));
jest.mock("@/lib/seo/search-engine-indexed.server", () => ({ searchEngineRobots: async () => ({ index: false }) }));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));
jest.mock("@/components/matrx/PublicHeaderActionsPortal", () => ({ PublicHeaderActionsPortal: () => null }));
jest.mock("@/features/sharing/components/DuplicateToEditButton", () => ({ DuplicateToEditButton: () => null }));
jest.mock("@/features/flashcards/components/public/PublicFlashcardDeck", () => ({
  PublicFlashcardDeck: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
jest.mock("@/features/sharing/lenses/record-fields-view", () => ({ RecordFieldsView: () => null }));

import { generateMetadata } from "../page";
import { PublicResourceView } from "../PublicResourceView";

const params = Promise.resolve({ resourceType: "note", id: RESOURCE.resourceId });

describe("K7: a public resource's title and description are never raw kind JSON", () => {
  it("the <title>, description and Open Graph / Twitter meta", async () => {
    const meta = await generateMetadata({ params });
    const text = JSON.stringify(meta);
    expect(text).not.toMatch(/__kind/);
    expect(String(meta.title)).toContain("Cell biology");
    expect(String(meta.description)).toContain("Study set");
  });

  it("the page heading", () => {
    const html = renderToStaticMarkup(<PublicResourceView resource={RESOURCE as never} />);
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
    expect(heading).not.toMatch(/__kind|&quot;/);
    expect(heading).toContain("Cell biology");
  });

  it("the deck heading", () => {
    const html = renderToStaticMarkup(<PublicResourceView resource={{ ...RESOURCE, resourceType: "fc_set", cards: [] } as never} />);
    const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
    expect(heading).not.toMatch(/__kind|&quot;/);
    expect(heading).toContain("Cell biology");
  });
});
