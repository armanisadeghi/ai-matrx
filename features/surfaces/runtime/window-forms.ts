/**
 * features/surfaces/runtime/window-forms.ts
 *
 * THE SAFETY NET FOR UNREGISTERED WINDOWS (register ARE-010 / ARE-011).
 *
 * A registered surface tells an agent exactly what a screen holds and what it
 * accepts — that is always the goal. But a dialog nobody has registered yet
 * must not be a blind spot: the person is looking at it, and an agent from the
 * Agents menu should see it and be able to fill it in. So at run time this
 * module reads every open window with no registered surface straight from the
 * screen — its title and EVERY field in it (label, type, current value, the
 * choices it offers, whether it is required or currently invalid) — and the
 * platform write target `window_form_fields` lets an agent change any or all
 * of those fields in one write, which the person approves on the usual card.
 *
 * What counts as a window: a dialog, sheet or drawer (`role="dialog"` /
 * `"alertdialog"`) or a window panel (`data-window-panel`). Popovers and menus
 * are not windows (they close the moment the person reaches for the Agents
 * menu), and an agent conversation's own composer (`data-agent-input-shell`)
 * is never read as a field. A REGISTERED layer marks its root with
 * `data-surface-layer="<surface name>"` and is skipped here — its surface
 * already speaks for it, and two ways to write one field would be one too many.
 *
 * A change lands exactly as if the person typed it: the field's own handlers
 * run, so the form's own rules still apply. Each change is checked against
 * the field's constraints (required, type, pattern, min/max, length) BEFORE
 * anything is applied; one bad value refuses the whole write with the reason,
 * so the agent can correct it. Passwords and files are never read or written.
 */

import { refuseSurfaceWrite } from "./surface-writeback";
import type { SurfaceWriteTarget } from "@/features/surfaces/types";

export const WINDOW_FORM_TARGET_NAME = "window_form_fields";

/** The marker a REGISTERED layer puts on its root element. */
export const SURFACE_LAYER_ATTRIBUTE = "data-surface-layer";

export type WindowFormKind = "dialog" | "window" | "sheet" | "drawer";

export interface WindowFormField {
  key: string;
  label: string;
  type: string;
  value: unknown;
  required: boolean;
  invalid: string;
  options?: string[];
}

export interface WindowForm {
  title: string;
  kind: WindowFormKind;
  fields: WindowFormField[];
}

/** The platform target — declared here once, offered only while a window form is open. */
export const WINDOW_FORM_TARGET: SurfaceWriteTarget = {
  name: WINDOW_FORM_TARGET_NAME,
  label: "Fields in an open window",
  description:
    'Change fields in an open window that has no registered surface (listed in your context as window::<title>). Value: { "window": "<title exactly as listed>", "changes": [{ "field": "<field key>", "value": <new value> }] }. A text or number field takes a string or number, a checkbox or switch takes true/false, a list takes one of its listed options. Every change is checked against the field\'s rules before anything lands; the person approves first, and the window\'s own Save still decides.',
  valueType: "object",
  mode: "draft",
  applyPolicy: "ask",
};

const WINDOW_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [data-window-panel]';
const FIELD_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [role="switch"], [role="checkbox"], [role="combobox"]';
const SKIPPED_INPUT_TYPES = new Set([
  "hidden",
  "password",
  "file",
  "submit",
  "button",
  "reset",
  "image",
]);

function isVisible(el: Element): boolean {
  if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
  return (el as HTMLElement).getClientRects().length > 0;
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function byIds(ids: string | null): string {
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => text(document.getElementById(id)))
    .filter(Boolean)
    .join(" ");
}

function windowKind(el: Element): WindowFormKind {
  if (el.hasAttribute("data-window-panel")) return "window";
  const slot = el.getAttribute("data-slot") ?? "";
  if (slot.includes("sheet")) return "sheet";
  if (slot.includes("drawer") || el.hasAttribute("data-vaul-drawer")) return "drawer";
  return "dialog";
}

function windowTitle(el: Element): string {
  return (
    byIds(el.getAttribute("aria-labelledby")) ||
    el.getAttribute("aria-label") ||
    text(el.querySelector('[data-slot$="-title"], h1, h2, h3')) ||
    ""
  );
}

/** Open windows that no registered surface speaks for, top-most last in DOM order. */
function openUnregisteredWindows(): Element[] {
  if (typeof document === "undefined") return [];
  const found = Array.from(document.querySelectorAll(WINDOW_SELECTOR)).filter(
    (el) =>
      isVisible(el) &&
      // A popover / menu carries role="dialog" too — it is not a window.
      !el.closest("[data-radix-popper-content-wrapper]") &&
      !el.hasAttribute(SURFACE_LAYER_ATTRIBUTE) &&
      !el.closest(`[${SURFACE_LAYER_ATTRIBUTE}]`),
  );
  // A window nested inside another listed window is read as part of it.
  return found.filter(
    (el) => !found.some((other) => other !== el && other.contains(el)),
  );
}

