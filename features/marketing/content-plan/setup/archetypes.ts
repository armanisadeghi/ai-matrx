/**
 * features/marketing/content-plan/setup/archetypes.ts
 *
 * Pure expansion of a site ARCHETYPE (a template of concepts + counts) into the
 * exact plan tree it will create. No IO, no React — so the preview the user
 * approves and the rows the commit writes come from ONE function.
 *
 * ── THE TWIN CONTRACT ──────────────────────────────────────────────────────
 * This is the TypeScript twin of aidream's CANONICAL
 * `aidream/services/content_plan/archetypes.py` (`expand_archetype`). Both
 * implementations must produce byte-identical work orders: an archetype applied
 * by the chat tool and one applied here have to land the same routes, or the
 * "already exists" diff in this UI is a lie.
 *
 * They are pinned to each other by the language-neutral fixture
 * `archetype-expansion-cases.json` (copied verbatim from aidream, which owns
 * it) and the runnable guard `pnpm check:archetype-expansion`. If that check
 * fails, fix THIS file — never the fixture, and never by relaxing a case.
 *
 * WHY a twin instead of calling the server: instantiating an archetype is
 * nothing but `plan.node` inserts, and the client owns plan CRUD (CLAUDE.md —
 * the browser goes DIRECT to Supabase for data; aidream is for AI work).
 * Routing 47 inserts through Python would be two extra hops for rows the
 * browser already writes, and the live preview — which rewrites on every
 * keystroke — needs the expansion locally regardless. A network round trip per
 * count nudge is not a design.
 *
 * Loud on malformed config: a silently-dropped family is a whole section of the
 * site that never gets planned.
 */

/** Node types accepted by `plan.node.node_type` (DB check constraint). */
export const NODE_TYPES = [
  "home",
  "pillar",
  "cluster",
  "article",
  "index",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type Materialize = "pages" | "count_only";
export type FoundationKind = "tokens" | "component" | "nav" | "asset";

/** A count literal, a bool (true→1), or the `"=<family>.count"` reference. */
export type CountRef = number | boolean | string;

export class ArchetypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchetypeError";
  }
}

export interface ArchetypeCorePage {
  label: string;
  /** null only for the home node. */
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

export interface ArchetypeFoundationConfig {
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
  foundation: ArchetypeFoundationConfig;
  /** `builtin` (platform library) or the org profile vertical that shadows it. */
  source: string;
}

/** One node the commit will attempt, already carrying its computed route. */
export interface PlanSpecNode {
  route: string;
  label: string;
  slug: string | null;
  nodeType: NodeType;
  /** `plan_page_type` category SLUG — resolved to an id at write time. */
  pageType: string | null;
  brief: string[];
  attributes: Record<string, unknown>;
  /** `core` | `family_hub` | `family_child` — drives preview grouping. */
  role: "core" | "family_hub" | "family_child";
  familyKey: string | null;
  children: PlanSpecNode[];
}

export interface FoundationRequirement {
  key: string;
  kind: FoundationKind;
  label: string;
  required: number;
  /** The raw declaration, so the UI can show 8 came from `=services.count`. */
  declaredAs: string;
}

export interface FamilyPlan {
  key: string;
  label: string;
  route: string;
  count: number;
  materialize: Materialize;
  childPageType: string | null;
  /** Names actually used (supplied or generated) — empty for count_only. */
  childLabels: string[];
}

export interface ExpandedArchetype {
  archetype: string;
  label: string;
  pageEstimate: string;
  counts: Record<string, number>;
  roots: PlanSpecNode[];
  /** Every route in the work order, sorted and de-duplicated. */
  routes: string[];
  pageCount: number;
  families: FamilyPlan[];
  foundation: FoundationRequirement[];
}

const COUNT_REF = /^=([a-z0-9][a-z0-9_-]*)\.count$/;

/** Stamped on every node an archetype creates (same key aidream uses). */
export const NODE_ATTR_KEY = "archetype";
/** `web.site.settings` block + key where a committed work order is recorded. */
export const SITE_SETTINGS_KEY = "content_plan";
export const SITE_ARCHETYPE_KEY = "archetype";
/** The system-org profile vertical carrying the platform archetype library. */
export const BUILTIN_ARCHETYPE_VERTICAL = "platform-archetypes";
export const ARCHETYPE_MAP_KEY = "archetypes";

export function resolveCount(
  value: CountRef | null | undefined,
  counts: Record<string, number>,
  where: string,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new ArchetypeError(`${where}: count ${value} is not a whole number >= 0.`);
    }
    return value;
  }
  const match = COUNT_REF.exec(value.trim());
  if (!match) {
    throw new ArchetypeError(
      `${where}: "${value}" is not a valid count. Use a whole number, true/false, or "=<family_key>.count".`,
    );
  }
  const key = match[1];
  if (!(key in counts)) {
    const families = Object.keys(counts).sort().join(", ") || "(none)";
    throw new ArchetypeError(
      `${where}: "${value}" references family "${key}", which this archetype does not declare. Families: ${families}.`,
    );
  }
  return counts[key];
}

