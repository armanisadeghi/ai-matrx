/**
 * THE BRIDGE — an agent reaches every item on a board in two requests.
 *
 * Two note tiles on one board; only the selected one is LIVE (registered
 * globally). Pins, through the real board surface and the real runtimes:
 *  - request one: `board_items` names both items, and carries the DORMANT
 *    one's basics from its own surface (the live one's full surface is the
 *    surface chain's job, so it carries none — no doubling);
 *  - request two: `board_open_item` on the dormant note returns its declared
 *    values with descriptions and its controls (write targets as the tool
 *    injection offers them, client tools with schemas), and selects it;
 *  - `board_item_act` sets the dormant note's title through the ONE writeback
 *    seam: an `ask` target raises THIS call's approval card, and the answer
 *    is the same envelope `apply_surface_write` gives on the page;
 *  - a value the item's rules refuse never reaches the person.
 */
const TEST_NOTE = "matrx-user/test-board-note";

jest.mock("@/features/surfaces/manifests/registry", () => {
  const { boardManifest } = jest.requireActual(
    "@/features/surfaces/manifests/board.manifest",
  );
  const note = {
    surfaceName: "matrx-user/test-board-note",
    label: "Test note",
    description: "One note.",
    briefValues: ["note_title", "note_body"],
    values: [
      { name: "note_title", label: "Title", description: "The note's title.", valueType: "string" },
      { name: "note_body", label: "Body", description: "The note's text.", valueType: "string" },
    ],
    writeTargets: [
      {
        name: "note_title_set",
        label: "Note title",
        description: "Rename the note.",
        valueType: "string",
        mode: "entity",
        applyPolicy: "ask",
        updatesValue: "note_title",
      },
    ],
    clientTools: [
      {
        name: "note_count_words",
        label: "Count words",
        description: "Counts the note's words.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ],
  };
  const all = [boardManifest, note];
  return {
    getManifest: (name: string) => all.find((m) => m.surfaceName === name),
    getAllManifests: () => all,
    // The index + body seam (jest.setup registers the package source from these).
    getRawManifest: (name: string) => all.find((m) => m.surfaceName === name),
    getSurfaceAncestry: () => [] as string[],
    getSurfaceChildren: () => [] as string[],
  };
});
jest.mock("@/lib/toast", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

import { act, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  SurfaceActivity,
  SurfaceRuntimeProvider,
  getSurfaceRuntimeForName,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { executeSurfaceClientTool } from "@ai-matrx/chat/surfaces/runtime/surface-client-tools";
import { BOARD_SURFACE_NAME } from "@/features/surfaces/manifests/board.manifest";
import { BoardSurface } from "../components/BoardSurface";
import { BoardCameraStore } from "../engine/camera-store";
import { createItemSurfaceIndex } from "../tools/item-surfaces";
import { TileSurfaceCapture } from "../tools/TileSurfaceCapture";
import type { BoardToolHost } from "../tools/useBoardAgentTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tile = { id: string; title: string; rect: { x: number; y: number; w: number; h: number } };

function NoteSurface({ title, body }: { title: string; body: string }) {
  return (
    <SurfaceRuntimeProvider surfaceName={TEST_NOTE} getScope={() => ({ note_title: title, note_body: body })}>
      <span>{title}</span>
    </SurfaceRuntimeProvider>
  );
}

/** A feature board (War Room / workflow run) tile: it only wraps its surface in TileSurfaceCapture. */
function FeatureTile({ tile, store, capture }: { tile: Tile; store: BoardCameraStore; capture: boolean }) {
  const live = useSyncExternalStore(store.subscribeSelection, store.getSelected, store.getSelected) === tile.id;
  const surface = <NoteSurface title={tile.title} body={`${tile.title} body text.`} />;
  return capture ? (
    <TileSurfaceCapture id={tile.id} active={live}>{surface}</TileSurfaceCapture>
  ) : (
    <SurfaceActivity active={live}>{surface}</SurfaceActivity>
  );
}

function FeatureBoard({ tiles, store, capture }: { tiles: Tile[]; store: BoardCameraStore; capture: boolean }) {
  const [index] = useState(createItemSurfaceIndex);
  const host: BoardToolHost<Tile> = {
    board: {
      read: () => ({ tiles, parked: [], frames: [], connections: [] }),
      moveMany: () => undefined,
      removeTile: () => () => undefined,
      parkTile: () => undefined,
      unparkTile: () => undefined,
    },
    store,
    boardTitle: "Vendor review room",
    createTile: () => ({ ok: false, error: "not in this test" }),
    describe: () => ({ kind: "note", surface: TEST_NOTE }),
    itemSurfaces: index,
  };
  return (
    <BoardSurface host={host}>
      {tiles.map((tile) => (
        <FeatureTile key={tile.id} tile={tile} store={store} capture={capture} />
      ))}
    </BoardSurface>
  );
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

const TILES: Tile[] = [
  { id: "live", title: "Pricing", rect: { x: 0, y: 0, w: 300, h: 200 } },
  { id: "other", title: "Contracts", rect: { x: 400, y: 0, w: 300, h: 200 } },
];

async function mount(capture: boolean) {
  const store = new BoardCameraStore({ x: 0, y: 0, z: 1 });
  store.select("live");
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<FeatureBoard tiles={TILES} store={store} capture={capture} />));
  await flush();
  return { store, root };
}

const overviewOf = async () =>
  (await getSurfaceRuntimeForName(BOARD_SURFACE_NAME)?.getScope())?.board_items as {
    items: Array<{ id: string; basics?: Record<string, unknown>; basics_note?: string; basics_stale?: true }>;
  };

describe("feature boards (War Room, workflow run) publish the same two-request bridge", () => {
  it("a tile wrapped in TileSurfaceCapture carries basics in board_items and opens with board_open_item", async () => {
    const { root } = await mount(true);
    const other = (await overviewOf()).items.find((i) => i.id === "other");
    expect(other?.basics).toEqual({ note_title: "Contracts", note_body: "Contracts body text." });
    let result: Awaited<ReturnType<typeof executeSurfaceClientTool>> | undefined;
    await act(async () => {
      const pending = executeSurfaceClientTool("board_open_item", { id: "other" });
      await flush();
      result = await pending;
    });
    expect(result?.ok).toBe(true);
    expect((result as { output: Record<string, unknown> }).output).toMatchObject({
      id: "other",
      values: { note_title: { value: "Contracts" } },
    });
    act(() => root.unmount());
  });

  it("control: a tile with no capture (how these boards were) has only its type and name, marked stale", async () => {
    const { root } = await mount(false);
    const other = (await overviewOf()).items.find((i) => i.id === "other");
    expect(Object.keys(other?.basics ?? {})).toEqual(["type", "name"]);
    expect(other?.basics_stale).toBe(true);
    act(() => root.unmount());
  });
});