function fieldLabel(el: Element): string {
  const labelled = byIds(el.getAttribute("aria-labelledby"));
  if (labelled) return labelled;
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  const id = el.getAttribute("id");
  if (id) {
    const forLabel = Array.from(document.getElementsByTagName("label")).find(
      (label) => label.htmlFor === id,
    );
    if (forLabel) return text(forLabel);
  }
  const wrapping = el.closest("label");
  if (wrapping) return text(wrapping);
  // The common "<Label/> then <Input/>" pair with no htmlFor: the nearest
  // preceding label in the same small group.
  let node: Element | null = el;
  // Six levels: a styled picker's button sits a few wrappers below the group
  // that holds its label ("Shows as" in Add New Column was read as "").
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      const label = sibling.matches("label, [data-slot='label']")
        ? sibling
        : sibling.querySelector("label, [data-slot='label']");
      if (label) return text(label);
      sibling = sibling.previousElementSibling;
    }
  }
  return (
    el.getAttribute("placeholder") ||
    el.getAttribute("name") ||
    el.getAttribute("title") ||
    ""
  );
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

interface LiveField {
  el: Element;
  field: WindowFormField;
}

function readField(el: Element): WindowFormField | null {
  const label = fieldLabel(el);
  if (el instanceof HTMLInputElement) {
    if (SKIPPED_INPUT_TYPES.has(el.type)) return null;
    const isCheck = el.type === "checkbox" || el.type === "radio";
    return {
      key: "",
      label,
      type: el.type || "text",
      value: isCheck ? el.checked : el.value,
      required: el.required,
      invalid: el.getAttribute("aria-invalid") === "true" ? el.validationMessage || "marked invalid" : el.validationMessage,
    };
  }
  if (el instanceof HTMLTextAreaElement) {
    return {
      key: "",
      label,
      type: "textarea",
      value: el.value,
      required: el.required,
      invalid: el.getAttribute("aria-invalid") === "true" ? el.validationMessage || "marked invalid" : el.validationMessage,
    };
  }
  if (el instanceof HTMLSelectElement) {
    return {
      key: "",
      label,
      type: "select",
      value: el.value,
      required: el.required,
      invalid: el.validationMessage,
      options: Array.from(el.options).map((option) => option.value),
    };
  }
  const role = el.getAttribute("role");
  if (role === "switch" || role === "checkbox") {
    return {
      key: "",
      label,
      type: role,
      value: el.getAttribute("aria-checked") === "true",
      required: el.getAttribute("aria-required") === "true",
      invalid: el.getAttribute("aria-invalid") === "true" ? "marked invalid" : "",
    };
  }
  if (role === "combobox") {
    // A styled list (a button showing its choice). Its options exist only
    // while it is open, so they are not listed — the agent sees the choice.
    return {
      key: "",
      label,
      type: "list",
      value: text(el),
      required: el.getAttribute("aria-required") === "true",
      invalid: el.getAttribute("aria-invalid") === "true" ? "marked invalid" : "",
    };
  }
  if (el.getAttribute("contenteditable") === "true") {
    return {
      key: "",
      label,
      type: "rich_text",
      value: text(el),
      required: false,
      invalid: "",
    };
  }
  return null;
}

