/**
 * Surface manifest — Spatial board (`matrx-user/spatial-board`).
 *
 * Any spatial board (features/spatial): the /demos/spatial proof, and every
 * host that mounts `SpatialBoardSurface` — War Room's Board view, the meeting
 * Board layout, a workflow run's Board view. Its job is the ACTION vocabulary:
 * the board's agent tools (`features/spatial/tools/board-tools.ts`) are
 * declared here once, so every agent working while a board is on screen can
 * read it and add, edit, move, arrange, group, connect, park and remove tiles.
 * A board inside another surface (a War Room) stacks on top of it — the host
 * surface keeps its own values and tools.
 *
 * Runtime emitter: `features/spatial/components/SpatialBoardSurface.tsx`.
 */

import type { SurfaceManifest, SurfaceValue, SurfaceValueGroup } from "@/features/surfaces/types";
import { BOARD_CLIENT_TOOLS } from "@/features/spatial/tools/board-tools";
import { mergeBaselineValues } from "./_baseline.manifest";

export const SPATIAL_BOARD_SURFACE_NAME = "matrx-user/spatial-board";

const groups: SurfaceValueGroup[] = [
  {
    key: "board",
    label: "Board",
    sortOrder: 100,
    description: "What is on the spatial board and what the person is looking at.",
  },
];

const values: SurfaceValue[] = [
  {
    name: "board_title",
    label: "Board",
    description: "The board's name.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "board",
    sortOrder: 100,
  },
  {
    name: "board_tiles",
    label: "Tiles on the board",
    description:
      "Every tile as {id, title, kind, parked}. Positions and content excerpts come from the board_read tool.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    group: "board",
    sortOrder: 110,
  },
  {
    name: "selected_tile",
    label: "Selected tile",
    description: "The tile the person has selected, as {id, title, kind}; null when none.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "board",
    sortOrder: 120,
  },
];

export const spatialBoardManifest: SurfaceManifest = {
  surfaceName: SPATIAL_BOARD_SURFACE_NAME,
  client: "matrx-user",
  label: "Spatial board",
  description:
    "An infinite, zoomable board of tiles — live AI results, notes, pages and images grouped into frames — that the person pans and zooms like a map.",
  executionMode: "python-stream",
  agentRosterMode: "universal",
  readiness: "partial",
  readinessNote:
    "Board agent tools live on every mounted board (read, add, edit, move, arrange, group, connect, focus, park, remove, undo). Values are a compact overview; board_read carries positions and excerpts.",
  urlPattern: "/demos/spatial",
  intro: `<surface_intro>
The person is looking at a spatial board: an infinite, zoomable plane of tiles (live AI results, notes, rendered markdown, generated pages, images, meeting parts, workflow steps) grouped into named frames. They pan and zoom it like a map.
You can WORK ON THE BOARD with the board_* tools, and every change you make lands on the person's undo stack like their own:
- board_read first — it returns every tile's id, rect (board pixels; x right, y down) and a text excerpt, plus frames and connections.
- board_add_tile to put something new on the board: a note (a real saved Note), markdown for write-ups, text for a heading, html for a visual you wrote, image by URL. Leave out x/y and it lands in free space near what they are looking at; tiles never land on each other.
- board_update_tile, board_move_tiles, board_arrange (tidy / grid / row / column / align / distribute), board_group (a named frame), board_connect, board_park, board_focus (show them a tile), board_remove_tile (they can undo), board_undo.
- Working INSIDE a tile (rewrite a note, change a task, act on a file): the selected tile is LIVE — its feature's own values, write targets and tools come to you as that feature's surface, exactly as on its own page. board_read names each tile's surface and the live one; to work in another tile, board_focus it, then act on your next turn.
Prefer arranging and grouping over describing where things are. Ask before removing something the person made.
</surface_intro>`,
  groups,
  values: mergeBaselineValues([], values),
  clientTools: BOARD_CLIENT_TOOLS,
};
