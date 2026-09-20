/**
 * 🚨 ONE REGISTRATION, THREE PRESENTATIONS — and they render the REAL row.
 *
 * Written in the shape U-W2 used for `calendar_event`, because this is the same
 * seam: `web_youtube_video` had an INLINE registry entry (V-22 NEW-6) with the
 * GENERIC loader — an untyped `select('*')` — no curated fields, and a health
 * strip that could only speak about the account. So a person who opened
 * `/detail/web_youtube_video/<id>` got the raw column dump of a fully stored
 * record: the `stats` jsonb with its `__kind` marker printed as content, the
 * audit columns, `version`, `visibility`, and nothing YouTube-shaped at all.
 *
 * This suite mounts the window, the docked panel and the page through the REAL
 * type map and the REAL refinement, and asserts what PLAN §4.11 promises on
 * each: the title, the curated fields, the counts, the freshness, what a
 * read-only grant cannot do — and NEVER the jsonb.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  DetailDockedPresentation,
  DetailPagePresentation,
  DetailWindowPresentation,
} from "@/lib/detail/presentations";
import { DetailHostProvider, type DetailHostPorts } from "@/lib/detail/host";
import type {
  DetailDockedShellProps,
  DetailPageShellProps,
  DetailWindowShellProps,
} from "@/lib/detail/host";

import { resolveItemDetailType } from "@/features/item-presentation/detail";
import { getItemConfig } from "@/features/item-presentation/registry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const VIDEO_ID = "eeeeeeee-1111-2222-3333-444444444444";

/**
 * The row exactly as the live table holds it (aidream migration 0767) —
 * `channel_resource_id` as the connection side, `sync_status`, `synced_at`, and
 * a `stats` document carrying the `__kind` marker the server writes.
 */
const ROW = {
  id: VIDEO_ID,
  channel_resource_id: "cccccccc-1111-2222-3333-444444444444",
  external_id: "dQw4w9WgXcQ",
  title: "Commercial roof inspection: what a leak actually costs you",
  description: "A walk-through of a 40,000 sq ft membrane roof.",
  published_at: "2026-09-10T15:00:00Z",
  thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  external_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  duration_seconds: 733,
  stats: {
    __kind: "youtube_video_stats",
    views: 4821,
    likes: 96,
    comments: 12,
    captured_at: "2026-09-18T12:00:00Z",
  },
  synced_at: "2026-09-18T12:00:00Z",
  sync_status: "available",
  sync_status_reason: null,
  organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  created_by: "dddddddd-1111-2222-3333-444444444444",
  updated_by: null,
  created_at: "2026-09-18T12:00:00Z",
  updated_at: "2026-09-18T12:00:00Z",
  deleted_at: null,
  version: 1,
  metadata: {},
  visibility: "personal",
};

jest.mock("@/utils/supabase/client", () => {
  const make = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      in: self,
      is: self,
      not: self,
      gte: self,
      lte: self,
      order: self,
      range: self,
      abortSignal: self,
      returns: self,
      maybeSingle: async () => ({
        data: table === "youtube_video" ? ROW : null,
        error: null,
      }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    });
    return chain;
  };
  return {
    supabase: {
      schema: () => ({ from: (table: string) => make(table) }),
      from: (table: string) => make(table),
    },
  };
});

// The health strip's real producer reads the connectors' own state; with
// nothing connected it answers honestly rather than throwing.
jest.mock("@/features/marketing/google/service", () => ({
  listGoogleCapabilities: async () => [],
  listGoogleConnectionInventory: async () => ({ connections: [], resources: [] }),
  postGoogleBackend: async () => ({ json: async () => ({}) }),
}));

function ports(shells: DetailHostPorts["shells"]): DetailHostPorts {
  return {
    // 🚨 THE REAL TYPE MAP.
    resolveType: resolveItemDetailType,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: () => `/detail/web_youtube_video/${VIDEO_ID}`,
      toPage: jest.fn(),
      back: jest.fn(),
      canGoBack: () => false,
      toRecordHome: jest.fn(),
    },
    shells,
    doors: {
      RecordDoors: ({ id }: { id: string }) => <span data-doors={id} />,
      RefCell: ({ value }: { value: string }) => <span>{value}</span>,
      tokenFromColumnName: () => null,
      isUuidValue: (v: unknown): v is string => typeof v === "string",
      hasDoor: () => true,
    },
    associations: { defaultTokens: [], canAnchor: () => false },
    history: { list: async () => [] },
    notify: { error: jest.fn(), success: jest.fn() },
    copyText: async () => true,
  } as unknown as DetailHostPorts;
}

