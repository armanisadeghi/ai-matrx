"use client";

/**
 * features/surfaces/runtime/surface-writeback.ts
 *
 * The surface WRITEBACK seam — how an agent result gets INTO the page.
 *
 * Surfaces have always been read-only: they emit declared values so agents
 * can see the page. This module is the write half. A surface's manifest
 * declares `writeTargets` (the fields/state agents may write); the page's
 * `SurfaceRuntimeProvider` registers one handler per target
 * (`getWriteHandlers`); and EVERY caller — a kind-component action button,
 * an automated envelope apply, chrome — lands the value through the ONE
 * function here:
 *
 *   applySurfaceWrite(target, value, opts?) → Promise<SurfaceWriteResult>
 *
 * Non-negotiables (mirrors the kind-action registry's safety posture):
 *  - NEVER throws. Every outcome is a `{ ok } | { ok:false, error }` envelope.
 *  - LOUD on contract breaks. A target nobody declared, a declared target
 *    with no live handler, a handler that throws — each one toasts, captures
 *    a structured error, and returns a failure envelope. Silent skips are how
 *    write paths rot.
 *  - Deepest-wins resolution over the live provider stack: the open node
 *    panel's targets shadow the workspace's, but a workspace-level target
 *    still resolves while a panel is open (the walk continues outward).
 *  - Validation is manifest-driven: only names declared in the resolved
 *    surface's `writeTargets` are accepted, so a UI cannot accept a write it
 *    never declared, and a caller cannot invent one.
 */

import { getManifest } from "@/features/surfaces/manifests/registry";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toast } from "@/lib/toast";

import type { SurfaceWriteTarget } from "../types";
import {
  getRegisteredWriteHandlers,
  getSurfaceRuntimeStack,
} from "./SurfaceRuntimeContext";

/**
 * Every handler that can service `surfaceName` right now: the provider's own
 * (`getWriteHandlers`) plus any a descendant registered by name
 * (`useSurfaceWriteHandlers`). Registered handlers win — the component that
 * registered one owns the state that target writes.
 */
function resolveHandlers(runtime: {
  surfaceName: string;
  getWriteHandlers?: () => Record<string, (value: unknown) => void | Promise<void>>;
}) {
  return {
    ...(runtime.getWriteHandlers?.() ?? {}),
    ...getRegisteredWriteHandlers(runtime.surfaceName),
  };
}

/** The envelope every write returns. A skip/failure is never a silent pass. */
export type SurfaceWriteResult =
  | { ok: true; surfaceName: string; target: SurfaceWriteTarget }
  | { ok: false; error: string }
  /**
   * The user was asked and said no. NOT a failure — nothing toasts, nothing is
   * captured. A caller that treats decline as an error trains users to stop
   * declining, which is the opposite of what the ask policy is for.
   */
  | { ok: false; declined: true; error: string };

/**
 * Who is driving this write.
 *
 * `"user"` (default) — a human interacted with a declared control. The click
 * IS the consent; the apply policy is not consulted.
 *
 * `"agent"` — model output is trying to change the page with no human in that
 * instant. This is the direction that needed a gate: `applyPolicy` decides
 * whether it is refused, asked, or applied.
 */
export type SurfaceWriteOrigin = "user" | "agent";

export interface ApplySurfaceWriteOptions {
  /**
   * Pin the write to one surface (`ui_surface.name`). Omitted = deepest
   * registered surface that DECLARES the target wins.
   */
  surfaceName?: string;
  /**
   * Suppress the success toast (callers that show their own confirmation).
   * Failures always toast — loud recovery is not optional.
   */
  quiet?: boolean;
  /** Defaults to `"user"`. Pass `"agent"` for any write not driven by a click. */
  origin?: SurfaceWriteOrigin;
  /**
   * Shown in the ask dialog so the user knows WHO wants the change ("Keyword
   * strategist wants to…"). Ignored for user-origin writes.
   */
  actorLabel?: string;
}

/** Neither a success nor a defect — the user declined. Silent by design. */
function declined(target: SurfaceWriteTarget): SurfaceWriteResult {
  return {
    ok: false,
    declined: true,
    error: `The user declined the change to "${target.label}".`,
  };
}

/**
 * Decide whether an agent-originated write may proceed. User-origin writes
 * never reach here.
 *
 * Returns true to apply, false to stop. A `manual` refusal is LOUD — an agent
 * attempting a write the surface never opened up is a real contract break the
 * author needs to see, not a silent no-op.
 */
