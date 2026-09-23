/**
 * Media reference roles — the builder's side of the one vocabulary.
 *
 * Image generation reads an image as subject / character / style / mask /
 * edit target / composition. Video generation reads an image as first frame /
 * last frame / asset / style, a video as extend / restyle, and an audio clip as
 * lip sync; an asset/style image or a reference video may carry a `name` the
 * prompt addresses as `@name` (server: `matrx_ai/media/video_reference_roles.py`).
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

/** The roles an IMAGE-generating model reads an image as (vocabulary order). */
export const IMAGE_REFERENCE_ROLES = [
  "subject",
  "character",
  "style",
  "mask",
  "edit_target",
  "composition_control",
] as const;

/** The roles a VIDEO-generating model reads an image as (`style` is shared). */
export const VIDEO_IMAGE_ROLES = [
  "first_frame",
  "last_frame",
  "asset",
  "style",
] as const;

/** Roles on a video part beside a video prompt. */
export const VIDEO_REFERENCE_ROLES = ["extend", "restyle"] as const;

/** Roles on an audio part beside a video prompt. */
export const AUDIO_REFERENCE_ROLES = ["lip_sync"] as const;

export type ImageReferenceRole =
  | (typeof IMAGE_REFERENCE_ROLES)[number]
  | (typeof VIDEO_IMAGE_ROLES)[number];
export type VideoReferenceRole = (typeof VIDEO_REFERENCE_ROLES)[number];
export type AudioReferenceRole = (typeof AUDIO_REFERENCE_ROLES)[number];
/** Any role a media part can carry — one union, one metadata table. */
export type ReferenceRole =
  | ImageReferenceRole
  | VideoReferenceRole
  | AudioReferenceRole;

const ALL_IMAGE_ROLES: readonly string[] = [
  ...IMAGE_REFERENCE_ROLES,
  ...VIDEO_IMAGE_ROLES,
];

export interface ImageRoleMeta {
  /** Segment label — plain words, never the wire token. */
  label: string;
  /** What the run form asks for when a variable fills this role. */
  ask: string;
  /** One line: what the model does with an image in this role. */
  explanation: string;
}

export const IMAGE_ROLE_META: Record<ReferenceRole, ImageRoleMeta> = {
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
  first_frame: {
    label: "First frame",
    ask: "First frame",
    explanation: "The video starts on exactly this image.",
  },
  last_frame: {
    label: "Last frame",
    ask: "Last frame",
    explanation: "The video ends on exactly this image (needs a first frame).",
  },
  asset: {
    label: "Asset",
    ask: "Asset reference",
    explanation:
      "Keeps this product, object or character recognisable throughout the clip.",
  },
  extend: {
    label: "Extend",
    ask: "Video to extend",
    explanation: "The new clip continues this video from its last frame.",
  },
  restyle: {
    label: "Restyle",
    ask: "Reference video",
    explanation: "Re-renders this video: same motion and timing, a new look.",
  },
  lip_sync: {
    label: "Lip sync",
    ask: "Lip-sync audio",
    explanation: "The speech the on-screen face mouths, word for word.",
  },
};

/** Which roles a block of this kind offers for this output modality. */
export function rolesFor(
  blockKind: "image" | "video" | "audio",
  output: "image" | "video",
): readonly ReferenceRole[] {
  if (output === "image") return blockKind === "image" ? IMAGE_REFERENCE_ROLES : [];
  if (blockKind === "image") return VIDEO_IMAGE_ROLES;
  if (blockKind === "video") return VIDEO_REFERENCE_ROLES;
  return AUDIO_REFERENCE_ROLES;
}

/** Roles whose reference may carry a name the prompt addresses as `@name`. */
export function roleTakesName(role: ReferenceRole | null | undefined): boolean {
  return role === "asset" || role === "style" || role === "restyle" || role === "extend";
}

