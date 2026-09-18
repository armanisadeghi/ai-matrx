/**
 * Audience counts are doors. A missing or failed facet response must never be
 * rendered as the numeric zero that a completed empty bucket would mean.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConversationAudienceFilter } from "./ConversationAudienceFilter";
import type { EntityListController } from "@/lib/entity-list/config";
import { EMPTY_SCOPE_COUNTS, type EntityFacets } from "@/lib/entity-list/types";
import type { ConversationBrowseRow } from "../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FACETS: EntityFacets = {
  byKind: {
    audience: [
      { value: "chat", count: 4 },
      { value: "external", count: 7 },
      { value: "internal", count: 2 },
    ],
    // The live shape since 2026-09-18 (cvx_list_facets_external_breaks_down_by_tool.sql):
    // every outside coding tool is source_app 'code-plugin', so external rows
    // are NOT in audience_source_app — their tool is counted by source_feature.
    audience_source_app: [{ value: "chat:matrx", count: 4 }],
    audience_source_feature: [
      { value: "external:codex", count: 5 },
      { value: "external:claude-code", count: 2 },
    ],
  },
};

function makeList(
  extra: Pick<
    EntityListController<ConversationBrowseRow>,
    "facetsLoading" | "facetsError"
  >,
): EntityListController<ConversationBrowseRow> {
  return {
    query: {
      scope: { kind: "mine" },
      search: "",
      deep: false,
      archived: "active",
      filters: { audience: { kind: "select", values: ["external"] } },
      page: 1,
    },
    rows: [],
    total: 0,
    counts: EMPTY_SCOPE_COUNTS,
    countsLoading: false,
    countsError: null,
    facets: FACETS,
    ...extra,
    archivedProbe: { state: "off" },
    defaultArchived: "active",
    isLoading: false,
    isFetching: false,
    error: null,
    setScope: jest.fn(),
    setFilters: jest.fn(),
    setSearch: jest.fn(),
    setDeep: jest.fn(),
    patchQuery: jest.fn(),
    setPage: jest.fn(),
    resetFilters: jest.fn(),
    refresh: jest.fn(),
    removeRow: jest.fn(),
    patchRow: jest.fn(),
  };
}

describe("ConversationAudienceFilter facet readiness", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not publish stale counts or second-cut chips while facets reload", () => {
    act(() => {
      root.render(
        <ConversationAudienceFilter
          list={makeList({ facetsLoading: true, facetsError: null })}
        />,
      );
    });

    expect(container.textContent).toContain("Loading…");
    expect(container.textContent).not.toContain("7");
    expect(container.textContent).not.toContain("Claude Code");
    expect(container.textContent).not.toContain("Codex");
  });

  it("names a failed count read and retries through the controller", () => {
    const list = makeList({
      facetsLoading: false,
      facetsError: "facet service unavailable",
    });
    act(() => {
      root.render(<ConversationAudienceFilter list={list} />);
    });

    expect(container.textContent).toContain("Unavailable");
    expect(container.textContent).toContain("facet service unavailable");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry",
    );
    if (!retry) throw new Error("the failed facet read did not offer Retry");
    act(() => retry.click());
    expect(list.refresh).toHaveBeenCalledTimes(1);
  });

  it("breaks External down by TOOL and the chip filters on source_feature", () => {
    const list = makeList({ facetsLoading: false, facetsError: null });
    act(() => {
      root.render(<ConversationAudienceFilter list={list} />);
    });

    const group = container.querySelector('[aria-label="Which tool"]');
    if (!group) throw new Error("External showed no per-tool chips");
    const chips = Array.from(group.querySelectorAll("button")).map(
      (button) => button.textContent,
    );
    expect(chips).toEqual(["Codex5", "Claude Code2"]);

    const codex = group.querySelector("button");
    act(() => codex!.click());
    expect(list.setFilters).toHaveBeenCalledWith({
      audience: { kind: "select", values: ["external"] },
      source_feature: { kind: "select", values: ["codex"] },
    });
  });
});
