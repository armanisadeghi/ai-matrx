/**
 * Surface manifest — visual map editor (`matrx-user/maps`).
 *
 * A map is a non-executable canvas diagram. The runtime exposes the complete
 * canonical DiagramData document so a bound agent can reason about every box,
 * section, arrow, position, and visual option, then propose a full replacement
 * through the declared write target.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import type { DiagramData } from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const MAPS_SURFACE_NAME = "matrx-user/maps";

const groups: SurfaceValueGroup[] = [
  {
    key: "map_identity",
    label: "Map identity",
    sortOrder: 100,
    description: "The open map and its human-facing name and description.",
  },
  {
    key: "map_structure",
    label: "Map structure",
    sortOrder: 200,
    description:
      "The complete visual document plus its boxes, sections, arrows, positions, and counts.",
  },
  {
    key: "map_selection",
    label: "Current focus",
    sortOrder: 300,
    description: "The box, section, or arrow the user currently has selected.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "map_id",
    label: "Map ID",
    description:
      "UUID of the visual map open in the editor. Always populated while this surface is mounted.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "map_identity",
    sortOrder: 100,
  },
  {
    name: "map_title",
    label: "Map title",
    description:
      "The live title shown above the open map, including unsaved local edits.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "map_identity",
    sortOrder: 110,
  },
  {
    name: "map_description",
    label: "Map description",
    description:
      "Optional description stored inside the visual map document. Empty when the map has no description.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "map_identity",
    sortOrder: 120,
  },
  {
    name: "map_summary",
    label: "Map summary",
    description:
      "Compact composite { id, title, description, box_count, section_count, arrow_count } for the open map.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 320,
    group: "map_identity",
    sortOrder: 130,
  },
  {
    name: "map_json",
    label: "Complete map",
    description:
      "The complete canonical DiagramData object: title, description, type, boxes/sections in nodes, arrows in edges, layout, and render hints. Positions of boxes inside sections are relative to their parentId.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 12000,
    group: "map_structure",
    sortOrder: 200,
  },
  {
    name: "map_boxes",
    label: "Boxes and sections",
    description:
      "Every visual item in order. Sections have isGroup=true; a box inside one carries parentId and a section-relative position.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 7000,
    group: "map_structure",
    sortOrder: 210,
  },
  {
    name: "map_arrows",
    label: "Arrows",
    description:
      "Every arrow with source/target box ids, optional label, path type, line style, animation, and arrowhead setting.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    group: "map_structure",
    sortOrder: 220,
  },
  {
    name: "box_count",
    label: "Box count",
    description:
      "Number of ordinary boxes on the open map, excluding sections.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "map_structure",
    sortOrder: 230,
  },
  {
    name: "section_count",
    label: "Section count",
    description: "Number of visual sections grouping boxes on the open map.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "map_structure",
    sortOrder: 240,
  },
  {
    name: "arrow_count",
    label: "Arrow count",
    description: "Number of arrows on the open map.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "map_structure",
    sortOrder: 250,
  },
  {
    name: "selected_item_kind",
    label: "Selected item type",
    description:
      '"box", "section", or "arrow" for the item the user clicked. Empty when nothing is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "map_selection",
    sortOrder: 300,
  },
  {
    name: "selected_item_id",
    label: "Selected item ID",
    description:
      "Stable id of the selected box, section, or arrow. Empty when nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "map_selection",
    sortOrder: 310,
  },
  {
    name: "selected_item",
    label: "Selected item",
    description:
      "The complete selected box/section or arrow object. Empty when nothing is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    group: "map_selection",
    sortOrder: 320,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "replace_map",
    label: "Replace complete map",
    description:
      "Replaces and immediately saves the COMPLETE DiagramData object for the open map after user confirmation. Read map_json first and include every box, section, arrow, id, position, and visual option that should remain; this is replacement, not merge. Pass the object itself, not a JSON string.",
    valueType: "object",
    updatesValue: "map_json",
    mode: "entity",
    applyPolicy: "ask",
    group: "map_structure",
    sortOrder: 200,
  },
];

export const mapsManifest: SurfaceManifest = {
  surfaceName: MAPS_SURFACE_NAME,
  readiness: "verified",
  label: "Visual Maps",
  urlPattern: "/maps/[id]",
  intro: `<surface_intro>
You are in Visual Maps, a deliberately non-executable thinking canvas. The user is arranging ideas, systems, relationships, and plans as boxes, visual sections, and arrows; nothing here runs as a workflow. map_json is the complete authoritative document and map_boxes / map_arrows are convenient read twins. A section is a node with isGroup=true; boxes inside it carry parentId and section-relative positions. Read the complete map before proposing replace_map, preserve stable ids and positions for anything that remains, and never turn this map into executable workflow semantics.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export interface MapSurfaceSelection {
  kind: "box" | "section" | "arrow" | null;
  id: string | null;
}

export function createMapsScope(values: {
  map_id: string;
  map_title: string;
  map_summary: Record<string, unknown>;
  map_json: DiagramData;
  map_boxes: DiagramData["nodes"];
  map_arrows: DiagramData["edges"];
  box_count: number;
  section_count: number;
  arrow_count: number;
  content: string;
  context: Record<string, unknown>;
  map_description?: string;
  selected_item_kind?: Exclude<MapSurfaceSelection["kind"], null>;
  selected_item_id?: string;
  selected_item?: DiagramData["nodes"][number] | DiagramData["edges"][number];
}): SurfaceScopePayload {
  return values;
}
