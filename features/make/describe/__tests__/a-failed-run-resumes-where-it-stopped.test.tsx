/**
 * @jest-environment jsdom
 */
// features/make/describe/__tests__/a-failed-run-resumes-where-it-stopped.test.tsx — lane MAKE-WORKS.
//
// THE USE CASE. An office manager types "track my team's PTO" on /make. The design comes back, then the
// install trips over a network blip. Before the guided run, Try again started over: a second model run
// (another 30–60 s and another bill) for a design that was already good, and a second one-off template.
// The owner of a 6-client agency types "an agency OS with clients, retainers, a dashboard and a 90-day
// plan" — before, that went to the template builder, which cannot make a page, so he got bare tables.
//
// BREAKS THIS CATCHES: Try again re-running a finished step · a workspace-shaped sentence never reaching
// the Space Builder · the person's words padded before they reach Spaces · a finished workspace left
// unopened · a failure that does not name the step it stopped at.

import { act } from "react";
import { createRoot } from "react-dom/client";

const ORG = "5b0b8d1e-3c4e-4f7d-9a51-2f7b8e3c9d10";
const TABLE = "a7c1f0e2-6b1d-4c55-8e0a-3d9f2b6c4e81";

const push = jest.fn();
const writerRun = jest.fn();
const spaceBuild = jest.fn();
const runTemplateDoor = jest.fn();

jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("@ai-matrx/records/core", () => ({ supabaseDataSource: () => ({}) }));
jest.mock("@ai-matrx/records/templates", () => ({ runTemplateDoor: (...a: unknown[]) => runTemplateDoor(...a) }));
jest.mock("@ai-matrx/agents/mandates", () => ({ MANDATE_KEYS: { make__describe_template: "make.describe_template" } }));
// Like the real hook, the run hands the model's answer to the caller's `coerce` and returns what it reads.
const coercedRun = async (o: { coerce?: (v: unknown) => unknown }) => {
  const v = await writerRun(o);
  return o.coerce ? o.coerce(v) : v;
};
jest.mock("@ai-matrx/chat/agents/hooks/useFloatingAgentRun", () => ({ useFloatingAgentRun: () => ({ run: coercedRun, isRunning: false }) }));
// The box before the guided run ran its model headless; the same stand-in serves both so the guard can fail before.
jest.mock("@ai-matrx/chat/agents/hooks/useHeadlessAgentJson", () => ({ HeadlessAgentRunError: class extends Error {}, useHeadlessAgentJson: () => ({ run: writerRun, isRunning: false }) }));
jest.mock("@ai-matrx/chat/surfaces/runtime/surface-mandates", () => ({ useDeclaredSurfaceMandates: () => undefined }));
jest.mock("@ai-matrx/kit/composer-keys", () => ({ enterSendsHere: () => true }));
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, asChild, ...rest }: { children: React.ReactNode; onClick?: () => void; asChild?: boolean } & Record<string, unknown>) =>
    asChild ? <>{children}</> : <button type="button" onClick={onClick} data-retry={"data-make-describe-retry" in rest ? "" : undefined}>{children}</button>,
}));
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({ value, onChange, onSubmit }: { value: string; onChange: (e: { target: { value: string } }) => void; onSubmit: () => void }) => (
    <>
      <textarea value={value} onChange={(e) => onChange({ target: { value: e.target.value } })} />
      <button type="button" data-submit="" onClick={onSubmit}>Make it</button>
    </>
  ),
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({ useOrganizationRequired: () => ({ organizationId: ORG, organizationState: "ready" }) }));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({ OrganizationContextNotice: () => null }));
jest.mock("@/features/spaces/embed/useSpaceBuild", () => ({ SpaceBuildRefused: class extends Error {}, useSpaceBuild: () => ({ build: spaceBuild, isRunning: false, available: true }) }));
jest.mock("@/features/unified-data/hub/doors", () => ({ dataHomeTables: async () => ({ ok: true, data: [] }) }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("../../gallery/TemplateGallery", () => ({ Landing: () => null, Progress: () => null }));
jest.mock("../../gallery/galleryHref", () => ({ templatePreviewHref: (id: string) => `/make/templates/${id}` }));
jest.mock("../describeTemplate", () => ({
  AnswerRefused: class extends Error {},
  DesignRefused: class extends Error {},
  readDesign: (v: { template: Record<string, unknown>; reuses: unknown[]; notes: string[] }) => ({
    answer: v,
    safe: { template: v.template, reuses: v.reuses, notes: [] },
    checked: { ok: true, spec: v.template, autoFixes: [] },
  }),
  applySafeReuses: (a: { template: Record<string, unknown>; reuses: unknown[]; notes: string[] }) => ({ template: a.template, reuses: a.reuses, notes: [] }),
  bindReuses: (s: unknown) => s,
  dropOrphanRows: (s: unknown) => ({ spec: s, notes: [] }),
  checkDescribeTemplate: (t: unknown) => ({ ok: true, spec: t, autoFixes: [] }),
  coerceDescribeAnswer: (v: unknown) => v,
  declareDescribeSpec: async () => "tpl-1",
  describeVariables: () => ({}),
  findBuiltSpace: async () => null,
  readExistingTables: async () => [],
  readOrganizationFacts: async () => ({ name: "Brightline", industry: null, time_zone: "UTC", working_hours: null }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the mocks above
const { DescribeBox } = require("../DescribeBox") as typeof import("../DescribeBox");

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<DescribeBox />));
  return host;
}

async function say(host: HTMLElement, words: string) {
  const box = host.querySelector("textarea")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(box, words);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => (host.querySelector("[data-submit]") as HTMLButtonElement).click());
  await act(async () => new Promise((r) => setTimeout(r, 20)));
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = "";
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("the guided run on /make", () => {
  it("resumes a failed install without designing again, then opens what was made", async () => {
    writerRun.mockResolvedValue({ template: { tables: [] }, notes: [], reuses: [] });
    runTemplateDoor
      .mockResolvedValueOnce({ ok: false, answer: null, error: { message: "Failed to fetch" }, calls: 1 })
      .mockResolvedValueOnce({ ok: true, answer: { made: [{ kind: "table", ref: "time_off", id: TABLE, title: "Time off" }] }, calls: 3 });
    const host = await mount();
    await say(host, "track my team's PTO");

    const alert = host.querySelector("[data-make-describe-refusal]");
    expect(alert?.getAttribute("data-make-failed-at")).toBe("build");
    expect(alert?.textContent).toContain("That stopped before it finished. Try again.");
    expect(alert?.textContent).not.toContain("Failed to fetch");

    await act(async () => (host.querySelector("[data-retry]") as HTMLButtonElement).click());
    await act(async () => new Promise((r) => setTimeout(r, 20)));

    expect(writerRun).toHaveBeenCalledTimes(1);
    expect(runTemplateDoor).toHaveBeenCalledTimes(2);
    expect(runTemplateDoor.mock.calls[1]![3]).toBe("tpl-1");
    expect(host.querySelector("[data-make-describe]")?.getAttribute("data-make-describe")).toBe("installed");
    expect(host.querySelector(`a[href="/data/${TABLE}"]`)).not.toBeNull();
    expect(spaceBuild).not.toHaveBeenCalled();
  });

  it("designs once more on its own when the check refuses the first design, then builds", async () => {
    // The check now runs inside the run's read (readDesign): its refusal is a DesignRefused thrown from `coerce`.
    const mod = jest.requireMock("../describeTemplate") as { readDesign: (v: unknown) => unknown; DesignRefused: new (m: string) => Error };
    const real = mod.readDesign;
    let n = 0;
    mod.readDesign = (v: unknown) => {
      if (++n === 1) throw new mod.DesignRefused("\"Call time\" is required, and this row leaves it empty.");
      return real(v);
    };
    writerRun.mockResolvedValue({ template: { tables: [] }, notes: [], reuses: [] });
    runTemplateDoor.mockResolvedValue({ ok: true, answer: { made: [{ kind: "table", ref: "call", id: TABLE, title: "Discovery calls" }] }, calls: 2 });
    const host = await mount();
    await say(host, "a booking page for discovery calls");
    mod.readDesign = real;

    expect(writerRun).toHaveBeenCalledTimes(2);
    expect(host.querySelector("[data-make-describe]")?.getAttribute("data-make-describe")).toBe("installed");
    expect(host.textContent).toContain("2nd try");
  });

  it("a reload during the install reattaches to the same template and never designs or declares again", async () => {
    const startedAt = Date.now() - 60_000;
    localStorage.setItem(
      `make.describe.run.v1:${ORG}`,
      JSON.stringify({
        key: "9f1c2d3e-0000-4000-8000-000000000001", sentence: "track my team's PTO", organizationId: ORG,
        plan: { route: "data", steps: ["design", "check", "build", "open"] }, startedAt, endedAt: null,
        step: { design: { state: "done", at: startedAt }, check: { state: "done", at: startedAt }, build: { state: "doing", at: startedAt + 30_000 } },
        space: null, templateId: "tpl-9", install: null, notes: [], failed: null,
      }),
    );
    runTemplateDoor.mockResolvedValue({ ok: true, answer: { made: [{ kind: "table", ref: "time_off", id: TABLE, title: "Time off" }] }, calls: 1 });
    const host = await mount();
    await act(async () => new Promise((r) => setTimeout(r, 20)));

    expect(writerRun).not.toHaveBeenCalled();
    expect(runTemplateDoor).toHaveBeenCalledTimes(1);
    expect(runTemplateDoor.mock.calls[0]![3]).toBe("tpl-9");
    expect(host.querySelector("[data-make-describe]")?.getAttribute("data-make-describe")).toBe("installed");
  });

  it("a workspace whose build was started before a pause is found and opened, never built a second time", async () => {
    const mod = jest.requireMock("../describeTemplate") as { findBuiltSpace: (...a: unknown[]) => Promise<unknown> };
    const real = mod.findBuiltSpace;
    const looked: unknown[][] = [];
    mod.findBuiltSpace = async (...a: unknown[]) => (looked.push(a), { id: "s9", title: "Agency OS" });
    const startedAt = Date.now() - 90_000;
    localStorage.setItem(
      `make.describe.run.v1:${ORG}`,
      JSON.stringify({
        key: "9f1c2d3e-0000-4000-8000-000000000002", sentence: "an agency OS with clients, retainers, a dashboard and a 90-day plan", organizationId: ORG,
        plan: { route: "page", steps: ["space", "open"] }, startedAt, endedAt: null,
        step: { space: { state: "failed", at: startedAt } }, space: null, templateId: null, install: null, notes: [],
        failed: { at: "space", why: "That stopped before it finished. Try again." },
      }),
    );
    const host = await mount();
    // A failed run is shown as it ended; Try again looks for the Space that build made before building again.
    expect(host.querySelector("[data-make-describe-refusal]")).not.toBeNull();
    await act(async () => (host.querySelector("[data-retry]") as HTMLButtonElement).click());
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    mod.findBuiltSpace = real;

    expect(spaceBuild).not.toHaveBeenCalled();
    expect(looked[0]![1]).toBe(ORG);
    expect(looked[0]![2]).toBe(startedAt);
    expect(push).toHaveBeenCalledWith("/spaces/s9");
  });

  it("sends a workspace to the Space Builder with the person's exact words and opens it", async () => {
    spaceBuild.mockResolvedValue({ summary: "Agency OS", rootSpaceId: "s1", url: "/spaces/s1", spaceIds: ["s1"], tableIds: [] });
    const words = "an agency OS with clients, retainers, a dashboard and a 90-day plan";
    const host = await mount();
    await say(host, words);

    expect(spaceBuild).toHaveBeenCalledTimes(1);
    expect(spaceBuild.mock.calls[0]![0]).toMatchObject({ request: words, organizationId: ORG });
    expect(writerRun).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/spaces/s1");
    expect(host.querySelector("[data-make-describe]")?.getAttribute("data-make-route")).toBe("page");
  });
});
