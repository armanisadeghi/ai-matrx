import { CONTEXT_MENU_HEADING_KEY, type ContextMenuExtraSection, type ResolvedContextMenuContext } from "./types";
import type { MatrxDataTableRecordControls } from "@ai-matrx/design-system/data-table/types";
import type {
  MatrxTableMenuPayload,
  MatrxTableMenuTarget,
} from "@ai-matrx/design-system/data-table/menu-targets";

export interface TableRowMenuDescriptor {
  context: ResolvedContextMenuContext;
  extraSections: ContextMenuExtraSection[];
}

const descriptors = new WeakMap<object, TableRowMenuDescriptor>();
const resolvers = new Map<string, (target: MatrxTableMenuTarget) => unknown>();

export function createTableRowMenuDescriptor(descriptor: TableRowMenuDescriptor): object {
  const token = {};
  descriptors.set(token, descriptor);
  return token;
}

/** Exactly the row commands the default menu renders. Nothing else is read. */
export type TableRowEditCommands = Pick<
  MatrxDataTableRecordControls,
  "beginEdit" | "saveEdits" | "cancelEdits"
>;

function isCommand(value: unknown): value is () => void {
  return typeof value === "function";
}

/**
 * The table hands its host the row's controls as `unknown` — it never
 * interprets what the host builds from them — so they are READ here, one
 * command at a time. A command the table did not send, or sent as something
 * that cannot be called, is simply not offered rather than rendered dead.
 */
export function tableRowEditCommands(controls: unknown): TableRowEditCommands {
  if (typeof controls !== "object" || controls === null) return {};
  const read = (key: string): (() => void) | undefined => {
    const value: unknown = Reflect.get(controls, key);
    return isCommand(value) ? value : undefined;
  };
  return {
    beginEdit: read("beginEdit"),
    saveEdits: read("saveEdits"),
    cancelEdits: read("cancelEdits"),
  };
}

/**
 * The host's generic menu model: complete current row data plus the
 * table-owned edit commands.
 *
 * The table asks this for whichever of its five right-click LEVELS was aimed
 * at. Only the row has a generic menu here, so every other level answers
 * `null` and the table leaves that level to the surface that owns it.
 */
export function createDefaultTableRowMenuDescriptor(
  payload: MatrxTableMenuPayload,
): object | null {
  if (payload.level !== "row") return null;
  return createTableRowMenuDescriptor(
    buildDefaultTableRowMenuDescriptor(
      payload.row,
      tableRowEditCommands(payload.controls),
    ),
  );
}

/** Reusable base for a domain menu that keeps the shared row edit controls. */
export function buildDefaultTableRowMenuDescriptor(
  row: unknown,
  controls: TableRowEditCommands,
): TableRowMenuDescriptor {
  const items = [
    ...(controls.beginEdit
      ? [{ kind: "item" as const, id: "table-edit-row", label: "Edit row", onSelect: controls.beginEdit }]
      : []),
    ...(controls.saveEdits
      ? [{ kind: "item" as const, id: "table-save-row", label: "Save changes", onSelect: () => void controls.saveEdits?.() }]
      : []),
    ...(controls.cancelEdits
      ? [{ kind: "item" as const, id: "table-discard-row", label: "Discard changes", onSelect: controls.cancelEdits }]
      : []),
  ];
  return {
    context: {
      content: JSON.stringify(row, null, 2) ?? String(row),
      context: row,
      __entity: null,
    },
    extraSections: items.length === 0
      ? []
      : [{ id: "table-row", label: "Row", primary: true, anchor: "after-clipboard", items }],
  };
}

/**
 * The canonical table registers ONE resolver per mounted instance and asks it
 * which of its right-click LEVELS was aimed at (`MatrxTableMenuTarget`), not
 * merely which row — so the resolver takes the target the package defines.
 */
export function registerTableRowContextResolver(
  tableId: string,
  resolve: (target: MatrxTableMenuTarget) => unknown,
) {
  resolvers.set(tableId, resolve);
  return () => { if (resolvers.get(tableId) === resolve) resolvers.delete(tableId); };
}

