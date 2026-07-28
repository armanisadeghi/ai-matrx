/**
 * app/(core)/marketing/content-plan/create-dense/_lib/archetypes.ts
 *
 * Site archetypes — the pure, browser-side half of the "counts become a work
 * order" step. Reads the SAME live config the server tool reads
 * (`plan.profile.template_map.archetypes`, builtin row `vertical =
 * 'platform-archetypes'` on the globally-readable system org) and expands it
 * into the exact tree + routes that will land.
 *
 * PARITY LAW — this is a deliberate, faithful port of
 * `aidream/aidream/services/content_plan/archetypes.py`
 * (`resolve_count` / `expand_archetype` / `parse_archetype_map`). The two must
 * agree route-for-route: the browser shows the dry run, either side may write
 * the tree, and both compute `route` the same way `plan._node_shape` does.
 * Change one, change the other in the same session.
 *
 * It lives here (not on the server) because the whole point of this console is
 * that adjusting "services × 8" re-renders the route list instantly — a network
 * round trip per keystroke is not a dry run, it is a lag machine.
 *
 * Pure: no IO, no React, no Supabase. Everything loud on malformed config —
 * a silently-zero count is a checklist item that never gets built.
 */

export type NodeType = "home" | "pillar" | "cluster" | "article" | "index";

const NODE_TYPES: readonly NodeType[] = [
  "home",
  "pillar",
  "cluster",
  "article",
  "index",
];

export type Materialize = "pages" | "count_only";
export type FoundationKind = "tokens" | "component" | "nav" | "asset";

/** Stamped onto every node an archetype creates (matches the server's key). */
export const NODE_ATTR_KEY = "archetype";
/** `web.site.settings` key holding the committed work order. */
export const SITE_SETTINGS_KEY = "content_plan";
export const SITE_ARCHETYPE_KEY = "archetype";
/** The builtin library's profile row. */
export const BUILTIN_ARCHETYPE_VERTICAL = "platform-archetypes";
export const ARCHETYPE_MAP_KEY = "archetypes";
/** plan_status slug every archetype-created node starts at. */
export const DEFAULT_NODE_STATUS = "planned";

/** Malformed archetype config. Surfaced verbatim — never swallowed. */
export class ArchetypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchetypeError";
  }
}

// ── config shapes ──────────────────────────────────────────────────────────

export interface ArchetypeCorePage {
  label: string;
  slug: string | null;
  nodeType: NodeType;
  pageType: string | null;
  brief: string[];
}

export interface ArchetypeFamily {
  key: string;
  label: string;
  slug: string | null;
  nodeType: NodeType;
  pageType: string | null;
  childNodeType: NodeType;
  childPageType: string | null;
  count: number;
  childLabelTemplate: string;
  childSlugTemplate: string;
  brief: string[];
  childBrief: string[];
  materialize: Materialize;
}

/** Raw declaration form: an int, a bool (`true` → 1), or `=<family>.count`. */
export type CountRef = number | boolean | string;

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
}

// ── derived shapes ─────────────────────────────────────────────────────────

