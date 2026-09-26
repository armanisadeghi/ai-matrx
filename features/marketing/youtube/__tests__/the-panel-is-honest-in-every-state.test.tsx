/**
 * THE CHANNEL PANEL IS HONEST IN EVERY STATE.
 *
 * The verifier's list for this unit is a list of STATES, not features: a brand
 * with no binding shows a door, never a dead panel; a brand bound but never
 * refreshed says so; a partially collected window refuses the percentage and
 * says why with both day counts; the analytics gate is named where it applies
 * and nowhere else. Each one is a way a screen can lie, so each one is a test.
 *
 * The panel is mounted for real — the queries are mocked at the SERVICE
 * boundary, not by stubbing the component's own logic, so the states below are
 * produced by the same code paths a person's browser runs.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { BrandChannelBinding } from "../types";

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

const BRAND_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const CONNECTION_ID = "11111111-2222-4333-8444-555555555555";
const CHANNEL_ID = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
const RESOURCE_ID = "cccccccc-1111-2222-3333-444444444444";
const NOW = new Date();

/** The brand's OWN organization — deliberately not the selected one below. */
const BRAND_ORG_ID = "7ead0000-0000-4a00-8a00-00000000c001";
const readVideoOrgs: string[] = [];
const readAnalyticsOrgs: string[] = [];

const world = {
  binding: { state: "unbound", brandVersion: 1 } as BrandChannelBinding,
  connections: [] as Record<string, unknown>[],
  resources: [] as Record<string, unknown>[],
  videos: [] as Record<string, unknown>[],
  days: [] as Record<string, unknown>[],
  capabilities: [] as Record<string, unknown>[],
};

jest.mock("../binding", () => ({
  BINDING_COLUMN_ABSENT_SENTENCE: "COLUMN ABSENT SENTENCE",
  readBrandChannelBinding: async () => world.binding,
  channelBindingDraft: () => ({
    enabled: true,
    credentialAuthority: "external_connection",
    credentialRef: CONNECTION_ID,
    resourceRef: CHANNEL_ID,
  }),
  writeBrandChannelBinding: jest.fn(async () => undefined),
}));

jest.mock("../service", () => ({
  MAX_REFRESH_WINDOW_DAYS: 90,
  readChannelVideos: async ({ organizationId }: { organizationId: string }) => {
    readVideoOrgs.push(organizationId);
    return world.videos;
  },
  readChannelAnalytics: async ({
    lane,
    organizationId,
  }: {
    lane: string;
    organizationId: string;
  }) => {
    readAnalyticsOrgs.push(organizationId);
    return lane === "channel" ? world.days : [];
  },
  refreshYouTubeChannel: jest.fn(async () => ({
    channelId: CHANNEL_ID,
    startDate: "2026-06-22",
    endDate: "2026-09-19",
    videos: [],
    analyticsDaysCreated: 0,
    analyticsDaysUpdated: 0,
  })),
  readYouTubeVideo: async () => null,
}));

jest.mock("@/features/marketing/google/service", () => ({
  listGoogleConnectionInventory: async () => ({
    connections: world.connections,
    resources: world.resources,
  }),
  listGoogleCapabilities: async () => world.capabilities,
}));

jest.mock("../knobs", () => ({
  useTargetKeywordRequired: () => ({ required: true, isResolving: false }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: unknown) =>
    String(selector).includes("organization")
      ? "5dc930e9-bd65-44a1-8369-af773f6e1a5b"
      : "dddddddd-1111-2222-3333-444444444444",
}));

jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name: string }) => <span data-door="entity-ref">{name}</span>,
}));

jest.mock("@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog", () => ({
  ClipboardFallbackDialog: () => null,
}));

/**
 * The consequence dialog is captured, never auto-accepted: these tests assert
 * WHAT it says before anything is written (V-27 NEW-6).
 */
const confirmCalls: Array<Record<string, unknown>> = [];
const confirmAnswer = { value: false };
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async (options: Record<string, unknown>) => {
    confirmCalls.push(options);
    return confirmAnswer.value;
  }),
}));