export function resolveTableRowMenuDescriptor(target: HTMLElement | null): TableRowMenuDescriptor | null {
  const row = target?.closest<HTMLElement>("[data-row-id]");
  const tableId = row?.closest<HTMLElement>("[data-matrx-table-id]")?.dataset.matrxTableId;
  const rowId = row?.dataset.rowId;
  if (!tableId || !rowId) return null;
  // This menu acts on the ROW it found in the DOM, so it asks for that level
  // by name. Handing the resolver a bare id instead leaves `level` undefined
  // and the table answers nothing at all.
  const token = resolvers.get(tableId)?.({ tableId, level: "row", rowId });
  const descriptor = token && typeof token === "object" ? descriptors.get(token) ?? null : null;
  if (!descriptor) return null;
  // 🚨 THE HEADING IS WHAT THE PERSON RIGHT-CLICKED, IN THE WORDS ON SCREEN (merged-grid review
  // 2026-09-26): the heading read `Content: { "id": …, "_choices": …, "level": "admin",
  // "hidden": {} }` — the row's raw document. The clicked cell's shown text ("Content: Priya
  // Nair") is the heading; the row's words when the click was between cells. The full row stays
  // in `context.context` for the actions that read it.
  const cell = target?.closest<HTMLElement>("td, [role='gridcell']");
  const shown = shownWords(cell ?? row);
  // THE HEADER NAMES THE ROW'S RECORD (admin pass 2026-09-27: "Content: partial" — the clicked
  // status cell). The descriptor's own `__heading` wins (a list row names "Quiz: …"); otherwise
  // the row's record name — its first data cell's primary line. What the actions act on
  // (`content`) stays the clicked cell's words.
  const ownHeading = (descriptor.context as Record<string, unknown>)[CONTEXT_MENU_HEADING_KEY];
  const recordName = ownHeading ? "" : rowRecordName(row);
  const context = {
    ...descriptor.context,
    ...(shown ? { content: shown } : {}),
    ...(recordName ? { [CONTEXT_MENU_HEADING_KEY]: { label: "Row", text: recordName } } : {}),
  };
  // THE ROW IS NAMED ONCE (admin final judge 2026-09-27: "Row: Basic Editor" then a "Basic
  // Editor" section heading right under it). A primary section labelled with the same name the
  // header already shows is headed "Row" instead — its rows stay first (an unnamed section
  // would lose its place; the package never draws a coined or empty heading).
  const headed = (ownHeading as { text?: unknown } | undefined)?.text ?? recordName;
  const same = (label: string | undefined) =>
    typeof headed === "string" && !!label && label.trim().toLowerCase() === headed.trim().toLowerCase();
  const extraSections = descriptor.extraSections.map((section) =>
    section.primary && same(section.label) ? { ...section, label: "Row" } : section,
  );
  const changedSections = extraSections.some((section, i) => section !== descriptor.extraSections[i]);
  return shown || recordName || changedSections ? { ...descriptor, context, extraSections } : descriptor;
}

/** The row's record name: the first data cell (not a tick box, star or button cell) with words. */
export function rowRecordName(row: HTMLElement | null | undefined): string {
  if (!row) return "";
  for (const cell of Array.from(row.querySelectorAll<HTMLElement>("td[data-matrx-table-column-id], [role='gridcell'][data-matrx-table-column-id]"))) {
    const words = primaryLine(cell);
    if (words) return words.length > 120 ? `${words.slice(0, 119)}…` : words;
  }
  return "";
}

/** Elements that start a new LINE of what a cell shows (name, then its subtitle). */
const LINE_BREAKING = "div, p, li, br, tr, h1, h2, h3, h4, h5, h6, section, article, header, footer, dd, dt";

/**
 * The PRIMARY line an element shows — its first line, without its controls.
 * `textContent` glues a cell's stacked lines together with no space
 * ("Data Destruction, Inc.Company re…", "Notesmatrx-user/notes"; page-pass
 * 2026-09-27), so each line-starting element is marked with a newline first and
 * only the first non-empty line is kept. Inline markup inside a line
 * (<b>, <a>, <span>) is untouched, so words are never split.
 */
function primaryLine(element: Element): string {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("button, [aria-hidden='true'], input, textarea, select").forEach((node) => node.remove());
  copy.querySelectorAll(LINE_BREAKING).forEach((node) => node.before("\n"));
  const lines = (copy.textContent ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && line !== "—");
  return lines[0] ?? "";
}

/** The words an element shows: one cell's primary line, or each cell's, joined with " · ". */
function shownWords(element: HTMLElement | null | undefined): string {
  if (!element) return "";
  const cells = element.querySelectorAll("td, [role='gridcell']");
  const text = cells.length > 1
    ? Array.from(cells).map(primaryLine).filter(Boolean).join(" · ")
    : primaryLine(element);
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}
