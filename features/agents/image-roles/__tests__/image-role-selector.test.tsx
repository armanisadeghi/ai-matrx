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
  VIDEO_IMAGE_ROLES,
  rolesFor,
  variableNameOfImageUrl,
  variableRunLabel,
  type ImageRoleLimits,
  type ReferenceRole,
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
  value: ReferenceRole | null,
  limits: ImageRoleLimits | null,
  onChange: (role: ReferenceRole | null) => void = () => {},
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

// --------------------------------------------------------------------------
// Video generation: frames and references, video and audio roles, @names
// --------------------------------------------------------------------------

const VEO: ImageRoleLimits = {
  first_frame: 1,
  last_frame: 1,
  asset: 3,
  total: 3,
  extend: 1,
  named: 3,
};

function renderVideo(
  value: ReferenceRole | null,
  roles: readonly ReferenceRole[],
  limits: ImageRoleLimits | null,
  opts: {
    onChange?: (role: ReferenceRole | null) => void;
    name?: string | null;
    onNameChange?: (name: string | null) => void;
  } = {},
) {
  act(() => {
    root.render(
      <ImageRoleSelector
        value={value}
        onChange={opts.onChange ?? (() => {})}
        limits={limits}
        modelLabel="Veo 3.1"
        roles={roles}
        name={opts.name ?? null}
        onNameChange={opts.onNameChange}
      />,
    );
  });
}

test("a video model offers frames and references on images, extend/restyle on videos, lip sync on audio", () => {
  expect(rolesFor("image", "video")).toEqual(VIDEO_IMAGE_ROLES);
  expect(rolesFor("video", "video")).toEqual(["extend", "restyle"]);
  expect(rolesFor("audio", "video")).toEqual(["lip_sync"]);
  expect(rolesFor("video", "image")).toEqual([]);

  renderVideo(null, rolesFor("image", "video"), VEO);
  expect(buttons().map((b) => b.textContent)).toEqual([
    "First frame",
    "Last frame",
    "Asset",
    "Style",
  ]);
});

test("Veo refuses a Style image and a Restyle video by name, keeps the rest", () => {
  renderVideo("style", rolesFor("image", "video"), VEO);
  const style = buttons()[3];
  expect(style.dataset.refused).toBe("true");
  expect(explanation()).toContain("Veo 3.1 cannot take a Style reference image");
  expect(buttons()[0].dataset.refused).toBeUndefined();

  renderVideo("restyle", rolesFor("video", "video"), VEO);
  expect(explanation()).toContain("Veo 3.1 cannot take a Restyle video");
  expect(buttons()[0].dataset.refused).toBeUndefined(); // Extend
});

test("an Asset reference takes an @name; a bad name is flagged, a good one saved without the @", () => {
  const onNameChange = jest.fn();
  renderVideo("asset", rolesFor("image", "video"), VEO, { onNameChange });
  const input = container.querySelector<HTMLInputElement>('[data-testid="reference-name"]');
  expect(input).not.toBeNull();

  const setValue = (v: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, v);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  setValue("two words");
  expect(
    container.querySelector('[data-testid="reference-name-hint"]')?.textContent,
  ).toMatch(/A letter, then letters/);
  setValue("@hero");
  act(() => {
    input!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onNameChange).toHaveBeenLastCalledWith("hero");

  // A First frame never carries a name.
  renderVideo("first_frame", rolesFor("image", "video"), VEO, { onNameChange });
  expect(container.querySelector('[data-testid="reference-name"]')).toBeNull();
});

test("a model without named elements refuses a name, naming the model", () => {
  renderVideo("asset", rolesFor("image", "video"), { asset: 3 }, {
    name: "hero",
    onNameChange: () => {},
  });
  expect(
    container.querySelector('[data-testid="reference-name-hint"]')?.textContent,
  ).toContain("Veo 3.1 cannot take named references");
});

test("video limits are read from capabilities_override.video_reference_roles", () => {
  expect(
    readImageRoleLimits({
      image_reference_roles: { first_frame: 1, asset: 3, total: 3 },
      video_reference_roles: { extend: 1, named: 3, lip_sync: 1, zoom: 2 },
    }),
  ).toEqual({ first_frame: 1, asset: 3, total: 3, extend: 1, named: 3, lip_sync: 1 });
});

test("the run form asks for a video-side variable by its role", () => {
  const fmt = (n: string) => n;
  expect(
    variableRunLabel({ name: "hero_shot", customComponent: { type: "image", imageRole: "first_frame" } }, fmt),
  ).toBe("First frame");
  expect(
    variableRunLabel({ name: "clip", customComponent: { type: "video", imageRole: "restyle" } }, fmt),
  ).toBe("Reference video");
  expect(
    variableRunLabel({ name: "line", customComponent: { type: "audio", imageRole: "lip_sync" } }, fmt),
  ).toBe("Lip-sync audio");
});
