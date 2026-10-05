// features/make/__tests__/every-tile-remembers-what-it-made.test.tsx — lane MAKE-HOME wave 1c.
//
// THE BREAK (verifier walk, 2026-10-02): a Client portal's save answered an id that never reached
// the address, so a reload showed a blank builder; a Checklist's first Save said nothing for 20 s
// and a second Save made a same-named duplicate. Form, booking and dashboard had been fixed one by
// one (85e4d99daa) and the other two were simply skipped.
//
// THE CLASS: EVERY tile in tiles.ts either (a) hands the made thing's id to the address the moment
// its builder saves, shows that it is saved, and reopens THAT thing when the address names it — or
// (b) leaves for the made thing's own page. This test iterates MAKE_TILES, so a new tile with
// neither proof fails here by name; it cannot skip the rule the way portal and checklist did.

import { act } from "react";
import { createRoot } from "react-dom/client";

import { MAKE_TILES, type MakeFlow, type MakeTile } from "../tiles";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const TABLE = "23ec225c-80d5-4414-9e77-7b46d2fef4af";
const MADE = "3b46cd8c-4e9b-40a6-81f0-d0d21bb558e8";

type Props = Record<string, unknown>;
const seen: Record<string, Props> = {};
jest.mock("@ai-matrx/records-ui", () => {
  const spy = (name: string) => (props: Props) => {
    seen[name] = props;
    return <div data-builder={name} />;
  };
  return {
    BookingBuilder: spy("BookingBuilder"),
    ChecklistTemplateEditor: spy("ChecklistTemplateEditor"),
    DashboardCanvas: spy("DashboardCanvas"),
    FormBuilder: spy("FormBuilder"),
    PortalBuilder: spy("PortalBuilder"),
    PickOrAdd: () => null,
    declareTable: jest.fn(),
    tokenFor: (s: string) => s,
  };
});
jest.mock("../MakeMount", () => ({
  MakeMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  NewTableBody: () => <div data-builder="TablesHome" />,
  SavesTo: () => null,
  SAVED_WHERE_CHOSEN: "",
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/make",
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock("@ai-matrx/records/core", () => ({ createRecordsClient: jest.fn(), supabaseDataSource: jest.fn() }));
jest.mock("@ai-matrx/records", () => ({ bookingPath: (id: string) => `/b/${id}`, publicFormPath: (id: string) => `/f/${id}` }));
jest.mock("@ai-matrx/design-system", () => ({ Skeleton: () => null }));
jest.mock("@/components/ui/button", () => ({ Button: () => null }));
jest.mock("@/components/ui/dialog", () => ({ Dialog: () => null, DialogContent: () => null, DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2> }));
jest.mock("@/features/shell/components/header/PageHeader", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/shell/components/header/variants/variants/HeaderStructured", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "87a6e699-3622-4869-8843-d0867456c0dd" }));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({ useOrganizationRequired: () => ({ organizationId: ORG, organizationState: "ready" }) }));
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => ({ organizations: [], loading: false }) }));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({ OrganizationContextNotice: () => null }));
jest.mock("@/features/unified-data/hub/doors", () => ({ dataHome: jest.fn(), dataHomeTables: jest.fn(), doorFailureLine: () => "" }));
jest.mock("@/features/unified-data/home/dataHomeRows", () => ({ buildDataHomeRows: jest.fn(), dataHomeKindWord: (k: string) => k }));
jest.mock("@/features/unified-data/hub/capabilities", () => ({ HUB_CAPABILITIES: [] }));
jest.mock("@/features/unified-data/home/dataHomeColumns", () => ({ KindIcon: () => null }));
// The describe box is its own unit (features/make/describe); here it is a stand-in.
jest.mock("../describe/DescribeBox", () => ({ DescribeBox: () => null }));
jest.mock("../gallery/TemplateGallery", () => ({ TemplateGallerySection: () => <div data-make-gallery="" /> }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { MakeFlowSheet } = require("../MakeHome") as typeof import("../MakeHome");

/**
 * How each builder says "I saved this" and how it is reopened. The builder's own contract
 * (records-ui), stated here once: a tile whose builder is not in this table has no proof.
 */
const SAVE_PROTOCOL: Partial<Record<MakeFlow, { builder: string; save: (props: Props) => void; reopen: string; makeNew?: string }>> = {
  form: { builder: "FormBuilder", save: (p) => (p["onActiveForm"] as (f: unknown) => void)({ id: MADE, state: "draft" }), reopen: "activeFormId", makeNew: "startWithOne" },
  booking: { builder: "BookingBuilder", save: (p) => (p["onSaved"] as (b: unknown) => void)({ form_id: MADE }), reopen: "bookingId", makeNew: "startNew" },
  dashboard: { builder: "DashboardCanvas", save: (p) => (p["onCreated"] as (id: string) => void)(MADE), reopen: "activeDashboardId", makeNew: "createOnMount" },
  checklist: { builder: "ChecklistTemplateEditor", save: (p) => (p["onSaved"] as (id: string) => void)(MADE), reopen: "templateId" },
  portal: { builder: "PortalBuilder", save: (p) => (p["onSaved"] as (id: string) => void)(MADE), reopen: "portalId" },
};

/** A tile whose made thing opens on its own page (it never comes back to /make). */
function leavesForItsOwnPage(tile: MakeTile): boolean {
  // The Table flow is TablesHome `makingOnly`, which opens /data/<new id> the moment it is made.
  return Boolean(tile.href) || tile.flow === "table";
}

async function render(tile: MakeTile, madeId: string | null, onMade: (id: string) => void) {
  for (const k of Object.keys(seen)) delete seen[k];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MakeFlowSheet
        tile={tile}
        tables={{ phase: "reading" }}
        testOrganizationIds={new Set()}
        activeOrganizationId={ORG}
        activeState="ready"
        tableId={tile.asksForTable ? TABLE : null}
        organizationId={tile.asksForTable ? ORG : null}
        madeId={madeId}
        onMade={onMade}
        onChoose={() => undefined}
        onBack={() => undefined}
        onClose={() => undefined}
        onLand={() => undefined}
      />,
    ),
  );
  return {
    host,
    done: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

/** What is wrong with one tile's memory, or null when it remembers what it made. */
async function forgets(tile: MakeTile): Promise<string | null> {
  if (leavesForItsOwnPage(tile)) return null;
  const protocol = SAVE_PROTOCOL[tile.flow];
  if (!protocol) return `${tile.id}: no save protocol — the address never learns what it made`;

  const told: string[] = [];
  const fresh = await render(tile, null, (id) => told.push(id));
  const props = seen[protocol.builder];
  if (!props) {
    await fresh.done();
    return `${tile.id}: ${protocol.builder} never mounted`;
  }
  if (protocol.makeNew && props[protocol.makeNew] !== true) {
    await fresh.done();
    return `${tile.id}: a fresh flow does not make a new one`;
  }
  try {
    await act(async () => protocol.save(props));
  } catch {
    await fresh.done();
    return `${tile.id}: ${protocol.builder} is given no save callback`;
  }
  const savedShown = fresh.host.querySelector("[data-make-saved]") !== null;
  await fresh.done();
  if (!told.includes(MADE)) return `${tile.id}: the saved id never reaches the address`;
  if (!savedShown) return `${tile.id}: nothing on screen says it is saved`;

  const reopened = await render(tile, MADE, () => undefined);
  const again = seen[protocol.builder] ?? {};
  await reopened.done();
  if (again[protocol.reopen] !== MADE) return `${tile.id}: a reload does not reopen what was made`;
  if (protocol.makeNew && again[protocol.makeNew]) return `${tile.id}: a reload makes another one`;
  return null;
}

it("every tile hands what it made to the address, says it is saved, and reopens it", async () => {
  const problems: string[] = [];
  for (const tile of MAKE_TILES) {
    const wrong = await forgets(tile);
    if (wrong) problems.push(wrong);
  }
  expect(problems).toEqual([]);
});

it("self-test: a tile with no save protocol is named", async () => {
  const planted: MakeTile = { ...MAKE_TILES.find((t) => t.flow === "form")!, id: "pipeline" as MakeTile["id"], flow: "pipeline" as MakeFlow };
  expect(await forgets(planted)).toBe("pipeline: no save protocol — the address never learns what it made");
});
