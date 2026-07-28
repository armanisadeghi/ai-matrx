/**
 * app/(core)/marketing/content-plan/create-sharp/_lib/archetypes.ts
 *
 * PURE archetype expansion — the TypeScript twin of aidream's
 * `aidream/services/content_plan/archetypes.py#expand_archetype`.
 *
 * An archetype is a template of CONCEPTS WITH COUNTS, not a template of a
 * website: "6 service pages, 4 locations, 1 header, 6 service icons". This
 * module turns one archetype + the user's count overrides into
 *
 *   • the exact routes that will be created (computed the same way the DB
 *     trigger `plan._node_shape` computes `plan.node.route`, so the preview
 *     IS the outcome), and
 *   • the foundation work order (tokens / header / footer / nav / assets)
 *     with `=<family>.count` references resolved.
 *
 * No IO, no React — every function here is deterministic and testable.
 *
 * PARITY LAW: the count grammar (int | bool | "=<family>.count") and the
 * label/slug templates must stay identical to the Python side. Anything else
 * raises loudly — a silently-zero requirement is a checklist item that never
 * gets built.
 */

export type PlanNodeTypeName =
  | "home"
  | "pillar"
  | "cluster"
  | "article"
  | "index";

const NODE_TYPES = new Set<PlanNodeTypeName>([
  "home",
  "pillar",
  "cluster",
  "article",
  "index",
]);

/** Stamped onto every node an archetype creates (`plan.node.attributes`). */
export const NODE_ATTR_KEY = "archetype";

/** The system-org profile row that carries the builtin archetype library. */
export const BUILTIN_ARCHETYPE_VERTICAL = "platform-archetypes";
/** `plan.profile.template_map` key holding the archetype map. */
export const ARCHETYPE_MAP_KEY = "archetypes";

export class ArchetypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchetypeError";
  }
}

export type CountRef = number | boolean | string;

export interface ArchetypeCorePage {
  label: string;
  /** null only for the home node. */
  slug: string | null;
  nodeType: PlanNodeTypeName;
  pageType: string | null;
  brief: string[];
}

export type Materialize = "pages" | "count_only";

export interface ArchetypeFamily {
  key: string;
  label: string;
  slug: string;
  nodeType: PlanNodeTypeName;
  pageType: string | null;
  childNodeType: PlanNodeTypeName;
  childPageType: string | null;
  count: number;
  childLabelTemplate: string;
  childSlugTemplate: string;
  brief: string[];
  childBrief: string[];
  materialize: Materialize;
}

export interface ArchetypeFoundationDecl {
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
  foundation: ArchetypeFoundationDecl;
}

export type FoundationKind = "tokens" | "component" | "nav" | "asset";

export interface FoundationRequirement {
  key: string;
  kind: FoundationKind;
  label: string;
  required: number;
  /** The raw declaration, so the UI can show that 6 came from "=services.count". */
  declaredAs: string;
}

/** One page the commit will attempt, in creation order. */
export interface PlannedPage {
  route: string;
  label: string;
  slug: string | null;
  nodeType: PlanNodeTypeName;
  pageType: string | null;
  brief: string[];
  /** Route of the parent page (null for the home root). */
  parentRoute: string | null;
  role: "home" | "core" | "family_hub" | "family_child";
  familyKey: string | null;
  /** For hubs: the promised child count recorded on the node. */
  targetCount?: number;
  materialize?: Materialize;
}

export interface FamilyPlan {
  key: string;
  label: string;
  route: string;
  count: number;
  materialize: Materialize;
  childPageType: string | null;
}

export interface ExpandedArchetype {
  archetype: string;
  label: string;
  pageEstimate: string;
  counts: Record<string, number>;
  /** Every page, ordered so a parent always precedes its children. */
  pages: PlannedPage[];
  families: FamilyPlan[];
  foundation: FoundationRequirement[];
}

const COUNT_REF = /^=([a-z0-9][a-z0-9_-]*)\.count$/;

