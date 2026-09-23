/**
 * Image-generation reference roles — the builder's side of the one vocabulary.
 *
 * A reference image in an image-generation request says what it controls.
 * The role rides on the image block itself (`role` on the image part); absent
 * = a plain image the model sees. The server owns the wire mapping and the
 * refusal gate (aidream `matrx_ai/media/image_reference_roles.py`); this module
 * mirrors its vocabulary and limits so the builder can tell the truth BEFORE a
 * run: a role the selected model cannot take is shown greyed with the reason.
 *
 * Limits come from the catalog: the routing offering's
 * `capabilities_override.image_reference_roles` (`{role: max, total: n}`).
 * Law: `common-docs/systems/agents/typed-messages/FEATURE.md` (Image generation).
 */

export const IMAGE_REFERENCE_ROLES = [
  "subject",
  "character",
  "style",
  "mask",
  "edit_target",
  "composition_control",
] as const;

export type ImageReferenceRole = (typeof IMAGE_REFERENCE_ROLES)[number];

export interface ImageRoleMeta {
  /** Segment label — plain words, never the wire token. */
  label: string;
  /** What the run form asks for when a variable fills this role. */
  ask: string;
  /** One line: what the model does with an image in this role. */
  explanation: string;
}

export const IMAGE_ROLE_META: Record<ImageReferenceRole, ImageRoleMeta> = {
  subject: {
    label: "Subject",
    ask: "Subject reference",
    explanation:
      "Keeps this exact product or object recognisable: shape, materials, labels.",
  },
  character: {
    label: "Character",
    ask: "Character reference",
    explanation: "Keeps this person or character looking the same.",
  },
  style: {
    label: "Style",
    ask: "Style reference",
    explanation:
      "Borrows only the look (colours, lighting, medium), never the content.",
  },
  mask: {
    label: "Mask",
    ask: "Mask",
    explanation:
      "Marks the only area of the edited image that is allowed to change.",
  },
  edit_target: {
    label: "Edit this",
    ask: "Image to edit",
    explanation: "The image being edited; everything not asked for stays the same.",
  },
  composition_control: {
    label: "Composition",
    ask: "Composition reference",
    explanation: "Follows its layout, pose and geometry, not its appearance.",
  },
};

export function isImageReferenceRole(value: unknown): value is ImageReferenceRole {
  return (
    typeof value === "string" &&
    (IMAGE_REFERENCE_ROLES as readonly string[]).includes(value)
  );
}

/** `{role: max, total: n}`. Empty = the model takes no roled reference image. */
export type ImageRoleLimits = Partial<Record<ImageReferenceRole | "total", number>>;

/** Read `capabilities_override.image_reference_roles` defensively. */
export function readImageRoleLimits(raw: unknown): ImageRoleLimits {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const source = (raw as Record<string, unknown>).image_reference_roles;
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return {};
  }
  const out: ImageRoleLimits = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      (isImageReferenceRole(key) || key === "total") &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0
    ) {
      out[key] = value;
    }
  }
  return out;
}

export type ImageRoleVerdict =
  | { verdict: "ok" }
  | { verdict: "refused"; reason: string };

/**
 * Can this model take an image in this role? The reason is a sentence a
 * person can act on; it names the role and the model, like the server's
 * refusal does.
 */
export function imageRoleVerdict(
  role: ImageReferenceRole,
  limits: ImageRoleLimits,
  modelLabel: string,
  countOfRole = 1,
): ImageRoleVerdict {
  const label = IMAGE_ROLE_META[role].label;
  const allowed = limits[role] ?? 0;
  if (allowed <= 0) {
    return {
      verdict: "refused",
      reason: `${modelLabel} cannot take a ${label} reference image. Pick another role or another model.`,
    };
  }
  if (countOfRole > allowed) {
    return {
      verdict: "refused",
      reason: `${modelLabel} takes at most ${allowed} ${label} reference image${allowed === 1 ? "" : "s"}; this message has ${countOfRole}.`,
    };
  }
  return { verdict: "ok" };
}

/** The variable an image block is filled by, when its url is exactly `{{name}}`. */
export function variableNameOfImageUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const match = /^\s*\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}\s*$/.exec(url);
  return match ? match[1] : null;
}

/**
 * The label a run form shows for a variable: an image variable that fills a
 * reference role is asked for BY that role ("Style reference"); every other
 * variable keeps its formatted name. One helper so every run surface (inline,
 * stacked, wizard, guided, public chat) asks the same question.
 */
export function variableRunLabel(
  variable: { name: string; customComponent?: { type?: string; imageRole?: unknown } },
  formatName: (name: string) => string,
): string {
  const role = variable.customComponent?.imageRole;
  if (variable.customComponent?.type === "image" && isImageReferenceRole(role)) {
    return IMAGE_ROLE_META[role].ask;
  }
  return formatName(variable.name);
}

/** The hint under / beside a variable: its own help text, else the role's line. */
export function variableRunHint(variable: {
  helpText?: string | null;
  customComponent?: { type?: string; imageRole?: unknown };
}): string | undefined {
  if (variable.helpText) return variable.helpText;
  const role = variable.customComponent?.imageRole;
  if (variable.customComponent?.type === "image" && isImageReferenceRole(role)) {
    return IMAGE_ROLE_META[role].explanation;
  }
  return undefined;
}
