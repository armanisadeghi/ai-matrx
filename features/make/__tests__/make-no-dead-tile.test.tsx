// features/make/__tests__/make-no-dead-tile.test.tsx — guard G1 `pnpm check:make-no-dead-tile`
// (lane MAKE-HOME, wave 1).
//
// THE RULE: absent beats dead. Every tile on /make (features/make/tiles.ts) names a flow whose
// FIRST STEP MOUNTS — the real `MakeFlowSheet` renders something a person can act on for it:
// "Which table, or make one?" for a flow that collects into a table, the existing builder for
// Table and Client portal, and a real route for a tile that leaves the page. A tile that names a
// flow the sheet does not draw renders an empty sheet: that is the dead tile this fails on.
//
// RED ON A PLANT: the "self-test" case plants a tile whose flow the sheet does not know and proves
// the checker names it; `MAKE_PLANT_DEAD_TILE=1` adds that planted tile to the real registry under
// check, which turns the main case red (the proof run recorded in PROGRESS-MAKE-HOME.md).

import { existsSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { MAKE_TILES, type MakeTile } from "../tiles";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/make",
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("@ai-matrx/records-ui", () => {
  const stub = (name: string) => () => <div data-builder={name}>{name}</div>;
  return {
    BookingBuilder: stub("BookingBuilder"),
    ChecklistTemplateEditor: stub("ChecklistTemplateEditor"),
    DashboardCanvas: stub("DashboardCanvas"),
    FormBuilder: stub("FormBuilder"),
    PortalBuilder: stub("PortalBuilder"),
    TablesHome: stub("TablesHome"),
    PickOrAdd: ({ triggerText }: { triggerText: string }) => <button data-builder="PickOrAdd">{triggerText}</button>,
    RecordsMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    declareTable: jest.fn(),
    personActor: () => ({}),
    tokenFor: (s: string) => s,
  };
});
jest.mock("@ai-matrx/records/core", () => ({ createRecordsClient: jest.fn(), supabaseDataSource: jest.fn() }));
jest.mock("@ai-matrx/records", () => ({ bookingPath: (id: string) => `/b/${id}`, publicFormPath: (id: string) => `/f/${id}` }));
jest.mock("@ai-matrx/design-system", () => ({ Skeleton: () => <div data-skeleton="" /> }));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...rest}>{children}</button>,
}));
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
jest.mock("@/features/shell/components/header/PageHeader", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/shell/components/header/variants/variants/HeaderStructured", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "87a6e699-3622-4869-8843-d0867456c0dd" }));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({ selectActiveOrganizationName: () => "Cedar Ridge Physical Therapy" }));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({ organizationId: ORG, organizationState: "ready" }),
}));
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => ({ organizations: [], loading: false }) }));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
  OrganizationContextNotice: () => <div data-builder="OrganizationContextNotice" />,
}));
jest.mock("@/features/organizations/components/OrganizationPickerPopover", () => ({ OrganizationPickerPopover: () => null }));
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({
  recordsUiHostFor: () => ({}),
  useRecordsDataSource: () => ({}),
  useAppRecordsConfig: () => ({}),
  useRecordsUiPorts: () => ({}),
}));
jest.mock("@ai-matrx/records/realtime", () => ({ createRecordsRealtimePort: () => undefined }));
jest.mock("@/features/unified-data/hub/doors", () => ({ dataHome: jest.fn(), dataHomeTables: jest.fn(), doorFailureLine: () => "" }));
jest.mock("@/features/unified-data/home/dataHomeRows", () => ({ buildDataHomeRows: jest.fn(), dataHomeKindWord: (k: string) => k }));
jest.mock("@/features/unified-data/hub/capabilities", () => ({ HUB_CAPABILITIES: [] }));
jest.mock("@/features/unified-data/home/dataHomeColumns", () => ({ KindIcon: () => <i /> }));
// The template gallery is its own unit (gallery/TemplateGallery.tsx, guard G3); here it is a stand-in.
// The describe box is its own unit (features/make/describe); here it is a stand-in.
jest.mock("../describe/DescribeBox", () => ({ DescribeBox: () => null }));
jest.mock("../gallery/TemplateGallery", () => ({ TemplateGallerySection: () => <div data-make-gallery="" /> }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { MakeFlowSheet, default: MakeHome } = require("../MakeHome") as typeof import("../MakeHome");

const TABLES = {
  phase: "read" as const,
  data: [
      {
        table_id: "b1000000-0000-4000-8000-000000000001",
        table_name: "Patient Intake",
        organization_id: ORG,
        organization_name: "Cedar Ridge Physical Therapy",
        member: true,
        visibility: "internal",
        updated_at: "2026-10-02T15:00:00Z",
        mine: true,
        shared_with_me: false,
        platform_owned: false,
        kind: "table",
      },
  ],
};

const REPO = path.resolve(__dirname, "../../..");

/** The first step a tile opens, as the person would see it: what mounted, or null when nothing did. */
async function firstStep(tile: MakeTile): Promise<string | null> {
  if (tile.href) {
    const route = path.join(REPO, "app/(core)", tile.href, "page.tsx");
    return existsSync(route) ? `route ${tile.href}` : null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <MakeFlowSheet
        tile={tile}
        tables={TABLES}
        testOrganizationIds={new Set()}
        activeOrganizationId={ORG}
        activeState="ready"
        tableId={null}
        organizationId={null}
        onChoose={() => undefined}
        onBack={() => undefined}
        onClose={() => undefined}
        onLand={() => undefined}
      />,
    );
  });
  const mounted = host.querySelector(`[data-make-flow="${tile.flow}"] [data-builder]`)?.getAttribute("data-builder") ?? null;
  await act(async () => root.unmount());
  host.remove();
  return mounted;
}

