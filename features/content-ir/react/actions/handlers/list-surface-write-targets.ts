/**
 * `list_surface_write_targets` — kind capability #3: a rendered kind component
 * asks WHAT IT COULD WRITE INTO THE PAGE RIGHT NOW, before it draws a control
 * that would do so.
 *
 * Why this exists: a kind component renders EVERYWHERE its kind appears — in
 * /chat, in a floating run window over any page, in the shape studio, in a
 * kind request. A "Use as goal" button in a mandate specification is exactly
 * right on the mandate page and a dead control anywhere else. THE LAW — a
 * screen is absent or honest, never dead — means the component must know
 * whether the target is reachable, and the only thing that knows is the
 * writeback seam's live view (`listLiveWriteTargets`: declared on a MOUNTED
 * surface, and wired to a handler). The component cannot import that seam
 * (sandbox allowlist), so it asks through the ONE action seam it already has.
 *
 * This is a READ. It never applies anything; `apply_surface_write` does.
 *
 * Input contract (malformed input is a safe `{ ok:false }`, never a throw):
 *   { surfaceName?: string; target?: string }
 *   — both optional filters. `target` narrows to one name, so a component
 *     can ask "is `mandate_goal_draft` reachable?" and read `result.length`.
 *
 * Result: `{ targets: Array<{ surfaceName, target, label, mode, hasHandler }> }`
 *   — `hasHandler: false` means declared but not wired, which the seam will
 *     refuse loudly on apply; a component treats it as NOT reachable.
 */

import { listLiveWriteTargets } from "@/features/surfaces/runtime/surface-writeback";
import type { KindActionResult } from "../kind-action-registry";
import { registerKindAction } from "../kind-action-registry";

export const LIST_SURFACE_WRITE_TARGETS_ACTION = "list_surface_write_targets";

export interface ReachableWriteTarget {
  surfaceName: string;
  target: string;
  label: string;
  mode: "draft" | "entity" | "ui";
  hasHandler: boolean;
}

async function listSurfaceWriteTargetsHandler(
  input: unknown,
): Promise<KindActionResult> {
  if (input !== undefined && input !== null && typeof input !== "object") {
    return {
      ok: false,
      error:
        "list_surface_write_targets expects an optional object { surfaceName?, target? }",
    };
  }
  const obj = (input ?? {}) as Record<string, unknown>;
  const surfaceName =
    typeof obj.surfaceName === "string" && obj.surfaceName.trim()
      ? obj.surfaceName
      : null;
  const target =
    typeof obj.target === "string" && obj.target.trim() ? obj.target : null;

  const targets: ReachableWriteTarget[] = listLiveWriteTargets()
    .filter((live) => !surfaceName || live.surfaceName === surfaceName)
    .filter((live) => !target || live.target.name === target)
    .map((live) => ({
      surfaceName: live.surfaceName,
      target: live.target.name,
      label: live.target.label,
      mode: live.target.mode,
      hasHandler: live.hasHandler,
    }));

  return { ok: true, result: { targets } };
}

registerKindAction({
  key: LIST_SURFACE_WRITE_TARGETS_ACTION,
  description:
    "List the surface write targets reachable RIGHT NOW (declared on a mounted surface). Optional filters { surfaceName, target }. A read — use it to decide whether to render an apply control at all; a target with hasHandler:false is not reachable.",
  handler: listSurfaceWriteTargetsHandler,
});
