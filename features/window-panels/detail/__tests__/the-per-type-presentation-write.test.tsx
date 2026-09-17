// 🚨 SAVING ONE RECORD TYPE'S EXCEPTION NEVER DROPS THE OTHERS — AND WHEN IT
//    CANNOT BE DONE SAFELY, THE PANE SAYS SO.
//
// The REAL write port (`savePresentation`) behind the REAL pane
// (`DetailPresentationPane`), with only the wire mocked, because the defect
// Bugbot found in frontend PR 228 (commit 4cbd9e45) lived exactly in the seam
// between them: a failed read of `ui.detail.presentation_by_type` was treated as
// an empty map, the write went ahead, every other record type the person had set
// was gone, and the pane cheerfully said "Saved."
//
// So this asserts the two things a person can see: nothing left the browser, and
// the screen told them why. The merge itself is pinned one layer down, over the
// primitive every map-valued knob shares
// (`lib/scoped-config/setUserKnobMapEntry.test.ts`).

import * as React from "react";
import { act } from "react";

import { DetailPresentationPane } from "@/lib/detail/core/DetailPresentationPane";
import { useDetailCore } from "@/lib/detail/core/useDetailCore";
import { instance, makePorts, mount } from "@/lib/detail/__tests__/harness";
import { invalidateEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { createClient } from "@/utils/supabase/client";

import { savePresentation } from "../savePresentation";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: jest.fn() }));

import { getStoreSingleton } from "@/lib/redux/store-singleton";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

type Call = { fn: string; args: Record<string, unknown> };

function fakeLadder(initial: unknown) {
  const state = { value: initial, resolveError: null as string | null };
  const calls: Call[] = [];
  const rpc = (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "knob_resolve") {
      return Promise.resolve(
        state.resolveError
          ? { data: null, error: { message: state.resolveError } }
          : { data: state.value, error: null },
      );
    }
    if (fn === "knob_override_set") {
      state.value = args.p_value;
      return Promise.resolve({ data: { ok: true }, error: null });
    }
    throw new Error(`unexpected rpc ${fn}`);
  };
  jest.mocked(createClient).mockReturnValue({
    rpc,
    schema: () => ({ rpc }),
  } as unknown as ReturnType<typeof createClient>);
  return { state, calls, writes: () => calls.filter((c) => c.fn === "knob_override_set") };
}

function signedIn(): void {
  jest.mocked(getStoreSingleton).mockReturnValue({
    getState: () => ({
      appContext: { organization_id: ORG },
      userAuth: { id: USER },
    }),
  } as unknown as ReturnType<typeof getStoreSingleton>);
}

function Pane() {
  const core = useDetailCore(instance(), "window", { onClose: () => {} });
  return (
    <div {...core.keyboard.rootProps} data-root>
      <DetailPresentationPane core={core} />
    </div>
  );
}

/** The pane starts collapsed; open it, choose a presentation, tick per-type, save. */
function click(container: HTMLElement, text: string): void {
  const el = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(text),
  );
  if (!el) throw new Error(`No button containing "${text}"`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function tickOnlyForThisType(container: HTMLElement): void {
  const box = container.querySelector<HTMLInputElement>("input[type='checkbox']");
  if (!box) throw new Error("no per-type checkbox");
  // React listens for `click` on a checkbox, not a synthesized `change`.
  act(() => {
    box.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  if (!box.checked) throw new Error("the per-type checkbox did not tick");
}

/** The real write port, bound as the host's `savePresentation`. */
const realPorts = () => makePorts({ savePresentation });

beforeEach(() => {
  jest.clearAllMocks();
  invalidateEffectiveKnob();
  signedIn();
});

it("refuses the per-type save when the current map cannot be read, and shows the reason", async () => {
  const ladder = fakeLadder({ task: "page" });
  ladder.state.resolveError = "knob ui.detail.presentation_by_type is not registered";
  const ports = realPorts();
  const m = mount(<Pane />, ports);

  click(m.container, "Change");
  click(m.container, "Docked");
  tickOnlyForThisType(m.container);
  await act(async () => {
    click(m.container, "Save");
  });

  const refusal = m.container.querySelector("[data-detail-presentation-refusal]");
  expect(refusal?.textContent).toContain("Nothing was saved");
  // Never a success line over a write that did not happen.
  expect(ports.notify.success).not.toHaveBeenCalled();
  expect(m.container.textContent).not.toContain("Saved. It applies");
  // And the person's other record type is untouched on the server.
  expect(ladder.writes()).toHaveLength(0);
  expect(ladder.state.value).toEqual({ task: "page" });
  m.unmount();
});

it("saves this type's exception beside the ones already there, and says so", async () => {
  const ladder = fakeLadder({ task: "page" });
  const ports = realPorts();
  const m = mount(<Pane />, ports);

  click(m.container, "Change");
  click(m.container, "Docked");
  tickOnlyForThisType(m.container);
  await act(async () => {
    click(m.container, "Save");
  });

  expect(m.container.querySelector("[data-detail-presentation-refusal]")).toBeNull();
  expect(ladder.state.value).toEqual({ task: "page", file: "docked" });
  expect(ports.notify.success).toHaveBeenCalledWith(
    "Every file now opens as a docked panel for you.",
  );
  m.unmount();
});

it("writes the plain default without reading the per-type map at all", async () => {
  const ladder = fakeLadder({ task: "page" });
  const ports = realPorts();
  const m = mount(<Pane />, ports);

  click(m.container, "Change");
  click(m.container, "Page");
  await act(async () => {
    click(m.container, "Save");
  });

  expect(ladder.writes()).toHaveLength(1);
  expect(ladder.writes()[0].args).toMatchObject({
    p_feature: "ui.detail",
    p_key: "default_presentation",
    p_scope_kind: "user",
    p_scope_id: USER,
    p_value: "page",
  });
  m.unmount();
});
