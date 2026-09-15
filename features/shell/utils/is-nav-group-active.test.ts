import type { ShellNavItem } from "../constants/nav-data";
import {
  findActiveNavChild,
  isNavGroupActive,
  isOnRoute,
} from "./is-nav-group-active";

const crossNamespaceGroup: ShellNavItem = {
  label: "Knowledge",
  href: "/knowledge",
  iconName: "BrainCircuit",
  section: "primary",
  ownedRoutePrefixes: ["/rag"],
  children: [
    {
      label: "Knowledge Hub",
      href: "/knowledge",
      iconName: "BrainCircuit",
      exact: true,
    },
    {
      label: "Data stores",
      href: "/knowledge/data-stores",
      iconName: "Database",
    },
    {
      label: "Search",
      href: "/knowledge/search",
      iconName: "Search",
    },
  ],
};

describe("shell navigation route ownership", () => {
  it("normalizes query strings and trailing slashes at segment boundaries", () => {
    expect(isOnRoute("/rag/search/?q=one", "/rag/search")).toBe(true);
    expect(isOnRoute("/rag/search-old", "/rag/search")).toBe(false);
  });

  it("activates a group when an alternate-namespace child owns the route", () => {
    expect(isNavGroupActive("/rag/data-stores/one", crossNamespaceGroup)).toBe(
      true,
    );
  });

  it("returns only the most-specific matching child", () => {
    const nested: ShellNavItem = {
      ...crossNamespaceGroup,
      children: [
        {
          label: "Data",
          href: "/rag",
          iconName: "Database",
        },
        ...(crossNamespaceGroup.children ?? []),
      ],
    };

    expect(findActiveNavChild("/rag/data-stores/one", nested)?.label).toBe(
      "Data stores",
    );
  });
});