// The freshness line's own rule and wording are proven by its own suite; here
// it only has to be PRESENT with the day it was handed.
jest.mock("@/features/marketing/components/shared/DataFreshnessLine", () => ({
  DataFreshnessLine: ({ dataThrough }: { dataThrough: string | null }) => (
    <span data-freshness={dataThrough ?? "none"}>
      {`data through ${dataThrough ?? "nothing"}`}
    </span>
  ),
}));

import { BrandChannelPanel } from "../components/BrandChannelPanel";
import { writeBrandChannelBinding } from "../binding";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `count` consecutive days ending `daysAgo` days before today. */
function days(count: number, daysAgo: number, views: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(NOW.getTime() - (daysAgo + index) * 86_400_000);
    return {
      id: `day-${daysAgo + index}`,
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      channel_resource_id: RESOURCE_ID,
      date: isoDay(date),
      views,
      watch_time_minutes: views * 3,
      avg_view_duration_seconds: 180,
      subscribers_gained: 1,
      video_external_id: null,
      metadata: {},
      version: 1,
      created_at: date.toISOString(),
      created_by: null,
      updated_at: date.toISOString(),
      updated_by: null,
    };
  });
}

const VIDEO = {
  id: "eeeeeeee-1111-2222-3333-444444444444",
  channel_resource_id: RESOURCE_ID,
  external_id: "dQw4w9WgXcQ",
  title: "Commercial roof inspection: what a leak costs",
  description: "A walk-through.",
  published_at: "2026-09-10T15:00:00Z",
  thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  external_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  duration_seconds: 733,
  stats: { __kind: "youtube_video_stats", views: 4821, likes: 96, comments: 12 },
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

/**
 * React Query resolves its promises on real macrotasks, so a microtask flush
 * alone leaves every query in `isLoading` and the panel showing its loading
 * state — which is exactly the state these tests must NOT be asserting
 * against.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <BrandChannelPanel brandId={BRAND_ID} />
      </QueryClientProvider>,
    );
  });
  await settle();
  return {
    text: container.textContent ?? "",
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  confirmCalls.length = 0;
  confirmAnswer.value = false;
  world.binding = { state: "unbound", brandVersion: 1 };
  world.connections = [];
  world.resources = [];
  world.videos = [];
  world.days = [];
  world.capabilities = [];
});

describe("the column has not been applied", () => {
  it("says so with its remedy — it never reads as `no channel is bound`", async () => {
    world.binding = { state: "column_absent", sentence: "COLUMN ABSENT SENTENCE" };
    const m = await mount();
    try {
      expect(m.text).toContain("COLUMN ABSENT SENTENCE");
      expect(m.text).not.toContain("No YouTube channel is bound to this client yet");
    } finally {
      m.unmount();
    }
  });
});

const SECOND_CONNECTION_ID = "99999999-2222-4333-8444-555555555555";
const SECOND_RESOURCE_ID = "88888888-1111-2222-3333-444444444444";
const OTHER_CHANNEL_ID = "UCabcdefghijklmnopqrstuv";

function connection(id: string, email: string) {
  return { id, provider: "google", account_email: email, account_name: null };
}

function channelResource(args: {
  id: string;
  connectionId: string;
  channelId: string;
  displayName: string;
  customUrl?: string;
  discoveredAt?: string;
}) {
  return {
    id: args.id,
    connection_id: args.connectionId,
    resource_type: "youtube_channel",
    resource_ref: args.channelId,
    display_name: args.displayName,
    permission_level: "owner",
    discovered_at: args.discoveredAt ?? "2026-09-01T00:00:00Z",
    metadata: args.customUrl ? { custom_url: args.customUrl } : {},
  };
}

describe("no channel is bound", () => {
  it("is a DOOR, never a dead panel — and the door names the channel, its handle and its account", async () => {
    world.connections = [connection(CONNECTION_ID, "owner@allgreen.com")];
    world.resources = [
      channelResource({
        id: RESOURCE_ID,
        connectionId: CONNECTION_ID,
        channelId: CHANNEL_ID,
        displayName: "All Green Recycling",
        customUrl: "@allgreen",
      }),
    ];
    const m = await mount();
    try {
      expect(m.text).toContain("No YouTube channel is bound");
      expect(m.text).toContain("All Green Recycling");
      expect(m.text).toContain("@allgreen");
      expect(m.text).toContain("owner@allgreen.com");
    } finally {
      m.unmount();
    }
  });

  /**
   * 🚨 V-27 NEW-6: seven buttons, four reading exactly "Bind Arman Sadeghi".
   * Two channels with the SAME title must still be tellable apart, or the press
   * is a guess.
   */
  it("keeps two same-named channels distinguishable", async () => {
    world.connections = [
      connection(CONNECTION_ID, "james.grant@rinconplumbing.test"),
      connection(SECOND_CONNECTION_ID, "maria.delgado@rinconplumbing.test"),
    ];
    world.resources = [
      channelResource({
        id: RESOURCE_ID,
        connectionId: CONNECTION_ID,
        channelId: CHANNEL_ID,
        displayName: "Arman Sadeghi",
        customUrl: "@armansadeghi",
      }),
      channelResource({
        id: SECOND_RESOURCE_ID,
        connectionId: SECOND_CONNECTION_ID,
        channelId: OTHER_CHANNEL_ID,
        displayName: "Arman Sadeghi",
      }),
    ];
    const m = await mount();
    try {
      const labels = [...m.container.querySelectorAll("[aria-label^='Bind ']")].map(
        (node) => node.getAttribute("aria-label"),
      );
      expect(labels).toHaveLength(2);
      expect(new Set(labels).size).toBe(2);
      // The handle for the one that has it; the channel id for the one that
      // does not — never nothing, and never a guess.
      expect(m.text).toContain("@armansadeghi");
      expect(m.text).toContain(OTHER_CHANNEL_ID);
      expect(m.text).toContain("maria.delgado@rinconplumbing.test");
    } finally {
      m.unmount();
    }
  });

  it("collapses ONE channel seen through two accounts into one row that says so", async () => {
    world.connections = [
      connection(CONNECTION_ID, "first@example.com"),
      connection(SECOND_CONNECTION_ID, "second@example.com"),
    ];
    world.resources = [
      channelResource({
        id: SECOND_RESOURCE_ID,
        connectionId: SECOND_CONNECTION_ID,
        channelId: CHANNEL_ID,
        displayName: "All Green Recycling",
        discoveredAt: "2026-09-05T00:00:00Z",
      }),
      channelResource({
        id: RESOURCE_ID,
        connectionId: CONNECTION_ID,
        channelId: CHANNEL_ID,
        displayName: "All Green Recycling",
        discoveredAt: "2026-09-01T00:00:00Z",
      }),
    ];
    const m = await mount();
    try {
      expect(
        m.container.querySelectorAll("[aria-label^='Bind ']"),
      ).toHaveLength(1);
      expect(m.text).toContain("also visible through second@example.com");
      expect(m.text).toContain("first@example.com");
    } finally {
      m.unmount();
    }
  });

  it("🚨 states the consequence BEFORE it writes, and writes nothing when declined", async () => {
    world.connections = [connection(CONNECTION_ID, "owner@allgreen.com")];
    world.resources = [
      channelResource({
        id: RESOURCE_ID,
        connectionId: CONNECTION_ID,
        channelId: CHANNEL_ID,
        displayName: "All Green Recycling",
        customUrl: "@allgreen",
      }),
    ];
    const m = await mount();
    try {
      const button = m.container.querySelector<HTMLButtonElement>(
        "[aria-label^='Bind ']",
      );
      expect(button).not.toBeNull();
      await act(async () => {
        button!.click();
      });
      await settle();
      expect(confirmCalls).toHaveLength(1);
      const description = String(confirmCalls[0].description ?? "");
      // What the refresh will READ, on WHOSE account, and what it OVERWRITES.
      expect(description).toContain("owner@allgreen.com");
      expect(description).toContain("spending a call");
      expect(description).toContain("overwrite");
      expect(description).toContain("read-only");
      // Declined — the binding writer was never called.
      expect(writeBrandChannelBinding).not.toHaveBeenCalled();
    } finally {
      m.unmount();
    }
  });

  it("offers the connect window when NO account has a channel, not a bind it cannot do", async () => {
    const m = await mount();
    try {
      expect(m.text).toContain("Connect the account that owns the channel");
      expect(m.container.querySelector("[aria-label^='Bind ']")).toBeNull();
    } finally {
      m.unmount();
    }
  });
});

