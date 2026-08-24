/**
 * Surface manifest — Item Detail (`matrx-user/item-detail`).
 *
 * The floating generic record dossier (`itemDetailWindow` overlay,
 * `features/window-panels/windows/item-detail/ItemDetailWindow.tsx`) — THE
 * DOOR LAW's peek target for every entity that has no bespoke window yet.
 * Given a `{ type, id }` it seeds from the agent-provided name/about, fetches
 * the row via the item registry's `detailSource`, and renders every populated
 * scalar column.
 *
 * 🚨 GENERIC BY DESIGN. This surface shows an ARBITRARY entity type, so it
 * declares the shape of a dossier, never the columns of any one table: what
 * kind of record is open, its identity, and the rendered fields as readable
 * text (`content`) plus the raw row (`record_fields`). Never add a per-type
 * value here — a type that earns its own vocabulary earns its own window and
 * its own surface.
 *
 * Emitter: nested `<SurfaceRuntimeProvider>` inside `ItemDetailWindow`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ITEM_DETAIL_SURFACE_NAME = "matrx-user/item-detail";

const groups: SurfaceValueGroup[] = [
  {
    key: "record_identity",
    label: "Record identity",
    sortOrder: 100,
    description:
      "What record the dossier is open on — its type, id, title, and the one-liner the opener passed.",
  },
  {
    key: "record_data",
    label: "Record data",
    sortOrder: 200,
    description:
      "The row the window actually fetched and rendered: how the load went, how many fields landed, and the fields themselves.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "item_type",
    label: "Item type token",
    description:
      'Canonical item-type token the window was opened with (e.g. "agent", "project", "note"). The string "unknown" when the opener passed no type — the window still renders whatever name/about it was given.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    group: "record_identity",
    sortOrder: 300,
  },
  {
    name: "item_label",
    label: "Item type label",
    description:
      'Human label for the item type as the window shows it in the title-bar chip (e.g. "Agent", "Project"). Falls back to a title-cased form of the raw type for an unregistered type. Always populated while the window is mounted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    group: "record_identity",
    sortOrder: 310,
  },
  {
    name: "item_id",
    label: "Record id",
    description:
      "UUID (or business key) of the record the dossier is open on. Empty when the window was opened as a bare type reference with no id.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "record_identity",
    sortOrder: 320,
  },
  {
    name: "item_title",
    label: "Record title",
    description:
      'The title the window displays — the fetched row\'s title column when the row loaded, else the name the opener passed, else an "Untitled <type>" placeholder. Always populated while the window is mounted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "record_identity",
    sortOrder: 330,
  },
  {
    name: "item_about",
    label: "Opener's one-liner",
    description:
      "The short description whoever opened the window passed along (commonly an agent naming the record in a run). Absent when the opener supplied none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "record_identity",
    sortOrder: 340,
  },
  {
    name: "record_status",
    label: "Load status",
    description:
      'How the row fetch went: "ready" (row loaded), "loading", "not-found", "error", or "none" (this item type has no detail source, so only the opener\'s name/about are shown). Always populated while the window is mounted.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "record_data",
    sortOrder: 400,
  },
  {
    name: "field_count",
    label: "Rendered field count",
    description:
      "Number of populated fields the dossier is rendering (plumbing columns like id/user_id/organization_id are excluded). 0 whenever the row did not load or carries nothing to show.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    group: "record_data",
    sortOrder: 410,
  },
  {
    name: "record_fields",
    label: "Rendered fields",
    description:
      "The rendered dossier as an object of `<Field label>: <formatted value>` pairs — exactly what the user is looking at, already date/number/JSON-formatted, with plumbing columns removed. Absent until a row loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    group: "record_data",
    sortOrder: 420,
  },
];

export const itemDetailManifest: SurfaceManifest = {
  surfaceName: ITEM_DETAIL_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Declared and emitted 2026-08-24 when the window got its own right-click menu (before that, a right-click inside the floating dossier was answered by the page underneath). `partial` because the surface is generic over every item type: the value set is complete for the dossier itself, but nobody has yet walked a spread of item types through it live to confirm the emitted scope reads well for each.",
  overlayId: "itemDetailWindow",
  label: "Item Detail",
  intro: `<surface_intro>
You are in the floating Item Detail window — the platform's generic record dossier. It is the peek target for any entity that has no richer window of its own, so the record on screen can be almost anything: an agent, a project, a note, a file, a keyword. item_type and item_label say which; item_id and item_title identify the row.

The dossier is a DOCUMENT ABOUT A RECORD, not an editor. content is the whole dossier as readable text and record_fields is the same thing keyed by field label — read one of those rather than guessing at columns. record_status tells you whether a row actually loaded: "none" means this item type has no detail source at all, so the only facts available are the title and the opener's one-liner in item_about.

Nothing here is editable and nothing here is saved. The useful work is reading, summarising, comparing, and explaining the record the user is looking at.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper — required keys mirror every `alwaysAvailable:
 * true` value above; optional keys mirror the rest.
 */
export function createItemDetailScope(values: {
  item_type: string;
  item_label: string;
  item_title: string;
  record_status: string;
  field_count: number;
  content: string;
  item_id?: string;
  item_about?: string;
  record_fields?: Record<string, string>;
  selection?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
