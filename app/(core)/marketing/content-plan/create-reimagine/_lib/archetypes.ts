/**
 * Site archetypes — the TypeScript twin of aidream's
 * `aidream/services/content_plan/archetypes.py`.
 *
 * TS↔Python PARITY LAW: this module must expand an archetype into EXACTLY the
 * same routes the server would. The browser is what the human sees before they
 * commit; if the two ever disagree, the preview is a lie. Every rule below is
 * a direct port — the count grammar (`=<family>.count`), the child slug/label
 * templates, the route shape, and the foundation requirement list.
 *
 * The route formula also mirrors the DB trigger `plan._node_shape`:
 *   root (slug NULL) -> "/"
 *   child            -> rtrim(parent.route, "/") + "/" + slug
 *
 * Pure. No IO, no React. The live archetype library is read from
 * `plan.profile.template_map.archetypes` (see ./data.ts) — this file never
 * hardcodes an archetype.
 */

export type CountRef = number | boolean | string;

export type ArchetypeNodeType =
  | "home"
  | "pillar"
  | "cluster"
  | "article"
  | "index";

const NODE_TYPES: readonly ArchetypeNodeType[] = [
  "home",
  "pillar",
  "cluster",
  "article",
  "index",
];

export type FoundationKind = "tokens" | "component" | "nav" | "asset";
export type Materialize = "pages" | "count_only";

/** Malformed archetype config — loud, never silently half-parsed. */
export class ArchetypeError extends Error {
  readonly code = "content_plan_bad_archetype";
  constructor(message: string) {
    super(message);
    this.name = "ArchetypeError";
  }
}

export interface ArchetypeCorePage {
  label: string;
  slug: string | null;
  nodeType: ArchetypeNodeType;
  pageType: string | null;
  brief: string[];
}

export interface ArchetypeFamily {
  key: string;
  label: string;
  slug: string | null;
  nodeType: ArchetypeNodeType;
  pageType: string | null;
  childNodeType: ArchetypeNodeType;
  childPageType: string | null;
  count: number;
  childLabelTemplate: string;
  childSlugTemplate: string;
  brief: string[];
  childBrief: string[];
  materialize: Materialize;
}

export interface ArchetypeFoundation {
  tokens: CountRef;
  header: CountRef;
  footer: CountRef;
  navEntries: CountRef;
  assets: Record<string, CountRef>;
}

export interface Archetype {
  key: string;
  label: string;
  description: string;
  pageEstimate: string;
  core: ArchetypeCorePage[];
  families: ArchetypeFamily[];
  foundation: ArchetypeFoundation;
  /** "builtin" (system-org library) or "org" (this org shadows the builtin). */
  origin: "builtin" | "org";
}

// ── expansion outputs ───────────────────────────────────────────────────────

export interface FoundationRequirement {
  key: string;
  kind: FoundationKind;
  label: string;
  required: number;
  /** The raw declaration, so the UI can show that 6 came from "=services.count". */
  declaredAs: string;
}

export interface FamilyPlan {
  key: string;
  label: string;
  route: string;
  count: number;
  materialize: Materialize;
  childPageType: string | null;
  childLabels: string[];
}

export type PlannedRole = "home" | "core" | "family_hub" | "family_child";

export interface PlannedNode {
  route: string;
  label: string;
  slug: string | null;
  nodeType: ArchetypeNodeType;
  pageType: string | null;
  brief: string[];
  attributes: Record<string, unknown>;
  role: PlannedRole;
  /** Grouping key for the manifest: "core" or the family key. */
  group: string;
  groupLabel: string;
  children: PlannedNode[];
}

export interface ExpandedArchetype {
  archetype: string;
  label: string;
  pageEstimate: string;
  counts: Record<string, number>;
  root: PlannedNode;
  /** Tree order (home, core pages, then each family hub + its children). */
  flat: PlannedNode[];
  routes: string[];
  pageCount: number;
  families: FamilyPlan[];
  foundation: FoundationRequirement[];
}

const COUNT_REF = /^=([a-z0-9][a-z0-9_-]*)\.count$/;

/**
 * Resolve a count literal or a `=<family>.count` reference. Loud on anything
 * else — a silently-zero requirement is a checklist item nobody ever builds.
 */
