// features/make/__tests__/recent-tells-rows-apart-and-says-when-slow.test.tsx — lane MAKE-HOME 1c.
//
// THE BREAKS (verifier walk, 2026-10-02): "Recently changed" listed three rows called "Patient
// Intake" — a table, its form and a booking page — that looked identical; and a slow read could
// leave the skeleton up with nothing said. Each row now says its kind, its parent table and its
// organization; a read still out after SLOW_READ_MS says so, with Try again.

import { act } from "react";
import { createRoot } from "react-dom/client";

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
jest.mock("@/features/unified-data/home/dataHomeRows", () => ({ buildDataHomeRows: jest.fn(), dataHomeKindWord: (k: string) => ({ table: "Table", form: "Form", booking: "Booking page" })[k] ?? k }));
jest.mock("@/features/unified-data/hub/capabilities", () => ({ HUB_CAPABILITIES: [] }));
jest.mock("@/features/unified-data/home/dataHomeColumns", () => ({ KindIcon: () => <i /> }));
// The template gallery is its own unit (gallery/TemplateGallery.tsx, guard G3); here it is a stand-in.
jest.mock("../describe/DescribeBox", () => ({ DescribeBox: () => null }));
jest.mock("../gallery/TemplateGallery", () => ({ TemplateGallerySection: () => <div data-make-gallery="" />, InstalledOneOffs: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { default: MakeHome, recentFacts, SLOW_READ_MS } = require("../MakeHome") as typeof import("../MakeHome");

it.each([
  [{ kind: "table", parentName: null, organizationName: "Cedar Ridge Physical Therapy" }, "Table · Cedar Ridge Physical Therapy"],
  [{ kind: "form", parentName: "Patient Intake", organizationName: "Cedar Ridge Physical Therapy" }, "Form · in Patient Intake · Cedar Ridge Physical Therapy"],
  [{ kind: "booking", parentName: "Visits", organizationName: null }, "Booking page · in Visits · —"],
])("a recent row named like another says what it is and where: %j", (row, said) => {
  expect(recentFacts(row)).toBe(said);
});

it("a read still out after SLOW_READ_MS says so with Try again, never a silent skeleton", async () => {
  jest.useFakeTimers();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const doors = require("@/features/unified-data/hub/doors") as { dataHome: jest.Mock };
  doors.dataHome.mockImplementation(() => new Promise(() => undefined));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<MakeHome />));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(SLOW_READ_MS);
  });
  const said = host.querySelector('[role="alert"]');
  expect(said?.textContent).toContain("taking longer than usual");
  expect(said?.textContent).toContain("Try again");
  expect(SLOW_READ_MS).toBeLessThanOrEqual(10_000);
  await act(async () => root.unmount());
  host.remove();
  jest.useRealTimers();
});
