// lib/spaces-blocks/types.ts — THE STORED SHAPE OF A SPACE PAGE, defined once.
//
// What `content.space_payload.snapshot` holds and what every importer, the editor and the server's
// projection read. The human-readable copy is common-docs/systems/content/spaces/BLOCK-SCHEMA.md.
//
// These types are structurally identical to the ones in features/spaces/contract.ts (the builder's
// fence). The fence may import from here; nothing here imports from the fence. Rules: add block types
// and props freely; never rename a stored `type` string or prop key once a snapshot holds it.

/** Notion's ten colors; "default" = none. Text color and background are separate choices. */
export type SpaceColor = "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";

export const SPACE_COLORS: readonly SpaceColor[] = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

/** Notion's reminder choices on a date: at the time, or this long before it. */
export type SpaceRemindOffset = "at" | "5m" | "1h" | "1d" | "2d" | "1w";

export type SpaceMention =
  | { kind: "space"; spaceId: string }
  | { kind: "person"; userId: string }
  /** `iso` is a day ("YYYY-MM-DD") or a local day and time ("YYYY-MM-DDTHH:mm"). `remind` = Notion's "Remind":
   *  when (relative to the date; a day without a time counts from 9:00) and who is told. */
  | { kind: "date"; iso: string; remind?: { offset: SpaceRemindOffset; userId: string } }
  /** A web link shown as a mention chip; `title` / `icon` (Lucide name or image URL) as last fetched. */
  | { kind: "link"; url: string; title?: string; icon?: string };

/** A run of inline text with marks — the content of every text-bearing block. */
export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: SpaceColor;
  background?: SpaceColor;
  link?: string;
  /** Inline mention: a Space, a person, a date or a web link. `text` is what shows (title, name, date). */
  mention?: SpaceMention;
  /** Inline equation (KaTeX source). `text` repeats the source so search and plain text see it. */
  equation?: string;
}

/** One block: `type` names it, `props` holds its own settings, `children` its nested blocks. */
export interface SpaceBlock<P extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  type: string;
  text?: RichSpan[];
  color?: SpaceColor;
  background?: SpaceColor;
  props?: P;
  children?: SpaceBlock[];
}

/** A Space's media: an uploaded file id (our file handler), an external URL, or a Lucide icon name. */
export type SpaceMedia = { fileId: string } | { url: string } | { icon: string };

export interface SpacePageSettings {
  font: "default" | "serif" | "mono";
  smallText: boolean;
  fullWidth: boolean;
  /** An editing switch, never a permission. */
  locked: boolean;
}

export const DEFAULT_PAGE_SETTINGS: SpacePageSettings = { font: "default", smallText: false, fullWidth: false, locked: false };

/** One stored snapshot = one row of `content.space_payload` = one page version. */
export interface SpaceSnapshot {
  v: 1;
  settings: SpacePageSettings;
  icon: SpaceMedia | null;
  cover: (SpaceMedia & { offsetY?: number }) | null;
  blocks: SpaceBlock[];
}

/** Where a database block's records come from. */
export type SpaceDataSource = { kind: "table"; tableId: string; viewId?: string } | { kind: "entity"; token: string };

/** The stored `type` strings. The first group renders in the editor today; the rest are schema-only. */
export const RENDERED_BLOCK_TYPES = [
  "text",
  "heading",
  "bulleted",
  "numbered",
  "todo",
  "toggle",
  "quote",
  "divider",
  "code",
  "callout",
  "page",
  "linkToPage",
  "columnList",
  "column",
  "slot",
  "tabs",
  "tab",
] as const;

export const SCHEMA_ONLY_BLOCK_TYPES = [
  "equation",
  "image",
  "video",
  "audio",
  "file",
  "pdf",
  "bookmark",
  "embed",
  "table",
  "tableOfContents",
  "breadcrumb",
  "database",
] as const;

export type SpaceBlockType = (typeof RENDERED_BLOCK_TYPES)[number] | (typeof SCHEMA_ONLY_BLOCK_TYPES)[number];

/** A media block's source: exactly one of fileId (preferred, our file handler) or url. */
export interface MediaProps extends Record<string, unknown> {
  fileId?: string;
  url?: string;
  /** Original file name (file, pdf, audio). */
  name?: string;
  /** Display width in px (image, video, pdf); absent = natural width. */
  width?: number;
  caption?: RichSpan[];
}

export interface TableProps extends Record<string, unknown> {
  headerRow: boolean;
  headerColumn: boolean;
  rows: Array<{ cells: RichSpan[][] }>;
  /** Column widths in px, one per column; null = automatic. */
  columnWidths?: Array<number | null>;
}

/** The layouts a database view can show (`table` = `grid`, `board` = `kanban`; both spellings are accepted). */
export const DATABASE_VIEW_LAYOUTS = ["grid", "table", "kanban", "board", "gallery", "list", "calendar", "timeline", "chart", "dashboard"] as const;
export type DatabaseViewLayout = (typeof DATABASE_VIEW_LAYOUTS)[number];
export const DATABASE_CHART_TYPES = ["donut", "bar", "hbar", "line"] as const;
export const DATABASE_CHART_OPS = ["count", "sum", "avg", "min", "max"] as const;
export const DATABASE_OPEN_AS = ["side", "center", "page", "full"] as const;

export interface DatabaseChartSettings {
  type: (typeof DATABASE_CHART_TYPES)[number];
  /** X axis field (null = one group). */
  groupBy: string | null;
  op: (typeof DATABASE_CHART_OPS)[number];
  /** The field sum / avg / min / max reads. */
  field?: string | null;
  sort?: "manual" | "asc" | "desc";
  legend?: boolean;
  dataLabels?: boolean;
  /** Donut: the total drawn in the middle. */
  centerValue?: boolean;
}

/** One saved view of a database block (props.views[]). */
export interface DatabaseView {
  id: string;
  name: string;
  layout: DatabaseViewLayout;
  /** Lucide icon name on the view tab. */
  icon?: string;
  groupField?: string | null;
  dateField?: string | null;
  sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
  filters?: Record<string, string | number | boolean | null>;
  /** Property keys this view hides. */
  hiddenFields?: string[];
  chart?: DatabaseChartSettings;
}

export interface DatabaseProps extends Record<string, unknown> {
  source: SpaceDataSource;
  /** true = inline database in the page body; false = a full-page database shown as a row that opens it. */
  inline: boolean;
  title?: string;
  /** The sample world the table lives in (the agency sample); absent = a real store table. */
  sample?: string;
  /** Linked view of a database: shows the source's name with an arrow. */
  linked?: boolean;
  showTitle?: boolean;
  /** Where a record opens: side peek, center peek or a full page. */
  openAs?: (typeof DATABASE_OPEN_AS)[number];
  views?: DatabaseView[];
  activeViewId?: string;
}

/** Tabs block: children are only `tab` blocks; `activeTab` = the id of the tab shown first. */
export interface TabsProps extends Record<string, unknown> {
  activeTab?: string;
}

/** Marks a block an importer could not map. It is a `text` block that says what it was. */
export interface UnsupportedProps extends Record<string, unknown> {
  unsupported: { from: string; kind: string; source: string };
}
