/**
 * H5 — hub saved views (KNOWLEDGE-HUB §4, §6, §8). What must be true:
 *  - a view's definition declares its kind, round-trips the query + layout +
 *    the alert choice + the preset key, and refuses another surface's shape;
 *  - "any library" (`library:*`) survives the URL but never reaches the server
 *    as an id;
 *  - a live count is the first page of item sections (not Top hit, not
 *    Segments), "99+" past the cap, and honest when unsupported or failed;
 *  - the six presets the specialized pages retire into all exist;
 *  - every write goes through the saved-view doors on surface `knowledge/hub`,
 *    pins through user_entity_state, deletes are soft.
 */

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
const setPinned = jest.fn();
jest.mock("@/features/scopes/service/favoritesService", () => ({
  favoritesService: { setPinned: (...a: unknown[]) => setPinned(...a) },
}));
jest.mock("@/features/knowledge/hub/hooks/useHubSidebarData", () => ({
  SAVED_VIEW_TOKEN: "platform_saved_view",
}));

import {
  encodeSavedViewDefinition,
  hubStateFromParams,
  hubStateToParams,
  DEFAULT_HUB_STATE,
  parseSavedViewDefinition,
} from "@/features/knowledge/hub/hubState";
import {
  HUB_PRESETS,
  countLabel,
  countViewQuery,
  missingPresets,
  viewIsDirty,
} from "@/features/knowledge/hub/hubSavedViews";
import { toServerRequest, type KnowledgeSection } from "@/features/knowledge/api/knowledgeSearch";
import {
  createHubView,
  deleteView,
  saveViewChanges,
  touchView,
} from "@/features/knowledge/hub/hubSavedViewActions";

const row = (over: Record<string, unknown> = {}) => ({
  id: "v1",
  name: "Grants",
  surface_key: "knowledge/hub",
  organization_id: "org-1",
  created_by: "me",
  visibility: "personal",
  version: 3,
  definition: {},
  last_used_at: null,
  sort_order: null,
  ...over,
});

const section = (key: KnowledgeSection["key"], count: number | null, extra: Partial<KnowledgeSection> = {}): KnowledgeSection => ({
  key,
  label: key,
  count,
  items: [],
  next_cursor: null,
  ...extra,
});

beforeEach(() => {
  rpc.mockReset();
  setPinned.mockReset();
});

describe("definition", () => {
  it("declares its kind and round-trips query, layout, alert choice and preset", () => {
    const stored = encodeSavedViewDefinition({
      query: { mode: "find", types: ["note"], text: "grant" },
      layout: "board",
      notifyNewMatches: true,
      preset: "files",
    });
    expect(stored.__kind).toBe("knowledge-hub-view");
    expect(parseSavedViewDefinition(stored)).toEqual({
      query: { mode: "find", types: ["note"], text: "grant" },
      layout: "board",
      notifyNewMatches: true,
      preset: "files",
    });
  });
  it("refuses a definition written for another surface", () => {
    expect(parseSavedViewDefinition({ __kind: "matrx-table-view", query: { types: ["note"] } })).toBeNull();
  });
  it("keeps `any library` through the URL and never sends it as an id", () => {
    const query = { mode: "find" as const, within: [{ type: "media_source_library", id: "*" }] };
    const back = hubStateFromParams(hubStateToParams({ ...DEFAULT_HUB_STATE, query })).query;
    expect(back.within).toEqual([{ type: "media_source_library", id: "*" }]);
    expect(toServerRequest(back, false).within).toBeUndefined();
    expect(
      toServerRequest({ mode: "find", within: [{ type: "project", id: "p1" }, { type: "media_source_library", id: "*" }] }, false)
        .within,
    ).toEqual([{ type: "project", id: "p1" }]);
  });
  it("is dirty only when the query or layout moved", () => {
    const def = { query: { mode: "find" as const, types: ["note"] }, layout: "list" as const };
    expect(viewIsDirty(def, { query: { mode: "find", types: ["note"] }, layout: "list" })).toBe(false);
    expect(viewIsDirty(def, { query: { mode: "find", types: ["note"], text: "x" }, layout: "list" })).toBe(true);
    expect(viewIsDirty(def, { query: { mode: "find", types: ["note"] }, layout: "table" })).toBe(true);
  });
});

describe("presets", () => {
  it("ships the six views the specialized pages retire into", () => {
    expect(HUB_PRESETS.map((p) => p.name)).toEqual([
      "Everything",
      "Transcripts",
      "Research sources",
      "Libraries",
      "Crawled pages",
      "Files",
    ]);
    expect(missingPresets(["everything", "files"]).map((p) => p.key)).toEqual([
      "transcripts",
      "research_sources",
      "libraries",
      "crawled_pages",
    ]);
  });
});

