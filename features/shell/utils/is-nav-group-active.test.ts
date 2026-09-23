import { primaryNavItems, type ShellNavItem } from "../constants/nav-data";
import {
  findActiveNavChild,
  findOwningNavItem,
  isExclusiveNavGroupActive,
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

  it("does not activate a group from a shortcut child in another module", () => {
    const aiWork = primaryNavItems.find((item) => item.label === "AI Work");
    const chat = primaryNavItems.find((item) => item.label === "Chat");
    expect(aiWork).toBeDefined();
    expect(chat).toBeDefined();

    expect(isNavGroupActive("/chat/new", aiWork!)).toBe(false);
    expect(isNavGroupActive("/chat/new", chat!)).toBe(true);
    expect(isNavGroupActive("/chat", aiWork!)).toBe(false);
    expect(isNavGroupActive("/chat", chat!)).toBe(true);
    expect(isNavGroupActive("/work", aiWork!)).toBe(true);
    expect(isNavGroupActive("/work", chat!)).toBe(false);
  });

  it("activates Publish for nested CMS routes through its CMS child", () => {
    const publish = primaryNavItems.find((item) => item.label === "Publish");
    expect(publish).toBeDefined();

    expect(isNavGroupActive("/cms/html-pages", publish!)).toBe(true);
    expect(isExclusiveNavGroupActive("/cms/html-pages", publish!, primaryNavItems)).toBe(true);
  });

  it("keeps at most one primary group selected for every listed destination", () => {
    const hrefs = new Set<string>();
    for (const item of primaryNavItems) {
      if (item.href.startsWith("/")) hrefs.add(item.href);
      for (const child of item.children ?? []) {
        if (child.href.startsWith("/")) hrefs.add(child.href);
      }
    }

    const collisions: string[] = [];
    const unexpected: string[] = [];
    for (const href of hrefs) {
      const exclusiveOwners = primaryNavItems.filter((item) =>
        isExclusiveNavGroupActive(href, item, primaryNavItems),
      );
      if (exclusiveOwners.length > 1) {
        collisions.push(
          `${href} → ${exclusiveOwners.map((item) => item.label).join(", ")}`,
        );
      }

      const owner = findOwningNavItem(href, primaryNavItems);
      if (href.startsWith("/chat")) {
        if (owner?.label !== "Chat") {
          unexpected.push(`${href} owner ${owner?.label ?? "none"}`);
        }
      }
      if (href === "/work" || href.startsWith("/work/")) {
        if (owner?.label !== "AI Work") {
          unexpected.push(`${href} owner ${owner?.label ?? "none"}`);
        }
      }
      if (href === "/education" || href.startsWith("/education/")) {
        if (owner?.label !== "Education Hub") {
          unexpected.push(`${href} owner ${owner?.label ?? "none"}`);
        }
      }
    }

    expect(collisions).toEqual([]);
    expect(unexpected).toEqual([]);
  });
});