function readFields(win: Element): LiveField[] {
  const out: LiveField[] = [];
  const used = new Map<string, number>();
  for (const el of Array.from(win.querySelectorAll(FIELD_SELECTOR))) {
    if (!isVisible(el)) continue;
    // A text input nested inside a combobox/editor is read as that control.
    if (el.parentElement?.closest('[contenteditable="true"]')) continue;
    // An agent conversation's own composer is the conversation, not a form
    // the agent should fill (an agent window is itself a window panel).
    if (el.closest("[data-agent-input-shell]")) continue;
    if ((el as HTMLInputElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
    const field = readField(el);
    if (!field) continue;
    const base =
      el.getAttribute("name") ||
      slug(field.label) ||
      (el.getAttribute("id") && !el.getAttribute("id")!.startsWith(":") ? slug(el.getAttribute("id")!) : "") ||
      field.type;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    field.key = count === 1 ? base : `${base}_${count}`;
    out.push({ el, field });
  }
  return out;
}

/** Every open unregistered window that holds at least one field. */
export function readWindowForms(): WindowForm[] {
  const titles = new Map<string, number>();
  const forms: WindowForm[] = [];
  for (const win of openUnregisteredWindows()) {
    const fields = readFields(win).map((live) => live.field);
    if (fields.length === 0) continue;
    const raw = windowTitle(win) || "Untitled window";
    const seen = (titles.get(raw) ?? 0) + 1;
    titles.set(raw, seen);
    forms.push({
      title: seen === 1 ? raw : `${raw} (${seen})`,
      kind: windowKind(win),
      fields,
    });
  }
  return forms;
}

/** True while at least one unregistered window with fields is open. */
export function hasWindowForms(): boolean {
  return readWindowForms().length > 0;
}

// ── write ──────────────────────────────────────────────────────────────────

interface WindowFormChange {
  field: string;
  value: unknown;
}

function parseWrite(value: unknown): { window: string; changes: WindowFormChange[] } {
  if (!value || typeof value !== "object") {
    refuseSurfaceWrite(
      'window_form_fields expects { "window": "<title>", "changes": [{ "field": "<key>", "value": … }] }.',
    );
  }
  const record = value as Record<string, unknown>;
  if (typeof record.window !== "string" || !Array.isArray(record.changes) || record.changes.length === 0) {
    refuseSurfaceWrite(
      'window_form_fields needs a "window" title and at least one entry in "changes".',
    );
  }
  const changes = (record.changes as unknown[]).map((entry) => {
    const change = entry as Record<string, unknown> | null;
    if (!change || typeof change.field !== "string" || !("value" in change)) {
      refuseSurfaceWrite('Each change needs a "field" key and a "value".');
    }
    return { field: change.field as string, value: change.value };
  });
  return { window: record.window as string, changes };
}

/** Check a value against a native field's own constraints, on a detached copy. */
function constraintProblem(el: Element, value: unknown): string | null {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    return typeof value === "boolean" ? null : "expects true or false";
  }
  if (el instanceof HTMLSelectElement) {
    const options = Array.from(el.options).map((option) => option.value);
    return options.includes(String(value)) ? null : `must be one of: ${options.join(", ")}`;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (typeof value !== "string" && typeof value !== "number") return "expects text or a number";
    const probe = el.cloneNode(false) as HTMLInputElement | HTMLTextAreaElement;
    probe.value = String(value);
    return probe.checkValidity() ? null : probe.validationMessage || "is not valid here";
  }
  const role = el.getAttribute("role");
  if (role === "switch" || role === "checkbox") {
    return typeof value === "boolean" ? null : "expects true or false";
  }
  if (role === "combobox") {
    return "is a list whose choices only exist while it is open — ask the person to pick it";
  }
  return "cannot be filled in automatically — ask the person to type it";
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  // React tracks the last value it rendered; setting through the prototype's
  // setter and firing the event is what a keystroke does, so the form's own
  // onChange runs and its state updates.
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(
    new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
  );
}

function applyChange(el: Element, value: unknown) {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    if (el.checked !== value) el.click();
    return;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    setNativeValue(el, String(value));
    return;
  }
  // role="switch" / "checkbox" buttons toggle on click.
  if ((el.getAttribute("aria-checked") === "true") !== value) (el as HTMLElement).click();
}

/**
 * The same write, with each change carrying the field's on-screen label, so
 * the approval card reads "Column Name → Region", never the machine key.
 * Unknown windows or fields pass through unchanged — the handler refuses them.
 */
export function labelWindowFormWrite(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.window !== "string" || !Array.isArray(record.changes)) return value;
  const form = readWindowForms().find((f) => f.title === record.window);
  if (!form) return value;
  return {
    ...record,
    changes: (record.changes as unknown[]).map((entry) => {
      const change = entry as Record<string, unknown> | null;
      const field = change && form.fields.find((f) => f.key === change.field);
      return field && field.label ? { label: field.label, ...change } : entry;
    }),
  };
}

/**
 * The handler behind `window_form_fields`. Finds the window by title, checks
 * EVERY change first (unknown field, wrong type, a constraint it breaks), and
 * only then applies them all — never a half-filled form.
 */
export function applyWindowFormChanges(value: unknown): void {
  const { window: title, changes } = parseWrite(value);
  const windows = openUnregisteredWindows();
  const forms = readWindowForms();
  const index = forms.findIndex((form) => form.title === title);
  if (index === -1) {
    refuseSurfaceWrite(
      `No open window is called "${title}". Open windows: ${forms.map((form) => `"${form.title}"`).join(", ") || "none"}.`,
    );
  }
  // readWindowForms skips field-less windows; match the same filter.
  const win = windows.filter((w) => readFields(w).length > 0)[index];
  const live = readFields(win);
  const problems: string[] = [];
  const resolved: Array<{ el: Element; value: unknown }> = [];
  for (const change of changes) {
    const target = live.find((entry) => entry.field.key === change.field);
    if (!target) {
      problems.push(`"${change.field}" is not a field in "${title}" (fields: ${live.map((entry) => entry.field.key).join(", ")})`);
      continue;
    }
    const problem = constraintProblem(target.el, change.value);
    if (problem) problems.push(`"${target.field.label || change.field}" ${problem}`);
    else resolved.push({ el: target.el, value: change.value });
  }
  if (problems.length > 0) {
    refuseSurfaceWrite(`Nothing was changed in "${title}": ${problems.join("; ")}.`);
  }
  for (const { el, value: next } of resolved) applyChange(el, next);
}
