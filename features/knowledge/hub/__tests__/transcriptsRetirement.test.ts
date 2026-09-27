/**
 * H6d: the Transcripts LIST's actions in the hub's Transcripts view
 * (`/knowledge?view=transcripts`) — the address a retired `/transcripts` lands
 * on (search, scope, sort, filters kept), the per-kind row menu, the facets
 * and the CSV, all the real pure code the hub page calls. The route itself is
 * NOT retired yet (studio / cleanup sessions are not in the preset — GAP), so
 * the real route module is asserted to still render the list.
 */
const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { to });
});
jest.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
jest.mock("@/features/transcripts/components/TranscriptsListPage", () => ({ TranscriptsListPage: () => "LIST" }));
jest.mock("@/features/auth/components/module-landing/landings/TranscriptsLanding", () => ({
  __esModule: true,
  default: () => "LANDING",
}));
let authed = true;
jest.mock("@/utils/supabase/sessionVerdict", () => ({
  getSessionVerdict: async () => ({ isAuthenticated: authed }),
}));
const downloads: { name: string; body: string }[] = [];
jest.mock("@/components/agent-copy/export", () => {
  const actual = jest.requireActual("@/components/agent-copy/export");
  return { ...actual, downloadFile: (name: string, body: string) => downloads.push({ name, body }) };
});

import TranscriptsRoute from "@/app/(core)/transcripts/page";
import { hubHref, hubStateFromParams, DEFAULT_HUB_STATE } from "@/features/knowledge/hub/hubState";
import { HUB_TRANSCRIPTS_HREF, transcriptsToHubHref } from "@/features/knowledge/hub/legacyRoutes";
import { mergePresetQuery } from "@/features/knowledge/hub/hubSavedViews";
import {
  buildTranscriptFacts,
  facetSelectionFromGroup,
  facetSelectionToGroup,
  narrowByTranscriptFacets,
  transcriptFacetCounts,
  transcriptMenu,
  transcriptRowHref,
  TRANSCRIPT_KIND_LABEL,
  type StudioSessionFields,
  type TranscriptRecordFields,
} from "@/features/knowledge/hub/transcripts/transcriptRows";
import { exportTranscriptRows } from "@/features/transcripts/browse/bulkExport";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import type { TranscriptListRow } from "@/features/transcripts/browse/types";

const land = async (search: Record<string, string>) => transcriptsToHubHref(search);

const params = (href: string) => new URLSearchParams(href.split("?")[1] ?? "");

describe("the /transcripts address maps to the hub's Transcripts view, keeping its address", () => {
  it("bare /transcripts lands on view=transcripts", async () => {
    expect(await land({})).toBe("/knowledge?view=transcripts");
    expect(HUB_TRANSCRIPTS_HREF).toBe("/knowledge?view=transcripts");
  });

  it("keeps search, scope, sort and every filter", async () => {
    const to = await land({
      q: "board meeting",
      scope: "mine",
      sort: "title",
      filters: JSON.stringify({
        kind: { kind: "select", values: ["transcript", "cleanup"] },
        status: { kind: "select", values: ["draft"] },
        folder_name: { kind: "select", values: ["Interviews"] },
        visibility: { kind: "select", values: ["organization"] },
        tags: { kind: "select", values: ["q3"] },
      }),
    });
    const state = hubStateFromParams(params(to as string));
    expect(state.view).toEqual({ kind: "preset", key: "transcripts" });
    expect(state.query).toEqual({ mode: "find", text: "board meeting", captured_by: "me", sort: "title" });
    expect(state.group).toEqual({
      kind: "transcript,cleanup",
      status: "draft",
      folder: "Interviews",
      visibility: "organization",
      tag: "q3",
    });
  });

  it("maps orgs:<id> to reach and shared/public to the Scope facet", () => {
    expect(hubStateFromParams(params(transcriptsToHubHref({ scope: "orgs:org-1" }))).query.organizations).toEqual(["org-1"]);
    expect(hubStateFromParams(params(transcriptsToHubHref({ scope: "shared" }))).group).toEqual({ scope: "shared" });
    expect(hubStateFromParams(params(transcriptsToHubHref({ scope: "public" }))).group).toEqual({ scope: "public" });
  });

  it("the /transcripts route still renders the list while sessions are missing from the view (GAP)", async () => {
    redirect.mockClear();
    const out = await (TranscriptsRoute as unknown as () => Promise<{ type: () => string }>)();
    expect(redirect).not.toHaveBeenCalled();
    expect(out.type()).toBe("LIST");
    authed = false;
    const guest = await (TranscriptsRoute as unknown as () => Promise<{ type: () => string }>)();
    expect(guest.type()).toBe("LANDING");
    authed = true;
  });

  it("the preset's filters merge under what the address carried", () => {
    expect(
      mergePresetQuery(
        { mode: "find", types: ["transcript", "studio_session"] },
        { mode: "find", text: "budget", captured_by: "me" },
      ),
    ).toEqual({ mode: "find", text: "budget", types: ["transcript", "studio_session"], captured_by: "me" });
  });

  it("the view round-trips with its facets (g.*)", () => {
    const href = hubHref({ ...DEFAULT_HUB_STATE, view: { kind: "preset", key: "transcripts" }, group: { status: "final" } });
    expect(href).toBe("/knowledge?view=transcripts&g.status=final");
    expect(hubStateFromParams(params(href)).group).toEqual({ status: "final" });
  });
});

