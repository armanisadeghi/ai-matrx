/**
 * CENSUS ROW 8 GUARD — "you can pick ONE of your own conversations".
 *
 * The Masterwork methods census (2026-09-12) reported every per-row checkbox
 * in "Your AI Matrx chats" as dead: only "Select all"/"None" moved the
 * counter, so an Expert with 200 conversations could not distill the three
 * that matter. Re-verified live on HEAD it did NOT reproduce — but nothing in
 * the repo proved the per-row path worked, which is exactly how a claim like
 * that survives. This suite is that proof.
 *
 * It drives the REAL `ChatImportDialog` (page variant, so no portal) with the
 * REAL `@ai-matrx/design-system` Checkbox inside the REAL row `<label>`. Only
 * transport is stubbed: the supabase listing, the durable-run hook, the file
 * uploader, the redux store. Every click below is a real bubbling MouseEvent
 * on a real element, the way a user's click arrives.
 *
 * Delete `onCheckedChange` from the row Checkbox (the defect as reported) and
 * the first two tests fail; the third fails the moment the Distill button
 * stops honouring a partial selection.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ChatImportDialog } from "../ChatImportDialog";
import type { Rulebook } from "../../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATIONS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Late Shipment Email Reply Rules",
    message_count: 12,
    updated_at: "2026-09-12T00:00:00Z",
    source_app: "ai-matrx",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Refund policy exception",
    message_count: 8,
    updated_at: "2026-09-11T00:00:00Z",
    source_app: "ai-matrx",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Warehouse escalation",
    message_count: 5,
    updated_at: "2026-09-10T00:00:00Z",
    source_app: "ai-matrx",
  },
];

/** The supabase-js builder is a chain that resolves at the end. */
function makeQuery() {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "is", "eq", "gt", "order"]) {
    chain[method] = () => chain;
  }
  chain.limit = () =>
    Promise.resolve({ data: CONVERSATIONS, error: null });
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => makeQuery() }) },
}));

const launch = jest.fn();
jest.mock("../../../durable-run/useMasterworkRun", () => ({
  useMasterworkRun: () => ({
    running: false,
    stages: [],
    result: null,
    status: "idle",
    error: null,
    launch,
    reset: jest.fn(),
  }),
}));

jest.mock("@/features/files/handler/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ upload: jest.fn() }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppStore: () => ({ dispatch: jest.fn() }),
}));

jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const RULEBOOK = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Fix — sources",
} as unknown as Rulebook;

let container: HTMLDivElement;
let root: Root;

async function mountPicker() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ChatImportDialog
        open
        onOpenChange={() => {}}
        rulebook={RULEBOOK}
        initialTab="matrx"
        variant="page"
      />,
    );
  });
  // the listing effect resolves on a microtask
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  launch.mockClear();
});

function counterText(): string {
  const span = [...container.querySelectorAll("span")].find((el) =>
    /of \d+ selected$/.test(el.textContent ?? ""),
  );
  if (!span) throw new Error("the selection counter never rendered");
  return span.textContent ?? "";
}

function rowCheckbox(title: string): HTMLElement {
  const label = [...container.querySelectorAll("label")].find((el) =>
    el.textContent?.includes(title),
  );
  if (!label) throw new Error(`no row for "${title}"`);
  const box = label.querySelector<HTMLElement>('[role="checkbox"]');
  if (!box) throw new Error(`row "${title}" has no checkbox`);
  return box;
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((el) =>
    el.textContent?.trim().startsWith(text),
  );
  if (!button) throw new Error(`no button starting with "${text}"`);
  return button as HTMLButtonElement;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

describe("ChatImportDialog — picking your own conversations", () => {
  beforeEach(async () => {
    await mountPicker();
  });

  it("selects exactly one conversation when its row checkbox is clicked", () => {
    expect(counterText()).toBe("0 of 3 selected");

    click(rowCheckbox("Late Shipment Email Reply Rules"));

    expect(counterText()).toBe("1 of 3 selected");
    expect(
      rowCheckbox("Late Shipment Email Reply Rules").getAttribute(
        "data-state",
      ),
    ).toBe("checked");
    expect(
      rowCheckbox("Refund policy exception").getAttribute("data-state"),
    ).toBe("unchecked");
  });

  it("toggles that one row off again without touching the others", () => {
    click(rowCheckbox("Refund policy exception"));
    click(rowCheckbox("Warehouse escalation"));
    expect(counterText()).toBe("2 of 3 selected");

    click(rowCheckbox("Refund policy exception"));
    expect(counterText()).toBe("1 of 3 selected");
    expect(
      rowCheckbox("Warehouse escalation").getAttribute("data-state"),
    ).toBe("checked");
  });

  it("distills the picked subset — not the whole list", () => {
    expect(buttonByText("Distill").disabled).toBe(true);

    click(rowCheckbox("Warehouse escalation"));
    const distill = buttonByText("Distill");
    expect(distill.disabled).toBe(false);
    expect(distill.textContent).toContain("Distill 1 conversation");

    click(distill);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0][0].conversation_ids).toEqual([
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("still honours the bulk controls", () => {
    click(buttonByText("Select all"));
    expect(counterText()).toBe("3 of 3 selected");
    click(buttonByText("None"));
    expect(counterText()).toBe("0 of 3 selected");
  });
});