/**
 * Resolve a count literal or a `=<family>.count` reference. Loud on anything
 * else — the whole grammar is three shapes, and a misparse silently drops the
 * requirement that is the entire point of the archetype.
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
      throw new ArchetypeError(`${where}: count ${value} is not a whole number ≥ 0.`);
    }
    return value;
  }
  const match = COUNT_REF.exec(value.trim());
  if (!match) {
    throw new ArchetypeError(
      `${where}: "${value}" is not a valid count. Use a whole number, true/false, ` +
        `or the reference form "=<family_key>.count".`,
    );
  }
  const key = match[1];
  if (!(key in counts)) {
    const known = Object.keys(counts).sort().join(", ") || "(none)";
    throw new ArchetypeError(
      `${where}: "${value}" references family "${key}", which this archetype does not declare. Families: ${known}.`,
    );
  }
  return counts[key];
}

// ─── parsing `plan.profile.template_map.archetypes` ──────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readNodeType(
  value: unknown,
  fallback: PlanNodeTypeName,
  where: string,
): PlanNodeTypeName {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string" && NODE_TYPES.has(value as PlanNodeTypeName)) {
    return value as PlanNodeTypeName;
  }
  throw new ArchetypeError(
    `${where}: node_type "${String(value)}" is not one of home/pillar/cluster/article/index.`,
  );
}

function readCountRef(value: unknown, where: string): CountRef {
  if (value === undefined || value === null) return 0;
  if (
    typeof value === "boolean" ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  throw new ArchetypeError(
    `${where}: count must be a number, true/false, or "=<family>.count".`,
  );
}

function parseCorePage(raw: unknown, where: string): ArchetypeCorePage {
  if (!isRecord(raw)) throw new ArchetypeError(`${where}: core page must be an object.`);
  const nodeType = readNodeType(raw.node_type, "article", where);
  const slug = typeof raw.slug === "string" ? raw.slug : null;
  const label = readString(raw.label).trim();
  if (!label) throw new ArchetypeError(`${where}: core page needs a label.`);
  if (nodeType !== "home" && !slug) {
    throw new ArchetypeError(`${where}: core page "${label}" needs a slug.`);
  }
  return {
    label,
    slug: nodeType === "home" ? null : slug,
    nodeType,
    pageType: typeof raw.page_type === "string" ? raw.page_type : null,
    brief: readStringList(raw.brief),
  };
}

function parseFamily(raw: unknown, where: string): ArchetypeFamily {
  if (!isRecord(raw)) throw new ArchetypeError(`${where}: family must be an object.`);
  const key = readString(raw.key).trim();
  if (!key) throw new ArchetypeError(`${where}: family needs a key.`);
  const label = readString(raw.label, key).trim();
  const materialize: Materialize =
    raw.materialize === "count_only" ? "count_only" : "pages";
  const count = typeof raw.count === "number" ? raw.count : 0;
  if (!Number.isInteger(count) || count < 0) {
    throw new ArchetypeError(`${where}: family "${key}" has a non-integer count.`);
  }
  return {
    key,
    label,
    slug: typeof raw.slug === "string" && raw.slug ? raw.slug : key,
    nodeType: readNodeType(raw.node_type, "index", `${where}.${key}`),
    pageType: typeof raw.page_type === "string" ? raw.page_type : "pillar-page",
    childNodeType: readNodeType(raw.child_node_type, "article", `${where}.${key}`),
    childPageType:
      typeof raw.child_page_type === "string" ? raw.child_page_type : null,
    count,
    childLabelTemplate: readString(raw.child_label_template, "{label} {n}"),
    childSlugTemplate: readString(raw.child_slug_template, "{key}-{n}"),
    brief: readStringList(raw.brief),
    childBrief: readStringList(raw.child_brief),
    materialize,
  };
}

function parseFoundation(raw: unknown, where: string): ArchetypeFoundationDecl {
  const source = isRecord(raw) ? raw : {};
  const assetsRaw = isRecord(source.assets) ? source.assets : {};
  const assets: Record<string, CountRef> = {};
  for (const [key, value] of Object.entries(assetsRaw)) {
    assets[key] = readCountRef(value, `${where}.assets.${key}`);
  }
  return {
    tokens: readCountRef(source.tokens, `${where}.tokens`),
    header: readCountRef(source.header, `${where}.header`),
    footer: readCountRef(source.footer, `${where}.footer`),
    navEntries: readCountRef(source.nav_entries, `${where}.nav_entries`),
    assets,
  };
}

/** Validate one `template_map.archetypes` blob. Loud on a malformed entry. */
export function parseArchetypeMap(
  raw: unknown,
  where: string,
): Record<string, Archetype> {
  if (raw === null || raw === undefined) return {};
  if (!isRecord(raw)) {
    throw new ArchetypeError(
      `${where}: \`archetypes\` must be an object keyed by archetype name.`,
    );
  }
  const out: Record<string, Archetype> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      throw new ArchetypeError(`${where}: archetype "${key}" is not an object.`);
    }
    const scope = `${where}.${key}`;
    const coreRaw = Array.isArray(value.core) ? value.core : [];
    const familiesRaw = Array.isArray(value.families) ? value.families : [];
    out[key] = {
      key,
      label: readString(value.label, key),
      description: readString(value.description),
      pageEstimate: readString(value.page_estimate),
      core: coreRaw.map((page) => parseCorePage(page, scope)),
      families: familiesRaw.map((family) => parseFamily(family, scope)),
      foundation: parseFoundation(value.foundation, `${scope}.foundation`),
    };
  }
  return out;
}

// ─── expansion ───────────────────────────────────────────────────────────

export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page";
}

function applyTemplate(
  template: string,
  family: ArchetypeFamily,
  index: number,
): string {
  return template
    .replaceAll("{n}", String(index + 1))
    .replaceAll("{label}", family.label)
    .replaceAll("{key}", family.key);
}

/** Family counts after the user's overrides. Unknown keys raise loudly. */
export function resolveFamilyCounts(
  archetype: Archetype,
  overrides: Record<string, number> | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const family of archetype.families) {
    if (family.key in counts) {
      throw new ArchetypeError(`Duplicate family key "${family.key}".`);
    }
    counts[family.key] = family.count;
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (!(key in counts)) {
      const known = Object.keys(counts).sort().join(", ") || "(none)";
      throw new ArchetypeError(
        `Count override references unknown family "${key}". Families: ${known}.`,
      );
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new ArchetypeError(`counts["${key}"] must be a whole number ≥ 0.`);
    }
    counts[key] = value;
  }
  return counts;
}