export function resolveCount(
  value: CountRef | null | undefined,
  counts: Record<string, number>,
  where: string,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new ArchetypeError(`${where}: count ${value} is not an integer.`);
    }
    if (value < 0) {
      throw new ArchetypeError(`${where}: count ${value} is negative.`);
    }
    return value;
  }
  const match = COUNT_REF.exec(value.trim());
  if (!match) {
    throw new ArchetypeError(
      `${where}: ${JSON.stringify(value)} is not a valid count. Use an integer, ` +
        `true/false, or the reference form "=<family_key>.count".`,
    );
  }
  const key = match[1];
  if (!(key in counts)) {
    const known = Object.keys(counts).sort();
    throw new ArchetypeError(
      `${where}: ${JSON.stringify(value)} references family ${JSON.stringify(key)}, ` +
        `which this archetype does not declare. Families: ${known.length ? known.join(", ") : "(none)"}.`,
    );
  }
  return counts[key];
}

// ── parsing (plan.profile.template_map.archetypes -> Archetype[]) ───────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = raw[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") {
    throw new ArchetypeError(`${key} must be a string, got ${typeof value}.`);
  }
  return value;
}

function readOptionalString(
  raw: Record<string, unknown>,
  key: string,
): string | null {
  const value = raw[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ArchetypeError(`${key} must be a string, got ${typeof value}.`);
  }
  return value;
}

function readStringList(raw: Record<string, unknown>, key: string): string[] {
  const value = raw[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ArchetypeError(`${key} must be a list of strings.`);
  }
  return value as string[];
}

function readNodeType(
  raw: Record<string, unknown>,
  key: string,
  fallback: ArchetypeNodeType,
  where: string,
): ArchetypeNodeType {
  const value = raw[key];
  if (value === undefined || value === null) return fallback;
  if (
    typeof value !== "string" ||
    !NODE_TYPES.includes(value as ArchetypeNodeType)
  ) {
    throw new ArchetypeError(
      `${where}: ${key} ${JSON.stringify(value)} is not one of ${NODE_TYPES.join(", ")}.`,
    );
  }
  return value as ArchetypeNodeType;
}

function readCountRef(
  raw: Record<string, unknown>,
  key: string,
  fallback: CountRef,
): CountRef {
  const value = raw[key];
  if (value === undefined || value === null) return fallback;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  throw new ArchetypeError(
    `${key} must be an integer, true/false, or a "=<family>.count" reference.`,
  );
}

function parseCorePage(raw: unknown, where: string): ArchetypeCorePage {
  if (!isRecord(raw)) throw new ArchetypeError(`${where}: core page must be an object.`);
  return {
    label: readString(raw, "label", ""),
    slug: readOptionalString(raw, "slug"),
    nodeType: readNodeType(raw, "node_type", "article", where),
    pageType: readOptionalString(raw, "page_type"),
    brief: readStringList(raw, "brief"),
  };
}

function parseFamily(raw: unknown, where: string): ArchetypeFamily {
  if (!isRecord(raw)) throw new ArchetypeError(`${where}: family must be an object.`);
  const key = readString(raw, "key", "");
  if (!key) throw new ArchetypeError(`${where}: family is missing "key".`);
  const countRaw = raw.count;
  if (
    countRaw !== undefined &&
    (typeof countRaw !== "number" || !Number.isInteger(countRaw) || countRaw < 0)
  ) {
    throw new ArchetypeError(
      `${where}: family ${key} count must be a non-negative integer.`,
    );
  }
  const materialize = readString(raw, "materialize", "pages");
  if (materialize !== "pages" && materialize !== "count_only") {
    throw new ArchetypeError(
      `${where}: family ${key} materialize must be "pages" or "count_only".`,
    );
  }
  return {
    key,
    label: readString(raw, "label", key),
    slug: readOptionalString(raw, "slug"),
    nodeType: readNodeType(raw, "node_type", "index", `${where}.${key}`),
    pageType: raw.page_type === undefined ? "pillar-page" : readOptionalString(raw, "page_type"),
    childNodeType: readNodeType(raw, "child_node_type", "article", `${where}.${key}`),
    childPageType: readOptionalString(raw, "child_page_type"),
    count: typeof countRaw === "number" ? countRaw : 0,
    childLabelTemplate: readString(raw, "child_label_template", "{label} {n}"),
    childSlugTemplate: readString(raw, "child_slug_template", "{key}-{n}"),
    brief: readStringList(raw, "brief"),
    childBrief: readStringList(raw, "child_brief"),
    materialize,
  };
}

function parseFoundation(raw: unknown, where: string): ArchetypeFoundation {
  if (raw === undefined || raw === null) {
    return { tokens: false, header: 0, footer: 0, navEntries: 0, assets: {} };
  }
  if (!isRecord(raw)) throw new ArchetypeError(`${where}: foundation must be an object.`);
  const assetsRaw = raw.assets;
  const assets: Record<string, CountRef> = {};
  if (assetsRaw !== undefined && assetsRaw !== null) {
    if (!isRecord(assetsRaw)) {
      throw new ArchetypeError(`${where}: foundation.assets must be an object.`);
    }
    for (const [assetKey, value] of Object.entries(assetsRaw)) {
      assets[assetKey] = readCountRef({ v: value }, "v", 0);
    }
  }
  return {
    tokens: readCountRef(raw, "tokens", false),
    header: readCountRef(raw, "header", 0),
    footer: readCountRef(raw, "footer", 0),
    navEntries: readCountRef(raw, "nav_entries", 0),
    assets,
  };
}