describe("bound, but nothing has ever been synced", () => {
  beforeEach(() => {
    world.binding = {
      state: "bound",
      connectionId: CONNECTION_ID,
      channelId: CHANNEL_ID,
      brandVersion: 1,
      organizationId: BRAND_ORG_ID,
    };
    world.resources = [
      {
        id: RESOURCE_ID,
        connection_id: CONNECTION_ID,
        resource_type: "youtube_channel",
        resource_ref: CHANNEL_ID,
        display_name: "All Green Recycling",
      },
    ];
  });

  it("says nothing has been synced and names the only thing that fills it", async () => {
    const m = await mount();
    try {
      expect(m.text).toContain("Nothing has been synced for this channel yet");
      expect(m.text).toContain("no schedule");
      expect(m.text).toContain("No videos have been mirrored");
      // 🚨 NOT a zero anywhere: an empty channel is not a channel with 0 views.
      expect(m.text).not.toMatch(/Views · last 30 days/);
    } finally {
      m.unmount();
    }
  });
});

describe("bound, with two windows collected alike", () => {
  beforeEach(() => {
    world.binding = {
      state: "bound",
      connectionId: CONNECTION_ID,
      channelId: CHANNEL_ID,
      brandVersion: 1,
      organizationId: BRAND_ORG_ID,
    };
    world.resources = [
      {
        id: RESOURCE_ID,
        connection_id: CONNECTION_ID,
        resource_type: "youtube_channel",
        resource_ref: CHANNEL_ID,
        display_name: "All Green Recycling",
      },
    ];
    world.videos = [VIDEO];
    world.days = [...days(30, 0, 200), ...days(30, 30, 100)];
  });

  // THE PERSON, NOT THE ORG (Arman, 2026-09-23): the client's channel is read
  // in the BRAND'S organization, never the selected one — reading it in the
  // selected one showed an empty channel whenever another was picked.
  it("reads the videos and analytics in the brand's own organization, not the selected one", async () => {
    readVideoOrgs.length = 0;
    readAnalyticsOrgs.length = 0;
    const m = await mount();
    try {
      expect(m.text).toContain("4,821 views");
      expect(readVideoOrgs.length).toBeGreaterThan(0);
      expect(new Set(readVideoOrgs)).toEqual(new Set([BRAND_ORG_ID]));
      expect(new Set(readAnalyticsOrgs)).toEqual(new Set([BRAND_ORG_ID]));
      // No organization notice: nothing on this panel can land in the wrong one.
      expect(m.text).not.toContain("not the organization you are working in");
    } finally {
      m.unmount();
    }
  });

  // THE REFRESH WRITES THE BRAND'S MIRROR, so it carries the BRAND'S
  // organization — never the selected one (Arman, 2026-09-26: the org notice
  // belongs only where a person could file something in the wrong org; here
  // the write simply goes home). RED before: the refresh sent the selection.
  it("refreshes in the brand's own organization, not the selected one", async () => {
    const { refreshYouTubeChannel } = jest.requireMock("../service") as {
      refreshYouTubeChannel: jest.Mock;
    };
    refreshYouTubeChannel.mockClear();
    confirmAnswer.value = true;
    const m = await mount();
    try {
      const button = Array.from(m.container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Refresh from YouTube"),
      );
      expect(button).toBeDefined();
      await act(async () => {
        button!.click();
      });
      await settle();
      expect(refreshYouTubeChannel).toHaveBeenCalledTimes(1);
      expect(refreshYouTubeChannel.mock.calls[0][0]).toMatchObject({
        organizationId: BRAND_ORG_ID,
      });
    } finally {
      m.unmount();
    }
  });

  it("prints the percentage, the freshness line and the video as a door", async () => {
    const m = await mount();
    try {
      expect(m.text).toContain("Views · last 30 days");
      expect(m.text).toContain("+100.0%");
      expect(m.container.querySelector("[data-freshness]")).not.toBeNull();
      expect(m.container.querySelector('[data-door="entity-ref"]')?.textContent).toBe(
        VIDEO.title,
      );
      expect(m.text).toContain("4,821 views");
      // Never the marker as content.
      expect(m.text).not.toContain("__kind");
    } finally {
      m.unmount();
    }
  });

  it("says average view duration is watch time ÷ views, not a mean of means", async () => {
    const m = await mount();
    try {
      expect(m.text).toContain("Average view duration");
      expect(m.text).toContain("average of each day");
    } finally {
      m.unmount();
    }
  });
});

