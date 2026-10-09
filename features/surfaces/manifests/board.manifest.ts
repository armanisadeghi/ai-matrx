/**
 * Surface manifest — Board (`matrx-user/board`).
 *
 * The surface key keeps its original name: it is a row in `ui.ui_surface`
 * and the server (aidream) resolves it. Renaming it is a data migration, not
 * a code edit — see the Board FEATURE.md.
 *
 * Any Board (features/board): the /demos/board proof, and every
 * host that mounts `BoardSurface` — War Room's Board view, the meeting
 * Board layout, a workflow run's Board view. Its job is the ACTION vocabulary:
 * the board's agent tools (`features/board/tools/board-tools.ts`) are
 * declared here once, so every agent working while a board is on screen can
 * read it and add, edit, move, arrange, group, connect, park and remove tiles.
 * A board inside another surface (a War Room) stacks on top of it — the host
 * surface keeps its own values and tools.
 *
 * Runtime emitter: `features/board/components/BoardSurface.tsx`.
 */

import type { SurfaceManifest, SurfaceValue, SurfaceValueGroup } from "@ai-matrx/chat/surfaces/types";
import { BOARD_CLIENT_TOOLS } from "@/features/board/tools/board-tools";
import { mergeBaselineValues } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";

export const BOARD_SURFACE_NAME = "matrx-user/board";

const groups: SurfaceValueGroup[] = [
  {
    key: "board",
    label: "Board",
    sortOrder: 100,
    description: "What is on the Board and what the person is looking at.",
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
    name: "board_items",
    label: "Items on the board",
    description:
      "Every item on the board: {live_item_ids, item_count, omitted_count, items, limits}. Each item is {id, title, kind, surface, live, selected?, parked?, removed?, basics?, basics_at?, basics_stale?, full_values?, basics_note?}. `surface` names the item's feature surface (null for board-only content). The LIVE item's full surface is already in your context as that surface; a selected item that is not live carries `full_values`. `basics` are a few of every other item's own values (a note's title and first line with its word count, a table's name and row count, a task's status and due date), bounded by `limits` — fewer and shorter as the board grows. An item whose tile is asleep carries its last-known basics with `basics_at` (when they were taken); `basics_stale: true` means only its type and name are known so far. Every item on this board — a note, a table, a list, a task, a file — is reached with board_open_item(id) then board_item_act(id, …), in this same turn; do not look for them with knowledge_search or the data tool, and do not call apply_surface_write for an item that is not live.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    // Always inline in the first request (the server's default inlines only values under 200 chars):
    // = BOARD_ITEMS_INLINE_CHARS in features/board/tools/item-surfaces.ts, which the value never outgrows.
    inlineUpTo: 24_000,
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

export const boardManifest: SurfaceManifest = {
  surfaceName: BOARD_SURFACE_NAME,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  label: "Board",
  description:
    "An infinite, zoomable board of tiles — live AI results, notes, pages and images grouped into frames — that the person pans and zooms like a map.",
  executionMode: "python-stream",
  agentRosterMode: "universal",
  contextBudgetApproval:
    "Arman 2026-10-04: \"the agent should instantly know the basics of what I have on my board and if I have one selected, then it should have the full data for that one ... it always sees enough to know what I'm talking about and has id references\" — board_items (every item's basics, 8,000, plus a non-live selected tile's full values, 12,000, plus ids) is always inline, up to 24,000.",
  readiness: "partial",
  readinessNote:
    "Board agent tools live on every mounted board (read, add, add items, find records, edit, move, arrange, group, connect, draw shapes, focus, open item, act on item, park, remove, undo). board_add_items puts the person's real records (or new ones) on the person's own Board; board_find_records finds them by name across every organization. board_items names every item with its basics; board_open_item / board_item_act reach any item's own surface on the person's Board (hosts that keep no per-tile capture list identity only); board_read carries positions and excerpts.",
  urlPattern: "/demos/board",
  intro: `<surface_intro>
The person is looking at a Board: an infinite, zoomable plane of tiles (live AI results, notes, rendered markdown, generated pages, images, meeting parts, workflow steps) grouped into named frames. They pan and zoom it like a map.
You can WORK ON THE BOARD with the board_* tools, and every change you make lands on the person's undo stack like their own:
- board_read first — it returns every tile's id, rect (board pixels; x right, y down) and a text excerpt, plus frames and connections.
- board_add_items to put the person's REAL records on the board as live tiles, many in one call: an existing note, file, chat, document, table, picklist, task, War Room, meeting, workflow run, research topic, project, flashcard deck or scope by {type, id}, or a new blank one with {type, new: true}. A record already on the board is reported, not doubled.
- board_find_records finds the person's records by name across all their organizations and returns {type, id, title} ready for board_add_items. knowledge_search finds by content; its ids work in board_add_items too.
- GATHERING A TOPIC ("I'm working on X — put everything about it on my board"): board_find_records with the topic's distinctive words (try a second wording if little comes back) → keep only what is really about the topic → board_add_items with those → board_group them in a frame titled for the topic with tidy: true. Say what you added and what you left out.
- board_add_tile for content you write yourself: a note (a real saved Note), markdown for write-ups, text for a heading, html for a visual you wrote, image by URL. Leave out x/y and it lands in free space near what they are looking at; tiles never land on each other.
- board_update_tile, board_move_tiles, board_arrange (tidy / grid / row / column / align / distribute), board_group (a named frame), board_connect, board_park, board_focus (show them a tile), board_remove_tile (they can undo), board_undo.
- board_shape to SKETCH: rectangles and ovals with text, lines and arrows (from_id/to_id bind an end to a tile or shape so it follows it), pen strokes, each with a colour, fill, weight and dash; create, update or delete in one call. Use it to draw a diagram or a flow beside the tiles; board_read lists every shape.
- Working INSIDE items (rewrite a note, fix a table, change a task, act on a file) — any of them, in ONE turn:
  - The LIVE item (the one the person has selected or is working in) arrives in full: its feature's own values, write targets and tools, exactly as on its own page.
  - These items are NOT found by knowledge_search or the data tool, and apply_surface_write only reaches the live one: board_items is the list, board_open_item is the way in.
  - board_items names EVERY other item — id, title, kind, surface — with a few basics, so you know what each one is.
  - For any other item: board_open_item(id) returns its values and its controls (write targets and tools, as its page offers them), then board_item_act(id, target + value, or tool + input) changes it through the item's own rules — the person approves where that item asks. Open as many items as the request needs; you never have to wait a turn.
Prefer arranging and grouping over describing where things are. Ask before removing something the person made.
</surface_intro>`,
  groups,
  values: mergeBaselineValues([], values),
  otherItemsHint:
    "This page is a Board. The targets listed below are only for the LIVE item. Any other item on the board (see board_items) is reached with board_open_item(id), then board_item_act(id, target + value) — that is how you read or change a note, table, list or task that is not live. Do not search for board items with knowledge_search.",
  hostLead:
    "The surface you are on is one item on the person's Board (the live tile). board_items lists every item (id, kind, name, basics). Reach any other with board_open_item(id), then board_item_act(id, target + value or tool + input) — never knowledge_search.",
  clientTools: BOARD_CLIENT_TOOLS,
};