export interface FoundationRequirement {
  key: string;
  kind: FoundationKind;
  label: string;
  required: number;
  /** The raw declaration, so the UI can show that 8 came from `=services.count`. */
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

/** One node in the tree an instantiation will apply. */
export interface PlanTreeNodeSpec {
  label: string;
  nodeType: NodeType;
  slug: string | null;
  pageType: string | null;
  brief: string[];
  attributes: Record<string, unknown>;
  /** The route this node will get — computed exactly as `plan._node_shape` does. */
  route: string;
  /** Which family (if any) produced it — drives the route preview grouping. */
  familyKey: string | null;
  role: "core" | "family_hub" | "family_child";
  children: PlanTreeNodeSpec[];
}

export interface ExpandedArchetype {
  archetype: string;
  label: string;
  pageEstimate: string;
  counts: Record<string, number>;
  roots: PlanTreeNodeSpec[];
  /** Every route, in tree order (NOT sorted — the preview reads top-down). */
  routes: string[];
  pageCount: number;
  families: FamilyPlan[];
  foundation: FoundationRequirement[];
}

// ── parsing ────────────────────────────────────────────────────────────────

const COUNT_REF = /^=([a-z0-9][a-z0-9_-]*)\.count$/;

/**
 * Resolve a count literal or a `=<family>.count` reference. Loud on anything
 * else — this is the whole grammar, there is no expression language.
 */
export function resolveCount(
  value: CountRef | null | undefined,
  counts: Record<string, number>,
  where: string,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new ArchetypeError(`${where}: count ${value} is not a non-negative integer.`);
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
      `${where}: ${JSON.stringify(value)} references family "${key}", which this ` +
        `archetype does not declare. Families: ${known.length ? known.join(", ") : "(none)"}.`,
    );
  }
  return counts[key];
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ArchetypeError(`${where}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, where: string, fallback?: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new ArchetypeError(`${where}: expected a non-empty string.`);
}

function asStringArray(value: unknown, where: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ArchetypeError(`${where}: expected an array of strings.`);
  }
  return value as string[];
}

function asNodeType(value: unknown, where: string, fallback: NodeType): NodeType {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !NODE_TYPES.includes(value as NodeType)) {
    throw new ArchetypeError(
      `${where}: ${JSON.stringify(value)} is not a plan node_type (${NODE_TYPES.join(", ")}).`,
    );
  }
  return value as NodeType;
}

function asCountRef(value: unknown, where: string, fallback: CountRef): CountRef {
  if (value === undefined || value === null) return fallback;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  throw new ArchetypeError(
    `${where}: count must be an int, bool or "=<family>.count" reference.`,
  );
}

function parseArchetype(key: string, raw: unknown): Archetype {
  const where = `archetype "${key}"`;
  const record = asRecord(raw, where);

  const core = (Array.isArray(record.core) ? record.core : []).map((entry, index) => {
    const pageWhere = `${where}.core[${index}]`;
    const page = asRecord(entry, pageWhere);
    const nodeType = asNodeType(page.node_type, `${pageWhere}.node_type`, "article");
    const slug = page.slug === undefined || page.slug === null ? null : asString(page.slug, `${pageWhere}.slug`);
    return {
      label: asString(page.label, `${pageWhere}.label`),
      slug,
      nodeType,
      pageType:
        page.page_type === undefined || page.page_type === null
          ? null
          : asString(page.page_type, `${pageWhere}.page_type`),
      brief: asStringArray(page.brief, `${pageWhere}.brief`),
    } satisfies ArchetypeCorePage;
  });

  const families = (Array.isArray(record.families) ? record.families : []).map(
    (entry, index) => {
      const familyWhere = `${where}.families[${index}]`;
      const family = asRecord(entry, familyWhere);
      const familyKey = asString(family.key, `${familyWhere}.key`);
      const materializeRaw = family.materialize ?? "pages";
      if (materializeRaw !== "pages" && materializeRaw !== "count_only") {
        throw new ArchetypeError(
          `${familyWhere}.materialize: expected "pages" or "count_only".`,
        );
      }
      const count = family.count ?? 0;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
        throw new ArchetypeError(`${familyWhere}.count: expected a non-negative integer.`);
      }
      return {
        key: familyKey,
        label: asString(family.label, `${familyWhere}.label`, familyKey),
        slug:
          family.slug === undefined || family.slug === null
            ? null
            : asString(family.slug, `${familyWhere}.slug`),
        nodeType: asNodeType(family.node_type, `${familyWhere}.node_type`, "index"),
        pageType:
          family.page_type === null
            ? null
            : asString(family.page_type, `${familyWhere}.page_type`, "pillar-page"),
        childNodeType: asNodeType(
          family.child_node_type,
          `${familyWhere}.child_node_type`,
          "article",
        ),
        childPageType:
          family.child_page_type === undefined || family.child_page_type === null
            ? null
            : asString(family.child_page_type, `${familyWhere}.child_page_type`),
        count,
        childLabelTemplate: asString(
          family.child_label_template,
          `${familyWhere}.child_label_template`,
          "{label} {n}",
        ),
        childSlugTemplate: asString(
          family.child_slug_template,
          `${familyWhere}.child_slug_template`,
          "{key}-{n}",
        ),
        brief: asStringArray(family.brief, `${familyWhere}.brief`),
        childBrief: asStringArray(family.child_brief, `${familyWhere}.child_brief`),
        materialize: materializeRaw as Materialize,
      } satisfies ArchetypeFamily;
    },
  );

  const foundationRaw = record.foundation ? asRecord(record.foundation, `${where}.foundation`) : {};
  const assetsRaw = foundationRaw.assets
    ? asRecord(foundationRaw.assets, `${where}.foundation.assets`)
    : {};
  const assets: Record<string, CountRef> = {};
  for (const [assetKey, value] of Object.entries(assetsRaw)) {
    assets[assetKey] = asCountRef(value, `${where}.foundation.assets.${assetKey}`, 0);
  }

  return {
    key,
    label: asString(record.label, `${where}.label`, key),
    description: typeof record.description === "string" ? record.description : "",
    pageEstimate: typeof record.page_estimate === "string" ? record.page_estimate : "",
    core,
    families,
    foundation: {
      tokens: asCountRef(foundationRaw.tokens, `${where}.foundation.tokens`, false),
      header: asCountRef(foundationRaw.header, `${where}.foundation.header`, 0),
      footer: asCountRef(foundationRaw.footer, `${where}.foundation.footer`, 0),
      navEntries: asCountRef(foundationRaw.nav_entries, `${where}.foundation.nav_entries`, 0),
      assets,
    },
  };
}

/**
 * Validate a `template_map.archetypes` blob. Loud on a malformed entry — a
 * half-parsed archetype silently drops the counts that are the whole point.
 */
export function parseArchetypeMap(raw: unknown, where: string): Archetype[] {
  if (raw === null || raw === undefined) return [];
  const record = asRecord(raw, `${where}: "archetypes"`);
  return Object.entries(record).map(([key, value]) => parseArchetype(key, value));
}

// ── expansion ──────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page";
}

function familyCounts(
  archetype: Archetype,
  countsOverride: Record<string, number> | undefined,
  namesOverride: Record<string, string[]> | undefined,
): Record<string, number> {
  const keys = archetype.families.map((family) => family.key);
  const dupes = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (dupes.length > 0) {
    throw new ArchetypeError(`Duplicate family keys ${[...new Set(dupes)].sort().join(", ")}.`);
  }
  const counts: Record<string, number> = {};
  for (const family of archetype.families) counts[family.key] = family.count;

  for (const [source, name] of [
    [namesOverride, "names"],
    [countsOverride, "counts"],
  ] as const) {
    for (const key of Object.keys(source ?? {})) {
      if (!(key in counts)) {
        throw new ArchetypeError(
          `${name} override references unknown family "${key}". ` +
            `Families: ${keys.length ? keys.join(", ") : "(none)"}.`,
        );
      }
    }
  }
  // Names win over the archetype default; an explicit count wins over both.
  for (const [key, labels] of Object.entries(namesOverride ?? {})) counts[key] = labels.length;
  for (const [key, value] of Object.entries(countsOverride ?? {})) {
    if (!Number.isInteger(value) || value < 0) {
      throw new ArchetypeError(`counts["${key}"] must be a non-negative integer.`);
    }
    counts[key] = value;
  }
  return counts;
}

function applyTemplate(template: string, family: ArchetypeFamily, index: number): string {
  return template
    .replaceAll("{n}", String(index + 1))
    .replaceAll("{label}", family.label)
    .replaceAll("{key}", family.key);
}

function foundationRequirements(
  foundation: ArchetypeFoundation,
  counts: Record<string, number>,
): FoundationRequirement[] {
  const out: FoundationRequirement[] = [];
  const add = (key: string, kind: FoundationKind, label: string, raw: CountRef) => {
    const required = resolveCount(raw, counts, `foundation.${key}`);
    if (required <= 0) return;
    const declaredAs = typeof raw === "boolean" ? String(raw) : String(raw);
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

/**
 * Turn an archetype + count overrides into the tree that will be applied and
 * the foundation counts that must be met. Every route is computed here exactly
 * as the DB trigger computes `plan.node.route`, so the preview shows precisely
 * what lands.
 */
export function expandArchetype(
  archetype: Archetype,
  options: {
    counts?: Record<string, number>;
    names?: Record<string, string[]>;
  } = {},
): ExpandedArchetype {
  const resolved = familyCounts(archetype, options.counts, options.names);

  let home: ArchetypeCorePage | null = null;
  const otherCore: ArchetypeCorePage[] = [];
  for (const page of archetype.core) {
    if (page.nodeType === "home") {
      if (home) throw new ArchetypeError("Archetype declares more than one home page.");
      home = page;
    } else {
      if (!page.slug) throw new ArchetypeError(`Core page "${page.label}" needs a slug.`);
      otherCore.push(page);
    }
  }
  if (!home) {
    throw new ArchetypeError(
      "Archetype must declare exactly one core page with node_type=home.",
    );
  }

  const children: PlanTreeNodeSpec[] = [];
  const familyPlans: FamilyPlan[] = [];

  for (const page of otherCore) {
    children.push({
      label: page.label,
      nodeType: page.nodeType,
      slug: page.slug,
      pageType: page.pageType,
      brief: [...page.brief],
      attributes: { [NODE_ATTR_KEY]: { source: archetype.key, role: "core" } },
      route: `/${page.slug}`,
      familyKey: null,
      role: "core",
      children: [],
    });
  }

  for (const family of archetype.families) {
    const count = resolved[family.key];
    const slug = family.slug ?? family.key;
    const hubRoute = `/${slug}`;
    const supplied = options.names?.[family.key];
    const childLabels: string[] = [];
    const familyChildren: PlanTreeNodeSpec[] = [];

    if (family.materialize === "pages") {
      const seen = new Set<string>();
      for (let index = 0; index < count; index += 1) {
        const label =
          supplied && index < supplied.length
            ? supplied[index]
            : applyTemplate(family.childLabelTemplate, family, index);
        let childSlug =
          supplied && index < supplied.length
            ? slugify(supplied[index])
            : slugify(applyTemplate(family.childSlugTemplate, family, index));
        if (seen.has(childSlug)) childSlug = `${childSlug}-${index + 1}`;
        seen.add(childSlug);
        childLabels.push(label);
        familyChildren.push({
          label,
          nodeType: family.childNodeType,
          slug: childSlug,
          pageType: family.childPageType,
          brief: [...family.childBrief],
          attributes: {
            [NODE_ATTR_KEY]: {
              source: archetype.key,
              role: "family_child",
              family: family.key,
            },
          },
          route: `${hubRoute}/${childSlug}`,
          familyKey: family.key,
          role: "family_child",
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
      label: family.label,
      nodeType: family.nodeType,
      slug,
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
      route: hubRoute,
      familyKey: family.key,
      role: "family_hub",
      children: familyChildren,
    });
  }

  const root: PlanTreeNodeSpec = {
    label: home.label,
    nodeType: "home",
    slug: null,
    pageType: home.pageType,
    brief: [...home.brief],
    attributes: { [NODE_ATTR_KEY]: { source: archetype.key, role: "core" } },
    route: "/",
    familyKey: null,
    role: "core",
    children,
  };

  const routes = flattenSpecs([root]).map((spec) => spec.route);
  return {
    archetype: archetype.key,
    label: archetype.label,
    pageEstimate: archetype.pageEstimate,
    counts: resolved,
    roots: [root],
    routes,
    pageCount: new Set(routes).size,
    families: familyPlans,
    foundation: foundationRequirements(archetype.foundation, resolved),
  };
}

/** Depth-first flatten, parents before children (the apply order). */
export function flattenSpecs(specs: PlanTreeNodeSpec[]): PlanTreeNodeSpec[] {
  const out: PlanTreeNodeSpec[] = [];
  const walk = (nodes: PlanTreeNodeSpec[]) => {
    for (const node of nodes) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(specs);
  return out;
}