// ─── fixtures: one of each kind, as the hub loads them ──────────────────────

const hit = (entity: string, id: string, title: string, extra: Partial<KnowledgeHit> = {}): KnowledgeHit => ({
  entity,
  id,
  title,
  ...extra,
});
const H = {
  transcript: hit("transcript", "t1", "Board call"),
  session: hit("studio_session", "s1", "Lecture"),
  cleanup: hit("studio_session", "c1", "Tidy notes"),
  source: hit("processed_document", "p1", "Board call (Source)", { source_kind: "transcript" }),
  lonelySource: hit("processed_document", "p2", "Imported", { source_kind: "transcript" }),
  web: hit("processed_document", "w1", "A web page", { source_kind: "web_page" }),
};
const T: TranscriptRecordFields = {
  id: "t1",
  title: "Board call",
  description: "",
  is_draft: true,
  folder_name: "Interviews",
  tags: ["q3"],
  visibility: "organization",
  metadata: { duration: "61.5", wordCount: "900" },
  organization_id: "o1",
  created_by: "me",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  processed_document_id: "p1",
};
const S = (id: string, source: string | null, status: string): StudioSessionFields => ({
  id,
  title: id === "s1" ? "Lecture" : "Tidy notes",
  source,
  status,
  visibility: "public",
  total_duration_ms: 120000,
  transcript_id: null,
  organization_id: "o1",
  created_by: "someone-else",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-03T00:00:00Z",
});
const hits = Object.values(H);
const facts = buildTranscriptFacts(hits, {
  transcripts: [T],
  sessions: [S("s1", "studio", "live"), S("c1", "cleanup", "done")],
  userId: "me",
  userEmail: "me@example.com",
  orgNames: new Map([["o1", "Acme"]]),
});
const factFor = (h: KnowledgeHit) => facts.get(`${h.entity}:${h.id}`);
const sourceHref = (id: string) => `/rag/viewer/${id}`;
const menu = (h: KnowledgeHit) => transcriptMenu(h, factFor(h), sourceHref);
const ids = (h: KnowledgeHit) => menu(h).map((e) => e.id);

describe("the Transcripts row menu, per kind", () => {
  it("a transcript opens in Processor / Studio / Cleanup, renames and copies", () => {
    expect(menu(H.transcript).filter((e) => e.href).map((e) => [e.label, e.href])).toEqual([
      ["Open in Processor", "/transcripts/processor?focus=t1"],
      ["Open in Studio", "/transcripts/studio?import=t1"],
      ["Run Cleanup", "/transcripts/cleanup?import=t1"],
    ]);
    expect(ids(H.transcript)).toEqual(
      expect.arrayContaining(["rename", "copy", "copy-ai", "copy-link", "copy-reference"]),
    );
  });

  it("a studio session opens in Studio and Scribe; a cleanup session in Cleanup", () => {
    expect(menu(H.session).filter((e) => e.href).map((e) => e.href)).toEqual([
      "/transcripts/studio?session=s1",
      "/transcripts/scribe/s1",
    ]);
    expect(menu(H.cleanup).filter((e) => e.href).map((e) => e.href)).toEqual(["/transcripts/cleanup?session=c1"]);
    expect(ids(H.cleanup)).toContain("rename");
  });

  it("a transcript Source opens its own page and the transcript it came from", () => {
    expect(menu(H.source).filter((e) => e.href).map((e) => e.href)).toEqual([
      "/rag/viewer/p1",
      "/transcripts/processor?focus=t1",
      "/transcripts/studio?import=t1",
      "/transcripts/cleanup?import=t1",
    ]);
    expect(ids(H.source)).not.toContain("rename");
    expect(menu(H.lonelySource).filter((e) => e.href).map((e) => e.href)).toEqual(["/rag/viewer/p2"]);
  });

  it("an unsorted recording views the pool and has no reference to copy", () => {
    const u = hit("studio_recording_segments", "u1", "Recording 3");
    expect(transcriptMenu(u, null, sourceHref).map((e) => e.href ?? e.id)).toEqual([
      "/transcripts/scribe/unsorted",
      "copy-link",
    ]);
  });

  it("a row that is not a transcript gets no transcript menu", () => {
    expect(menu(H.web)).toEqual([]);
  });

  it("each row's link is its own record page", () => {
    expect(transcriptRowHref(factFor(H.cleanup)!, sourceHref)).toBe("/transcripts/cleanup?session=c1");
    expect(transcriptRowHref(factFor(H.source)!, sourceHref)).toBe("/rag/viewer/p1");
  });
});