// ── config parsing ─────────────────────────────────────────────────────────

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ArchetypeError(`${where}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, where: string, fallback?: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (fallback !== undefined) return fallback;
  throw new ArchetypeError(`${where}: expected a non-empty string.`);
}

/**
 * Loud recovery, matching aidream's `coerce_node_type`: an unrecognised
 * node_type falls back to `article` and SCREAMS. It is deliberately not a
 * refusal — the server writes that tree, so a twin that refused would preview
 * nothing for a plan the chat tool happily creates.
 */
function asNodeType(
  value: unknown,
  fallback: NodeType,
  where: string,
  problems: string[],
): NodeType {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim().toLowerCase();
  if ((NODE_TYPES as readonly string[]).includes(text)) return text as NodeType;
  problems.push(
    `${where}: node_type "${String(value)}" is not one of ${NODE_TYPES.join(" | ")} — using "article".`,
  );
  return "article";
}

/**
 * Extra keys are REJECTED, matching the canonical models' `extra="forbid"`.
 * A typo'd config key means the author asked for something the expander never
 * applied — silently ignoring it is how a whole family goes missing.
 */
function rejectUnknownKeys(
  row: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): void {
  const unknown = Object.keys(row).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ArchetypeError(
      `${where}: unknown key(s) ${unknown.sort().join(", ")}. Allowed: ${[...allowed].sort().join(", ")}.`,
    );
  }
}

const CORE_KEYS = ["label", "slug", "node_type", "page_type", "brief"] as const;
const FAMILY_KEYS = [
  "key",
  "label",
  "slug",
  "node_type",
  "page_type",
  "child_node_type",
  "child_page_type",
  "count",
  "child_label_template",
  "child_slug_template",
  "brief",
  "child_brief",
  "materialize",
] as const;
const FOUNDATION_KEYS = [
  "tokens",
  "header",
  "footer",
  "nav_entries",
  "assets",
] as const;
const ARCHETYPE_KEYS = [
  "label",
  "description",
  "page_estimate",
  "core",
  "families",
  "foundation",
] as const;

function asStringList(value: unknown, where: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ArchetypeError(`${where}: expected a list of strings.`);
  return value.map((item, index) => asString(item, `${where}[${index}]`));
}

function asCountRef(value: unknown, where: string, fallback: CountRef): CountRef {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  throw new ArchetypeError(`${where}: count must be a number, true/false, or "=<family>.count".`);
}

function parseCore(
  raw: unknown,
  where: string,
  problems: string[],
): ArchetypeCorePage {
  const row = asRecord(raw, where);
  rejectUnknownKeys(row, CORE_KEYS, where);
  return {
    label: asString(row.label, `${where}.label`),
    slug: typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : null,
    nodeType: asNodeType(row.node_type, "article", where, problems),
    pageType: typeof row.page_type === "string" ? row.page_type : null,
    brief: asStringList(row.brief, `${where}.brief`),
  };
}

function parseFamily(
  raw: unknown,
  where: string,
  problems: string[],
): ArchetypeFamily {
  const row = asRecord(raw, where);
  rejectUnknownKeys(row, FAMILY_KEYS, where);
  const materializeRaw = row.materialize === undefined ? "pages" : String(row.materialize);
  if (materializeRaw !== "pages" && materializeRaw !== "count_only") {
    throw new ArchetypeError(
      `${where}.materialize: "${materializeRaw}" is not "pages" or "count_only".`,
    );
  }
  const count = row.count === undefined ? 0 : Number(row.count);
  if (!Number.isInteger(count) || count < 0) {
    throw new ArchetypeError(`${where}.count: must be a whole number >= 0.`);
  }
  return {
    key: asString(row.key, `${where}.key`),
    label: asString(row.label, `${where}.label`),
    slug: typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : null,
    nodeType: asNodeType(row.node_type, "index", where, problems),
    pageType:
      row.page_type === undefined ? "pillar-page" : ((row.page_type as string | null) ?? null),
    childNodeType: asNodeType(row.child_node_type, "article", where, problems),
    childPageType: typeof row.child_page_type === "string" ? row.child_page_type : null,
    count,
    childLabelTemplate: asString(
      row.child_label_template,
      `${where}.child_label_template`,
      "{label} {n}",
    ),
    childSlugTemplate: asString(
      row.child_slug_template,
      `${where}.child_slug_template`,
      "{key}-{n}",
    ),
    brief: asStringList(row.brief, `${where}.brief`),
    childBrief: asStringList(row.child_brief, `${where}.child_brief`),
    materialize: materializeRaw,
  };
}

function parseFoundation(raw: unknown, where: string): ArchetypeFoundationConfig {
  if (raw === undefined || raw === null) {
    return { tokens: false, header: 0, footer: 0, navEntries: 0, assets: {} };
  }
  const row = asRecord(raw, where);
  rejectUnknownKeys(row, FOUNDATION_KEYS, where);
  const assetsRaw =
    row.assets === undefined || row.assets === null
      ? {}
      : asRecord(row.assets, `${where}.assets`);
  const assets: Record<string, CountRef> = {};
  for (const [key, value] of Object.entries(assetsRaw)) {
    assets[key] = asCountRef(value, `${where}.assets.${key}`, 0);
  }
  return {
    tokens: asCountRef(row.tokens, `${where}.tokens`, false),
    header: asCountRef(row.header, `${where}.header`, 0),
    footer: asCountRef(row.footer, `${where}.footer`, 0),
    navEntries: asCountRef(row.nav_entries, `${where}.nav_entries`, 0),
    assets,
  };
}

/**
 * Validate one `template_map.archetypes` blob into the client model.
 *
 * `problems` collects LOUD RECOVERIES (currently node_type coercion) so the
 * caller can surface them beside the library instead of losing them to a
 * console nobody reads. Genuine config errors still throw.
 */
export function parseArchetypeMap(
  raw: unknown,
  where: string,
  source: string,
  problems: string[] = [],
): Archetype[] {
  if (raw === undefined || raw === null) return [];
  const map = asRecord(raw, `${where}: "archetypes" must be an object keyed by archetype name`);
  return Object.entries(map).map(([key, value]) => {
    const scope = `${where}.${key}`;
    const row = asRecord(value, scope);
    rejectUnknownKeys(row, ARCHETYPE_KEYS, scope);
    const coreRaw = Array.isArray(row.core) ? row.core : [];
    const familiesRaw = Array.isArray(row.families) ? row.families : [];
    return {
      key,
      label: asString(row.label, `${scope}.label`, key),
      description: typeof row.description === "string" ? row.description : "",
      pageEstimate: typeof row.page_estimate === "string" ? row.page_estimate : "",
      core: coreRaw.map((item, index) =>
        parseCore(item, `${scope}.core[${index}]`, problems),
      ),
      families: familiesRaw.map((item, index) =>
        parseFamily(item, `${scope}.families[${index}]`, problems),
      ),
      foundation: parseFoundation(row.foundation, `${scope}.foundation`),
      source,
    } satisfies Archetype;
  });
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
  overrides: Record<string, number> | undefined,
  names: Record<string, string[]> | undefined,
): Record<string, number> {
  const keys = archetype.families.map((family) => family.key);
  const dupes = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (dupes.length > 0) {
    throw new ArchetypeError(
      `Duplicate family keys: ${[...new Set(dupes)].sort().join(", ")}.`,
    );
  }
  const counts: Record<string, number> = {};
  for (const family of archetype.families) counts[family.key] = family.count;
  for (const [label, source] of [
    ["names", names],
    ["counts", overrides],
  ] as const) {
    for (const key of Object.keys(source ?? {})) {
      if (!(key in counts)) {
        throw new ArchetypeError(
          `${label} override references unknown family "${key}". Families: ${keys.sort().join(", ") || "(none)"}.`,
        );
      }
    }
  }
  // Names win over the archetype default; an explicit count wins over both.
  for (const [key, labels] of Object.entries(names ?? {})) counts[key] = labels.length;
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (!Number.isInteger(value) || value < 0) {
      throw new ArchetypeError(`counts["${key}"] must be a whole number >= 0.`);
    }
    counts[key] = value;
  }
  return counts;
}

function fillTemplate(template: string, family: ArchetypeFamily, index: number): string {
  return template
    .replaceAll("{n}", String(index + 1))
    .replaceAll("{label}", family.label)
    .replaceAll("{key}", family.key);
}

function foundationRequirements(
  foundation: ArchetypeFoundationConfig,
  counts: Record<string, number>,
): FoundationRequirement[] {
  const out: FoundationRequirement[] = [];
  const add = (key: string, kind: FoundationKind, label: string, raw: CountRef) => {
    const required = resolveCount(raw, counts, `foundation.${key}`);
    if (required <= 0) return;
    out.push({ key, kind, label, required, declaredAs: String(raw) });
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

/** `service_icon` → `Service icon` — machine keys are never shown raw. */
export function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface ExpandOptions {
  counts?: Record<string, number>;
  names?: Record<string, string[]>;
}

/**
 * Turn an archetype + count/name overrides into the exact tree that will land.
 * Routes are computed the same way `plan._node_shape` computes them, so the
 * preview is the truth, not an approximation.
 */
export function expandArchetype(
  archetype: Archetype,
  options: ExpandOptions = {},
): ExpandedArchetype {
  const counts = familyCounts(archetype, options.counts, options.names);

  let home: ArchetypeCorePage | null = null;
  const otherCore: ArchetypeCorePage[] = [];
  for (const page of archetype.core) {
    if (page.nodeType === "home") {
      if (home) throw new ArchetypeError("This archetype declares more than one home page.");
      home = page;
    } else {
      if (!page.slug) throw new ArchetypeError(`Core page "${page.label}" needs a slug.`);
      otherCore.push(page);
    }
  }
  if (!home) {
    throw new ArchetypeError(
      "This archetype must declare exactly one core page with node_type=home.",
    );
  }

  const routes: string[] = ["/"];
  const familyPlans: FamilyPlan[] = [];
  const children: PlanSpecNode[] = [];

  for (const page of otherCore) {
    const route = `/${page.slug}`;
    routes.push(route);
    children.push({
      route,
      label: page.label,
      slug: page.slug,
      nodeType: page.nodeType,
      pageType: page.pageType,
      brief: [...page.brief],
      attributes: { [NODE_ATTR_KEY]: { source: archetype.key, role: "core" } },
      role: "core",
      familyKey: null,
      children: [],
    });
  }

  for (const family of archetype.families) {
    const count = counts[family.key];
    const slug = family.slug ?? family.key;
    const hubRoute = `/${slug}`;
    const supplied = options.names?.[family.key];
    const familyChildren: PlanSpecNode[] = [];
    const childLabels: string[] = [];

    if (family.materialize === "pages") {
      const seen = new Set<string>();
      for (let index = 0; index < count; index += 1) {
        const label =
          supplied && index < supplied.length
            ? supplied[index]
            : fillTemplate(family.childLabelTemplate, family, index);
        let childSlug =
          supplied && index < supplied.length
            ? slugify(supplied[index])
            : slugify(fillTemplate(family.childSlugTemplate, family, index));
        if (seen.has(childSlug)) childSlug = `${childSlug}-${index + 1}`;
        seen.add(childSlug);
        childLabels.push(label);
        const route = `${hubRoute}/${childSlug}`;
        routes.push(route);
        familyChildren.push({
          route,
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
          familyKey: family.key,
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
    routes.push(hubRoute);
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
      familyKey: family.key,
      children: familyChildren,
    });
  }

  const root: PlanSpecNode = {
    route: "/",
    label: home.label,
    slug: null,
    nodeType: "home",
    pageType: home.pageType,
    brief: [...home.brief],
    attributes: { [NODE_ATTR_KEY]: { source: archetype.key, role: "core" } },
    role: "core",
    familyKey: null,
    children,
  };

  const unique = [...new Set(routes)].sort();
  return {
    archetype: archetype.key,
    label: archetype.label,
    pageEstimate: archetype.pageEstimate,
    counts,
    roots: [root],
    routes: unique,
    pageCount: unique.length,
    families: familyPlans,
    foundation: foundationRequirements(archetype.foundation, counts),
  };
}

/** Depth-first walk of the spec tree in write order (parents before children). */
export function walkSpec(nodes: PlanSpecNode[]): PlanSpecNode[] {
  const out: PlanSpecNode[] = [];
  const visit = (node: PlanSpecNode) => {
    out.push(node);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return out;
}