function foundationRequirements(
  foundation: ArchetypeFoundationDecl,
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

/**
 * Turn an archetype + count overrides into the exact page list and the
 * foundation work order. Routes are computed exactly as `plan._node_shape`
 * computes them, so the preview is the outcome — not an approximation.
 */
export function expandArchetype(
  archetype: Archetype,
  overrides?: Record<string, number>,
): ExpandedArchetype {
  const counts = resolveFamilyCounts(archetype, overrides);

  let home: ArchetypeCorePage | null = null;
  const otherCore: ArchetypeCorePage[] = [];
  for (const page of archetype.core) {
    if (page.nodeType === "home") {
      if (home) {
        throw new ArchetypeError(
          `Archetype "${archetype.key}" declares more than one home page.`,
        );
      }
      home = page;
    } else {
      otherCore.push(page);
    }
  }
  if (!home) {
    throw new ArchetypeError(
      `Archetype "${archetype.key}" must declare exactly one core page with node_type=home.`,
    );
  }

  const pages: PlannedPage[] = [
    {
      route: "/",
      label: home.label,
      slug: null,
      nodeType: "home",
      pageType: home.pageType,
      brief: home.brief,
      parentRoute: null,
      role: "home",
      familyKey: null,
    },
  ];

  for (const page of otherCore) {
    pages.push({
      route: `/${page.slug}`,
      label: page.label,
      slug: page.slug,
      nodeType: page.nodeType,
      pageType: page.pageType,
      brief: page.brief,
      parentRoute: "/",
      role: "core",
      familyKey: null,
    });
  }

  const families: FamilyPlan[] = [];
  for (const family of archetype.families) {
    const count = counts[family.key];
    const hubRoute = `/${family.slug}`;
    pages.push({
      route: hubRoute,
      label: family.label,
      slug: family.slug,
      nodeType: family.nodeType,
      pageType: family.pageType,
      brief: family.brief,
      parentRoute: "/",
      role: "family_hub",
      familyKey: family.key,
      targetCount: count,
      materialize: family.materialize,
    });
    if (family.materialize === "pages") {
      const seen = new Set<string>();
      for (let index = 0; index < count; index += 1) {
        const label = applyTemplate(family.childLabelTemplate, family, index);
        let childSlug = slugify(
          applyTemplate(family.childSlugTemplate, family, index),
        );
        if (seen.has(childSlug)) childSlug = `${childSlug}-${index + 1}`;
        seen.add(childSlug);
        pages.push({
          route: `${hubRoute}/${childSlug}`,
          label,
          slug: childSlug,
          nodeType: family.childNodeType,
          pageType: family.childPageType,
          brief: family.childBrief,
          parentRoute: hubRoute,
          role: "family_child",
          familyKey: family.key,
        });
      }
    }
    families.push({
      key: family.key,
      label: family.label,
      route: hubRoute,
      count,
      materialize: family.materialize,
      childPageType: family.childPageType,
    });
  }

  return {
    archetype: archetype.key,
    label: archetype.label,
    pageEstimate: archetype.pageEstimate,
    counts,
    pages,
    families,
    foundation: foundationRequirements(archetype.foundation, counts),
  };
}

// ─── reading the committed shape back off the live plan ──────────────────

/**
 * What an archetype stamped onto `plan.node.attributes.archetype`. Read back
 * so the checklist is PERSISTENT: the plan itself remembers which shape it
 * was built to and what each family promised — no second store, no site
 * settings write.
 */
export interface NodeArchetypeStamp {
  source: string;
  role: "core" | "family_hub" | "family_child";
  family?: string;
  targetCount?: number;
  materialize?: Materialize;
}

export function readArchetypeStamp(
  attributes: unknown,
): NodeArchetypeStamp | null {
  if (!isRecord(attributes)) return null;
  const raw = attributes[NODE_ATTR_KEY];
  if (!isRecord(raw)) return null;
  const source = readString(raw.source).trim();
  if (!source) return null;
  const role = raw.role;
  return {
    source,
    role:
      role === "family_hub" || role === "family_child" || role === "core"
        ? role
        : "core",
    family: typeof raw.family === "string" ? raw.family : undefined,
    targetCount:
      typeof raw.target_count === "number" ? raw.target_count : undefined,
    materialize: raw.materialize === "count_only" ? "count_only" : undefined,
  };
}

/** The attributes payload written onto a node this surface creates. */
export function archetypeStampFor(page: PlannedPage, source: string) {
  const stamp: Record<string, unknown> = {
    source,
    role: page.role === "home" ? "core" : page.role,
  };
  if (page.familyKey) stamp.family = page.familyKey;
  if (page.role === "family_hub") {
    stamp.target_count = page.targetCount ?? 0;
    stamp.materialize = page.materialize ?? "pages";
  }
  return { [NODE_ATTR_KEY]: stamp };
}
