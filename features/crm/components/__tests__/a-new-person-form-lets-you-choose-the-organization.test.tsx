// features/crm/components/__tests__/a-new-person-form-lets-you-choose-the-organization.test.tsx
//
// THE BREAK (found on a walk, 2026-10-02). With no active organization the CRM "New person" form
// said "choose one from the menu under your avatar" — a menu with no such choice — so nobody could
// add a person. Now the form carries the shared organization picker itself and files the record
// into whatever is chosen there.
//
// RED ON A PLANT: `CRM_FORM_PLANT_REF=<commit before the fix>` renders that commit's form instead
// (written to an untracked sibling file for the run, removed after) — the picker assertions fail.

import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CEDAR = "87a6e699-3622-4869-8843-d0867456c0dd";
const store = {
  org: { id: null as string | null, name: null as string | null },
  subs: new Set<() => void>(),
  set(id: string | null, name: string | null) {
    this.org = { id, name };
    this.subs.forEach((fn) => fn());
  },
};

const resolveParty = jest.fn(async () => ({ partyId: "p1", created: true, displayName: "x" }));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (select: () => unknown) => {
    useSyncExternalStore(
      (fn) => (store.subs.add(fn), () => store.subs.delete(fn)),
      () => store.org,
    );
    return select();
  },
}));
let MEMBER_OF: { id: string; name: string }[] = [];
jest.mock("@/features/organizations/hooks/useActiveOrganizationPicker", () => ({
  useActiveOrganizationPicker: () => ({ organizations: MEMBER_OF, loading: false, loadFailed: false }),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => store.org.id,
  selectOrganizationName: () => store.org.name,
}));
jest.mock("@/features/organizations/components/OrganizationPickerPopover", () => ({
  OrganizationPickerPopover: ({ trigger }: { trigger: React.ReactNode }) => (
    <span data-org-picker="">
      {trigger}
      <button data-pick="cedar" onClick={() => store.set(CEDAR, "Cedar Ridge Physical Therapy")}>
        Cedar Ridge Physical Therapy
      </button>
    </span>
  ),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("@/components/official/entity-ref/toastDoor", () => ({ toastDoor: () => undefined }));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...rest}>{children}</button>,
}));
jest.mock("@/components/ui/label", () => ({
  Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props} />,
}));
jest.mock("@ai-matrx/design-system", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@ai-matrx/chat/surfaces/utils/surface-display", () => ({ surfaceValueLabels: () => ({}) }));
jest.mock("@/features/surfaces/manifests/crm-create-party.manifest", () => ({
  CRM_CREATE_PARTY_SURFACE_NAME: "crm-create-party",
  createCrmCreatePartyScope: (x: unknown) => x,
  crmCreatePartyManifest: { readTargets: [], writeTargets: [] },
}));
jest.mock("../../service", () => ({
  ensurePrimaryContactPoints: jest.fn(async () => undefined),
  normalizeMediumValue: (_k: string, v: string) => v,
  resolveParty: (...args: unknown[]) => (resolveParty as jest.Mock)(...args),
}));

const REPO = path.resolve(__dirname, "../../../..");
const PLANT_REF = process.env.CRM_FORM_PLANT_REF;
const PLANT_FILE = path.join(REPO, "features/crm/components/PartyCreateFormPlant.tsx");
if (PLANT_REF) {
  writeFileSync(
    PLANT_FILE,
    execFileSync("git", ["show", `${PLANT_REF}:features/crm/components/PartyCreateForm.tsx`], { cwd: REPO, encoding: "utf8" }),
  );
}
afterAll(() => existsSync(PLANT_FILE) && rmSync(PLANT_FILE));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { PartyCreateForm } = require(PLANT_REF ? "../PartyCreateFormPlant" : "../PartyCreateForm") as typeof import("../PartyCreateForm");

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

it("with no active organization, the form offers its own picker and files into the chosen one", async () => {
  store.set(null, null);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<PartyCreateForm onCancel={() => {}} onCreated={() => {}} />));

  expect(host.textContent).not.toMatch(/menu under your avatar/);
  expect(host.querySelector("[data-org-picker]")).not.toBeNull();

  await act(async () => {
    setValue(host.querySelector("#crm-first") as HTMLInputElement, "Dana");
    setValue(host.querySelector("#crm-last") as HTMLInputElement, "Whitcomb");
  });
  await act(async () => (host.querySelector('[data-pick="cedar"]') as HTMLButtonElement).click());
  expect(host.textContent).toContain("Filing into Cedar Ridge Physical Therapy");

  const create = [...host.querySelectorAll("button")].find((b) => b.textContent === "Create record")!;
  await act(async () => create.click());
  expect(resolveParty).toHaveBeenCalledWith(expect.objectContaining({ orgId: CEDAR, displayName: "Dana Whitcomb" }));
});

it("a passed organization the person cannot file into falls back to the picker", async () => {
  const OTHER = "11111111-1111-4111-8111-111111111111";
  store.set(null, null);
  MEMBER_OF = [{ id: CEDAR, name: "Cedar Ridge Physical Therapy" }];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<PartyCreateForm initialOrgId={OTHER} onCancel={() => {}} onCreated={() => {}} />));
  expect(host.querySelector("[data-org-picker]")).not.toBeNull();

  // a passed organization she belongs to stays pinned, with no picker
  await act(async () => root.render(<PartyCreateForm initialOrgId={CEDAR} onCancel={() => {}} onCreated={() => {}} />));
  expect(host.querySelector("[data-org-picker]")).toBeNull();
  expect(host.textContent).toContain("Filing into Cedar Ridge Physical Therapy");
});
