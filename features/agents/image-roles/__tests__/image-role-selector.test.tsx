/**
 * The reference-image role selector tells the truth before a run.
 *
 * Rendered for real (react-dom), not snapshot-matched:
 *   - six plain-word roles, in the server's vocabulary order;
 *   - clicking a role sets it; clicking the active one clears it (no role =
 *     a plain image);
 *   - a role the model cannot take stays visible but is marked refused, and
 *     when it is the chosen role the line below names the role AND the model;
 *   - while limits are loading (null) nothing is judged refused.
 * Plus the limit reader the builder feeds it from `capabilities_override`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ImageRoleSelector } from "@/features/agents/image-roles/ImageRoleSelector";
import {
  IMAGE_REFERENCE_ROLES,
  readImageRoleLimits,
  variableNameOfImageUrl,
  type ImageReferenceRole,
  type ImageRoleLimits,
} from "@/features/agents/image-roles/roles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GEMINI: ImageRoleLimits = {
  subject: 10,
  character: 4,
  style: 14,
  edit_target: 1,
  total: 14,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(
  value: ImageReferenceRole | null,
  limits: ImageRoleLimits | null,
  onChange: (role: ImageReferenceRole | null) => void = () => {},
) {
  act(() => {
    root.render(
      <ImageRoleSelector
        value={value}
        onChange={onChange}
        limits={limits}
        modelLabel="Gemini 3.1 Flash Image"
      />,
    );
  });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
}

function explanation(): string {
  return (
    container.querySelector('[data-testid="image-role-explanation"]')?.textContent ?? ""
  );
}

test("offers the six roles in plain words, in vocabulary order", () => {
  render(null, GEMINI);
  expect(buttons().map((b) => b.textContent)).toEqual([
    "Subject",
    "Character",
    "Style",
    "Mask",
    "Edit this",
    "Composition",
  ]);
  expect(IMAGE_REFERENCE_ROLES).toHaveLength(6);
  expect(explanation()).toMatch(/No role/);
});

test("clicking a role sets it and clicking the active role clears it", () => {
  const onChange = jest.fn();
  render(null, GEMINI, onChange);
  act(() => buttons()[2].click());
  expect(onChange).toHaveBeenLastCalledWith("style");

  render("style", GEMINI, onChange);
  expect(buttons()[2].getAttribute("aria-checked")).toBe("true");
  expect(explanation()).toMatch(/Borrows only the look/);
  act(() => buttons()[2].click());
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test("a role the model cannot take stays visible, marked refused, with the reason", () => {
  render("mask", GEMINI);
  const mask = buttons()[3];
  expect(mask.dataset.refused).toBe("true");
  expect(mask.title).toContain("Gemini 3.1 Flash Image cannot take a Mask");
  // Chosen AND refused: the line below says so, naming role and model.
  expect(explanation()).toContain("Gemini 3.1 Flash Image cannot take a Mask");
  // Roles it can take are not marked.
  expect(buttons()[0].dataset.refused).toBeUndefined();
});

test("nothing is judged refused while the limits are still loading", () => {
  render("mask", null);
  expect(buttons().some((b) => b.dataset.refused)).toBe(false);
  expect(explanation()).toMatch(/Marks the only area/);
});

test("limits are read from capabilities_override, junk ignored", () => {
  expect(
    readImageRoleLimits({
      image_reference_roles: { subject: 6, total: 14, background: 2, style: -1 },
    }),
  ).toEqual({ subject: 6, total: 14 });
  expect(readImageRoleLimits({})).toEqual({});
  expect(readImageRoleLimits(null)).toEqual({});
});

test("an image block filled by exactly one variable names that variable", () => {
  expect(variableNameOfImageUrl("{{style_reference}}")).toBe("style_reference");
  expect(variableNameOfImageUrl(" {{ product_photo }} ")).toBe("product_photo");
  expect(variableNameOfImageUrl("https://x/{{a}}.png")).toBeNull();
  expect(variableNameOfImageUrl(undefined)).toBeNull();
});
