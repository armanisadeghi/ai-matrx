/**
 * 🚨 F-87 — A MARKETING SITE OPENS IN PLACE.
 *
 * THE DEFECT (surfaced by lane F-86 on PR 228). A site is the Marketing
 * module's central identity — every Search Console number, crawl, page and
 * keyword belongs to one — and `web_site` has been a registered
 * `platform.entity_types` token (`web.site`) with a route and a generic peek
 * for months. But it was NOT in the item-presentation registry, which is THE
 * type map the Detail primitive reads, so nothing in the app could open a site
 * in place:
 *
 *   - `getItemConfig("web_site").recognized` was `false`, so
 *     `useOpenItemPresentation("web_site", id)` returned `false` and F-86's new
 *     door on the Google marketing answer rendered NOTHING at all — the reader
 *     of "412 clicks" was left with a bare uuid;
 *   - `resolveItemDetailType("web_site")` resolved the neutral fallback
 *     (`load === null`), so `/detail/web_site/<id>` — a URL anyone can build —
 *     showed nothing about a record that is fully stored.
 *
 * GREEN: ONE registration (`features/marketing/site-item-type.ts`, entered in
 * the item registry) — the same entry the Detail primitive reads for window,
 * docked and page. No bespoke Site panel and no copy of the site workspace.
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

import { getItemConfig } from "../registry";
import { resolveItemDetailType } from "../detail";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const SITE_ID = "38eff4c9-b021-451a-b995-7d9b3d17db5e";
const BRAND_ID = "9b1f1c2d-4a5e-4f6a-8b7c-0d1e2f3a4b5c";

// The registry's own loader against a stubbed client: the loader, the curated
// field list and the title resolution are the real ones. The row's SHAPE is the
// live `web.site` shape (`types/database.types.ts`), jsonb plumbing included —
// the fields assertion below is what proves the plumbing stays off the screen.
jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    schema: self,
    from: self,
    select: self,
    eq: self,
    abortSignal: self,
    is: self,
    order: self,
    maybeSingle: async () => ({
      data: {
        id: "38eff4c9-b021-451a-b995-7d9b3d17db5e",
        name: "Titanium Success",
        domain: "titaniumsuccess.com",
        root_url: "https://titaniumsuccess.com",
        description: "The coaching practice's public site.",
        status: "active",
        brand_id: "9b1f1c2d-4a5e-4f6a-8b7c-0d1e2f3a4b5c",
        visibility: "internal",
        gsc_synced_at: "2026-09-17T09:15:00Z",
        created_at: "2026-04-02T12:00:00Z",
        updated_at: "2026-09-17T09:15:00Z",
        // Plumbing the generic formatter would have dumped on the reader.
        gsc_sync: { last_run: "ok", rows: 4120 },
        integrations: { ga4: true },
        metadata: { seeded_by: "import" },
        settings: { crawl_depth: 3 },
        initialization: { step: "done" },
        previous_slugs: ["titanium"],
        version: 7,
        organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      },
      error: null,
    }),
  });
  return { supabase: chain };
});

describe("the Site registration (the door F-86's marketing answer needed)", () => {
  it("is a recognized item type reading web.site, on the canonical token", () => {
    const { config, recognized } = getItemConfig("web_site");
    // RED: `false` — the token existed everywhere except here.
    expect(recognized).toBe(true);
    expect(config.detailSource).toMatchObject({
      table: "site",
      schemaName: "web",
      titleField: "name",
    });
    // The item type IS the entity token; a twin spelled `site` resolves nothing.
    expect(config.entityToken).toBeUndefined();
    expect(getItemConfig("site").recognized).toBe(false);
  });

  it("declares the open discriminant the one opener switches on", () => {
    // RED: undefined, so `useOpenItemPresentation` refused and every door that
    // gates on it rendered absent.
    expect(getItemConfig("web_site").config.open).toEqual({ kind: "web_site" });
  });

  it("resolves through THE type map with a loader and the web_site token", () => {
    const recordType = resolveItemDetailType("web_site");
    expect(recordType).not.toBeNull();
    // RED: null (the fallback config) — nothing could be shown about the row.
    expect(recordType?.load).not.toBeNull();
    expect(recordType?.entityToken).toBe("web_site");
    expect(recordType?.label).toBe("Site");
  });

  it("titles the detail from the site's own name, never a stand-in", () => {
    const recordType = resolveItemDetailType("web_site");
    expect(recordType?.title({ name: "Titanium Success" }, null)).toBe(
      "Titanium Success",
    );
  });

  it("shows the site's own facts and none of the jsonb plumbing", () => {
    const recordType = resolveItemDetailType("web_site");
    const fields = recordType!.fields({
      root_url: "https://titaniumsuccess.com",
      domain: "titaniumsuccess.com",
      status: "active",
      brand_id: BRAND_ID,
      gsc_sync: { rows: 4120 },
      settings: { crawl_depth: 3 },
      metadata: { seeded_by: "import" },
      version: 7,
      previous_slugs: ["titanium"],
    });
    const keys = fields.map((f) => f.key);
    expect(keys).toEqual(["root_url", "domain", "status", "brand_id"]);
    // The owning marketing account is a DOOR, on the token that names it — the
    // generic column→token rule would derive "brand", which names nothing.
    expect(fields.find((f) => f.key === "brand_id")?.ref).toEqual({
      token: "web_brand",
      id: BRAND_ID,
    });
    // And the plumbing is simply not there.
    for (const plumbing of [
      "gsc_sync",
      "settings",
      "metadata",
      "version",
      "previous_slugs",
    ]) {
      expect(keys).not.toContain(plumbing);
    }
  });
});

// ─── The record, composed, in all three presentations ────────────────────────

function ports(shells: DetailHostPorts["shells"]): DetailHostPorts {
  return {
    // THE REAL TYPE MAP.
    resolveType: resolveItemDetailType,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: () => `/detail/web_site/${SITE_ID}`,
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

function StubWindowShell({
  titleNode,
  actions,
  children,
}: DetailWindowShellProps) {
  return (
    <div data-shell="window">
      {titleNode}
      {actions}
      {children}
    </div>
  );
}
function StubDockedShell({
  titleNode,
  actions,
  children,
}: DetailDockedShellProps) {
  return (
    <div data-shell="docked">
      {titleNode}
      {actions}
      {children}
    </div>
  );
}
function StubPageShell({
  titleNode,
  actions,
  onBack,
  children,
}: DetailPageShellProps) {
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

const DATA = { type: "web_site", id: SITE_ID, seed: null, list: null };

const PRESENTATIONS = [
  {
    name: "window",
    shells: { Window: StubWindowShell },
    node: <DetailWindowPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "docked",
    shells: { Docked: StubDockedShell },
    node: <DetailDockedPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "page",
    shells: { Page: StubPageShell },
    node: <DetailPagePresentation data={DATA} />,
  },
] as const;

async function mountComposed(which: (typeof PRESENTATIONS)[number]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DetailHostProvider ports={ports(which.shells)}>
        {which.node}
      </DetailHostProvider>,
    );
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("a Marketing site, composed, in all three presentations", () => {
  for (const which of PRESENTATIONS) {
    it(`shows the site's own record in the ${which.name} presentation`, async () => {
      const m = await mountComposed(which);
      expect(
        m.container.querySelector(`[data-shell="${which.name}"]`),
      ).not.toBeNull();
      const title = m.container.querySelector(
        "[data-detail-title]",
      ) as HTMLElement;
      // RED: "Untitled Item" from the seedless fallback — the type had no loader.
      expect(title.textContent).toBe("Titanium Success");
      expect(title.getAttribute("data-detail-title-standin")).toBeNull();
      expect(m.container.querySelector("[data-detail-id]")?.textContent).toBe(
        SITE_ID,
      );
      const text = m.container.textContent ?? "";
      expect(text).toContain("https://titaniumsuccess.com");
      expect(text).toContain("The coaching practice's public site.");
      // The jsonb plumbing the generic formatter would have dumped is absent.
      expect(text).not.toContain("crawl_depth");
      expect(text).not.toContain("seeded_by");
      // A site is not a mirror of a provider: no source-health strip.
      expect(m.container.querySelector("[data-detail-health]")).toBeNull();
      m.unmount();
    });
  }
});