describe("Folders / Visibility / Status / Type / Scope facets over the rows' own fields", () => {
  it("counts each facet's values across the loaded rows", () => {
    const c = transcriptFacetCounts(hits, factFor);
    expect(c.kind.map((v) => v.value).sort()).toEqual(["cleanup", "session", "source", "transcript"]);
    expect(c.status).toEqual(expect.arrayContaining([{ value: "draft", count: 1 }, { value: "live", count: 1 }]));
    expect(c.folder).toEqual(expect.arrayContaining([{ value: "Interviews", count: 2 }]));
    expect(c.visibility).toEqual(expect.arrayContaining([{ value: "public", count: 2 }]));
    expect(c.scope).toEqual(expect.arrayContaining([{ value: "mine", count: 2 }, { value: "public", count: 2 }]));
  });

  it("narrows AND across facets, OR within one; a non-transcript row leaves when a facet is set", () => {
    const only = (g: Record<string, string>) =>
      narrowByTranscriptFacets(hits, facetSelectionFromGroup(g), factFor).map((h) => h.id);
    expect(only({ visibility: "public" })).toEqual(["s1", "c1"]);
    expect(only({ kind: "transcript,cleanup" })).toEqual(["t1", "c1"]);
    expect(only({ folder: "Interviews", kind: "source" })).toEqual(["p1"]);
    expect(only({ status: "draft" })).toEqual(["t1"]);
    expect(only({})).toHaveLength(hits.length);
  });

  it("the selection rides in the view's group without touching other keys", () => {
    expect(facetSelectionToGroup({ status: ["final", "draft"], kind: [] }, { other: "1", status: "x" })).toEqual({
      other: "1",
      status: "final,draft",
    });
  });
});

describe("Export writes the list's CSV for hub rows", () => {
  it("names each row's type and links its record page", () => {
    downloads.length = 0;
    const rows = [H.transcript, H.cleanup, H.source].map((h) => factFor(h)!) as TranscriptListRow[];
    const out = exportTranscriptRows(rows, {
      linkFor: (r) => `https://app.test${transcriptRowHref(r, sourceHref)}`,
      kindLabel: (r) => TRANSCRIPT_KIND_LABEL[r.kind as keyof typeof TRANSCRIPT_KIND_LABEL],
    });
    expect(out.message).toBe("Exported 3 items to CSV.");
    expect(downloads).toHaveLength(1);
    const [header, ...lines] = downloads[0].body.trim().split(/\r?\n/);
    expect(header).toContain("Type");
    expect(lines[0]).toContain("Transcript");
    expect(lines[0]).toContain("Board call");
    expect(lines[0]).toContain("Interviews");
    expect(lines[0]).toContain("https://app.test/transcripts/processor?focus=t1");
    expect(lines[0]).toContain("Acme");
    expect(lines[0]).toContain("me@example.com");
    expect(lines[1]).toContain("Cleanup");
    expect(lines[1]).toContain("https://app.test/transcripts/cleanup?session=c1");
    expect(lines[2]).toContain("Source");
    expect(lines[2]).toContain("https://app.test/rag/viewer/p1");
  });

  it("refuses an empty selection with a sentence, never an empty file", () => {
    expect(() => exportTranscriptRows([])).toThrow(/nothing to write/);
  });
});
