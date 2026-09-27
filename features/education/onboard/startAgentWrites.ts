// features/education/onboard/startAgentWrites.ts
//
// Validation for the `kit_request_draft` agent write target on
// /education/start (`matrx-user/education-start`). Pure: the page passes in
// which outputs are available, and the handler in StartHero applies the
// result through the form's own state setters. The WHOLE value is checked
// before anything changes, and every refusal is a sentence the agent can act on.

import { ALL_TARGET_KINDS, type TargetKind } from "@/features/education/convert/types";
import { isCoverageDepth, type CoverageDepth } from "@/features/education/convert/coverage";

export type AgentInputMode = "paste" | "link" | "files";

export interface KitRequestDraftFields {
  mode?: AgentInputMode;
  pasteText?: string;
  url?: string;
  fileId?: string;
  outputs?: TargetKind[];
  depth?: CoverageDepth;
  /** null = size to the material (the blank count box). */
  count?: number | null;
  focus?: string;
}

const KNOWN_KEYS = new Set([
  "input_mode",
  "paste_text",
  "url",
  "file_id",
  "outputs",
  "depth",
  "count",
  "focus",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_KIT_COUNT = 150;

function fail(message: string): never {
  throw new Error(message);
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") fail(`${key} must be a string.`);
  return v;
}

export function parseKitRequestDraftValue(
  value: unknown,
  availableOutputs: readonly TargetKind[],
): KitRequestDraftFields {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("kit_request_draft takes a JSON object, e.g. { \"paste_text\": \"…\", \"outputs\": [\"deck\"] }.");
  }
  const obj = value as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => !KNOWN_KEYS.has(k));
  if (unknown.length > 0) {
    fail(
      `Unknown field${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}. Allowed: ${[...KNOWN_KEYS].join(", ")}.`,
    );
  }
  if (Object.keys(obj).length === 0) fail("Send at least one field to fill.");

  const out: KitRequestDraftFields = {};

  const mode = obj.input_mode;
  if (mode !== undefined) {
    if (mode === "upload") {
      fail(
        "Only the person can drop a new file to upload. Use file_id for a file they already have, or ask them to drop the file on the Upload tab.",
      );
    }
    if (mode !== "paste" && mode !== "link" && mode !== "files") {
      fail('input_mode must be "paste", "link" or "files".');
    }
    out.mode = mode;
  }

  const pasteText = stringField(obj, "paste_text");
  if (pasteText !== undefined) out.pasteText = pasteText;

  const url = stringField(obj, "url");
  if (url !== undefined) {
    const trimmed = url.trim();
    if (trimmed !== "") {
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        fail(`url "${trimmed}" is not a web address. Send a full http(s) link.`);
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        fail(`url must start with http:// or https:// (got "${trimmed}").`);
      }
    }
    out.url = trimmed;
  }

  const fileId = stringField(obj, "file_id");
  if (fileId !== undefined) {
    if (!UUID_RE.test(fileId.trim())) fail(`file_id "${fileId}" is not a file id.`);
    out.fileId = fileId.trim();
  }

  // Which tab the input switches to when no input_mode is sent.
  const inputs = [
    out.pasteText !== undefined && out.pasteText.trim() !== "" ? "paste" : null,
    out.url !== undefined && out.url !== "" ? "link" : null,
    out.fileId !== undefined ? "files" : null,
  ].filter((m): m is AgentInputMode => m !== null);
  if (out.mode === undefined) {
    if (inputs.length > 1) {
      fail("Send only one of paste_text, url and file_id, or also send input_mode to say which tab to open.");
    }
    if (inputs.length === 1) out.mode = inputs[0];
  }

  if (obj.outputs !== undefined) {
    if (!Array.isArray(obj.outputs)) fail("outputs must be an array of kinds, e.g. [\"deck\", \"quiz\"].");
    if (obj.outputs.length === 0) fail("outputs cannot be empty: pick at least one thing to make.");
    const kinds: TargetKind[] = [];
    for (const k of obj.outputs) {
      if (typeof k !== "string" || !(ALL_TARGET_KINDS as string[]).includes(k)) {
        fail(`Unknown output ${JSON.stringify(k)}. Kinds: ${ALL_TARGET_KINDS.join(", ")}.`);
      }
      const kind = k as TargetKind;
      if (!availableOutputs.includes(kind)) {
        fail(`"${kind}" cannot be made yet (shown as "soon"). Available: ${availableOutputs.join(", ")}.`);
      }
      if (kinds.includes(kind)) fail(`"${kind}" is listed twice in outputs.`);
      kinds.push(kind);
    }
    out.outputs = kinds;
  }

  if (obj.depth !== undefined) {
    if (!isCoverageDepth(obj.depth)) fail('depth must be "quick", "standard" or "thorough".');
    out.depth = obj.depth;
  }

  if (obj.count !== undefined) {
    if (obj.count === null) out.count = null;
    else {
      const n = typeof obj.count === "string" ? Number(obj.count) : obj.count;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_KIT_COUNT) {
        fail(`count must be a whole number from 1 to ${MAX_KIT_COUNT}, or null to size the kit to the material.`);
      }
      out.count = n;
    }
  }

  const focus = stringField(obj, "focus");
  if (focus !== undefined) out.focus = focus;

  return out;
}