/**
 * Validate a `template_map.archetypes` blob. Loud on a malformed entry — a
 * half-parsed archetype silently drops the counts that are the whole point.
 */
export function parseArchetypeMap(
  raw: unknown,
  where: string,
  origin: "builtin" | "org",
): Archetype[] {
  if (raw === undefined || raw === null) return [];
  if (!isRecord(raw)) {
    throw new ArchetypeError(
      `${where}: \`archetypes\` must be an object keyed by archetype name.`,
    );
  }
  const out: Archetype[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      throw new ArchetypeError(`${where}: archetype ${key} must be an object.`);
    }
    try {
      const coreRaw = Array.isArray(value.core) ? value.core : [];
      const familiesRaw = Array.isArray(value.families) ? value.families : [];
      out.push({
        key,
        label: readString(value, "label", key),
        description: readString(value, "description", ""),
        pageEstimate: readString(value, "page_estimate", ""),
        core: coreRaw.map((page) => parseCorePage(page, `${where}.${key}.core`)),
        families: familiesRaw.map((family) =>
          parseFamily(family, `${where}.${key}.families`),
        ),
        foundation: parseFoundation(value.foundation, `${where}.${key}`),
        origin,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ArchetypeError(`${where}: archetype ${key} is invalid — ${detail}`);
    }
  }
  return out;
}

// ── expansion ───────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page";
}

function fillTemplate(
  template: string,
  index: number,
  family: ArchetypeFamily,
): string {
  return template
    .replaceAll("{n}", String(index + 1))
    .replaceAll("{label}", family.label)
    .replaceAll("{key}", family.key);
}

export interface ExpandOverrides {
  /** Family key -> count. Wins over `names.length` and the archetype default. */
  counts?: Record<string, number>;
  /** Family key -> the real page names. Sets the count AND the labels/slugs. */
  names?: Record<string, string[]>;
}

function familyCounts(
  archetype: Archetype,
  overrides: ExpandOverrides,
): Record<string, number> {
  const keys = archetype.families.map((f) => f.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) {
    throw new ArchetypeError(
      `Duplicate family keys ${[...new Set(dupes)].sort().join(", ")}.`,
    );
  }
  const counts: Record<string, number> = {};
  for (const family of archetype.families) counts[family.key] = family.count;

  for (const [source, name] of [
    [overrides.names, "names"],
    [overrides.counts, "counts"],
  ] as const) {
    for (const key of Object.keys(source ?? {})) {
      if (!(key in counts)) {
        const known = Object.keys(counts).sort();
        throw new ArchetypeError(
          `${name} override references unknown family ${JSON.stringify(key)}. ` +
            `Families: ${known.length ? known.join(", ") : "(none)"}.`,
        );
      }
    }
  }
  // Names win over the archetype default; an explicit count wins over both.
  for (const [key, labels] of Object.entries(overrides.names ?? {})) {
    counts[key] = labels.length;
  }
  for (const [key, value] of Object.entries(overrides.counts ?? {})) {
    if (!Number.isInteger(value) || value < 0) {
      throw new ArchetypeError(
        `counts[${JSON.stringify(key)}] must be a non-negative integer.`,
      );
    }
    counts[key] = value;
  }
  return counts;
}

function foundationRequirements(
  foundation: ArchetypeFoundation,
  counts: Record<string, number>,
): FoundationRequirement[] {
  const out: FoundationRequirement[] = [];
  const add = (
    key: string,
    kind: FoundationKind,
    label: string,
    raw: CountRef,
  ) => {
    const required = resolveCount(raw, counts, `foundation.${key}`);
    if (required <= 0) return;
    const declaredAs =
      raw === true ? "true" : raw === false ? "false" : String(raw);
    out.push({ key, kind, label, required, declaredAs });
  };
  add("tokens", "tokens", "Design tokens / theme", foundation.tokens);
  add("header", "component", "Header component", foundation.header);
  add("footer", "component", "Footer component", foundation.footer);
  add("nav_entries", "nav", "Primary navigation entries", foundation.navEntries);
  for (const [assetKey, raw] of Object.entries(foundation.assets)) {
    add(`asset:${assetKey}`, "asset", `Asset — ${assetKey}`, raw);
  }
  return out;
}

