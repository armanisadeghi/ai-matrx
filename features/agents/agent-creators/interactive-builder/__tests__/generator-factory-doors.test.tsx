/**
 * AF-D doors #5 (mandate "+ Agent") and #6 (/agents/new/generate) in the ONE generator.
 *
 * legacy (the live knob value): today's screen — the generator shortcut / drafting job,
 * no Examples field, no build. pipeline: an Examples field (free mode), the press starts a
 * server build naming the door (the browser inserts nothing), BuildProgress shows it, and
 * in mandate mode a kept agent goes to the holder controls exactly as `onCreated` does.
 * The knob is mocked — never a live knob row.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

let door: "legacy" | "pipeline" = "legacy";
jest.mock("@/features/agents/factory/door", () => ({ useFactoryDoor: () => door }));

const started: Record<string, unknown>[] = [];
jest.mock("@/features/agents/factory/service", () => ({
  startAgentBuild: async (input: Record<string, unknown>) => {
    started.push(input);
    return "build-6";
  },
}));

let finish: ((state: Record<string, unknown>) => void) | null = null;
jest.mock("@/features/agents/factory/components/BuildProgress", () => ({
  BuildProgress: ({ buildId, onFinished }: { buildId: string; onFinished?: (s: Record<string, unknown>) => void }) => {
    finish = onFinished ?? null;
    return <div data-testid="build-progress">{`progress:${buildId}`}</div>;
  },
}));

const trigger = jest.fn(async () => undefined);
const launchMandate = jest.fn(async () => undefined);
const createFromBuilder = jest.fn(async () => ({ success: true, agentId: "legacy-agent" }));
jest.mock("@ai-matrx/chat/agents/hooks/useShortcutTrigger", () => ({ useShortcutTrigger: () => trigger }));
jest.mock("@ai-matrx/chat/agents/hooks/useAgentLauncher", () => ({ useAgentLauncher: () => ({ launchMandate }) }));
jest.mock("@ai-matrx/chat/mandates/useMandate", () => ({
  useMandate: () => ({ mandate: { key: "mandates.holder_draft" }, error: null, organizationPending: false }),
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/surface-mandates", () => ({ useDeclaredSurfaceMandates: () => undefined }));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.thunks", () => ({
  destroyInstanceIfAllowed: () => ({ type: "noop" }),
}));
jest.mock("@ai-matrx/chat/agents/redux/agent-shortcuts/thunks", () => ({
  ensureShortcutLoaded: () => ({ type: "noop" }),
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/active-requests/useRetainRequestForViewer", () => ({
  useRetainRequestForViewer: () => undefined,
}));
jest.mock("@ai-matrx/chat/agents/constants/system-shortcuts", () => ({
  getSystemShortcut: () => ({ id: "agent-generator-01", label: "Agent Generator", temporaryConfigs: {} }),
}));
jest.mock("../../services/agentBuilderService", () => ({
  createAgentFromBuilder: (...a: unknown[]) => createFromBuilder(...(a as [])),
  useAgentBuilder: () => ({ createAgent: jest.fn() }),
}));
jest.mock("@/features/ai-models/preferredAuthoringModel", () => ({ resolvePreferredAuthoringModel: async () => null }));
jest.mock("@/features/overlays/openers/mandateWindow", () => ({ useOpenMandateWindow: () => jest.fn() }));
jest.mock("@/hooks/useDebugContext", () => ({
  useDebugContext: () => ({ publish: jest.fn(), publishKey: jest.fn(), isActive: false }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: async () => undefined }),
  // The shortcut is loaded; no conversation exists yet.
  useAppSelector: (sel: (s: unknown) => unknown) => {
    try {
      return sel({ agentShortcut: { shortcuts: { "agent-generator-01": { id: "agent-generator-01" } } } });
    } catch {
      return null;
    }
  },
}));
jest.mock("@/components/official/VoiceTextarea", () => ({
  VoiceTextarea: ({ value, onChange, placeholder, disabled, ...rest }: Record<string, unknown>) => (
    <textarea
      aria-label={(rest["aria-label"] as string) ?? (placeholder as string)}
      value={value as string}
      onChange={onChange as never}
      placeholder={placeholder as string}
      disabled={disabled as boolean}
    />
  ),
}));
jest.mock("@ai-matrx/rich-content/levels/RichContent", () => ({ RichContent: () => null }));
jest.mock("../AgentJsonDisplay", () => ({ AgentStreamingResponse: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async () => "org-active" }));

import { AgentGenerator } from "../AgentGenerator";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  started.length = 0;
  finish = null;
  trigger.mockClear();
  launchMandate.mockClear();
  createFromBuilder.mockClear();
});

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(node);
  });
  return host;
}

function type(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`no button "${label}" in: ${[...host.querySelectorAll("button")].map((b) => b.textContent).join(" | ")}`);
  return found as HTMLButtonElement;
}

const describeBox = (host: HTMLElement) =>
  host.querySelector('textarea[placeholder="Describe what you want your AI agent to do..."]') as HTMLTextAreaElement;

describe("door #6 — /agents/new/generate", () => {
  it("legacy: today's generator — no Examples, Generate runs the shortcut, no build", async () => {
    door = "legacy";
    const host = await render(<AgentGenerator />);
    expect(host.querySelector('[data-testid="generator-examples"]')).toBeNull();
    await act(async () => type(describeBox(host), "Summarize rental listings"));
    await act(async () => button(host, "Generate").click());
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(started).toEqual([]);
    expect(host.querySelector('[data-testid="build-progress"]')).toBeNull();
  });

  it("pipeline: the Examples ride the build, the server starts it, BuildProgress shows it", async () => {
    door = "pipeline";
    const host = await render(<AgentGenerator />);
    expect(host.querySelector('[data-testid="generator-examples"]')).not.toBeNull();
    await act(async () => type(describeBox(host), "Summarize rental listings"));
    const examples = [...host.querySelectorAll('[data-testid="generator-examples"] textarea')] as HTMLTextAreaElement[];
    expect(examples).toHaveLength(3);
    await act(async () => {
      type(examples[0], "2br in Austin, $1,900");
      type(examples[1], "Studio in Reno, $1,100");
    });
    await act(async () => button(host, "Build agent").click());
    expect(trigger).not.toHaveBeenCalled();
    expect(started).toHaveLength(1);
    // No owner org on this door: the active organization (asked for when none is selected).
    expect(started[0]).toMatchObject({ door: "generate", mandateKey: null, builtin: false, organizationId: "org-active" });
    const spec = started[0].spec as Record<string, unknown>;
    expect(spec.purpose).toBe("Summarize rental listings");
    expect(JSON.parse(spec.sample_inputs as string)).toEqual(["2br in Austin, $1,900", "Studio in Reno, $1,100"]);
    expect(host.querySelector('[data-testid="build-progress"]')?.textContent).toBe("progress:build-6");
  });
});

const MANDATE = {
  mandateKey: "news.coarse_relevance",
  label: "Coarse relevance",
  variables: {},
  owner: { kind: "system" as const },
  summary: <p>job</p>,
};

describe("door #5 — mandate + Agent", () => {
  it("legacy: today's drafting job runs; nothing is built on the server", async () => {
    door = "legacy";
    const onCreated = jest.fn();
    const host = await render(<AgentGenerator mandate={{ ...MANDATE, onCreated }} />);
    await act(async () => button(host, "Generate").click());
    expect(launchMandate).toHaveBeenCalledTimes(1);
    expect(started).toEqual([]);
  });

  it("pipeline: a server build for THIS mandate; a passed agent goes to the holder controls", async () => {
    door = "pipeline";
    const onCreated = jest.fn();
    const host = await render(<AgentGenerator mandate={{ ...MANDATE, onCreated }} />);
    expect(host.querySelector('[data-testid="generator-examples"]')).toBeNull(); // real runs prove it
    await act(async () => button(host, "Build agent").click());
    expect(launchMandate).not.toHaveBeenCalled();
    expect(started[0]).toMatchObject({ door: "mandate_holder_draft", mandateKey: "news.coarse_relevance", builtin: true });
    expect(createFromBuilder).not.toHaveBeenCalled(); // the browser inserts nothing
    await act(async () => finish?.({ outcome: "send_backs_exhausted", agent_id: "draft-1" }));
    expect(onCreated).not.toHaveBeenCalled(); // a refused draft never becomes the holder
    await act(async () => finish?.({ outcome: "passed", agent_id: "agent-5" }));
    expect(onCreated).toHaveBeenCalledWith("agent-5");
  });
});
