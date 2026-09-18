import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  filterGitHubRepositories,
  GitHubRepositoryPicker,
} from "./GitHubRepositoryPicker";
import type { GitHubRepository } from "./types";

jest.mock("./GitHubConnectionCard", () => ({
  GitHubConnectionCard: () => <div data-testid="connection-card" />,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function repository(
  fullName: string,
  overrides: Partial<GitHubRepository> = {},
): GitHubRepository {
  return {
    id: fullName,
    fullName,
    htmlUrl: `https://github.com/${fullName}`,
    cloneUrl: `https://github.com/${fullName}.git`,
    defaultBranch: "main",
    private: false,
    archived: false,
    permissionLevel: "admin",
    ...overrides,
  };
}

const REPOSITORIES = [
  repository("armanisadeghi/ai-matrx-admin"),
  repository("armanisadeghi/matrx-sandbox", { private: true }),
  repository("armanisadeghi/notes", { permissionLevel: "read" }),
];

describe("filterGitHubRepositories", () => {
  // Guard (c): search over the full name, which the old <select> could not do.
  it("matches on full_name, including the owner half", () => {
    expect(
      filterGitHubRepositories(REPOSITORIES, "sandbox").map((r) => r.fullName),
    ).toEqual(["armanisadeghi/matrx-sandbox"]);
    expect(filterGitHubRepositories(REPOSITORIES, "armanisadeghi")).toHaveLength(
      3,
    );
    expect(
      filterGitHubRepositories(REPOSITORIES, "AI-MATRX-ADMIN").map(
        (r) => r.fullName,
      ),
    ).toEqual(["armanisadeghi/ai-matrx-admin"]);
  });

  it("matches on the visibility and permission words the row shows", () => {
    expect(
      filterGitHubRepositories(REPOSITORIES, "private").map((r) => r.fullName),
    ).toEqual(["armanisadeghi/matrx-sandbox"]);
    expect(
      filterGitHubRepositories(REPOSITORIES, "read").map((r) => r.fullName),
    ).toEqual(["armanisadeghi/notes"]);
  });

  it("requires every term, so two words narrow instead of widen", () => {
    expect(
      filterGitHubRepositories(REPOSITORIES, "matrx private").map(
        (r) => r.fullName,
      ),
    ).toEqual(["armanisadeghi/matrx-sandbox"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterGitHubRepositories(REPOSITORIES, "   ")).toHaveLength(3);
  });
});

describe("GitHubRepositoryPicker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("filters the rendered list as the user types", async () => {
    await act(async () => {
      root.render(
        <GitHubRepositoryPicker
          repositories={REPOSITORIES}
          selectedId={null}
          onSelect={jest.fn()}
        />,
      );
    });
    expect(container.querySelectorAll("li")).toHaveLength(3);

    const input = container.querySelector("input");
    if (!input) throw new Error("search input did not render");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(input, "sandbox");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const rows = container.querySelectorAll("li");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("armanisadeghi/matrx-sandbox");
    expect(container.textContent).toContain("1 of 3 repositories");
  });

  // An empty result is the moment a user concludes the platform is broken, so
  // it must name the real cause instead of shrugging.
  it("names the missing-organization fix when nothing matches", async () => {
    await act(async () => {
      root.render(
        <GitHubRepositoryPicker
          repositories={REPOSITORIES}
          selectedId={null}
          onSelect={jest.fn()}
        />,
      );
    });
    const input = container.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      setter?.call(input, "AI-Matrix-Engine");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("add that organization above");
  });

  // Regression guard: while the inventory fetch is still in flight,
  // `repositories` is necessarily `[]` — that must never be read as "no
  // repos, go add an organization" (the class-of-bug this file's sibling,
  // GitHubConnectionCard's "Loading GitHub account…" state, also guards).
  it("shows a loading message, never the missing-org fix, while the inventory is loading", async () => {
    await act(async () => {
      root.render(
        <GitHubRepositoryPicker
          repositories={[]}
          selectedId={null}
          onSelect={jest.fn()}
          loading
        />,
      );
    });
    expect(container.textContent).not.toContain("No repositories yet");
    expect(container.textContent).toContain("Loading your repositories");
  });
});
