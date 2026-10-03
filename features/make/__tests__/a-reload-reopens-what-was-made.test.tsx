// features/make/__tests__/a-reload-reopens-what-was-made.test.tsx — lane MAKE-HOME wave 1b.
//
// THE BREAK (the /make walk, 2026-10-02): reloading /make?make=form&table=… or …dashboard… made
// ANOTHER form or dashboard each time, because the address only said "make one". A create flow is
// idempotent now: the moment a thing is made its id goes into the address (`&id=<new>`, replacing
// the entry, never adding one), and an address that names an id reopens that thing instead of
// making a new one. Booking pages likewise reopen the page they saved.

import { act } from "react";
import { createRoot } from "react-dom/client";

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
jest.mock("@/features/unified-data/hub/doors", () => ({ dataHome: jest.fn(), dataHomeTables: jest.fn(), doorFailureLine: () => "" }));
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

async function open(flow: string, madeId: string | null, onMade: (id: string) => void = () => undefined) {
  const tile = MAKE_TILES.find((t) => t.flow === flow)!;
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
        tableId={TABLE}
        organizationId={ORG}
        madeId={madeId}
        onMade={onMade}
        onChoose={() => undefined}
        onBack={() => undefined}
        onClose={() => undefined}
        onLand={() => undefined}
      />,
    ),
  );
  await act(async () => root.unmount());
  host.remove();
}

it("a form flow makes one only while the address names none, and names the one it made", async () => {
  const made: string[] = [];
  await open("form", null, (id) => made.push(id));
  expect(seen["FormBuilder"]!["startWithOne"]).toBe(true);
  const onActive = seen["FormBuilder"]!["onActiveForm"] as (f: { id: string; state: string }) => void;
  act(() => onActive({ id: MADE, state: "draft" }));
  expect(made).toEqual([MADE]);

  await open("form", MADE);
  expect(seen["FormBuilder"]!["startWithOne"]).toBeFalsy();
  expect(seen["FormBuilder"]!["activeFormId"]).toBe(MADE);
});

it("a dashboard flow reopens the dashboard the address names", async () => {
  const made: string[] = [];
  await open("dashboard", null, (id) => made.push(id));
  expect(seen["DashboardCanvas"]!["createOnMount"]).toBe(true);
  act(() => (seen["DashboardCanvas"]!["onCreated"] as (id: string) => void)(MADE));
  expect(made).toEqual([MADE]);

  await open("dashboard", MADE);
  expect(seen["DashboardCanvas"]!["createOnMount"]).toBeFalsy();
  expect(seen["DashboardCanvas"]!["activeDashboardId"]).toBe(MADE);
});

it("a booking flow reopens the page the address names", async () => {
  const made: string[] = [];
  await open("booking", null, (id) => made.push(id));
  expect(seen["BookingBuilder"]!["startNew"]).toBe(true);
  act(() => (seen["BookingBuilder"]!["onSaved"] as (p: { form_id: string }) => void)({ form_id: MADE }));
  expect(made).toEqual([MADE]);

  await open("booking", MADE);
  expect(seen["BookingBuilder"]!["startNew"]).toBeFalsy();
  expect(seen["BookingBuilder"]!["bookingId"]).toBe(MADE);
});
