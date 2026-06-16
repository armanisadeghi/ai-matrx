// route-tree.ts
// Builds a navigable tree of every admin route from the filesystem route
// scanner (utils/route-discovery → scanRoutes), so the breadcrumb dropdowns
// reflect the ACTUAL route hierarchy. Each crumb exposes its direct children
// (the routes one step below it). Friendly labels/icons are merged in from the
// curated categories.tsx where a path matches.
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
  /** True when this node maps to an actual page (has its own page.tsx). */
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

// Friendly labels/icons from the curated categories, keyed by absolute path.
const pageMeta = new Map<string, { title: string; icon?: ModulePageIcon }>();
for (const page of filteredPages) {
  const fullPath = `${MODULE_HOME}/${page.path}`.replace(/\/+/g, "/");
  pageMeta.set(fullPath, { title: page.title, icon: page.icon });
}

function makeNode(
  fullPath: string,
  segment: string,
  isPage: boolean,
): AdminTreeNode {
  const meta = pageMeta.get(fullPath);
  return {
    segment,
    fullPath,
    label: meta?.title ?? titleCase(segment),
    icon: meta?.icon,
    isPage,
    children: [],
  };
}

function sortTree(node: AdminTreeNode) {
  node.children.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );
  node.children.forEach(sortTree);
}

/**
 * Build the admin route tree from scanned filesystem routes.
 * `routes` are paths relative to the admin root, e.g.
 * "system-agents/agents" or "system-agents/shortcuts".
 * Intermediate directories without their own page still become nodes so the
 * hierarchy stays navigable; their `isPage` is false.
 */
export function buildAdminTree(routes: string[]): AdminTreeNode {
  const root = makeNode(MODULE_HOME, "administration", true);
  const list = Array.isArray(routes) ? routes : [];

  for (const raw of list) {
    const rel = raw.replace(/^\/?administration\/?/, "").replace(/^\/+/, "");
    const segments = rel.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let cursor = root;
    let accumulated = MODULE_HOME;

    segments.forEach((segment, index) => {
      accumulated = `${accumulated}/${segment}`;
      let child = cursor.children.find((c) => c.segment === segment);
      const isLeaf = index === segments.length - 1;
      if (!child) {
        child = makeNode(accumulated, segment, isLeaf);
        cursor.children.push(child);
      } else if (isLeaf) {
        // A deeper route already created this as an intermediate; it's a page too.
        child.isPage = true;
      }
      cursor = child;
    });
  }

  sortTree(root);
  return root;
}

function findChild(node: AdminTreeNode, segment: string): AdminTreeNode | null {
  return node.children.find((c) => c.segment === segment) ?? null;
}

export interface AdminCrumb {
  fullPath: string;
  label: string;
  isPage: boolean;
  isLast: boolean;
  /** Direct children of this crumb — the routes one step below it. Powers the dropdown. */
  children: AdminTreeNode[];
}

/**
 * Resolve a pathname into a breadcrumb trail. Each crumb carries its direct
 * children so the UI renders a "drill one level deeper" dropdown at every level.
 * Unknown/dynamic segments (e.g. UUIDs) degrade gracefully.
 */
export function getAdminCrumbs(
  root: AdminTreeNode,
  pathname: string,
): AdminCrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: AdminCrumb[] = [];

  // First crumb is always the admin root.
  let cursor: AdminTreeNode | null = root;
  crumbs.push({
    fullPath: MODULE_HOME,
    label: MODULE_NAME,
    isPage: true,
    isLast: segments.length <= 1,
    children: root.children,
  });

  let accumulated = MODULE_HOME;
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    accumulated = `${accumulated}/${segment}`;
    const node = cursor ? findChild(cursor, segment) : null;
    const isLast = i === segments.length - 1;

    crumbs.push({
      fullPath: accumulated,
      label: node?.label ?? titleCase(segment),
      isPage: node?.isPage ?? false,
      isLast,
      children: node?.children ?? [],
    });

    cursor = node;
  }

  return crumbs;
}
