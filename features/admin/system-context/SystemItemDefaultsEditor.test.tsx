/**
 * The System items every agent receives without naming them (lane CONTEXT-VALUES-NAMED-2): the
 * platform knob `context/system_item_defaults`, edited on the admin scopes-context page. The
 * editor says the one honest sentence, shows the list with each item's name, names a key that is
 * not a System item, adds and removes, saves the exact list through the knob's write path, resets
 * to the default with `null`, and says why a refused save was refused. Data doors are injected;
 * the editor is the real component.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/features/admin/limits/service", () => ({ setFeatureKnob: jest.fn() }));
const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

import {
  SYSTEM_ITEM_DEFAULTS_SENTENCE,
  SystemItemDefaultsEditor,
  type SystemItemDefaultsData,
} from "./SystemItemDefaultsEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEFAULTS = ["current_date", "current_datetime", "current_timezone"];
const ITEMS = [
  { key: "current_date", display_name: "Current Date" },
  { key: "current_datetime", display_name: "Current Date & Time" },
  { key: "current_timezone", display_name: "Your Timezone" },
  { key: "company_name", display_name: "Company Name" },
  { key: "ai_models_guidance", display_name: "AI Models Guidance" },
];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  toastError.mockReset();
  toastSuccess.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(data: SystemItemDefaultsData, save = jest.fn(async () => ({ ok: true as const }))) {
  const load = jest.fn(async () => data);
  await act(async () => {
    root.render(<SystemItemDefaultsEditor load={load} save={save} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { load, save };
}

function button(label: string): HTMLButtonElement {
  const b = Array.from(host.querySelectorAll("button")).find(
    (x) => x.getAttribute("aria-label") === label || x.textContent?.trim() === label,
  );
  if (!b) throw new Error(`no button "${label}" in: ${host.textContent}`);
  return b as HTMLButtonElement;
}

function listed(): string[] {
  return Array.from(host.querySelectorAll('ul[aria-label="On the list"] li span.font-mono')).map(
    (s) => s.textContent ?? "",
  );
}

it("says the honest sentence and shows the default list by name, with no save until something changes", async () => {
  await render({ value: DEFAULTS, defaultValue: DEFAULTS, items: ITEMS });
  expect(host.textContent).toContain(SYSTEM_ITEM_DEFAULTS_SENTENCE);
  expect(SYSTEM_ITEM_DEFAULTS_SENTENCE).toBe("Every agent receives these without naming them.");
  expect(listed()).toEqual(DEFAULTS);
  expect(host.textContent).toContain("Your Timezone");
  expect(host.textContent).not.toContain("Save");
  expect(host.textContent).not.toContain("Use the default");
});

it("adds and removes an item and saves exactly the new list through the knob", async () => {
  const { save } = await render({ value: DEFAULTS, defaultValue: DEFAULTS, items: ITEMS });
  await act(async () => button("Add company_name").click());
  await act(async () => button("Take current_datetime off the list").click());
  expect(listed()).toEqual(["current_date", "current_timezone", "company_name"]);
  await act(async () => button("Save").click());
  expect(save).toHaveBeenCalledWith(["current_date", "current_timezone", "company_name"]);
  expect(toastSuccess).toHaveBeenCalled();
});

it("names a key on the list that is not a System item instead of dropping it", async () => {
  await render({ value: [...DEFAULTS, "retired_item"], defaultValue: DEFAULTS, items: ITEMS });
  expect(listed()).toContain("retired_item");
  expect(host.textContent).toContain("not a System item — nothing is delivered for it");
});

it("resets to the platform default with null and says a refused save's reason", async () => {
  const save = jest.fn(async () => ({ ok: false as const, reason: "admin_only", detail: "Only an admin may change this." }));
  await render({ value: ["company_name"], defaultValue: DEFAULTS, items: ITEMS }, save);
  await act(async () => button("Use the default").click());
  expect(save).toHaveBeenCalledWith(null);
  expect(toastError).toHaveBeenCalledWith("Not saved: Only an admin may change this.");
  expect(listed()).toEqual(["company_name"]);
});

it("says why when the list cannot be read", async () => {
  const load = jest.fn(async () => {
    throw new Error("the platform knob context/system_item_defaults does not exist");
  });
  await act(async () => {
    root.render(<SystemItemDefaultsEditor load={load} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(host.textContent).toContain("could not be read: the platform knob context/system_item_defaults does not exist");
});
