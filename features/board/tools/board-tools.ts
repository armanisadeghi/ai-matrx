/**
 * The board's AGENT TOOLS — what any agent working beside a Board can
 * do to it. Declared once here and carried by the `matrx-user/board`
 * surface manifest, so every board host (the demo, War Room, meetings,
 * workflow runs) offers the same vocabulary. Executed in the browser by
 * `useBoardAgentTools`, through the board's ONE change path (`useBoard`, or a
 * host's adapter over its own layout model), so an agent's change is animated,
 * undoable where the board has undo, and saved exactly like a person's. A tool
 * a board cannot honour answers `{ok:false, error}` naming what to do instead.
 *
 * World coordinates: x grows right, y grows down, in board pixels (a tile is
 * typically 360–720 wide). `board_read` returns every rect, so an agent never
 * has to guess positions.
 */

import type { SurfaceClientTool } from "@ai-matrx/chat/surfaces/types";

export const BOARD_TILE_KINDS = ["note", "markdown", "text", "html", "image"] as const;
export type BoardTileKindInput = (typeof BOARD_TILE_KINDS)[number];

/**
 * Every item type an agent can put on a board with `board_add_items` — a catalog key
 * (`items/catalog.ts` `BOARD_ITEM_TYPES`) whose type has a record door or a "new" entry.
 * A literal so the manifest never imports the catalog's tile bodies; the guard
 * `__tests__/board-add-items.test.ts` fails when it and the catalog disagree.
 */
export const BOARD_ADDABLE_ITEM_KEYS = [
  "chat",
  "agent-form",
  "note",
  "file",
  "udt_document",
  "data-table",
  "list",
  "task",
  "war-room",
  "meeting",
  "workflow-run",
  "research",
  "project",
  "fc_set",
  "study-kit",
  "scope",
  "label",
  "social-post",
  "social-profile",
  "social-outlier-feed",
  "social-ad",
  "social-swipe-collection",
] as const;

/** Item types `board_find_records` searches (each has a search token or a finder). */
export const BOARD_FINDABLE_ITEM_KEYS = [
  "chat",
  "note",
  "file",
  "udt_document",
  "data-table",
  "list",
  "task",
  "war-room",
  "research",
  "project",
  "fc_set",
  "scope",
  "meeting",
  "workflow-run",
  "study-kit",
] as const;

/** Most entries one `board_add_items` call places. */
export const BOARD_ADD_ITEMS_MAX = 40;
/** Most candidates one `board_find_records` call returns. */
export const BOARD_FIND_RECORDS_MAX = 50;

const idsProp = {
  type: "array" as const,
  items: { type: "string" as const },
  description: "Tile ids, as returned by board_read. Omit to act on every tile on the board.",
};

