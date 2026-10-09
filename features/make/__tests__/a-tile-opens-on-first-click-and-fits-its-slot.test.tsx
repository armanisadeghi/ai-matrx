// features/make/__tests__/a-tile-opens-on-first-click-and-fits-its-slot.test.tsx — lane MAKE-HOME 1c.
//
// THE BREAKS (verifier walk, 2026-10-02):
//   1. The first two to four tile clicks did nothing while the page was not yet interactive (the
//      flow opened 1.4–2.6 s in): a tile was a <button> whose click lived only in React. A tile is
//      now a real link to /make?make=<flow> — a click before hydration is a plain navigation that
//      reloads with the flow open; after it, the same link is a client navigation.
//   2. At 1280 px the second line was cut ("Rows and columns for anything y…") though it was under
//      its 60-character budget: the layout could not hold its own budget. The rule now measured:
//      at the grid's NARROWEST tile, the second line's text column holds 60 characters in the lines
//      it may take.

import { act } from "react";
import { createRoot } from "react-dom/client";

import { MAKE_TILES, tileFor, MAKE_FLOW_PARAM } from "../tiles";

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
jest.mock("../describe/DescribeBox", () => ({ DescribeBox: () => null }));
jest.mock("../gallery/TemplateGallery", () => ({ TemplateGallerySection: () => <div data-make-gallery="" />, InstalledOneOffs: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { default: MakeHome } = require("../MakeHome") as typeof import("../MakeHome");

async function paint(): Promise<{ host: HTMLElement; done: () => Promise<void> }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const doors = require("@/features/unified-data/hub/doors") as { dataHome: jest.Mock };
  doors.dataHome.mockImplementation(() => new Promise(() => undefined));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<MakeHome />));
  return {
    host,
    done: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("every tile is a link that opens its own flow without the page's script", async () => {
  const { host, done } = await paint();
  const wrong: string[] = [];
  for (const tile of MAKE_TILES) {
    const el = host.querySelector(`[data-make-tile="${tile.id}"]`);
    if (!el || el.tagName !== "A") {
      wrong.push(`${tile.id}: not a link`);
      continue;
    }
    const href = el.getAttribute("href") ?? "";
    if (tile.href) {
      if (href !== tile.href) wrong.push(`${tile.id}: goes to ${href}`);
      continue;
    }
    const url = new URL(href, "http://make.localhost");
    if (url.pathname !== "/make" || tileFor(url.searchParams.get(MAKE_FLOW_PARAM)) !== tile) wrong.push(`${tile.id}: ${href} opens no flow of its own`);
  }
  await done();
  expect(wrong).toEqual([]);
});

/** The longest second line a tile may carry (interface-text: secondary text ≤ 60). */
const BUDGET_CHARS = 60;
/** 12 px (text-xs) Inter averages ≤ 6 px a character over English words (measured on :3001). */
const CHAR_PX = 6;
/** The tile's own chrome beside the text column: p-4 both sides (32) + the 40 px icon + gap-3 (12). */
const CHROME_PX = 84;
const REM_PX = 16;

/** Why one tile's second line cannot hold the budget at the grid's narrowest tile, or null. */
function whyItDoesNotFit(gridClass: string, lineClass: string): string | null {
  if (/\b(truncate|whitespace-nowrap)\b/.test(lineClass) && !/line-clamp-/.test(lineClass)) {
    return "the second line is held to one line";
  }
  const lines = Number(/line-clamp-(\d+)/.exec(lineClass)?.[1] ?? "1");
  const min = /minmax\(min\(100%,([\d.]+)rem\)/.exec(gridClass);
  if (!min) return "the grid names no narrowest tile";
  const textPx = Number(min[1]) * REM_PX - CHROME_PX;
  return BUDGET_CHARS * CHAR_PX <= lines * textPx ? null : `60 characters need ${BUDGET_CHARS * CHAR_PX}px; ${lines} line(s) of ${textPx}px hold less`;
}

it("at the narrowest tile, the second line holds its 60-character budget", async () => {
  const { host, done } = await paint();
  const grid = host.querySelector("[data-make-tiles]")?.className ?? "";
  const lines = [...host.querySelectorAll("[data-make-tile-what]")].map((el) => el.className);
  await done();
  expect(lines).toHaveLength(MAKE_TILES.length);
  expect(lines.map((line) => whyItDoesNotFit(grid, line))).toEqual(lines.map(() => null));
});

it("self-test: a one-line second line, or a grid too narrow for two lines, is named", () => {
  expect(whyItDoesNotFit("grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))]", "block truncate text-xs")).toBe(
    "the second line is held to one line",
  );
  expect(whyItDoesNotFit("grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]", "line-clamp-2 text-xs")).toMatch(/need 360px/);
});