async function agentWriteAllowed(
  target: SurfaceWriteTarget,
  surfaceName: string,
  actorLabel: string | undefined,
): Promise<boolean> {
  const policy = target.applyPolicy ?? "manual";
  if (policy === "auto") return true;
  if (policy === "manual") {
    fail(
      `"${target.label}" is not agent-writable on this surface (applyPolicy: manual). A person has to make this change.`,
      { targetName: target.name, surfaceName, policy },
    );
    return false;
  }
  const who = actorLabel?.trim() ? actorLabel.trim() : "An agent";
  return confirm({
    title: `${who} wants to change ${target.label}`,
    description:
      target.mode === "entity"
        ? `${target.description} This is saved immediately.`
        : target.mode === "draft"
          ? `${target.description} It is staged for you to review — nothing is saved until you save.`
          : target.description,
    confirmLabel: "Apply",
    cancelLabel: "Keep as is",
  });
}

function findDeclaredTarget(
  surfaceName: string,
  targetName: string,
): SurfaceWriteTarget | null {
  const manifest = getManifest(surfaceName);
  return (
    manifest?.writeTargets?.find((entry) => entry.name === targetName) ?? null
  );
}

function fail(message: string, raw: Record<string, unknown>): SurfaceWriteResult {
  toast.error(message);
  captureError({
    source: "surface-writeback",
    message: `[surface-writeback] ${message}`,
    raw,
  });
  return { ok: false, error: message };
}

/**
 * Apply one value to one declared write target on the live page.
 * See the module header for resolution + safety semantics.
 */
export async function applySurfaceWrite(
  targetName: string,
  value: unknown,
  opts?: ApplySurfaceWriteOptions,
): Promise<SurfaceWriteResult> {
  const stack = getSurfaceRuntimeStack().filter(
    (entry) => !opts?.surfaceName || entry.surfaceName === opts.surfaceName,
  );

  if (stack.length === 0) {
    return fail(
      opts?.surfaceName
        ? `Surface "${opts.surfaceName}" is not mounted — nothing can receive "${targetName}".`
        : `No surface is mounted — nothing can receive "${targetName}".`,
      { targetName, surfaceName: opts?.surfaceName ?? null },
    );
  }

  // Deepest-first: first surface that DECLARES the target owns the write.
  for (const runtime of stack) {
    const target = findDeclaredTarget(runtime.surfaceName, targetName);
    if (!target) continue;

    const handlers = resolveHandlers(runtime);
    const handler = handlers[targetName];
    if (!handler) {
      // Declared but not wired — a real defect on the page, not the caller.
      return fail(
        `Surface "${runtime.surfaceName}" declares write target "${targetName}" but registered no handler for it.`,
        { targetName, surfaceName: runtime.surfaceName },
      );
    }

    if ((opts?.origin ?? "user") === "agent") {
      const allowed = await agentWriteAllowed(
        target,
        runtime.surfaceName,
        opts?.actorLabel,
      );
      // `agentWriteAllowed` already reported a manual refusal; a decline is
      // deliberately quiet.
      if (!allowed) {
        return (target.applyPolicy ?? "manual") === "manual"
          ? {
              ok: false,
              error: `"${target.label}" is not agent-writable on this surface.`,
            }
          : declined(target);
      }
    }

    try {
      await handler(value);
      // ui-mode writes are self-evident on screen (selection moved, view
      // changed) — no toast. Draft/entity writes confirm what landed where.
      if (!opts?.quiet && target.mode !== "ui") {
        toast.success(
          target.mode === "entity"
            ? `${target.label} — done.`
            : `${target.label} staged — review and save.`,
        );
      }
      return { ok: true, surfaceName: runtime.surfaceName, target };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Applying "${target.label}" failed.`;
      return fail(message, {
        targetName,
        surfaceName: runtime.surfaceName,
        error,
      });
    }
  }

  return fail(
    `No mounted surface declares write target "${targetName}".`,
    {
      targetName,
      mounted: stack.map((entry) => entry.surfaceName),
    },
  );
}

/**
 * The write targets currently reachable (declared AND mounted), deepest
 * surface first — for authoring surfaces / debug chrome (the Surface Context
 * window can show "what could an agent write here right now").
 */
export function listLiveWriteTargets(): ReadonlyArray<{
  surfaceName: string;
  target: SurfaceWriteTarget;
  hasHandler: boolean;
}> {
  const out: Array<{
    surfaceName: string;
    target: SurfaceWriteTarget;
    hasHandler: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const runtime of getSurfaceRuntimeStack()) {
    const manifest = getManifest(runtime.surfaceName);
    if (!manifest?.writeTargets) continue;
    const handlers = resolveHandlers(runtime);
    for (const target of manifest.writeTargets) {
      const key = `${runtime.surfaceName}:${target.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        surfaceName: runtime.surfaceName,
        target,
        hasHandler: Boolean(handlers[target.name]),
      });
    }
  }
  return out;
}