export const BOARD_CLIENT_TOOLS: SurfaceClientTool[] = [
  {
    name: "board_read",
    label: "Read board",
    description:
      "Returns what is on the Board right now: every tile (id, title, kind, status, rect {x,y,w,h} in board pixels, parked or not, and a text excerpt of its content), every frame (named region: id, title, rect), connections between tiles, every drawn shape (id, kind, rect, style, text, the ids its line/arrow ends are bound to), the selected and focused tile, which tiles are in the person's view, and `live_tile_id` — the tile whose feature is live for you. A tile with a `surface` is a real feature record: read and change it with board_open_item and board_item_act. Call this before arranging so you act on real ids and positions. Excerpts are capped; the result says how many tiles were left out.",
    inputSchema: {
      type: "object",
      properties: {
        include_text: { type: "boolean", description: "Include text excerpts (default true)." },
      },
      required: [],
    },
    mode: "ui",
  },
  {
    name: "board_add_tile",
    label: "Add tile",
    description:
      "Adds a tile to the board. Kinds: `note` (a real Note saved in the person's Notes, editable and commentable — use for thoughts, summaries, to-dos), `markdown` (rendered markdown: headings, lists, tables, code — use for reports and structured write-ups), `text` (plain text right on the canvas, no box — a heading or caption; it is a canvas object, edited and styled with board_shape), `html` (a self-contained HTML page you wrote, shown sandboxed — use for visual explainers, mockups, charts), `image` (an image by URL). Placement: give `x`/`y` for an exact spot, or `near_tile_id` to place it beside that tile, or nothing to land in the nearest free space to what the person is looking at. Tiles never land on top of each other. Returns the new tile's id and rect. Not every board supports every kind; the result says so if not.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...BOARD_TILE_KINDS], description: "What the tile holds." },
        title: { type: "string", description: "Short title shown in the tile header." },
        text: { type: "string", description: "Content for note / markdown / text tiles." },
        html: { type: "string", description: "Complete HTML document for an html tile (scripts allowed; it runs sandboxed)." },
        url: { type: "string", description: "Image URL for an image tile, or a page URL for an html tile." },
        width: { type: "number", description: "Tile width in board pixels (default depends on kind)." },
        height: { type: "number", description: "Tile height in board pixels." },
        x: { type: "number", description: "Left edge in board pixels (with y: exact placement)." },
        y: { type: "number", description: "Top edge in board pixels." },
        near_tile_id: { type: "string", description: "Place beside this tile instead." },
      },
      required: ["kind"],
    },
    mode: "draft",
  },
  {
    name: "board_add_items",
    label: "Add items",
    description:
      "Puts the person's REAL records on the board as live tiles, several at once, as one undoable step: an existing record by `id` (a note, file, chat, document, table, picklist, task, War Room, meeting, workflow run, research topic, project, flashcard deck, scope… — ids from board_find_records or knowledge_search), or a NEW one with `new: true` (a blank note, task, table, document… the person fills in). Each tile is the feature itself, exactly as when the person brings it in from the Add menu. A record already on this board is not added twice: its entry answers `already_on_board` with that tile's id. A type whose new one needs the person's choice first (a meeting, a workflow run, a chat with an agent) answers `needs_person`. Placement: per entry `near_tile_id` or `x`/`y`, else the items fill free space in reading order near what the person is looking at. Returns one result per entry, in order, with each new tile's id. To gather a topic: board_find_records → board_add_items → board_group (a frame named for the topic, tidy: true).",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          maxItems: BOARD_ADD_ITEMS_MAX,
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: [...BOARD_ADDABLE_ITEM_KEYS], description: "The item type (as board_find_records returns it)." },
              id: { type: "string", description: "The existing record's id. Omit with new: true." },
              new: { type: "boolean", description: "Start a new, blank one of this type instead." },
              title: { type: "string", description: "Tile title (default: the record's name)." },
              near_tile_id: { type: "string", description: "Place beside this tile." },
              x: { type: "number", description: "Left edge in board pixels (with y)." },
              y: { type: "number", description: "Top edge in board pixels." },
            },
            required: ["type"],
          },
        },
      },
      required: ["items"],
    },
    mode: "draft",
  },
  {
    name: "board_find_records",
    label: "Find records",
    description:
      "Finds the person's own records by name across every organization they belong to — notes, files, chats, documents, tables, picklists, tasks, War Rooms, research topics, projects, flashcard decks, scopes, meetings, workflow runs, study kits — so you can put them on the board. Data records and meeting notes cannot be searched (the person brings those in from the Add menu, or you place one by id). Returns candidates `{type, id, title, updated_at, snippet?}`; pass `type` and `id` straight to board_add_items. Trashed and archived records are left out. Matches names (titles), not body text: search the topic's distinctive words (\"Harborview\", not \"move\"), and try a second wording if the first finds little. knowledge_search finds by content too; its note, file, task, project and conversation ids work in board_add_items as well (a conversation is type `chat`). For a topic: find, add the relevant ones (leave out what is not about the topic), then board_group them in a frame named for the topic.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words in the records' names." },
        types: {
          type: "array",
          items: { type: "string", enum: [...BOARD_FINDABLE_ITEM_KEYS] },
          description: "Only these item types (default: all).",
        },
        limit: { type: "number", description: `Most candidates to return (default 25, at most ${BOARD_FIND_RECORDS_MAX}).` },
      },
      required: ["query"],
    },
    mode: "ui",
  },
  {
    name: "board_update_tile",
    label: "Edit tile",
    description:
      "Changes a tile: its `title`, and for note / markdown / text / html tiles its content (`text` or `html` replaces the content entirely), and optionally its size. Live results (streams, records) keep their content; only their title and size can change. Returns the tile's id and rect.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Tile id from board_read." },
        title: { type: "string" },
        text: { type: "string", description: "New full content for note / markdown / text tiles." },
        html: { type: "string", description: "New full HTML for an html tile." },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["id"],
    },
    mode: "draft",
  },
  {
    name: "board_remove_tile",
    label: "Remove tile",
    description:
      "Takes a tile off the board. Only the tile leaves — a Note it showed stays in Notes, a result stays in its run. The person gets an Undo right away, and ⌘Z also brings it back. Confirm with the person before removing something they made.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Tile id from board_read." } },
      required: ["id"],
    },
    mode: "draft",
  },
  {
    name: "board_move_tiles",
    label: "Move tiles",
    description:
      "Moves tiles (and frames) to exact positions, as one undoable step. Each move is {id, x, y} — the new top-left in board pixels. Sizes do not change. Use board_arrange instead for layouts.",
    inputSchema: {
      type: "object",
      properties: {
        moves: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, x: { type: "number" }, y: { type: "number" } },
            required: ["id", "x", "y"],
          },
        },
      },
      required: ["moves"],
    },
    mode: "draft",
  },
  {
    name: "board_arrange",
    label: "Arrange tiles",
    description:
      "Arranges tiles without resizing them, as one undoable step, starting where the group already is (or at `x`/`y`). Layouts: `grid` (`columns` per row), `tidy` (grid with even column widths — cleanest for mixed sizes), `row`, `column`; `align` lines them up on an `edge` (left, center, right, top, middle, bottom); `distribute` spaces them evenly along an `axis` (horizontal, vertical). Order follows how the tiles read now (top-to-bottom, left-to-right). Returns every new rect.",
    inputSchema: {
      type: "object",
      properties: {
        layout: { type: "string", enum: ["grid", "tidy", "row", "column", "align", "distribute"] },
        ids: idsProp,
        columns: { type: "number", description: "For grid / tidy." },
        gap: { type: "number", description: "Space between tiles in board pixels (default 48)." },
        edge: { type: "string", enum: ["left", "center", "right", "top", "middle", "bottom"], description: "For align." },
        axis: { type: "string", enum: ["horizontal", "vertical"], description: "For distribute." },
        x: { type: "number", description: "Start the layout here instead." },
        y: { type: "number" },
      },
      required: ["layout"],
    },
    mode: "draft",
  },
  {
    name: "board_group",
    label: "Group in a frame",
    description:
      "Draws a named frame around tiles to group them into a region the person can fly to (frames are how a big board keeps its map). Optionally tidies them first. Returns the frame id and rect.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Tiles to enclose." },
        title: { type: "string", description: "The frame's name." },
        tidy: { type: "boolean", description: "Arrange the tiles in a tidy grid first (default false)." },
      },
      required: ["ids", "title"],
    },
    mode: "draft",
  },
  {
    name: "board_connect",
    label: "Connect tiles",
    description:
      "Draws a connection from one tile to another — a hand-off, a dependency, a 'see also'. Returns the connection id. Connections follow their tiles when they move.",
    inputSchema: {
      type: "object",
      properties: {
        from_id: { type: "string" },
        to_id: { type: "string" },
      },
      required: ["from_id", "to_id"],
    },
    mode: "draft",
  },
  {
    name: "board_shape",
    label: "Draw shapes",
    description:
      "Draws, changes or erases shapes on the Board so you can sketch a diagram: rectangles and ovals (with centred text), lines and arrows, pen strokes, sticky notes and plain text. One call is ONE undoable step. action \"create\": each entry has `kind` (rect | oval | line | arrow | pen | sticky | text); a rect/oval takes `x`,`y`,`w`,`h` (board px; default 240x160 at the view centre) and optional `text`; a line/arrow joins `from_id` → `to_id` (tile ids, shape ids, or the `ref` of a shape created earlier in the same call — its ends then FOLLOW those objects when they move) or goes between points `from` {x,y} → `to` {x,y}; a pen stroke takes `points` [{x,y}…]; a `sticky` (sticky note: a coloured square card with words, saved as a Note in the person's Sticky notes folder) takes `text`, optional `x`,`y`,`w`,`h` (default 220x220 at the view centre) and `color` (yellow, orange, pink, violet, blue, green); plain `text` (words on the canvas, no box) takes `text`, optional `x`,`y` and `w` (a width makes it wrap), `text_size`, `text_weight` (normal|bold), `stroke` (its colour) and `text_align`. An arrow between two TILES is a connection (the same as board_connect: it hands a chat tile the other tile's content). Style on any entry: `stroke` and `fill` (ink, slate, blue, violet, rose, orange, amber, emerald, teal; fill also none), `size` (s|m|l|xl), `dash` (solid|dashed|dotted), `opacity` (0.1–1), `text_size` (s|m|l|xl), `text_align` (start|center|end). action \"update\": entries carry `id` plus any of the fields above (`x`,`y`,`w`,`h` move or resize it; `from_id`/`to_id` rebind an end). action \"delete\": `ids`. Returns the shape ids in order. board_read lists every shape with its id, kind, rect, style and text (a sticky also its note_id).",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "update", "delete"] },
        shapes: {
          type: "array",
          description: "For create / update.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "update: the shape to change." },
              ref: { type: "string", description: "create: a name later entries in this call can bind to." },
              kind: { type: "string", enum: ["rect", "oval", "line", "arrow", "pen", "sticky", "text"] },
              color: { type: "string", enum: ["yellow", "orange", "pink", "violet", "blue", "green"], description: "A sticky note's colour." },
              text_weight: { type: "string", enum: ["normal", "bold"], description: "Plain text's weight." },
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
              text: { type: "string" },
              from_id: { type: "string" },
              to_id: { type: "string" },
              from: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
              to: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } },
              points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } },
              stroke: { type: "string" },
              fill: { type: "string" },
              size: { type: "string", enum: ["s", "m", "l", "xl"] },
              dash: { type: "string", enum: ["solid", "dashed", "dotted"] },
              opacity: { type: "number" },
              text_size: { type: "string", enum: ["s", "m", "l", "xl"] },
              text_align: { type: "string", enum: ["start", "center", "end"] },
            },
          },
        },
        ids: { type: "array", items: { type: "string" }, description: "For delete." },
      },
      required: ["action"],
    },
    mode: "draft",
  },
  {
    name: "board_focus",
    label: "Show tile",
    description:
      "Shows the person a tile and makes it the LIVE tile: `fly` glides the camera to it and selects it (default); `focus` opens it full-size over the board (they press Esc to return). Changes nothing on the board. To READ or CHANGE what is inside a tile, use board_open_item and board_item_act — they work in this same turn.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        mode: { type: "string", enum: ["fly", "focus"] },
      },
      required: ["id"],
    },
    mode: "ui",
  },
  {
    name: "board_open_item",
    label: "Open item",
    description:
      "Opens ANY item on the board for you, in this same turn — including ones the person is not working in. Returns the item's feature surface exactly as its own page gives it: `values` (each declared value with its description: a note's title and text, a table's rows, a task's fields…), `write_targets` (every change you may make, one line each: its name, the value's type, whether the person is asked first, and what it does), `patch_contract` when a target takes an anchored edit, and `client_tools` (the item's own actions, with their input schemas). It also selects the item so the person sees which one you are working in (an item parked on the shelf comes back onto the board). Use the ids from `board_items`. Then act with board_item_act. The live item's full surface is already in your context — you only need this for the others.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The item's id, from board_items or board_read." },
      },
      required: ["id"],
    },
    mode: "ui",
  },
  {
    name: "board_item_act",
    label: "Act on item",
    description:
      "Applies ONE of an item's write targets, or runs ONE of its client tools, exactly as on the item's own page — in this same turn, whether or not the item is live. Pass `target` and `value` for a write (shaped as its line in board_open_item says: an object or array target takes the object or array itself; a [patchable] target also takes an anchored edit), or `tool` and `input` for a tool. The item's own rules apply: a value of the wrong type or shape is refused before the person is asked, a target marked 'the user is asked first' shows the person an approval card and waits for their answer (a decline is an answer — respect it, do not retry), and the result says what landed. Call board_open_item first so you use the item's real target and tool names.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The item's id." },
        target: { type: "string", description: "A write target from the item's write_targets." },
        value: {
          type: ["string", "number", "boolean", "array", "object", "null"],
          description: "The value for `target`, shaped as that target's line says.",
        },
        tool: { type: "string", description: "Or: a tool from the item's client_tools." },
        input: { type: "object", description: "The tool's input, matching its input_schema." },
      },
      required: ["id"],
    },
    mode: "draft",
  },
  {
    name: "board_park",
    label: "Park tile",
    description:
      "Moves a tile onto the board's side shelf (`parked: true`) to clear space without removing it, or brings it back to where it was (`parked: false` — this also restores a tile board_read lists as `removed`).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, parked: { type: "boolean" } },
      required: ["id", "parked"],
    },
    mode: "draft",
  },
  {
    name: "board_undo",
    label: "Undo",
    description:
      "Undoes the most recent change on the board (yours or the person's), exactly like ⌘Z. Use it to take back a change the person did not want.",
    inputSchema: { type: "object", properties: {}, required: [] },
    mode: "draft",
  },
];
