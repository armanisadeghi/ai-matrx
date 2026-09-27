/**
 * The board's AGENT TOOLS — what any agent working beside a spatial board can
 * do to it. Declared once here and carried by the `matrx-user/spatial-board`
 * surface manifest, so every board host (the demo, War Room, meetings,
 * workflow runs) offers the same vocabulary. Executed in the browser by
 * `useBoardAgentTools`, through the board's ONE change path (`useBoard`), so an
 * agent's change is animated, undoable (⌘Z) and saved exactly like a person's.
 *
 * World coordinates: x grows right, y grows down, in board pixels (a tile is
 * typically 360–720 wide). `board_read` returns every rect, so an agent never
 * has to guess positions.
 */

import type { SurfaceClientTool } from "@/features/surfaces/types";

export const BOARD_TILE_KINDS = ["note", "markdown", "text", "html", "image"] as const;
export type BoardTileKindInput = (typeof BOARD_TILE_KINDS)[number];

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
      "Returns what is on the spatial board right now: every tile (id, title, kind, status, rect {x,y,w,h} in board pixels, parked or not, and a text excerpt of its content), every frame (named region: id, title, rect), connections between tiles, the selected and focused tile, and which tiles are in the person's view. Call this before arranging or editing so you act on real ids and positions. Excerpts are capped; the result says how many tiles were left out.",
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
      "Adds a tile to the board. Kinds: `note` (a real Note saved in the person's Notes, editable and commentable — use for thoughts, summaries, to-dos), `markdown` (rendered markdown: headings, lists, tables, code — use for reports and structured write-ups), `text` (a large on-board label or heading), `html` (a self-contained HTML page you wrote, shown sandboxed — use for visual explainers, mockups, charts), `image` (an image by URL). Placement: give `x`/`y` for an exact spot, or `near_tile_id` to place it beside that tile, or nothing to land in the nearest free space to what the person is looking at. Tiles never land on top of each other. Returns the new tile's id and rect. Not every board supports every kind; the result says so if not.",
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
    name: "board_focus",
    label: "Show tile",
    description:
      "Moves the person's view to a tile so they see what you are talking about: `fly` glides the camera to it (default); `focus` opens it full-size over the board (they press Esc to return). Changes nothing on the board.",
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
    name: "board_park",
    label: "Park tile",
    description:
      "Moves a tile onto the board's side shelf (`parked: true`) to clear space without removing it, or brings it back to where it was (`parked: false`).",
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
