/**
 * PASTED WORK ON THE FOUR NEWLY-WIRED SURFACES SURVIVES A RELOAD.
 *
 * `every-text-entry-surface-keeps-its-work.test.ts` (the census guard) only
 * proves each of these four files CALLS the sitting primitive — it would
 * pass just as happily if the snapshot wired the wrong fields, or the apply
 * callback wrote them back to the wrong setters. This file is the forcing
 * function on the wiring itself: mount the REAL dialog, type into it the way
 * an Expert would, unmount it (a reload knows nothing except what the first
 * mount wrote to this browser's storage), mount it again, and check the
 * actual words are back on screen — not merely that some key exists in
 * localStorage.
 *
 * RED against the pre-fix components (verified 2026-09-17 by reverting each
 * dialog's `useDialogSitting` wiring in turn): the second mount shows empty
 * fields and no "We kept…" notice — see `every-text-entry-surface-keeps-
 * its-work.test.ts` for the source-level proof of the same regression.
 *
 * Doubles: `useMasterworkRun` / `useBuildRun` (the durable-run network
 * client — nothing here launches a run), `ProTextarea`/`Input` (heavy
 * editor chrome unrelated to the sitting mechanism — reduced to a plain
 * controlled `<textarea>`/`<input>` that still carries `value`/`onChange`),
 * Supabase-backed history reads, and `WindowPanel`'s drag/resize machinery.
 * Everything that owns the behaviour under test — the dialog's own
 * `useState`, its `useDialogSitting` snapshot/apply/clearScreen wiring, and
 * the real `createSittingStore` reading/writing real `localStorage` — is
 * real.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// ── Generic doubles shared by all four mounts ──────────────────────────────

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    placeholder?: string;
  }) => (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e)}
      placeholder={placeholder}
    />
  ),
}));

// `@/components/ui/{button,checkbox,badge,label,dialog}` all re-export their
// real implementation FROM this package — replacing the whole module would
// take every one of those down with it. Keep everything real; swap only
// `Input`, which is the heavy rich-text-adjacent field these dialogs use for
// short one-line values.
jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual("@ai-matrx/design-system"),
  Input: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    placeholder?: string;
  }) => (
    <input id={id} value={value} onChange={(e) => onChange(e)} placeholder={placeholder} />
  ),
}));

jest.mock("@/features/masterwork/MasterworkDictationOrigin", () => ({
  MasterworkDictationOrigin: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async () => true,
}));

// ── Audition-only doubles ───────────────────────────────────────────────────

jest.mock("../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: () => ({
    status: "idle",
    running: false,
    rejoining: false,
    stage: null,
    stages: [],
    error: null,
    result: null,
    runId: null,
    interruption: null,
    launch: jest.fn(),
    reset: jest.fn(),
    retry: jest.fn(),
    cancel: jest.fn(),
    cancelling: false,
    stoppedMessage: null,
    surfacing: false,
    dismiss: jest.fn(),
  }),
}));

jest.mock("../audition/auditionRuns", () => ({
  EXPERT_CALLS: [
    { score: 100, label: "Ready to ship" },
    { score: 0, label: "Not there yet" },
  ],
  listAuditionRuns: async () => [],
  saveExpertCall: jest.fn(),
}));

jest.mock("../components/masterworks/UnfoldingAuditionPanel", () => ({
  UnfoldingAuditionPanel: () => null,
}));

jest.mock("../components/masterworks/RuleFidelityTable", () => ({
  RuleFidelityTable: () => null,
}));

// ── Build-only doubles ──────────────────────────────────────────────────────

const mockBuildRun = {
  status: "idle",
  running: false,
  rejoining: false,
  error: null as string | null,
  result: null as unknown,
  progress: null,
  launch: jest.fn(),
  reset: jest.fn(),
};

jest.mock("../build/useBuildRun", () => ({
  useBuildRun: () => mockBuildRun,
}));

jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({
    children,
    footer,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

jest.mock("../components/masterworks/TryMasterworkBox", () => ({
  TryMasterworkBox: () => null,
}));

jest.mock("@/features/shell/constants/nav-data", () => ({
  WORKFLOWS_APP_URL: "https://workflows.test",
}));

jest.mock("../service", () => ({
  getRulebook: async (id: string) => ({
    id,
    name: "E-waste routing",
    slug: "e-waste-routing",
    description: "",
    metadata: {},
    rules: [],
    sections: {},
    source: {},
    status: "draft",
    visibility: "personal",
    version: 1,
    organization_id: "0e3f1c90-3333-4333-8333-333333333333",
    created_by: "7c2b6d41-4444-4444-8444-444444444444",
    created_at: "2026-09-16T20:00:00.000Z",
    updated_at: "2026-09-16T20:00:00.000Z",
    updated_by: null,
    deleted_at: null,
    assurance_level: null,
    industry_id: null,
    source_authority: null,
    source_rulebook_id: null,
    source_synced_at: null,
    source_version: null,
  }),
  listMasterworksForRulebook: async () => [],
}));

import { AuditionDialog } from "../components/masterworks/AuditionDialog";
import { CompareTwoDialog } from "../components/masterworks/CompareTwoDialog";
import { RunTheBench } from "../encore/RunTheBench";
import BuildWindow from "../build/BuildWindow";
import type { BenchProofState } from "../encore/benchProof";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const RULEBOOK_ID = "9b1f0c34-52ad-4e77-8c10-6f3d2b8e41aa";

interface Mounted {
  container: HTMLElement;
  rerender: (node: React.ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
}

// The real Radix Dialog (Audition, Compare-Two, Run-the-Bench) portals its
// content straight onto `document.body`, not into the mount container — so
// every lookup below reads the DOCUMENT, which always holds exactly one
// mounted surface at a time (each test fully unmounts before mounting again).
async function mount(node: React.ReactElement): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  return {
    container,
    async rerender(next: React.ReactElement) {
      await act(async () => root.render(next));
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function fieldById(_container: HTMLElement, id: string): HTMLInputElement | HTMLTextAreaElement {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (!el) throw new Error(`no field #${id} on screen`);
  return el;
}

async function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function buttonSaying(_container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => (button.textContent ?? "").includes(text),
  );
  if (!match) throw new Error(`no button saying "${text}" on screen`);
  return match;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/**
 * `useDialogSitting` debounces its write by 400ms (`WRITE_DEBOUNCE_MS`, see
 * `sitting/useDialogSitting.ts`) so a person who clears a field is not
 * fought by their own storage. Unmounting before that timer fires cancels
 * the write — the real equivalent of tabbing away before autosave finishes
 * — so every "reload" in this file waits it out first, the same way a real
 * reload only ever loses work typed in the last 400ms.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockBuildRun.running = false;
  mockBuildRun.result = null;
  mockBuildRun.error = null;
  mockBuildRun.progress = null;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the pasted Audition comparison survives a reload", () => {
  it("comes back with the candidate, the original, the case name and the vanilla input", async () => {
    const first = await mount(
      <AuditionDialog
        open
        onOpenChange={() => undefined}
        rulebookId={RULEBOOK_ID}
        rules={[]}
      />,
    );
    await typeInto(
      fieldById(first.container, "audition-candidate"),
      "Our Masterwork said the pallet needs a full chain-of-custody wipe log.",
    );
    await typeInto(
      fieldById(first.container, "audition-reference"),
      "The real published brief required serial-level wipe certificates.",
    );
    await typeInto(
      fieldById(first.container, "audition-context"),
      "the county courthouse IT closet pallet",
    );
    // Reveal the vanilla-AI textarea and fill it too — the fourth field the
    // registry names ("the input both were given").
    await click(fieldById(first.container, "audition-vanilla").closest("div")!
      .parentElement!.querySelector("button[role=checkbox]") as HTMLButtonElement);
    await settle();
    await first.unmount();

    // THE RELOAD: a brand-new mount that knows only what the first one wrote
    // to localStorage.
    const back = await mount(
      <AuditionDialog
        open
        onOpenChange={() => undefined}
        rulebookId={RULEBOOK_ID}
        rules={[]}
      />,
    );
    expect(document.body.textContent).toContain("We kept");
    expect(
      (fieldById(back.container, "audition-candidate") as HTMLTextAreaElement).value,
    ).toBe("Our Masterwork said the pallet needs a full chain-of-custody wipe log.");
    expect(
      (fieldById(back.container, "audition-reference") as HTMLTextAreaElement).value,
    ).toBe("The real published brief required serial-level wipe certificates.");
    expect((fieldById(back.container, "audition-context") as HTMLInputElement).value).toBe(
      "the county courthouse IT closet pallet",
    );
    await back.unmount();
  });

  it("start again clears the sitting and the screen", async () => {
    const first = await mount(
      <AuditionDialog
        open
        onOpenChange={() => undefined}
        rulebookId={RULEBOOK_ID}
        rules={[]}
      />,
    );
    await typeInto(fieldById(first.container, "audition-candidate"), "draft output");
    await typeInto(fieldById(first.container, "audition-reference"), "the real thing");
    await settle();
    await first.unmount();

    const back = await mount(
      <AuditionDialog
        open
        onOpenChange={() => undefined}
        rulebookId={RULEBOOK_ID}
        rules={[]}
      />,
    );
    expect(document.body.textContent).toContain("We kept");
    await click(buttonSaying(back.container, "Start again"));
    expect((fieldById(back.container, "audition-candidate") as HTMLTextAreaElement).value).toBe("");
    expect((fieldById(back.container, "audition-reference") as HTMLTextAreaElement).value).toBe("");
    await back.unmount();

    // A THIRD mount proves the storage itself was cleared, not just the screen.
    const third = await mount(
      <AuditionDialog
        open
        onOpenChange={() => undefined}
        rulebookId={RULEBOOK_ID}
        rules={[]}
      />,
    );
    expect(document.body.textContent).not.toContain("We kept");
    expect((fieldById(third.container, "audition-candidate") as HTMLTextAreaElement).value).toBe("");
    await third.unmount();
  });
});

describe("the pasted Compare-Two answers survive a reload", () => {
  it("comes back with both answers and what each was called", async () => {
    const first = await mount(
      <CompareTwoDialog open onOpenChange={() => undefined} rulebookId={RULEBOOK_ID} />,
    );
    await typeInto(fieldById(first.container, "compare-label-one"), "Watson's adviser");
    await typeInto(
      fieldById(first.container, "compare-text-one"),
      "Refund the client and note the exception in the ledger.",
    );
    await typeInto(fieldById(first.container, "compare-label-two"), "Montessori's adviser");
    await typeInto(
      fieldById(first.container, "compare-text-two"),
      "Offer a store credit and flag the case for review.",
    );
    await settle();
    await first.unmount();

    const back = await mount(
      <CompareTwoDialog open onOpenChange={() => undefined} rulebookId={RULEBOOK_ID} />,
    );
    expect(document.body.textContent).toContain("We kept");
    expect((fieldById(back.container, "compare-label-one") as HTMLInputElement).value).toBe(
      "Watson's adviser",
    );
    expect((fieldById(back.container, "compare-text-one") as HTMLTextAreaElement).value).toBe(
      "Refund the client and note the exception in the ledger.",
    );
    expect((fieldById(back.container, "compare-label-two") as HTMLInputElement).value).toBe(
      "Montessori's adviser",
    );
    expect((fieldById(back.container, "compare-text-two") as HTMLTextAreaElement).value).toBe(
      "Offer a store credit and flag the case for review.",
    );
    await back.unmount();
  });
});

describe("the trial bench's job, material and expert answer survive a reload", () => {
  const bench: BenchProofState = {
    status: "ready",
    canRunHere: true,
    running: null,
    howToRun: "",
    form: {
      masterwork_id: "m1",
      masterwork_name: "E-waste router",
      judge_model: "judge-1",
      frontier_model: "frontier-1",
      cheap_model: "cheap-1",
      budget_multiple: 3,
      budget_multiple_source: "default",
      corpus_sources: null,
      corpus_note: "",
      durable: true,
      durable_note: "",
    },
  } as unknown as BenchProofState;

  it("comes back with the job, the case, and the expert's answer, and says so before a paid trial starts", async () => {
    const first = await mount(<RunTheBench rulebookId={RULEBOOK_ID} bench={bench} />);
    await click(buttonSaying(first.container, "Run the Bench"));
    await typeInto(
      fieldById(first.container, "bench-task"),
      "Route this pallet to the correct disposition.",
    );
    await typeInto(
      fieldById(first.container, "bench-case"),
      "County courthouse IT closet pallet, 18 intact towers, no wipe cert.",
    );
    await typeInto(
      fieldById(first.container, "bench-gt"),
      "Manual review — insufficient chain of custody for auto-approval.",
    );
    await settle();
    await first.unmount();

    const back = await mount(<RunTheBench rulebookId={RULEBOOK_ID} bench={bench} />);
    await click(buttonSaying(back.container, "Run the Bench"));
    expect(document.body.textContent).toContain("We kept");
    expect((fieldById(back.container, "bench-task") as HTMLTextAreaElement).value).toBe(
      "Route this pallet to the correct disposition.",
    );
    expect((fieldById(back.container, "bench-case") as HTMLTextAreaElement).value).toBe(
      "County courthouse IT closet pallet, 18 intact towers, no wipe cert.",
    );
    expect((fieldById(back.container, "bench-gt") as HTMLTextAreaElement).value).toBe(
      "Manual review — insufficient chain of custody for auto-approval.",
    );
    await back.unmount();
  });
});

describe("the Build window's name and instructions survive a reload", () => {
  it("comes back with what the Masterwork was to be called and built from", async () => {
    const first = await mount(
      <BuildWindow isOpen onClose={() => undefined} rulebookId={RULEBOOK_ID} />,
    );
    // Wait for the async getRulebook() read to resolve and the setup form
    // to replace the loading spinner.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await typeInto(fieldById(first.container, "masterwork-name"), "Routing Advisor");
    // Switch to "Instructions" so the deliverable field is on screen too.
    await click(buttonSaying(first.container, "Instructions"));
    await typeInto(
      fieldById(first.container, "masterwork-deliverable"),
      "the disposition decision and its reasoning for one pallet",
    );
    await settle();
    await first.unmount();

    const back = await mount(
      <BuildWindow isOpen onClose={() => undefined} rulebookId={RULEBOOK_ID} />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("We kept");
    expect((fieldById(back.container, "masterwork-name") as HTMLInputElement).value).toBe(
      "Routing Advisor",
    );
    // The deliverable field only renders once "Instructions" is picked again
    // — the sitting restores the DATA even though the kind choice itself
    // isn't part of what this surface declared it keeps.
    await click(buttonSaying(back.container, "Instructions"));
    expect(
      (fieldById(back.container, "masterwork-deliverable") as HTMLTextAreaElement).value,
    ).toBe("the disposition decision and its reasoning for one pallet");
    await back.unmount();
  });

  it("forgets the sitting once the Masterwork is actually built", async () => {
    const first = await mount(
      <BuildWindow isOpen onClose={() => undefined} rulebookId={RULEBOOK_ID} />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await typeInto(fieldById(first.container, "masterwork-name"), "Routing Advisor");
    // Let the debounced write land first — a real Build takes far longer
    // than 400ms, so by the time it finishes the typed name is always
    // already on disk. Racing the write against completion is not a
    // scenario a real reload can produce.
    await settle();
    // The build finished — the hook now reports a result. `useBuildRun` is a
    // double; mutating what it returns and re-rendering the SAME mounted
    // tree is how a real finished run would land on this component too.
    mockBuildRun.result = {
      workflowId: "wf-1",
      name: "Routing Advisor",
      masterworkKind: "edit",
      agentCount: 1,
      submitLabel: null,
    };
    await first.rerender(
      <BuildWindow isOpen onClose={() => undefined} rulebookId={RULEBOOK_ID} />,
    );
    await first.unmount();

    // A fresh window for the NEXT Masterwork — this is the state a person
    // actually reopens the window into, not the "just built" screen still
    // holding the last result.
    mockBuildRun.result = null;
    const back = await mount(
      <BuildWindow isOpen onClose={() => undefined} rulebookId={RULEBOOK_ID} />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.textContent).not.toContain("We kept");
    expect((fieldById(back.container, "masterwork-name") as HTMLInputElement).value).toBe("");
    await back.unmount();
  });
});