describe("bound, with a window that was only partly collected", () => {
  beforeEach(() => {
    world.binding = {
      state: "bound",
      connectionId: CONNECTION_ID,
      channelId: CHANNEL_ID,
      brandVersion: 1,
      organizationId: BRAND_ORG_ID,
    };
    world.resources = [
      {
        id: RESOURCE_ID,
        connection_id: CONNECTION_ID,
        resource_type: "youtube_channel",
        resource_ref: CHANNEL_ID,
        display_name: "All Green Recycling",
      },
    ];
    // 28 of the last 30 days, against 6 of the 30 before.
    world.days = [...days(28, 0, 200), ...days(6, 30, 500)];
  });

  it("REFUSES the percentage and prints why, with BOTH day counts", async () => {
    const m = await mount();
    try {
      expect(m.text).not.toMatch(/[+-]\d+\.\d% vs the 30 days before/);
      expect(m.text).toContain("no comparison");
      expect(m.text).toContain("28 of 30 days now vs 6 of 30");
    } finally {
      m.unmount();
    }
  });
});

describe("the analytics rollout gate", () => {
  beforeEach(() => {
    world.binding = {
      state: "bound",
      connectionId: CONNECTION_ID,
      channelId: CHANNEL_ID,
      brandVersion: 1,
      organizationId: BRAND_ORG_ID,
    };
    world.resources = [
      {
        id: RESOURCE_ID,
        connection_id: CONNECTION_ID,
        resource_type: "youtube_channel",
        resource_ref: CHANNEL_ID,
        display_name: "All Green Recycling",
      },
    ];
    world.videos = [VIDEO];
    world.capabilities = [
      {
        key: "youtube_analytics",
        rollout_phase: "internal_test",
        eligible: false,
        limitation: "YouTube Analytics is limited to internal testers right now.",
        remedy: "A reviewer account can see these numbers today.",
        admission_error: null,
      },
      { key: "youtube", rollout_phase: "available", eligible: true, limitation: "", remedy: "" },
    ];
  });

  it("names the gate in the SERVER's words, and only over the analytics", async () => {
    const m = await mount();
    try {
      expect(m.text).toContain("limited to internal testers");
      expect(m.text).toContain("A reviewer account can see these numbers today.");
      // 🚨 THE PREVIEW IS A DIFFERENT CAPABILITY AND IS `approved`: the videos
      // still render. Hiding them would hide a working half behind another
      // half's gate.
      expect(m.text).toContain("The videos below do not depend on it");
      expect(m.container.querySelector('[data-door="entity-ref"]')).not.toBeNull();
    } finally {
      m.unmount();
    }
  });
});

