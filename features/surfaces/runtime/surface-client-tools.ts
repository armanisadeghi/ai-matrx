"use client";

/**
 * features/surfaces/runtime/surface-client-tools.ts
 *
 * The surface CLIENT-TOOL seam — how an agent's delegated tool call gets
 * EXECUTED on the live page.
 *
 * Surfaces declare tools in `SurfaceManifest.clientTools`; the page registers
 * one handler per tool (`useSurfaceClientTools` in SurfaceRuntimeContext);
 * launch injection (`build-tool-injection.ts`) offers every
 * declared+mounted+handled tool to the agent as an inline spec; and when the
 * server emits `tool_delegated` for one, the execution system lands the call
 * through the ONE function here:
 *
 *   executeSurfaceClientTool(name, input, opts?) → Promise<SurfaceClientToolResult>
 *
 * Non-negotiables (mirrors `surface-writeback.ts`'s safety posture):
 *  - NEVER throws. Every outcome is a `{ ok } | { ok:false, error }` envelope.
 *  - LOUD on contract breaks. A tool nobody declared, a declared tool with no
 *    live handler, a handler that throws — each one toasts, captures a
 *    structured error (source "surface-writeback" — same seam family), and
 *    returns a failure envelope. Silent skips are how tool paths rot.
 *  - Deepest-wins resolution over the live provider stack: the first mounted
 *    surface (deepest-first) whose manifest DECLARES the tool owns the call —
 *    same walk as `applySurfaceWrite`.
 *  - Declaration is manifest-driven: only names declared in a mounted
 *    surface's `clientTools` execute, so a page cannot service a tool it
 *    never declared, and a caller cannot invent one.
 */

import { getAllManifests, getManifest } from "@/features/surfaces/manifests/registry";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toast } from "@/lib/toast";

import type { SurfaceClientTool } from "../types";
import {
  getRegisteredSurfaceClientTools,
  getSurfaceRuntimeStack,
} from "./SurfaceRuntimeContext";

/** The envelope every execution returns. A skip/failure is never silent. */
export type SurfaceClientToolResult =
  | {
      ok: true;
      surfaceName: string;
      tool: SurfaceClientTool;
      /** Whatever the page handler returned — the tool output the agent gets. */
      output: unknown;
    }
  | { ok: false; error: string };

export interface ExecuteSurfaceClientToolOptions {
  /**
   * Pin the call to one surface (`ui_surface.name`). Omitted = deepest
   * mounted surface that DECLARES the tool wins.
   */
  surfaceName?: string;
}

function findDeclaredClientTool(
  surfaceName: string,
  toolName: string,
): SurfaceClientTool | null {
  const manifest = getManifest(surfaceName);
  return (
    manifest?.clientTools?.find((entry) => entry.name === toolName) ?? null
  );
}

function fail(
  message: string,
  raw: Record<string, unknown>,
): SurfaceClientToolResult {
  toast.error(message);
  captureError({
    source: "surface-writeback",
    message: `[surface-client-tools] ${message}`,
    raw,
  });
  return { ok: false, error: message };
}

/**
 * True when ANY registered surface manifest declares `name` as a client tool.
 * This is the ROUTING predicate the delegation seam uses (parallel to
 * `isScribeToolName` etc.) — deliberately manifest-wide, not mounted-only, so
 * a surface tool whose page unmounted mid-turn still routes HERE and gets the
 * precise "surface not mounted" failure instead of the generic
 * `unsupported_client_tool`.
 */
export function isDeclaredSurfaceClientToolName(name: string): boolean {
  for (const manifest of getAllManifests()) {
    if (manifest.clientTools?.some((tool) => tool.name === name)) return true;
  }
  return false;
}

/**
 * Execute one declared surface client tool against the live page.
 * See the module header for resolution + safety semantics.
 */
export async function executeSurfaceClientTool(
  toolName: string,
  input: unknown,
  opts?: ExecuteSurfaceClientToolOptions,
): Promise<SurfaceClientToolResult> {
  const stack = getSurfaceRuntimeStack().filter(
    (entry) => !opts?.surfaceName || entry.surfaceName === opts.surfaceName,
  );

  if (stack.length === 0) {
    return fail(
      opts?.surfaceName
        ? `Surface "${opts.surfaceName}" is not mounted — nothing can run tool "${toolName}".`
        : `No surface is mounted — nothing can run tool "${toolName}".`,
      { toolName, surfaceName: opts?.surfaceName ?? null },
    );
  }

  // Deepest-first: first surface that DECLARES the tool owns the call.
  for (const runtime of stack) {
    const tool = findDeclaredClientTool(runtime.surfaceName, toolName);
    if (!tool) continue;

    const handler = getRegisteredSurfaceClientTools(runtime.surfaceName)[
      toolName
    ];
    if (!handler) {
      // Declared but not wired — a real defect on the page, not the caller.
      return fail(
        `Surface "${runtime.surfaceName}" declares client tool "${toolName}" but registered no handler for it.`,
        { toolName, surfaceName: runtime.surfaceName },
      );
    }

    try {
      const output = await handler(input);
      return { ok: true, surfaceName: runtime.surfaceName, tool, output };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Running "${tool.label}" failed.`;
      return fail(message, {
        toolName,
        surfaceName: runtime.surfaceName,
        error,
      });
    }
  }

  return fail(
    `No mounted surface declares client tool "${toolName}".`,
    { toolName, mounted: stack.map((entry) => entry.surfaceName) },
  );
}

/**
 * The client tools currently reachable (declared AND mounted), deepest
 * surface first — mirror of `listLiveWriteTargets`. Launch injection offers
 * only `hasHandler: true` entries to the agent; authoring/debug chrome can
 * show the rest as declared-but-unwired.
 */
export function listLiveSurfaceClientTools(): ReadonlyArray<{
  surfaceName: string;
  tool: SurfaceClientTool;
  hasHandler: boolean;
}> {
  const out: Array<{
    surfaceName: string;
    tool: SurfaceClientTool;
    hasHandler: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const runtime of getSurfaceRuntimeStack()) {
    const manifest = getManifest(runtime.surfaceName);
    if (!manifest?.clientTools) continue;
    const handlers = getRegisteredSurfaceClientTools(runtime.surfaceName);
    for (const tool of manifest.clientTools) {
      const key = `${runtime.surfaceName}:${tool.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        surfaceName: runtime.surfaceName,
        tool,
        hasHandler: Boolean(handlers[tool.name]),
      });
    }
  }
  return out;
}