/** Every tile whose first step mounts nothing — the dead tiles. */
async function deadTiles(tiles: readonly MakeTile[]): Promise<string[]> {
  const dead: string[] = [];
  for (const tile of tiles) if (!(await firstStep(tile))) dead.push(tile.id);
  return dead;
}

const PLANTED: MakeTile = {
  id: "pipeline" as MakeTile["id"],
  label: "Pipeline board",
  what: "Cards you drag through stages",
  source: "store",
  flow: "pipeline" as MakeTile["flow"],
  kind: "table",
  champion: "Trello",
  asksForTable: false,
};

it("every tile on /make opens a flow whose first step mounts (no dead tile)", async () => {
  const underCheck = process.env.MAKE_PLANT_DEAD_TILE === "1" ? [...MAKE_TILES, PLANTED] : MAKE_TILES;
  expect(await deadTiles(underCheck)).toEqual([]);
});

it("each flow's first step is the one the registry promises", async () => {
  for (const tile of MAKE_TILES) {
    const step = await firstStep(tile);
    if (tile.asksForTable) expect(step).toBe("PickOrAdd");
    else if (tile.flow === "table") expect(step).toBe("TablesHome");
    else if (tile.flow === "portal") expect(step).toBe("PortalBuilder");
    else expect(step).toMatch(/^route \//);
  }
});

it("self-test: a planted tile with no flow is named dead", async () => {
  expect(await deadTiles([...MAKE_TILES, PLANTED])).toEqual(["pipeline"]);
});

it("every tile's secondary line fits its 60-character slot", () => {
  for (const tile of MAKE_TILES) expect(tile.what.length).toBeLessThanOrEqual(60);
});

it("wave 1 ships the seven store tiles and no platform tile", () => {
  expect(MAKE_TILES.map((t) => t.id)).toEqual(["table", "form", "booking", "checklist", "dashboard", "portal", "list"]);
  expect(MAKE_TILES.every((t) => t.source === "store")).toBe(true);
});

it("A4: the tiles paint while every read is still out (no tile waits on the database)", async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const doors = require("@/features/unified-data/hub/doors") as { dataHome: jest.Mock; dataHomeTables: jest.Mock };
  doors.dataHome.mockImplementation(() => new Promise(() => undefined));
  doors.dataHomeTables.mockImplementation(() => new Promise(() => undefined));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<MakeHome />));
  expect(host.querySelectorAll("[data-make-tile]").length).toBe(MAKE_TILES.length);
  // And the step-1 table list is not read until a flow that asks for a table is open.
  expect(doors.dataHomeTables).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  host.remove();
});
