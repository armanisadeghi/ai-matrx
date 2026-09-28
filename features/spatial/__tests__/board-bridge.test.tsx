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
  const { spatialBoardManifest } = jest.requireActual(
    "@/features/surfaces/manifests/spatial-board.manifest",
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
  const all = [spatialBoardManifest, note];
  return {
    getManifest: (name: string) => all.find((m) => m.surfaceName === name),
    getAllManifests: () => all,
  };
});
jest.mock("@/lib/toast", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

import { act, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  SurfaceActivity,
  SurfaceRuntimeProvider,
  createSurfaceCapture,
  getSurfaceRuntimeForName,
  getSurfaceRuntimeStack,
  useSurfaceClientTools,
  useSurfaceWriteHandlers,
  type SurfaceToolCall,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { executeSurfaceClientTool } from "@/features/surfaces/runtime/surface-client-tools";
import { SPATIAL_BOARD_SURFACE_NAME } from "@/features/surfaces/manifests/spatial-board.manifest";
import { SpatialBoardSurface } from "../components/SpatialBoardSurface";
import { SpatialStore } from "../engine/spatial-store";
import { createItemSurfaceIndex, type ItemSurfaceIndex } from "../tools/item-surfaces";
import type { BoardToolHost } from "../tools/useBoardAgentTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tile = { id: string; title: string; rect: { x: number; y: number; w: number; h: number } };

const notes: Record<string, { title: string; body: string }> = {};

function NoteSurface({ id }: { id: string }) {
  useSurfaceWriteHandlers(TEST_NOTE, {
    note_title_set: {
      validate: (value) => {
        if (typeof value === "string" && value.length > 40) throw new Error("A title is at most 40 characters.");
      },
      apply: (value) => {
        notes[id].title = String(value);
        return { summary: `Renamed to ${String(value)}.` };
      },
    },
  });
  useSurfaceClientTools(TEST_NOTE, {
    note_count_words: () => ({ words: notes[id].body.split(/\s+/).filter(Boolean).length }),
  });
  return (
    <SurfaceRuntimeProvider
      surfaceName={TEST_NOTE}
      getScope={() => ({ note_title: notes[id].title, note_body: notes[id].body })}
    >
      <span>{notes[id].title}</span>
    </SurfaceRuntimeProvider>
  );
}

function BoardTile({ tile, store, index }: { tile: Tile; store: SpatialStore; index: ItemSurfaceIndex }) {
  const live = useSyncExternalStore(store.subscribeSelection, store.getSelected, store.getSelected) === tile.id;
  const [capture] = useState(createSurfaceCapture);
  useEffect(() => index.set(tile.id, capture), [index, tile.id, capture]);
  return (
    <SurfaceActivity active={live} capture={capture}>
      <NoteSurface id={tile.id} />
    </SurfaceActivity>
  );
}

function TestBoard({ tiles, store, index }: { tiles: Tile[]; store: SpatialStore; index: ItemSurfaceIndex }) {
  const host: BoardToolHost<Tile> = {
    board: {
      read: () => ({ tiles, parked: [], frames: [], connections: [] }),
      moveMany: () => undefined,
      removeTile: () => () => undefined,
      parkTile: () => undefined,
      unparkTile: () => undefined,
    },
    store,
    boardTitle: "Website redo",
    createTile: () => ({ ok: false, error: "not in this test" }),
    describe: () => ({ kind: "note", surface: TEST_NOTE }),
    itemSurfaces: index,
  };
  return (
    <SpatialBoardSurface host={host}>
      {tiles.map((tile) => (
        <BoardTile key={tile.id} tile={tile} store={store} index={index} />
      ))}
    </SpatialBoardSurface>
  );
}

async function flush() {
  // Two animation frames (the tools settle a selection before reading).
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

function agentCall(decision: "approved" | "declined") {
  let approved = false;
  const requestApproval = jest.fn(async () => {
    if (decision === "approved") approved = true;
    return decision === "approved" ? { kind: "approved" as const } : { kind: "declined" as const };
  });
  const call: SurfaceToolCall = {
    conversationId: "conv-1",
    callId: "call-1",
    toolName: "board_item_act",
    agentWrite: { origin: "agent", actorLabel: "Designer", requestApproval },
    approvedByUser: () => approved,
  };
  return { call, requestApproval };
}

describe("the bridge — every board item in two requests", () => {
  let root: ReturnType<typeof createRoot>;
  let store: SpatialStore;

  beforeEach(async () => {
    notes.colors = { title: "Colors", body: "Primary is teal.\nAccent is coral for buttons." };
    notes.site = { title: "Website", body: "Hero, pricing, footer." };
    store = new SpatialStore({ x: 0, y: 0, z: 1 });
    store.select("site");
    const tiles: Tile[] = [
      { id: "site", title: "Website", rect: { x: 0, y: 0, w: 300, h: 200 } },
      { id: "colors", title: "Colors", rect: { x: 400, y: 0, w: 300, h: 200 } },
    ];
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(<TestBoard tiles={tiles} store={store} index={createItemSurfaceIndex()} />));
    await flush();
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("keeps exactly one live registration of the item surface", () => {
    const live = getSurfaceRuntimeStack().filter((r) => r.surfaceName === TEST_NOTE);
    expect(live).toHaveLength(1);
  });

  it("request one: board_items names every item, with the dormant one's basics and none for the live one", async () => {
    const scope = await getSurfaceRuntimeForName(SPATIAL_BOARD_SURFACE_NAME)?.getScope();
    const overview = scope?.board_items as {
      live_item_ids: string[];
      items: Array<{ id: string; live: boolean; surface: string; basics?: Record<string, unknown>; basics_note?: string }>;
      limits: Record<string, number>;
    };
    expect(overview.live_item_ids).toEqual(["site"]);
    const site = overview.items.find((i) => i.id === "site");
    const colors = overview.items.find((i) => i.id === "colors");
    expect(site).toMatchObject({ live: true, surface: TEST_NOTE });
    expect(site?.basics).toBeUndefined();
    expect(colors).toMatchObject({ live: false, surface: TEST_NOTE });
    expect(colors?.basics).toEqual({
      note_title: "Colors",
      note_body: { first_line: "Primary is teal.", words: 8 },
    });
    expect(overview.limits.basics_total_chars).toBeGreaterThan(0);
  });

  it("request two: board_open_item returns the dormant item's values and controls and selects it", async () => {
    let result: Awaited<ReturnType<typeof executeSurfaceClientTool>> | undefined;
    await act(async () => {
      const pending = executeSurfaceClientTool("board_open_item", { id: "colors" });
      await flush();
      result = await pending;
    });
    expect(result?.ok).toBe(true);
    const output = (result as { output: Record<string, unknown> }).output;
    expect(output).toMatchObject({
      id: "colors",
      surface: TEST_NOTE,
      values: {
        note_title: { value: "Colors", description: "The note's title." },
        note_body: { value: notes.colors.body, description: "The note's text." },
      },
      client_tools: [expect.objectContaining({ name: "note_count_words", input_schema: expect.any(Object) })],
    });
    expect(output.write_targets).toEqual([
      expect.stringMatching(/^- note_title_set \(on matrx-user\/test-board-note, type=string, .*the user is asked first\): Rename the note\.$/),
    ]);
    expect(store.getSelected()).toBe("colors");
  });

  it("board_item_act writes a dormant item through the approval card and answers like apply_surface_write", async () => {
    const { call, requestApproval } = agentCall("approved");
    const result = await executeSurfaceClientTool(
      "board_item_act",
      { id: "colors", target: "note_title_set", value: "Palette" },
      { call },
    );
    expect(requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ surfaceName: TEST_NOTE, value: "Palette", actorLabel: "Designer" }),
    );
    expect(notes.colors.title).toBe("Palette");
    expect(notes.site.title).toBe("Website");
    expect((result as { output: Record<string, unknown> }).output).toMatchObject({
      ok: true,
      status: "applied_now",
      surface_name: TEST_NOTE,
      target: "note_title_set",
      change: { page_value: "note_title", before: "Colors", written: "Palette" },
    });
  });

  it("a declined card changes nothing; a refused value never asks; a tool runs on the dormant copy", async () => {
    const declined = agentCall("declined");
    const answer = await executeSurfaceClientTool(
      "board_item_act",
      { id: "colors", target: "note_title_set", value: "Nope" },
      { call: declined.call },
    );
    expect((answer as { output: Record<string, unknown> }).output).toMatchObject({ ok: false, declined: true });
    expect(notes.colors.title).toBe("Colors");

    const refused = agentCall("approved");
    const tooLong = await executeSurfaceClientTool(
      "board_item_act",
      { id: "colors", target: "note_title_set", value: "x".repeat(41) },
      { call: refused.call },
    );
    expect(refused.requestApproval).not.toHaveBeenCalled();
    expect((tooLong as { output: Record<string, unknown> }).output).toMatchObject({
      ok: false,
      reason: "surface_write_refused",
      stage: "before_approval",
    });

    const tool = await executeSurfaceClientTool("board_item_act", { id: "colors", tool: "note_count_words" });
    expect((tool as { output: Record<string, unknown> }).output).toMatchObject({ ok: true, output: { words: 8 } });
  });
});
