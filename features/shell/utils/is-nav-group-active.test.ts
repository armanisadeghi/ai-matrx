import { primaryNavItems, settingsItem, type ShellNavItem } from "../constants/nav-data";
import {
  findActiveNavBranch,
  findActiveNavChild,
  findOwningNavItem,
  isExclusiveNavGroupActive,
  isNavGroupActive,
  isOnRoute,
} from "./is-nav-group-active";

const crossNamespaceGroup: ShellNavItem = {
  label: "Knowledge",
  href: "/knowledge",
  iconName: "BookOpen",
  section: "primary",
  ownedRoutePrefixes: ["/rag"],
  children: [
    {
      label: "Knowledge Hub",
      href: "/knowledge",
      iconName: "BookOpen",
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

  it("lights the one domain that holds a route, across route namespaces", () => {
    const owner = (path: string) => findOwningNavItem(path, primaryNavItems)?.label;

    expect(owner("/work")).toBe("Chat");
    expect(owner("/work/conversations")).toBe("Chat");
    expect(owner("/chat/new")).toBe("Chat");
    expect(owner("/chat/message-templates")).toBe("Communications");
    expect(owner("/agents/orchestras")).toBe("Workflows");
    expect(owner("/agents/all")).toBe("Agents");
    expect(owner("/agent-connections/plugins")).toBe("Coding");
    expect(owner("/agent-connections/skills")).toBe("Agents");
    expect(owner("/notes")).toBe("Workspace");
    expect(owner("/transcripts/studio")).toBe("Media");
    expect(owner("/print/qr")).toBe("Media");
    expect(owner("/legal/ca-wc/cases")).toBe("Industries");
    expect(owner("/free/games/tic-tac-toe")).toBe("Other");
    expect(owner("/free/data-truncator")).toBe("Workspace");
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
      if (href.startsWith("/chat") && !href.startsWith("/chat/message-templates")) {
        if (owner?.label !== "Chat") {
          unexpected.push(`${href} owner ${owner?.label ?? "none"}`);
        }
      }
      if (href === "/work" || href.startsWith("/work/")) {
        if (owner?.label !== "Chat") {
          unexpected.push(`${href} owner ${owner?.label ?? "none"}`);
        }
      }
      if (href === "/education" || href.startsWith("/education/")) {
        if (owner?.label !== "Industries") {
          unexpected.push(`${href} owner ${owner?.label ?? "none"}`);
        }
      }
    }

    expect(collisions).toEqual([]);
    expect(unexpected).toEqual([]);
  });
  // The Industries node's href is /education, so its /legal, /commerce and
  // /medical prefixes used to read as aliases of /education: "Browse the Hub"
  // (/education) matched /legal and lit Education on every other industry.
  it("lights the industry that owns the route, never Education by alias", () => {
    const industries = primaryNavItems.find((item) => item.label === "Industries")!;
    const branch = (path: string) => findActiveNavBranch(path, industries)?.label;
    expect(branch("/legal")).toBe("Legal");
    expect(branch("/legal/ca-wc/cases")).toBe("Legal");
    expect(branch("/medical")).toBe("Medical");
    expect(branch("/commerce")).toBe("Commerce");
    expect(branch("/commerce/review")).toBe("Commerce");
    expect(branch("/commerce/intake/instant")).toBe("Commerce");
    expect(branch("/education")).toBe("Education");
    expect(branch("/education/subjects")).toBe("Education");
    expect(findActiveNavChild("/legal", industries)?.label).toBe("Legal Hub");
    expect(findActiveNavChild("/medical", industries)?.label).toBe("Medical Hub");
    expect(findActiveNavChild("/commerce/review", industries)).toBeUndefined();
  });

  it("never lights a new-tab launcher as the current route", () => {
    const workspace = primaryNavItems.find((item) => item.label === "Workspace")!;
    expect(findActiveNavChild("/launchpad", workspace)?.label).not.toBe("Launchpad");
  });

  // /user-settings lit Account, /user-settings/appearance lit nothing: the
  // Settings row was exact-only.
  it("lights Account on every settings page, not only the landing", () => {
    const account = primaryNavItems.find((item) => item.label === "Account")!;
    const candidates = [...primaryNavItems, settingsItem];
    for (const path of ["/user-settings", "/user-settings/appearance", "/user-settings/ai/models"]) {
      expect([path, isExclusiveNavGroupActive(path, account, candidates)]).toEqual([path, true]);
      expect([path, findActiveNavChild(path, account)?.label]).toEqual([path, "Settings"]);
    }
  });
});
