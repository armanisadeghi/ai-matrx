/**
 * THE ONE LEGACY SURFACE OF THE KIND DIRECTIVES CAMPAIGN — and nothing else.
 *
 * Stored conversations, stored context-item values and stored picklist
 * selections hold ` ```matrx ` fences written before 2026-08-23, in the retired
 * 4-key shell:
 *
 *     { "matrx_version": 1, "kind": "reference", "type": "note", "items": [...] }
 *
 * Those fences must keep rendering forever. This module is how — and it is the
 * ENTIRE legacy story on the client. Its constraints are not style, they are
 * the campaign's Strictness Law (`common-docs/projects/kind-directives/PLAN.md`
 * § THE STRICTNESS LAW, clause 4), and each is mechanically proven:
 *
 * 1. **READ-ONLY.** It translates an old shell into the new one. It never
 *    emits, never writes, and never hands the old shape back to anyone.
 * 2. **UNREACHABLE FROM ANY EMISSION PATH.** The only importer in the whole
 *    repo is `decode.ts` (plus this module's own tests and the guard that
 *    enforces it). Proven by `pnpm check:legacy-shim-containment`, which walks
 *    every TS/TSX file in the repo. If you are reading this because you want to
 *    import it somewhere else: the answer is no. Emit the new shell.
 * 3. **IT NEVER REGISTERS A RENDERER.** No dual registration, no compatibility
 *    alias, and no "try new, fall back to old" branch anywhere in the system.
 *    A fallback branch is a defect the moment it is written.
 * 4. **COUNTED.** Every translation increments {@link legacyShellUses}, so the
 *    number can be watched and known to be aging out. A legacy surface nobody
 *    measures is a permanent one.
 *
 * WHY A TRANSLATION AND NOT A SECOND DECODER
 * ------------------------------------------
 * A second decoder is a second set of rules that drifts. This produces the NEW
 * shell — `{"__kind": slug, "items": [...]}` — and then stops. Everything
 * downstream (slug routing, the position law, the renderer lookup, the confirm
 * POST) runs the single new path, so a 2024 fence and a fence written this
 * second are identical by the time anything makes a decision about them.
 *
 * Byte-mirror of aidream `services/content_ir_directives/legacy_shell.py`.
 */

import { KIND_KEY, buildDirectiveSlug } from "./grammar";

/** The retired shell's sentinel — the field the old detector keyed on. */
const LEGACY_SENTINEL = "matrx_version";

/**
 * Old envelope kind → new directive class, for the classes whose noun IS the
 * old `type` verbatim. `output_directive`/`function` are handled separately
 * because their type carried the verb.
 */
const CLASS_BY_LEGACY_KIND: Readonly<Record<string, string>> = {
  reference: "reference",
  secret: "secret",
  validation: "validation",
};

/**
 * The two old kinds that both meant "a side effect", distinguished only by
 * whether the type carried a `verb:noun`. The merge collapses them: a
 * `verb:noun` becomes that verb's class, anything else becomes `action`.
 */
const LEGACY_SIDE_EFFECT_KINDS: ReadonlySet<string> = new Set([
  "output_directive",
  "function",
]);

const VERB_NOUN_RE = /^(create|update|delete):([a-z][a-z0-9_]*)$/;

let uses = 0;

/**
 * How many legacy shells this browser session has translated. Watched, not
 * assumed — a legacy surface nobody measures is a permanent one.
 */
export function legacyShellUses(): number {
  return uses;
}

/** Test-only reset of the counter. */
export function resetLegacyShellUses(): void {
  uses = 0;
}

/** Whether `obj` is a retired 4-key shell (presence of the old sentinel). */
export function isLegacyShell(obj: unknown): boolean {
  return (
    typeof obj === "object" &&
    obj !== null &&
    !Array.isArray(obj) &&
    LEGACY_SENTINEL in (obj as Record<string, unknown>)
  );
}

function slugForLegacy(kind: string, type: string): string | null {
  let directiveClass: string;
  let noun: string;
  if (LEGACY_SIDE_EFFECT_KINDS.has(kind)) {
    const match = VERB_NOUN_RE.exec(type);
    if (match) {
      directiveClass = match[1]!;
      noun = match[2]!;
    } else {
      directiveClass = "action";
      noun = type;
    }
  } else {
    const mapped = CLASS_BY_LEGACY_KIND[kind];
    if (!mapped) return null;
    directiveClass = mapped;
    noun = type;
  }
  try {
    return buildDirectiveSlug(directiveClass, noun);
  } catch {
    return null;
  }
}

/**
 * A retired 4-key shell → the new two-key shell, or `null` when it is not
 * translatable (an unknown old kind, or a type that is not a legal noun).
 *
 * Returning null rather than throwing is deliberate: the caller (`decode`)
 * already has the one place that turns "this looks like a directive but cannot
 * be honored" into a real message, and a shim that invents its own error
 * vocabulary is a second decoder in disguise.
 */
export function translateLegacyShell(
  obj: Record<string, unknown>,
): Record<string, unknown> | null {
  const kind = obj.kind;
  const type = obj.type;
  if (typeof kind !== "string" || typeof type !== "string") return null;
  const slug = slugForLegacy(kind, type);
  if (slug === null) return null;
  const items = obj.items;
  uses += 1;
  return { [KIND_KEY]: slug, items: Array.isArray(items) ? [...items] : [] };
}