/** `@name` rule shared with the server (media/video_reference_roles.py). */
export function normalizeReferenceName(raw: string): string | null {
  const candidate = raw.trim().replace(/^@/, "");
  if (!candidate) return null;
  return /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(candidate) ? candidate : null;
}

export function isReferenceRole(value: unknown): value is ReferenceRole {
  return typeof value === "string" && value in IMAGE_ROLE_META;
}

export function isImageReferenceRole(value: unknown): value is ImageReferenceRole {
  return typeof value === "string" && ALL_IMAGE_ROLES.includes(value);
}

/**
 * `{role: max, total: n, named: n}` — image roles from
 * `capabilities_override.image_reference_roles`, video/audio roles and the
 * named-reference cap from `capabilities_override.video_reference_roles`.
 * Empty = the model takes no roled reference.
 */
export type ImageRoleLimits = Partial<Record<ReferenceRole | "total" | "named", number>>;

function readLimitMap(
  source: unknown,
  accept: (key: string) => boolean,
  out: ImageRoleLimits,
): void {
  if (typeof source !== "object" || source === null || Array.isArray(source)) return;
  for (const [key, value] of Object.entries(source)) {
    if (
      accept(key) &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0
    ) {
      out[key as keyof ImageRoleLimits] = value;
    }
  }
}

/** Read the offering's role limits (image + video maps) defensively. */
export function readImageRoleLimits(raw: unknown): ImageRoleLimits {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const out: ImageRoleLimits = {};
  readLimitMap(
    record.image_reference_roles,
    (k) => isImageReferenceRole(k) || k === "total",
    out,
  );
  readLimitMap(
    record.video_reference_roles,
    (k) =>
      (VIDEO_REFERENCE_ROLES as readonly string[]).includes(k) ||
      (AUDIO_REFERENCE_ROLES as readonly string[]).includes(k) ||
      k === "named",
    out,
  );
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
  role: ReferenceRole,
  limits: ImageRoleLimits,
  modelLabel: string,
  countOfRole = 1,
): ImageRoleVerdict {
  const label = IMAGE_ROLE_META[role].label;
  const noun = (VIDEO_REFERENCE_ROLES as readonly string[]).includes(role)
    ? "video"
    : role === "lip_sync"
      ? "audio clip"
      : ALL_IMAGE_ROLES.includes(role) &&
          !(IMAGE_REFERENCE_ROLES as readonly string[]).includes(role)
        ? "image"
        : "reference image";
  const allowed = limits[role] ?? 0;
  if (allowed <= 0) {
    return {
      verdict: "refused",
      reason: `${modelLabel} cannot take a ${label} ${noun}. Pick another role or another model.`,
    };
  }
  if (countOfRole > allowed) {
    return {
      verdict: "refused",
      reason: `${modelLabel} takes at most ${allowed} ${label} ${noun}${allowed === 1 ? "" : "s"}; this message has ${countOfRole}.`,
    };
  }
  return { verdict: "ok" };
}

/** Can this model take a named (`@name`) reference at all? */
export function namedReferenceVerdict(
  limits: ImageRoleLimits,
  modelLabel: string,
): ImageRoleVerdict {
  return (limits.named ?? 0) > 0
    ? { verdict: "ok" }
    : {
        verdict: "refused",
        reason: `${modelLabel} cannot take named references. Clear the name, or pick a model with named elements.`,
      };
}

/** The variable an image block is filled by, when its url is exactly `{{name}}`. */
export function variableNameOfImageUrl(url: unknown): string | null {
  return variableNameOfMediaUrl(url);
}

/** The variable any media block (image, video, audio) is filled by. */
export function variableNameOfMediaUrl(url: unknown): string | null {
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
  if (isMediaComponent(variable.customComponent?.type) && isReferenceRole(role)) {
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
  if (isMediaComponent(variable.customComponent?.type) && isReferenceRole(role)) {
    return IMAGE_ROLE_META[role].explanation;
  }
  return undefined;
}

function isMediaComponent(type: string | undefined): boolean {
  return type === "image" || type === "video" || type === "audio";
}
