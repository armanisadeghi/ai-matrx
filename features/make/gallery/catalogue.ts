// features/make/gallery/catalogue.ts — LANE MAKE-HOME (v6 Unified Data System), wave 4.
//
// THE TEMPLATE GALLERY'S PURE HALF: the shape `custom.templates` answers (lane 8's card fields,
// adopted 2026-10-02: name, persona, footprint, teaches, strengths, industry, job, preview image),
// the filter the gallery sends it, how its cards split into the platform row and "Your
// organization's" row, and the words a person reads for each catalogue value.
//
// ONE SOURCE (guard G3, __tests__/one-gallery-source.test.ts): every card on /make comes from the
// catalogue door `custom.templates`. Nothing in features/make reads `context.templates`,
// `catalog_entries`, the kits service or the use-case registry. Until lane 8's rows exist, the door's
// rows are whatever exists — never a second list stitched beside them.
//
// No store import here: this file is pure so tests and the clone guard can load it.

/** One card exactly as `custom.templates` answers it (card keys only — never a spec, plan or row). */
export interface GalleryCard {
  id: string;
  catalogue_id: string;
  version: number;
  scope: "platform" | "org";
  /** The organization that saved it; null for the platform's own. */
  owner_organization_id: string | null;
  name: string;
  persona: string | null;
  business: string | null;
  vertical: string | null;
  industry: string | null;
  job: string | null;
  audience: string | null;
  teaches: string | null;
  strengths: string[];
  requires: string[];
  footprint: GalleryFootprint | null;
  preview_image: string | null;
  install_door: string;
  /** Present when the read asked `installed_in`: this organization's live install, or null. */
  installed: { install_id: string; state: string; version: number } | null;
  /** A one-off (a describe run): on no shelf until the person keeps it (custom.template_keep). */
  ephemeral?: boolean;
  /** The template's readable address (`spec.id`, unique and stable): /templates/<slug>. Public door only. */
  slug?: string | null;
  /** The main table's first rows, for the card's live thumbnail. Public door, asked with `thumb`. */
  thumb?: GalleryThumb | null;
}

/** The first rows of a template's main table, as the public door hands them to a gallery card. */
export interface GalleryThumb {
  table: string | null;
  columns: Array<{ key: string; label: string; type: string; colors: Record<string, string> | null }>;
  rows: Array<Record<string, unknown>>;
  /** The main table's first non-grid view (kanban, calendar, timeline, gallery), else null. */
  view: string | null;
}

export interface GalleryFootprint {
  tables?: number;
  views?: number;
  forms?: number;
  dimensions?: number;
  agents?: number;
  workflows?: number;
  sharedBlocks?: number;
  extras?: Record<string, number>;
  opensOutsideSignIn?: boolean;
  /** "3 tables · 1 form · 1 booking" — derived by lane 8's footprintOf, never hand-written. */
  line?: string;
}

export interface GalleryAnswer {
  total: number;
  limit: number;
  offset: number;
  cards: GalleryCard[];
}

export interface GalleryFilters {
  industry?: string | null;
  job?: string | null;
  teaches?: string | null;
  q?: string | null;
}

/** The door's page ceiling (custom.templates clamps `limit` to 200). */
export const GALLERY_PAGE = 200;

/**
 * THE FILTER /make SENDS `custom.templates`. `installedIn` marks which cards that organization
 * already installed (the door ignores an organization the person is not in). Empty filters are
 * left out, so "All" is the door's own unfiltered answer.
 */
export function galleryFilter(
  filters: GalleryFilters,
  opts: { installedIn?: string | null; scope?: "all" | "platform" | "org"; organizationId?: string | null; offset?: number; id?: string | null; installedOneOffs?: boolean } = {},
): Record<string, unknown> {
  const f: Record<string, unknown> = { limit: GALLERY_PAGE, offset: opts.offset ?? 0 };
  // One template by id — the only read that answers a one-off (a describe run) before it is kept.
  if (opts.id) f.id = opts.id;
  if (opts.scope && opts.scope !== "all") f.scope = opts.scope;
  if (opts.organizationId) f.organization_id = opts.organizationId;
  if (opts.installedIn) f.installed_in = opts.installedIn;
  // The one-offs (describe runs) `installedIn` has installed and not removed: /make's "Made from your descriptions".
  if (opts.installedOneOffs) f.installed_one_offs = true;
  for (const key of ["industry", "job", "teaches"] as const) {
    const v = filters[key];
    if (v) f[key] = v;
  }
  const q = filters.q?.trim();
  if (q) f.q = q;
  return f;
}

