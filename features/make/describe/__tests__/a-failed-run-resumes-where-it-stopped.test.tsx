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
jest.mock("@ai-matrx/chat/agents/hooks/useFloatingAgentRun", () => ({ useFloatingAgentRun: () => ({ run: writerRun, isRunning: false }) }));
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
jest.mock("@/features/spaces/embed/useSpaceBuild", () => ({ useSpaceBuild: () => ({ build: spaceBuild, isRunning: false, available: true }) }));
jest.mock("@/features/unified-data/hub/doors", () => ({ dataHomeTables: async () => ({ ok: true, data: [] }) }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("../../gallery/TemplateGallery", () => ({ Landing: () => null, Progress: () => null }));
jest.mock("../../gallery/galleryHref", () => ({ templatePreviewHref: (id: string) => `/make/templates/${id}` }));
jest.mock("../describeTemplate", () => ({
  AnswerRefused: class extends Error {},
  applySafeReuses: (a: { template: Record<string, unknown>; reuses: unknown[]; notes: string[] }) => ({ template: a.template, reuses: a.reuses, notes: [] }),
  bindReuses: (s: unknown) => s,
  checkDescribeTemplate: (t: unknown) => ({ ok: true, spec: t, autoFixes: [] }),
  coerceDescribeAnswer: (v: unknown) => v,
  declareDescribeSpec: async () => "tpl-1",
  describeVariables: () => ({}),
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
    const mod = jest.requireMock("../describeTemplate") as { checkDescribeTemplate: unknown };
    const real = mod.checkDescribeTemplate;
    let n = 0;
    mod.checkDescribeTemplate = (t: unknown) => (++n === 1 ? { ok: false, line: "\"Call time\" is required, and this row leaves it empty.", problems: [], spec: t, autoFixes: [] } : { ok: true, spec: t, autoFixes: [] });
    writerRun.mockResolvedValue({ template: { tables: [] }, notes: [], reuses: [] });
    runTemplateDoor.mockResolvedValue({ ok: true, answer: { made: [{ kind: "table", ref: "call", id: TABLE, title: "Discovery calls" }] }, calls: 2 });
    const host = await mount();
    await say(host, "a booking page for discovery calls");
    mod.checkDescribeTemplate = real;

    expect(writerRun).toHaveBeenCalledTimes(2);
    expect(host.querySelector("[data-make-describe]")?.getAttribute("data-make-describe")).toBe("installed");
    expect(host.textContent).toContain("2nd try");
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
