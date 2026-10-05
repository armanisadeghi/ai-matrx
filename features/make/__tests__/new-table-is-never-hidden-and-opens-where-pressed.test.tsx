// features/make/__tests__/new-table-is-never-hidden-and-opens-where-pressed.test.tsx
//
// G5 (b) — "NEW TABLE" IS NEVER HIDDEN WITHOUT A REASON, AND ITS NAME BOX OPENS WHERE IT WAS PRESSED
// (lane MAKE-HOME, found in lane 5's dry run, 2026-10-02).
//
// THE BREAKS. (1) With no active organization both data homes drew no "New table" at all and said
// nothing — a control silently gone. (2) Pressed, the name box opened at the foot of the list, under
// every organization's rows, far from the button. Now: both homes always offer New table once the
// store is open; the press opens ONE dialog (`NewTableDialog`, also /make's Table flow) that says
// where the table will be saved and, with no organization chosen, asks for one there — never a
// default, never a hidden control.
//
// RED before the fix: the homes' header gated New table on the active organization, the name box
// was opened by `askedBy` from the homes' footers, and the dialog did not exist.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(__dirname, "../../..");
/**
 * RED ON A PLANT: `MAKE_G5_PLANT_REF=<commit>` reads the homes from that commit instead of the
 * working tree (`git show`, nothing on disk is touched) — a commit before the fix turns the two
 * source halves red.
 */
const PLANT_REF = process.env.MAKE_G5_PLANT_REF;
const source = (file: string) =>
  PLANT_REF
    ? execFileSync("git", ["show", `${PLANT_REF}:${file}`], { cwd: REPO, encoding: "utf8" })
    : readFileSync(path.join(REPO, file), "utf8");
const HOMES = ["features/unified-data/home/DataHomeShellPage.tsx"];

let ACTIVE: { organizationId: string | null; organizationState: string } = { organizationId: null, organizationState: "required" };

jest.mock("@ai-matrx/records-ui", () => ({
  TablesHome: ({ askedBy, templatesHref }: { askedBy?: { create: number }; templatesHref?: string }) => (
    <div data-builder="TablesHome" data-asked={JSON.stringify(askedBy ?? null)} data-templates={templatesHref ?? ""} />
  ),
  RecordsMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  personActor: () => ({}),
}));
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-dialog="">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...rest}>{children}</button>,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "87a6e699-3622-4869-8843-d0867456c0dd" }));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({ selectActiveOrganizationName: () => "Cedar Ridge Physical Therapy" }));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({ useOrganizationRequired: () => ACTIVE }));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
  OrganizationContextNotice: ({ state }: { state: string }) => <div data-asks-organization={state} />,
}));
jest.mock("@/features/organizations/components/OrganizationPickerPopover", () => ({
  OrganizationPickerPopover: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({
  recordsUiHostFor: () => ({}),
  useRecordsDataSource: () => ({}),
  useRecordsUiPorts: () => ({}),
}));
jest.mock("@/features/unified-data/realtime/recordsRealtimePort", () => ({ createRecordsRealtimePort: () => undefined }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { NewTableDialog } = require("../MakeMount") as typeof import("../MakeMount");

async function open(what: "create") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<NewTableDialog what={what} onClose={() => undefined} />));
  const html = host.innerHTML;
  await act(async () => root.unmount());
  host.remove();
  return html;
}

it("with no active organization, New table asks where to save it — never nothing", async () => {
  ACTIVE = { organizationId: null, organizationState: "required" };
  const html = await open("create");
  expect(html).toContain('data-asks-organization="required"');
  expect(html).not.toContain('data-builder="TablesHome"');
});

it("with one chosen, the name box opens in the dialog, in that organization", async () => {
  ACTIVE = { organizationId: "0a54df90-eab8-4d07-ab29-81a45fb41e04", organizationState: "ready" };
  const html = await open("create");
  expect(html).toContain('data-asked="{&quot;create&quot;:1}"');
  // "Start from a template" leads to the one gallery (lane TEMPLATES, RETIRE-1), never a second list.
  expect(html).toContain('data-templates="/make#make-templates"');
});

it("the data home never hides New table behind the active organization", () => {
  for (const file of HOMES) {
    const src = source(file);
    expect([file, /storeOn\s*&&\s*active\.organizationId/.test(src)]).toEqual([file, false]);
  }
});

it("the name box is opened only by the New table dialog, never from a list's foot", () => {
  const args = PLANT_REF
    ? ["grep", "-l", "-E", "askedBy[=:]", PLANT_REF, "--", "*.tsx"]
    : ["grep", "--untracked", "-l", "-E", "askedBy[=:]", "--", "*.tsx"];
  const hits = execFileSync("git", args, { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .map((f) => (PLANT_REF ? f.replace(`${PLANT_REF}:`, "") : f))
    .filter((f) => f && !f.includes("__tests__"));
  expect(hits).toEqual(["features/make/MakeMount.tsx"]);
});