/**
 * "YOUR ORGANIZATION'S" ROW (D2): only the templates THIS organization saved. The door already
 * narrows `scope: "org"` + `organization_id`; the row re-checks the owner, so a card another
 * organization saved never lands in this row even if a read widened.
 */
export function orgRowFilter(organizationId: string): Record<string, unknown> {
  return galleryFilter({}, { scope: "org", organizationId, installedIn: organizationId });
}

export function orgRowCards(cards: readonly GalleryCard[], organizationId: string | null): GalleryCard[] {
  if (!organizationId) return [];
  return cards.filter((c) => c.scope === "org" && c.owner_organization_id === organizationId);
}

/** The main list: the platform's catalogue (organizations' own templates live in their own row). */
export function platformCards(cards: readonly GalleryCard[]): GalleryCard[] {
  return cards.filter((c) => c.scope === "platform");
}

/** The values each filter offers: only what the catalogue actually holds, in reading order. */
export function facetValues(cards: readonly GalleryCard[], key: "industry" | "job" | "teaches"): string[] {
  const seen = new Set<string>();
  for (const c of cards) {
    const v = c[key];
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => wordFor(key, a).localeCompare(wordFor(key, b)));
}

/** The card's footprint line, or one built from its counts when the line is missing. */
export function footprintLine(fp: GalleryFootprint | null | undefined): string {
  if (!fp) return "";
  if (fp.line) return fp.line;
  const parts: string[] = [];
  const add = (n: number | undefined, one: string, many: string) => {
    if (n && n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(fp.tables, "table", "tables");
  add(fp.views, "view", "views");
  add(fp.forms, "form", "forms");
  for (const [kind, n] of Object.entries(fp.extras ?? {})) add(n, kind, `${kind}s`);
  add(fp.agents, "agent", "agents");
  add(fp.workflows, "workflow", "workflows");
  return parts.join(" · ");
}

/** The footprint as the preview lists it: one line per kind of thing an install makes. */
export function footprintParts(fp: GalleryFootprint | null | undefined): Array<{ kind: string; count: number; label: string }> {
  if (!fp) return [];
  const out: Array<{ kind: string; count: number; label: string }> = [];
  const add = (kind: string, n: number | undefined, one: string, many: string) => {
    if (n && n > 0) out.push({ kind, count: n, label: n === 1 ? one : many });
  };
  add("table", fp.tables, "table", "tables");
  add("view", fp.views, "view", "views");
  add("form", fp.forms, "form", "forms");
  add("dimension", fp.dimensions, "set of dimensions", "sets of dimensions");
  for (const [kind, n] of Object.entries(fp.extras ?? {})) {
    const word = EXTRA_WORDS[kind] ?? [kind.replace(/_/g, " "), `${kind.replace(/_/g, " ")}s`];
    add(kind, n, word[0], word[1]);
  }
  add("agent", fp.agents, "agent", "agents");
  add("workflow", fp.workflows, "workflow", "workflows");
  return out;
}

const EXTRA_WORDS: Record<string, [string, string]> = {
  booking: ["booking page", "booking pages"],
  dashboard: ["dashboard", "dashboards"],
  portal: ["client portal", "client portals"],
  checklist: ["checklist", "checklists"],
  digest: ["digest", "digests"],
  document: ["document", "documents"],
  notification: ["notification", "notifications"],
  row_action: ["row action", "row actions"],
  stage_rules: ["stage rule set", "stage rule sets"],
  drill_down: ["drill-down", "drill-downs"],
  automation: ["automation", "automations"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Words: lane 8's catalogue values (INDUSTRY_GROUPS, TEMPLATE_JOBS, TEACHES_FEATURES, STRENGTHS in
// @ai-matrx/records/templates) as a person reads them. A value with no entry reads as its own words.
// ─────────────────────────────────────────────────────────────────────────────

const INDUSTRY_WORDS: Record<string, string> = {
  healthcare: "Healthcare",
  legal_professional: "Legal and professional",
  construction_trades: "Construction and trades",
  real_estate_property: "Real estate",
  hospitality_food: "Food and hospitality",
  agencies_creative: "Agencies and creative",
  field_home_services: "Home services",
  retail_ecommerce: "Retail",
  manufacturing_logistics: "Manufacturing",
  education: "Education",
  nonprofit_community: "Nonprofit",
  software_it: "Software and IT",
  fitness_beauty_wellness: "Fitness and beauty",
  media_creators: "Media and creators",
  staffing_hr_recruiting: "Staffing and HR",
  personal_family: "Personal and family",
  events_weddings: "Events",
  automotive: "Automotive",
  agriculture_environment: "Agriculture",
  cross_industry: "Any business",
};

const JOB_WORDS: Record<string, string> = {
  intake: "Intake",
  scheduling: "Scheduling",
  crm_pipeline: "Sales pipeline",
  work_orders: "Work orders",
  inventory: "Inventory",
  billing: "Billing",
  team_hr: "Team and HR",
  projects: "Projects",
  content: "Content",
  compliance_quality: "Compliance",
  customer_service: "Customer service",
  reporting: "Reporting",
};

const TEACHES_WORDS: Record<string, string> = {
  relations_rollups: "Linked tables",
  dimensions: "Dimensions",
  kanban: "Boards",
  calendar: "Calendar",
  timeline: "Timeline",
  gallery: "Gallery",
  forms: "Forms",
  bookings: "Bookings",
  portals: "Client portals",
  dashboards: "Dashboards",
  drill_down: "Drill-down",
  agents: "Agents",
  field_governance: "Governed columns",
  import_upsert: "Imports",
  checklists: "Checklists",
  documents_esign: "Documents and e-sign",
};

const STRENGTH_WORDS: Record<string, string> = {
  S1: "Governed columns",
  S2: "Agents in your data",
  S3: "Every front door, one table",
  S4: "Links to anything",
  S5: "Nothing gets lost",
};

export function wordFor(key: "industry" | "job" | "teaches" | "strength", value: string): string {
  const map = key === "industry" ? INDUSTRY_WORDS : key === "job" ? JOB_WORDS : key === "teaches" ? TEACHES_WORDS : STRENGTH_WORDS;
  return map[value] ?? value.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing: every object an install made, opened where it lives.
// ─────────────────────────────────────────────────────────────────────────────

export interface MadeObject {
  kind: string;
  id: string | null;
  ref: string;
  title: string | null;
  table_id: string | null;
}

/**
 * Where a made object opens. Tables open their page; a view, form or dashboard opens on its
 * table, and so does a document or a portal. Fields, rules and the Home record are parts of a
 * table, not things a person opens on their own, so the landing lists them under it (null here).
 */
export function hrefForMade(m: MadeObject): string | null {
  if (!m.id) return null;
  switch (m.kind) {
    case "table":
      return `/data/${m.id}`;
    case "view":
      return m.table_id ? `/data/${m.table_id}?view=${m.id}` : null;
    case "form":
      return m.table_id ? `/data/${m.table_id}?rail=forms&item=${m.id}` : `/f/${m.id}`;
    case "dashboard":
      return m.table_id ? `/data/${m.table_id}?dashboard=${m.id}` : null;
    case "document":
      return m.table_id ? `/data/${m.table_id}` : null;
    case "portal":
      return m.table_id ? `/data/${m.table_id}?rail=portals&item=${m.id}` : null;
    case "agent":
      return `/agents/${m.id}`;
    case "workflow":
      return `/workflows/${m.id}`;
    case "stage_rules":
      // A stage rule set is declared on its table (no record of its own): it opens the table.
      return m.table_id ? `/data/${m.table_id}` : null;
    case "rule":
      // A digest or notification opens in its table's notifications rail; a stage rule set or row
      // action is a rule OF its table, so it opens the table (the card counts every one of them).
      if (!m.table_id) return null;
      return /^(digests|notifications)\./.test(m.ref) ? `/data/${m.table_id}?rail=notifications&item=${m.id}` : `/data/${m.table_id}`;
    default:
      return null;
  }
}

/** The made objects a person opens (one row each), in the order the install made them. */
export function openableMade(made: readonly MadeObject[]): MadeObject[] {
  return made.filter((m) => hrefForMade(m) !== null);
}
