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
    expect(owner("/agent-connections/plugins")).toBe("Code");
    expect(owner("/agent-connections/skills")).toBe("Agents");
    expect(owner("/notes")).toBe("Content");
    expect(owner("/transcripts/studio")).toBe("Audio");
    expect(owner("/print/qr")).toBe("Publish");
    expect(owner("/legal/ca-wc/cases")).toBe("Industries");
    expect(owner("/free/games/tic-tac-toe")).toBe("Other");
    expect(owner("/free/data-truncator")).toBe("Content");
  });

  // The corrected domain tree (Arman, 2026-10-04): each moved family lights
  // its new strip icon.
  it("lights the strip icon of each family the domain tree moved", () => {
    const owner = (path: string) => findOwningNavItem(path, primaryNavItems)?.label;
    expect(owner("/files")).toBe("Files");
    expect(owner("/files/all")).toBe("Files");
    expect(owner("/files/trash")).toBe("Files");
    expect(owner("/tools/pdf-extractor")).toBe("Files");
    expect(owner("/notes")).toBe("Content");
    expect(owner("/notes/abc")).toBe("Content");
    expect(owner("/workbooks")).toBe("Content");
    expect(owner("/esign")).toBe("Content");
    expect(owner("/data")).toBe("Data");
    expect(owner("/data/some-table")).toBe("Data");
    expect(owner("/shapes/all")).toBe("Data");
    expect(owner("/scopes")).toBe("Data");
    expect(owner("/war-room")).toBe("Workspace");
    expect(owner("/war-room/all")).toBe("Workspace");
    expect(owner("/board")).toBe("Workspace");
    expect(owner("/board/all")).toBe("Workspace");
    expect(owner("/dashboard")).toBe("Workspace");
    expect(owner("/transcripts")).toBe("Audio");
    expect(owner("/transcripts/scribe")).toBe("Audio");
    expect(owner("/voice/playground")).toBe("Audio");
    expect(owner("/user-settings/voice/voices")).toBe("Audio");
    expect(owner("/images")).toBe("Media");
    expect(owner("/libraries")).toBe("Media");
    expect(owner("/tools/scanner")).toBe("Media");
    expect(owner("/projects")).toBe("Workspace");
    expect(owner("/data/pages")).toBe("Workspace");
    expect(owner("/data/dashboards")).toBe("Workspace");
    expect(owner("/make")).toBe("Workspace");
    expect(owner("/tasks")).toBe("Workspace");
    expect(owner("/scraper")).toBe("Web");
    expect(owner("/search")).toBe("Web");
    expect(owner("/connect-computer")).toBe("Computer");
    expect(owner("/local")).toBe("Computer");
    expect(owner("/reports")).toBe("Intelligence");
    expect(owner("/reports/agent-drift")).toBe("Intelligence");
    expect(owner("/acquisition")).toBe("Knowledge");
    expect(owner("/print")).toBe("Publish");
    expect(owner("/tools/product-capture")).toBe("Industries");
    expect(owner("/capture/needs-you")).toBe("Industries");
    expect(owner("/code")).toBe("Code");
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
    const board = primaryNavItems.find((item) => item.label === "Workspace")!;
    expect(findActiveNavChild("/launchpad", board)?.label).not.toBe("Launchpad");
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