describe("live count", () => {
  it("sums item sections of the first page, skipping Top hit and Segments", async () => {
    const runner = jest.fn().mockResolvedValue([
      section("top_hit", 1),
      section("sources", 7),
      section("segments", 40),
      section("notes", 3),
    ]);
    const c = await countViewQuery({ mode: "find", types: ["note"] }, runner);
    expect(c).toEqual({ kind: "count", count: 10, capped: false });
    expect(runner.mock.calls[0][0]).toMatchObject({ limit: 100, types: ["note"] });
    expect(runner.mock.calls[0][1]).toMatchObject({ asYouType: true });
    expect(countLabel(c)).toBe("10");
  });
  it("says 99+ past the cap or when a section has another page", async () => {
    const big = await countViewQuery({ mode: "find" }, jest.fn().mockResolvedValue([section("files", 100)]));
    expect(countLabel(big)).toBe("99+");
    const paged = await countViewQuery(
      { mode: "find" },
      jest.fn().mockResolvedValue([section("files", 5, { next_cursor: "c2" })]),
    );
    expect(countLabel(paged)).toBe("99+");
  });
  it("is honest when the filter is unsupported or the search fails", async () => {
    const runner = jest.fn();
    const any = await countViewQuery({ mode: "find", within: [{ type: "media_source_library", id: "*" }] }, runner);
    expect(any.kind).toBe("unsupported");
    expect(runner).not.toHaveBeenCalled();
    const failed = await countViewQuery(
      { mode: "find" },
      jest.fn().mockResolvedValue([section("files", null, { error: { message: "down", retryable: true } })]),
    );
    expect(failed).toEqual({ kind: "error", message: "down" });
    expect(countLabel(failed)).toBe("—");
  });
});

describe("writes", () => {
  it("creates through saved_view_save on knowledge/hub, shared = internal, then pins per person", async () => {
    rpc.mockResolvedValue({ data: row({ visibility: "internal" }), error: null });
    setPinned.mockResolvedValue({ ok: true, data: null });
    const out = await createHubView({
      name: "Grants",
      organizationId: "org-1",
      shared: true,
      pinned: true,
      definition: { query: { mode: "find", types: ["note"] }, layout: "list", notifyNewMatches: true },
    });
    expect(out).toEqual({ id: "v1", pinError: null });
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("saved_view_save");
    expect(args).toMatchObject({
      p_surface_key: "knowledge/hub",
      p_organization_id: "org-1",
      p_visibility: "internal",
      p_name: "Grants",
    });
    expect(args.p_definition).toMatchObject({ __kind: "knowledge-hub-view", notify_new_matches: true });
    expect(setPinned).toHaveBeenCalledWith("platform_saved_view", "v1", true);
  });
  it("saves changes as a compare-and-swap and says so when the view moved", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const view = {
      id: "v1", name: "Grants", version: 3, mine: true, builtIn: false, pinned: false, preset: null,
      visibility: "personal" as const, organizationId: "org-1", createdBy: "me",
      definition: { query: { mode: "find" as const }, layout: "list" as const },
    };
    await expect(saveViewChanges(view, { query: { mode: "find", text: "x" }, layout: "list" })).rejects.toThrow(
      /changed elsewhere/,
    );
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_id: "v1", p_expected_version: 3, p_surface_key: "knowledge/hub" });
  });
  it("deletes softly through the archive door, and touches only my own views", async () => {
    rpc.mockResolvedValue({ data: row({ deleted_at: "now" }), error: null });
    const view = {
      id: "v1", name: "Grants", version: 3, mine: false, builtIn: false, pinned: false, preset: null,
      visibility: "internal" as const, organizationId: "org-1", createdBy: "them", definition: null,
    };
    await deleteView(view);
    expect(rpc).toHaveBeenCalledWith("saved_view_archive", { p_surface_key: "knowledge/hub", p_id: "v1", p_expected_version: 3 });
    rpc.mockClear();
    await touchView(view);
    expect(rpc).not.toHaveBeenCalled();
    await touchView({ ...view, mine: true });
    expect(rpc).toHaveBeenCalledWith("saved_view_save", expect.objectContaining({ p_touch: true, p_id: "v1" }));
  });
});

describe("live count under the title stand-in", () => {
  it("never counts a filter the stand-in would silently ignore", async () => {
    const runner = jest.fn(async (_q, opts) => {
      opts?.onEngine?.("title_stand_in");
      return [section("sources", 100)];
    });
    const c = await countViewQuery({ mode: "find", source_kinds: ["transcript"] }, runner);
    expect(c.kind).toBe("unsupported");
    const typesOnly = await countViewQuery({ mode: "find", types: ["file"] }, runner);
    expect(countLabel(typesOnly)).toBe("99+");
  });
});

describe("view link", () => {
  it("a bare saved-view address is a link to open; any filter or layout makes it a working state", async () => {
    const { isViewLinkOnly } = await import("@/features/knowledge/hub/hubSavedViews");
    const base = { ...DEFAULT_HUB_STATE, view: { kind: "saved" as const, id: "v1" } };
    expect(isViewLinkOnly(base)).toBe(true);
    expect(isViewLinkOnly({ ...base, query: { mode: "find", types: ["note"] } })).toBe(false);
    expect(isViewLinkOnly({ ...base, layout: "board" })).toBe(false);
  });
});