const Shell =
  (mark: string) =>
  ({ titleNode, actions, children }: DetailWindowShellProps | DetailDockedShellProps) => (
    <div data-shell={mark}>
      {titleNode}
      {actions}
      {children}
    </div>
  );

function PageShell({ titleNode, actions, onBack, children }: DetailPageShellProps) {
  return (
    <div data-shell="page">
      <button type="button" aria-label="Back" onClick={onBack}>
        back
      </button>
      {titleNode}
      {actions}
      {children}
    </div>
  );
}

const DATA = { type: "web_youtube_video", id: VIDEO_ID, seed: null, list: null };

const PRESENTATIONS = [
  {
    name: "window",
    shells: { Window: Shell("window") },
    node: <DetailWindowPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "docked",
    shells: { Docked: Shell("docked") },
    node: <DetailDockedPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "page",
    shells: { Page: PageShell },
    node: <DetailPagePresentation data={DATA} />,
  },
] as const;

async function mount(which: (typeof PRESENTATIONS)[number]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DetailHostProvider ports={ports(which.shells)}>{which.node}</DetailHostProvider>,
    );
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    text: container.textContent ?? "",
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the registration itself", () => {
  it("is recognized, is not the neutral fallback, and lives beside its feature", () => {
    const { config, recognized } = getItemConfig("web_youtube_video");
    expect(recognized).toBe(true);
    expect(config.label).toBe("YouTube video");
    expect(config.detailSource).toEqual({
      table: "youtube_video",
      schemaName: "web",
      titleField: "title",
    });
    const type = resolveItemDetailType("web_youtube_video");
    expect(type).not.toBeNull();
    // The entity token is what gives the record its route, peek, associations
    // and history — a null here is the silent "no door" defect.
    expect(type!.entityToken).toBe("web_youtube_video");
    // 🚨 A TYPED LOADER AND A HEALTH PRODUCER — the two things the INLINE entry
    // could not have.
    expect(type!.load).not.toBeNull();
    expect(type!.health).toBeTruthy();
  });
});

describe("one real video, in all three presentations", () => {
  for (const which of PRESENTATIONS) {
    it(`renders the ${which.name} presentation from the real type map`, async () => {
      const m = await mount(which);
      try {
        expect(m.container.querySelector(`[data-shell="${which.name}"]`)).not.toBeNull();
        // The record names itself.
        expect(m.text).toContain("Commercial roof inspection");
        // The curated fields, not a column dump: the counts, the length, the
        // watch URL, the freshness.
        expect(m.text).toContain("4,821");
        expect(m.text).toContain("12:13");
        expect(m.text).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        expect(m.text).toContain("Refreshed from YouTube");
        // 🚨 NEVER the raw jsonb: the marker must not reach a person's screen
        // as content, and the stats payload must not be printed as a field.
        expect(m.text).not.toContain("__kind");
        expect(m.text).not.toContain("youtube_video_stats");
        // …nor the columns a person has no use for.
        expect(m.text).not.toContain("updated_by");
        // What a read-only grant cannot do — stated, with no control to press.
        expect(m.text).toContain("Publish or upload a video");
        expect(m.text).toContain("Replace the thumbnail");
      } finally {
        m.unmount();
      }
    });
  }
});

describe("a video YouTube refused", () => {
  it("wears its own reason, not the account's health", async () => {
    const { youtubeVideoHealthOverride } = await import("../record");
    const health = youtubeVideoHealthOverride(
      {
        ...ROW,
        sync_status: "unavailable",
        sync_status_reason: "This video was made private on YouTube.",
      } as never,
      { source: "YouTube", grant: "ok", grantDetail: "Connected." } as never,
    );
    expect(health.grant).toBe("unknown");
    expect(health.grantDetail).toContain("made private on YouTube");
    expect(health.openAtSourceLabel).toBe("Open on YouTube");
  });
});