describe("the per-video lane", () => {
  it("says the server does not write it yet — never an empty table reading as zero", async () => {
    world.binding = {
      state: "bound",
      connectionId: CONNECTION_ID,
      channelId: CHANNEL_ID,
      brandVersion: 1,
      organizationId: BRAND_ORG_ID,
    };
    world.resources = [
      {
        id: RESOURCE_ID,
        connection_id: CONNECTION_ID,
        resource_type: "youtube_channel",
        resource_ref: CHANNEL_ID,
        display_name: "All Green Recycling",
      },
    ];
    world.days = days(30, 0, 200);
    const m = await mount();
    try {
      const buttons = [...m.container.querySelectorAll("button")];
      const perVideo = buttons.find((button) => button.textContent === "Per video");
      expect(perVideo).toBeTruthy();
      await act(async () => {
        perVideo!.click();
      });
      await settle();
      const text = m.container.textContent ?? "";
      expect(text).toContain("Per-video days are not collected yet");
      expect(text).toContain("not zero views");
    } finally {
      m.unmount();
    }
  });
});

describe("the pre-upload check is on the panel", () => {
  it("promises to publish nothing, in plain words", async () => {
    const m = await mount();
    try {
      expect(m.text).toContain("Check a video before you upload it");
      expect(m.text).toContain("Nothing here is sent to YouTube");
    } finally {
      m.unmount();
    }
  });
});
