// features/make/__tests__/new-table-is-offered-before-anything-is-typed.test.tsx — lane MAKE-HOME W5b.
//
// THE BREAK (verifier walk, 2026-10-02): making a form from /make asks "Which table, or make one?",
// and "New table" appeared only after typing in the picker — a front-desk lead with no table yet saw a
// list with nothing to press. Now "New table" is always offered; pressed with nothing typed it makes
// a table called "New table" (a unique address, so a second one never collides) and opens its builder,
// where she adds the questions.

import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const TABLE = "23ec225c-80d5-4414-9e77-7b46d2fef4af";
const MADE = "3b46cd8c-4e9b-40a6-81f0-d0d21bb558e8";

type Props = Record<string, unknown>;
const seen: Record<string, Props> = {};
const declared: Array<{ name: string; slug: string }> = [];
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
    PickOrAdd: (props: Props) => {
      seen["PickOrAdd"] = props;
      return null;
    },
    declareTable: jest.fn(async (_client: unknown, spec: { name: string; slug: string }) => {
      declared.push(spec);
      return { ok: true, data: TABLE };
    }),
    tokenFor: (s: string) => s,
  };
});
jest.mock("../MakeMount", () => ({
  MakeMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  NewTableBody: () => null,
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
  default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
jest.mock("@/lib/knobs/unifiedDataCampaign", () => ({ UNIFIED_DATA_CAMPAIGN: { check: async () => ({ state: "on" }) } }));
jest.mock("@/features/unified-data/hub/doors", () => ({ dataHome: jest.fn(), dataHomeTables: jest.fn(), doorFailureLine: (e: { message: string }) => e.message }));
jest.mock("@/features/unified-data/home/dataHomeRows", () => ({ buildDataHomeRows: jest.fn(), dataHomeKindWord: (k: string) => k }));
jest.mock("@/features/unified-data/hub/capabilities", () => ({ HUB_CAPABILITIES: [] }));
jest.mock("@/features/unified-data/home/dataHomeColumns", () => ({ KindIcon: () => null }));
// The template gallery is its own unit (gallery/TemplateGallery.tsx, guard G3); here it is a stand-in.
// The describe box is its own unit (features/make/describe); here it is a stand-in.
jest.mock("../describe/DescribeBox", () => ({ DescribeBox: () => null }));
jest.mock("../gallery/TemplateGallery", () => ({ TemplateGallerySection: () => <div data-make-gallery="" /> }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { MakeFlowSheet } = require("../MakeHome") as typeof import("../MakeHome");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MAKE_TILES } = require("../tiles") as typeof import("../tiles");

async function openTableChoice(search: string) {
  const tile = MAKE_TILES.find((t) => t.flow === "form")!;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const chose: Array<[string, string]> = [];
  await act(async () =>
    root.render(
      <MakeFlowSheet
        tile={tile}
        tables={{ phase: "read", data: [] }}
        testOrganizationIds={new Set()}
        activeOrganizationId={ORG}
        activeState="ready"
        tableId={null}
        organizationId={null}
        onChoose={(t, o) => chose.push([t, o])}
        onBack={() => undefined}
        onClose={() => undefined}
        onLand={() => undefined}
      />,
    ),
  );
  if (search) await act(async () => (seen["PickOrAdd"]!["onSearch"] as (q: string) => void)(search));
  return { root, host, chose };
}

beforeEach(() => {
  declared.length = 0;
  delete seen["PickOrAdd"];
});

it("offers New table before anything is typed, and pressing it makes and opens one", async () => {
  const { root, host, chose } = await openTableChoice("");
  const add = seen["PickOrAdd"]!["add"] as { label: string; onAdd: () => void } | null;
  expect(add?.label).toBe("New table");
  await act(async () => add!.onAdd());
  expect(declared).toHaveLength(1);
  expect(declared[0]!.name).toBe("New table");
  expect(declared[0]!.slug).toMatch(/^New table_[0-9a-z]+$/);
  expect(chose).toEqual([[TABLE, ORG]]);
  await act(async () => root.unmount());
  host.remove();
});

it("a typed name is the new table's name and address", async () => {
  const { root, host } = await openTableChoice("Patient intake");
  const add = seen["PickOrAdd"]!["add"] as { label: string; onAdd: () => void };
  expect(add.label).toBe("New table “Patient intake”");
  await act(async () => add.onAdd());
  expect(declared).toEqual([{ name: "Patient intake", slug: "Patient intake" }]);
  await act(async () => root.unmount());
  host.remove();
});
