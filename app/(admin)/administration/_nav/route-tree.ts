// route-tree.ts
// Builds a navigable tree of every admin route from the single source of truth
// (categories.tsx → config.ts → filteredPages). Used by the admin breadcrumbs
// (sibling dropdowns at every level) and the admin tree menu.
//
// Admin-only. Do not generalize into the shared ModuleHeader.

import type { ModulePageIcon } from "@/components/matrx/navigation/types";
import { MODULE_HOME, MODULE_NAME, filteredPages } from "../config";

export interface AdminTreeNode {
  /** Single URL segment, e.g. "system-agents". */
  segment: string;
  /** Absolute path, e.g. "/administration/system-agents". */
  fullPath: string;
  /** Human label — feature title when the path is a registered page, else title-cased. */
  label: string;
  icon?: ModulePageIcon;
  /** True when this node maps to an actual registered admin page. */
  isPage: boolean;
  children: AdminTreeNode[];
}

const WORD_REPLACEMENTS: Record<string, string> = {
  api: "API",
  ui: "UI",
  url: "URL",
  qr: "QR",
  cx: "CX",
  ai: "AI",
  mcp: "MCP",
  sql: "SQL",
  kg: "KG",
  ts: "TS",
};

function titleCase(segment: string): string {
  const base = segment
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\w\S*/g,
      (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    );

  return base
    .split(" ")
    .map((word) => WORD_REPLACEMENTS[word.toLowerCase()] ?? word)
    .join(" ");
}

// Map of absolute path → registered page metadata (title + icon).
const pageMeta = new Map<string, { title: string; icon?: ModulePageIcon }>();
for (const page of filteredPages) {
  const fullPath = `${MODULE_HOME}/${page.path}`.replace(/\/+/g, "/");
  pageMeta.set(fullPath, { title: page.title, icon: page.icon });
}

function emptyRoot(): AdminTreeNode {
  return {
    segment: "administration",
    fullPath: MODULE_HOME,
    label: MODULE_NAME,
    isPage: true,
    children: [],
  };
}

function buildTree(): AdminTreeNode {
  const root = emptyRoot();

  for (const page of filteredPages) {
    const segments = page.path.split("/").filter(Boolean);
    let cursor = root;
    let accumulated = MODULE_HOME;

    segments.forEach((segment) => {
      accumulated = `${accumulated}/${segment}`;
      let child = cursor.children.find((c) => c.segment === segment);
      if (!child) {
        const meta = pageMeta.get(accumulated);
        child = {
          segment,
          fullPath: accumulated,
          label: meta?.title ?? titleCase(segment),
          icon: meta?.icon,
          isPage: Boolean(meta),
          children: [],
        };
        cursor.children.push(child);
      }
      cursor = child;
    });
  }

  sortTree(root);
  return root;
}

function sortTree(node: AdminTreeNode) {
  node.children.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
  node.children.forEach(sortTree);
}

export const adminRouteRoot = buildTree();

function findChild(node: AdminTreeNode, segment: string): AdminTreeNode | null {
  return node.children.find((c) => c.segment === segment) ?? null;
}

export interface AdminCrumb {
  /** Absolute path for this crumb. */
  fullPath: string;
  label: string;
  /** Whether this crumb resolves to a real page (clickable link). */
  isPage: boolean;
  /** Whether this is the final crumb in the trail. */
  isLast: boolean;
  /**
   * Sibling routes available where this crumb sits (its parent's children,
   * or the root's children for the first crumb). Powers the per-level dropdown.
   */
  options: AdminTreeNode[];
}

/**
 * Resolve a pathname into a breadcrumb trail. Each crumb carries the set of
 * sibling routes for its level so the UI can render a dropdown at every level.
 * Unknown/dynamic segments (e.g. UUIDs) degrade gracefully: title-cased label,
 * no options.
 */
export function getAdminCrumbs(pathname: string): AdminCrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: AdminCrumb[] = [];

  // First crumb is always the admin root.
  let cursor: AdminTreeNode | null = adminRouteRoot;
  crumbs.push({
    fullPath: MODULE_HOME,
    label: MODULE_NAME,
    isPage: true,
    isLast: segments.length <= 1,
    options: adminRouteRoot.children,
  });

  let accumulated = MODULE_HOME;
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    accumulated = `${accumulated}/${segment}`;
    const parent = cursor;
    const node = parent ? findChild(parent, segment) : null;
    const isLast = i === segments.length - 1;

    crumbs.push({
      fullPath: accumulated,
      label: node?.label ?? titleCase(segment),
      isPage: node?.isPage ?? false,
      isLast,
      options: parent ? parent.children : [],
    });

    cursor = node;
  }

  return crumbs;
}
