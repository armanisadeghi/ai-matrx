/**
 * features/surfaces/runtime/agent-offer.ts
 *
 * HOW A WRITE TARGET IS OFFERED TO AN AGENT — one line per agent-writable
 * target, exactly as the injected `apply_surface_write` tool lists it: the
 * name, the surface it lives on, the value's type in words, where the value
 * lands, whether the user is asked, the registered value contract and the
 * patchable flag, then the manifest description.
 *
 * One builder, two readers: the per-turn tool injection
 * (`build-tool-injection.ts`) and the board's `board_open_item`, which hands
 * an agent a dormant tile's controls — so a tile's targets read exactly as
 * they do on the feature's own page.
 */

import { KIND_KEY } from "@ai-matrx/content-ir";
import { kindValidator } from "@/features/content-ir/registry/kind-schema-source";
import type { SurfaceWritePolicy, SurfaceWriteTarget } from "../types";

/**
 * A one-line, model-readable précis of a kind's JSON Schema: the required and
 * optional top-level fields with their types. Deliberately compact — this
 * rides in a tool description beside up to a few dozen targets, and the full
 * schema is what the SEAM validates against, not what the model must recite.
 */
function summarizeKindSchema(schema: unknown): string | null {
  if (typeof schema !== "object" || schema === null) return null;
  const s = schema as Record<string, unknown>;

  const describe = (spec: unknown): string => {
    if (typeof spec !== "object" || spec === null) return "any";
    const p = spec as Record<string, unknown>;
    const t = p.type;
    const base = Array.isArray(t)
      ? t.filter((entry) => entry !== "null").join("|") || "any"
      : typeof t === "string"
        ? t
        : p.$ref || p.anyOf || p.oneOf
          ? "object"
          : "any";
    if (base === "array") {
      const inner = describe(p.items);
      return `${inner}[]`;
    }
    return String(base);
  };

  if (s.type === "array") return `${describe(s.items)}[]`;

  const props = s.properties;
  if (typeof props !== "object" || props === null) return null;
  const required = new Set(
    Array.isArray(s.required) ? (s.required as unknown[]).map(String) : [],
  );
  const parts = Object.entries(props as Record<string, unknown>)
    // The marker stays in the advertised schema. Calling it stamped explains
    // that the seam supplies the invariant without hiding it from the contract.
    .map(([name, spec]) =>
      name === KIND_KEY
        ? `${name} (stamped): ${describe(spec)}`
        : `${name}${required.has(name) ? "" : "?"}: ${describe(spec)}`,
    );
  if (parts.length === 0) return null;
  return `{ ${parts.join(", ")} }`;
}

/** The offer line of every agent-writable target, in the given order. */
export async function describeAgentWritableTargets(
  writable: ReadonlyArray<{
    surfaceName: string;
    target: SurfaceWriteTarget;
    policy: Exclude<SurfaceWritePolicy, "manual">;
  }>,
): Promise<string[]> {
  const contracts = new Map<string, string>();
  await Promise.all(
    [
      ...new Set(
        writable
          .map(({ target }) => target.valueKind)
          .filter((kind): kind is string => Boolean(kind)),
      ),
    ].map(async (kind) => {
      const summary = summarizeKindSchema(await kindValidator.cachedSchema(kind));
      if (summary) contracts.set(kind, summary);
    }),
  );

  return writable.map(({ surfaceName, target, policy }) => {
    const applied =
      policy === "auto" ? "applied immediately" : "the user is asked first";
    const landing =
      target.mode === "draft"
        ? "staged into the page's editor for the user to review and save"
        : target.mode === "entity"
          ? "persisted through the page's canonical save path"
          : "ephemeral view state";
    // A kind-bearing target states its contract: the slug (the registered
    // shape's name) and, when the registry answered, the field précis. A
    // value that fails it is refused at the seam before the user is asked.
    const contract = target.valueKind
      ? ` [kind=${target.valueKind}${contracts.has(target.valueKind) ? ` ${contracts.get(target.valueKind)}` : ""}]`
      : "";
    // A patchable target says so ON ITS OWN LINE. The shape is explained once
    // in the description above; per-target it only needs the flag, because a
    // model scanning for "can I edit this in place?" reads the target line.
    const patch = target.patchable ? " [patchable]" : "";
    // Which open screen the target lives on — the page, a parent page, or a
    // window over them (the surface chain): the agent reads that level's
    // values under `<surface>::<value>` and writes it here.
    const where = surfaceName ? `on ${surfaceName}, ` : "";
    // THE TYPE, SAID IN WORDS. `type=object` alone did not stop smaller models
    // from JSON-encoding the value into a string (education classes,
    // 2026-09-27) — the tool schema cannot forbid it, because other targets
    // legitimately take strings. The seam parses such a string when it can,
    // but the line tells the model the right shape up front.
    const typeRule =
      target.valueType === "array"
        ? "value must be a JSON array (the array itself, not a string)"
        : target.valueType === "object"
          ? "value must be a JSON object (the object itself, not a string)"
          : `type=${target.valueType}`;
    return `- ${target.name} (${where}${typeRule}, ${landing}, ${applied})${contract}${patch}: ${target.description}`;
  });
}
