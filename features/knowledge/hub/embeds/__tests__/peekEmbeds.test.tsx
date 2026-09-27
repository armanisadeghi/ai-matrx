/**
 * The peek from the person's seat: a hit whose kind has a full embed opens
 * that screen under the peek's header (title, Open full, Keep/Archive/Tag),
 * with Details one tab away; any other kind — and sample data — keeps the
 * light peek.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("q=plan") }));
jest.mock("@ai-matrx/associations/react", () => ({
  useEntityTitles: () => ({ titleFor: () => "Untitled" }),
  useAssociations: () => ({ edges: [], status: "ready", error: null }),
}));
jest.mock("@/features/knowledge/hub/components/PeekSourceSegments", () => ({ PeekSourceSegments: () => null }));
jest.mock("@/features/knowledge/hub/embeds/HubDetailEmbed", () => ({
  HubDetailEmbed: ({ embed }: { embed: { kind: string } }) => <div data-testid="embed">{embed.kind}</div>,
}));

import { HubPeek } from "@/features/knowledge/hub/components/HubPeek";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function peek(hit: KnowledgeHit, sample = false) {
  act(() => {
    root.render(
      <HubPeek
        hit={hit}
        peekKey={`${hit.entity}:${hit.id}`}
        sample={sample}
        onClose={() => undefined}
        onOpenFull={() => undefined}
        onFileUnder={() => undefined}
        onAcceptSuggestion={() => undefined}
        extraActions={<button type="button">Keep</button>}
      />,
    );
  });
}

const q = (sel: string) => host.querySelector(sel);
const text = () => host.textContent ?? "";

it.each([
  [{ entity: "processed_document", id: "s1", title: "A page", source_kind: "scrape_parsed_page" }, "web"],
  [{ entity: "processed_document", id: "s2", title: "Deck", source_kind: "cld_file" }, "file"],
  [{ entity: "processed_document", id: "s3", title: "Talk", source_kind: "transcript" }, "transcript"],
  [{ entity: "conversation", id: "c1", title: "Chat", matches: [{ message_id: "m1" }] }, "conversation"],
  [{ entity: "note", id: "n1", title: "Plan" }, "note"],
] as [KnowledgeHit, string][])("%o opens its own screen (%s) under the peek header", (hit, kind) => {
  peek(hit);
  expect(q("[data-testid=embed]")?.textContent).toBe(kind);
  expect(q("[data-testid=hub-peek-embed]")?.getAttribute("data-embed-kind")).toBe(kind);
  // The header stays: title, Open full, the host's Keep/Archive/Tag.
  expect(q("h2")?.textContent).toBe(hit.title);
  expect(text()).toContain("Open full");
  expect(text()).toContain("Keep");
  expect(text()).toContain("Filed under");
  // Details is the light peek, one tab away.
  const details = Array.from(host.querySelectorAll("[role=tab]")).find((b) => b.textContent === "Details");
  act(() => (details as HTMLButtonElement).click());
  expect(q("[data-testid=embed]")).toBeNull();
  expect(text()).toContain("Suggestions");
});

it("a kind without an embed keeps the light peek", () => {
  peek({ entity: "project", id: "p1", title: "Project X" });
  expect(q("[data-testid=embed]")).toBeNull();
  expect(q("[role=tablist]")).toBeNull();
  expect(text()).toContain("Top segments");
  expect(text()).toContain("Suggestions");
});

it("a Source of an unknown kind keeps the light peek", () => {
  peek({ entity: "processed_document", id: "s9", title: "Odd", source_kind: "mystery" });
  expect(q("[data-testid=embed]")).toBeNull();
});

it("sample data keeps the light peek (no real record behind it)", () => {
  peek({ entity: "note", id: "n-sample", title: "Sample" }, true);
  expect(q("[data-testid=embed]")).toBeNull();
});