/** Mirrors the DB trigger: child route = rtrim(parent, "/") + "/" + slug. */
function joinRoute(parentRoute: string, slug: string): string {
  return `${parentRoute.replace(/\/+$/, "")}/${slug}`;
}

const NODE_ATTR_KEY = "archetype";

/**
 * Turn an archetype + overrides into the exact tree that will land, the counts
 * to meet, and the foundation to pre-establish. Pure — every route here is what
 * `plan._node_shape` will compute, so the preview is the truth.
 */
export function expandArchetype(
  archetype: Archetype,
  overrides: ExpandOverrides = {},
): ExpandedArchetype {
  const counts = familyCounts(archetype, overrides);

  let home: ArchetypeCorePage | null = null;
  const otherCore: ArchetypeCorePage[] = [];
  for (const page of archetype.core) {
    if (page.nodeType === "home") {
      if (home) throw new ArchetypeError("Archetype declares more than one home page.");
      home = page;
    } else {
      if (!page.slug) {
        throw new ArchetypeError(`Core page ${JSON.stringify(page.label)} needs a slug.`);
      }
      otherCore.push(page);
    }
  }
  if (!home) {
    throw new ArchetypeError(
      "Archetype must declare exactly one core page with node_type=home.",
    );
  }

  const children: PlannedNode[] = [];
  const familyPlans: FamilyPlan[] = [];

  for (const page of otherCore) {
    children.push({
      route: joinRoute("/", page.slug as string),
      label: page.label,
      slug: page.slug,
      nodeType: page.nodeType,
      pageType: page.pageType,
      brief: [...page.brief],
      attributes: { [NODE_ATTR_KEY]: { source: archetype.key, role: "core" } },
      role: "core",
      group: "core",
      groupLabel: "Core pages",
      children: [],
    });
  }

  for (const family of archetype.families) {
    const count = counts[family.key];
    const slug = family.slug ?? family.key;
    const hubRoute = joinRoute("/", slug);
    const supplied = overrides.names?.[family.key];
    const childLabels: string[] = [];
    const familyChildren: PlannedNode[] = [];

    if (family.materialize === "pages") {
      const seen = new Set<string>();
      for (let index = 0; index < count; index += 1) {
        const label =
          supplied && index < supplied.length
            ? supplied[index]
            : fillTemplate(family.childLabelTemplate, index, family);
        let childSlug =
          supplied && index < supplied.length
            ? slugify(supplied[index])
            : slugify(fillTemplate(family.childSlugTemplate, index, family));
        if (seen.has(childSlug)) childSlug = `${childSlug}-${index + 1}`;
        seen.add(childSlug);
        childLabels.push(label);
        familyChildren.push({
          route: joinRoute(hubRoute, childSlug),
          label,
          slug: childSlug,
          nodeType: family.childNodeType,
          pageType: family.childPageType,
          brief: [...family.childBrief],
          attributes: {
            [NODE_ATTR_KEY]: {
              source: archetype.key,
              role: "family_child",
              family: family.key,
            },
          },
          role: "family_child",
          group: family.key,
          groupLabel: family.label,
          children: [],
        });
      }
    }

    familyPlans.push({
      key: family.key,
      label: family.label,
      route: hubRoute,
      count,
      materialize: family.materialize,
      childPageType: family.childPageType,
      childLabels,
    });

    children.push({
      route: hubRoute,
      label: family.label,
      slug,
      nodeType: family.nodeType,
      pageType: family.pageType,
      brief: [...family.brief],
      attributes: {
        [NODE_ATTR_KEY]: {
          source: archetype.key,
          role: "family_hub",
          family: family.key,
          target_count: count,
          materialize: family.materialize,
        },
      },
      role: "family_hub",
      group: family.key,
      groupLabel: family.label,
      children: familyChildren,
    });
  }

  const root: PlannedNode = {
    route: "/",
    label: home.label,
    slug: null,
    nodeType: "home",
    pageType: home.pageType,
    brief: [...home.brief],
    attributes: { [NODE_ATTR_KEY]: { source: archetype.key, role: "core" } },
    role: "home",
    group: "core",
    groupLabel: "Core pages",
    children,
  };

  const flat: PlannedNode[] = [];
  const walk = (node: PlannedNode) => {
    flat.push(node);
    for (const child of node.children) walk(child);
  };
  walk(root);

  const routes = [...new Set(flat.map((node) => node.route))].sort();

  return {
    archetype: archetype.key,
    label: archetype.label,
    pageEstimate: archetype.pageEstimate,
    counts,
    root,
    flat,
    routes,
    pageCount: routes.length,
    families: familyPlans,
    foundation: foundationRequirements(archetype.foundation, counts),
  };
}
