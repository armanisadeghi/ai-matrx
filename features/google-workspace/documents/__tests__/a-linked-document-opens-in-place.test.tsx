/**
 * 🚨 PLAN §4.1 Plane A + §5.1 — A CONNECTED GOOGLE DOC OPENS IN THE ONE DETAIL
 * PRIMITIVE, IN ALL THREE PRESENTATIONS, FROM ONE REGISTRATION.
 *
 * THE DEFECT THIS PINS. `workbench.google_document` has been live since
 * 2026-09-17 with NO client registration: the type was not in the item-presentation
 * registry, so `resolveItemDetailType("google_document")` answered the neutral
 * fallback — no loader, no fields, no body, no composer — and the health strip
 * (which the campaign has been trying to verify for five rounds) had no synced
 * record to render on at all (VERIFY-U-P1-R5).
 *
 * WHAT IS REAL HERE: the registry, `resolveItemDetailType` (including the health
 * producer it attaches), the refinement, the loader, the curated fields, the
 * core, the header, the body, the panel and all three presentation components.
 * WHAT IS NOT: the three shells (the app's chrome, each with its own suite), the
 * Supabase transport, and the Google HTTP calls.
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

import { CONNECTION_ID, DOC_ID, googleDocumentRow } from "./fixtures";

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

const ROW = googleDocumentRow();

jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    schema: self,
    from: self,
    select: self,
    eq: self,
    is: self,
    abortSignal: self,
    maybeSingle: async () => ({
      data: jest.requireActual<typeof import("./fixtures")>("./fixtures").googleDocumentRow(),
      error: null,
    }),
  });
  return { supabase: chain, createClient: () => chain };
});

// The connector half of the health strip: one connected account, one healthy
// product. The strip's own suite proves the refusal path; here it must simply
// have a real subject.
jest.mock("@/features/marketing/google/service", () => ({
  listGoogleConnectionInventory: jest.fn(async () => ({
    connections: [
      {
        id: "33333333-4444-5555-6666-777777777777",
        owner_type: "user",
        owner_user_id: "u1",
        organization_id: null,
        provider: "google",
        provider_subject: "sub-1",
        account_email: "arman@titaniumsuccess.com",
        account_name: "Arman",
        scopes: ["https://www.googleapis.com/auth/drive.file"],
        status: "connected",
        last_verified_at: "2026-09-18T14:00:00Z",
        last_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-09-18T14:00:00Z",
        metadata: {},
        credential_present: true,
        credential_stable: true,
        health: "connected",
        capability_health: null,
      },
    ],
    resources: [],
  })),
  listGoogleCapabilities: jest.fn(async () => [
    {
      key: "drive_files",
      rollout_phase: "available",
      eligible: true,
      required_scopes: [{ scope: "https://www.googleapis.com/auth/drive.file" }],
      admission_error: null,
    },
  ]),
  postGoogleBackend: jest.fn(async () => ({ json: async () => ({}) })),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "u1" }));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (
    _org: unknown,
    _user: unknown,
    ref: { feature: string; key: string },
  ) => (ref.key === "on_open_min_age_seconds" ? 300 : "dated"),
}));

function ports(shells: DetailHostPorts["shells"]): DetailHostPorts {
  return {
    resolveType: resolveItemDetailType,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: () => `/detail/google_document/${DOC_ID}`,
      toPage: jest.fn(),
      back: jest.fn(),
      canGoBack: () => false,
      toRecordHome: jest.fn(),
    },
    shells,
    doors: {
      RecordDoors: ({ id }: { id: string }) => <span data-doors={id} />,
      RefCell: ({ value, token }: { value: string; token: string }) => (
        <span data-ref-token={token}>{value}</span>
      ),
      tokenFromColumnName: () => null,
      isUuidValue: (v: unknown): v is string => typeof v === "string",
      hasDoor: () => true,
    },
    associations: { defaultTokens: ["project", "task", "party"], canAnchor: () => true },
    history: { list: async () => [] },
    notify: { error: jest.fn(), success: jest.fn() },
    copyText: async () => true,
  } as unknown as DetailHostPorts;
}

const StubWindow = ({ titleNode, actions, children }: DetailWindowShellProps) => (
  <div data-shell="window">
    {titleNode}
    {actions}
    {children}
  </div>
);
const StubDocked = ({ titleNode, actions, children }: DetailDockedShellProps) => (
  <div data-shell="docked">
    {titleNode}
    {actions}
    {children}
  </div>
);
const StubPage = ({ titleNode, actions, children }: DetailPageShellProps) => (
  <div data-shell="page">
    {titleNode}
    {actions}
    {children}
  </div>
);

const DATA = { type: "google_document", id: DOC_ID, seed: null, list: null };

const PRESENTATIONS = [
  {
    name: "window",
    shells: { Window: StubWindow },
    node: <DetailWindowPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "docked",
    shells: { Docked: StubDocked },
    node: <DetailDockedPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "page",
    shells: { Page: StubPage },
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
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("the registration itself", () => {
  it("is recognized — not the neutral fallback", () => {
    const type = resolveItemDetailType("google_document");
    expect(type).not.toBeNull();
    expect(type!.label).not.toBe("Item");
    expect(type!.load).not.toBeNull();
    expect(type!.health).toBeTruthy();
    expect(type!.extraSections).toBeTruthy();
  });

  it("is a registry entity, so associations and history exist", () => {
    expect(resolveItemDetailType("google_document")!.entityToken).toBe("google_document");
  });

  it("loads the real row and titles the record from it", async () => {
    const type = resolveItemDetailType("google_document")!;
    const result = await type.load!(DOC_ID, new AbortController().signal);
    expect("row" in result).toBe(true);
    const row = (result as { row: Record<string, unknown> }).row;
    expect(type.title(row as never, null)).toBe("Q3 Plan");
    // What the table does not say out loud, added without losing a column: this
    // table has no `provider` column (it IS Google's) and does not name the
    // connector product whose grant refreshes it.
    expect(row.provider).toBe("google");
    expect(row.provider_product).toBe("workspace_files");
    // 🚨 AND THE CONNECTION IS NOT RENAMED ANY MORE (lane F-51). The health
    // producer reads `synced_via_connection_id` — the column this table really
    // has — so the old `connection_id` alias is gone from every registration.
    expect(row.synced_via_connection_id).toBe(CONNECTION_ID);
    expect(row.connection_id).toBeUndefined();
    expect(row.external_id).toBe(ROW.external_id);
  });

  it("curates the fields and NEVER prints the cached document as one", () => {
    const type = resolveItemDetailType("google_document")!;
    const fields = type.fields(googleDocumentRow() as never);
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("owner_email");
    expect(keys).toContain("external_modified_at");
    expect(keys).toContain("synced_at");
    expect(keys).toContain("synced_via_connection_id");
    expect(keys).not.toContain("body_text");
    expect(keys).not.toContain("metadata");
    expect(keys).not.toContain("version");
    // THE DOOR LAW: the account a refresh runs through opens.
    const via = fields.find((f) => f.key === "synced_via_connection_id")!;
    expect(via.ref).toEqual({ token: "integration_connection", id: CONNECTION_ID });
  });
});

describe("one connected Google Doc, composed, in all three presentations", () => {
  for (const which of PRESENTATIONS) {
    it(`renders the ${which.name} presentation from the real type map`, async () => {
      const m = await mount(which);
      expect(m.container.querySelector(`[data-shell="${which.name}"]`)).not.toBeNull();
      const title = m.container.querySelector("[data-detail-title]") as HTMLElement;
      expect(title.textContent).toBe("Q3 Plan");
      expect(title.getAttribute("data-detail-title-standin")).toBeNull();
      m.unmount();
    });

    it(`shows the same facts, body and composer in the ${which.name} presentation`, async () => {
      const m = await mount(which);
      const text = m.container.textContent ?? "";
      expect(text).toContain("arman@titaniumsuccess.com");
      expect(text).toContain("Refreshed");
      // The body read view — the cached text, not a field.
      expect(m.container.querySelector("[data-google-document-body]")?.textContent).toContain(
        "Ship the connector.",
      );
      // The composer, at the bottom.
      expect(m.container.querySelector("[data-google-document-append]")).not.toBeNull();
      expect(text).toContain("Add to the end of this doc");
      // The health strip, with a real subject.
      expect(m.container.querySelector("[data-detail-health]")).not.toBeNull();
      // A healthy record says nothing about being unavailable.
      expect(m.container.querySelector("[data-google-document-unavailable]")).toBeNull();
      m.unmount();
    });
  }
});
