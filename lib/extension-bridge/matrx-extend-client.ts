/**
 * Typed Matrx Extend client used by delegated agent tools.
 *
 * Tool ownership is discovered from the installed extension's live
 * capabilities response. The frontend never carries a copied browser-tool
 * allowlist, so adding or removing a DB-backed extension tool cannot drift
 * this executor.
 */

import { z } from "zod";
import {
  detectExtensionId,
  MATRX_EXTEND_EXTENSION_IDS,
  sendChromeRpc,
} from "@/lib/extension-bridge/chrome-rpc";

const ExtensionToolSchema = z.object({
  name: z.string().min(1),
  tier: z.enum(["read", "action"]),
  description: z.string().nullable().optional(),
  admin_only: z.boolean().optional(),
});

const CapabilitiesSchema = z.object({
  version: z.string(),
  tools: z.array(ExtensionToolSchema),
});

type ExtensionTool = z.infer<typeof ExtensionToolSchema>;

interface CapabilitySnapshot {
  extensionId: string;
  version: string;
  tools: ReadonlyMap<string, ExtensionTool>;
  fetchedAt: number;
}

export type MatrxExtendInvocation =
  | { handled: false; reason: string }
  | { handled: true; ok: true; output: Record<string, unknown> }
  | { handled: true; ok: false; error: string };

const CAPABILITY_TTL_MS = 60_000;
const UNAVAILABLE_TTL_MS = 5_000;
const READ_TOOL_TIMEOUT_MS = 30_000;
const ACTION_TOOL_TIMEOUT_MS = 5 * 60_000 + 10_000;

let cachedSnapshot: CapabilitySnapshot | null = null;
let unavailableUntil = 0;
let inFlightSnapshot: Promise<CapabilitySnapshot | null> | null = null;

function recordOutput(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return { value };
}

async function loadCapabilitySnapshot(): Promise<CapabilitySnapshot | null> {
  const now = Date.now();
  if (cachedSnapshot && now - cachedSnapshot.fetchedAt < CAPABILITY_TTL_MS) {
    return cachedSnapshot;
  }
  if (now < unavailableUntil) return null;
  if (inFlightSnapshot) return inFlightSnapshot;

  inFlightSnapshot = (async () => {
    const detected = await detectExtensionId(MATRX_EXTEND_EXTENSION_IDS);
    if (!detected) {
      unavailableUntil = Date.now() + UNAVAILABLE_TTL_MS;
      return null;
    }

    const reply = await sendChromeRpc(
      detected.id,
      "capabilities",
      {},
      { timeoutMs: READ_TOOL_TIMEOUT_MS },
    );
    if (!reply.ok) {
      console.error("[matrx-extend] capability discovery failed:", reply.error);
      unavailableUntil = Date.now() + UNAVAILABLE_TTL_MS;
      return null;
    }

    const parsed = CapabilitiesSchema.safeParse(reply.result);
    if (!parsed.success) {
      console.error(
        "[matrx-extend] capability response violated the bridge contract:",
        parsed.error.format(),
      );
      unavailableUntil = Date.now() + UNAVAILABLE_TTL_MS;
      return null;
    }

    cachedSnapshot = {
      extensionId: detected.id,
      version: parsed.data.version,
      tools: new Map(parsed.data.tools.map((tool) => [tool.name, tool])),
      fetchedAt: Date.now(),
    };
    unavailableUntil = 0;
    return cachedSnapshot;
  })().finally(() => {
    inFlightSnapshot = null;
  });

  return inFlightSnapshot;
}

/** Execute one delegated tool only when the installed extension owns it. */
export async function invokeMatrxExtendTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<MatrxExtendInvocation> {
  const snapshot = await loadCapabilitySnapshot();
  if (!snapshot) {
    return { handled: false, reason: "matrx_extend_unavailable" };
  }

  const tool = snapshot.tools.get(toolName);
  if (!tool) {
    return { handled: false, reason: "tool_not_owned_by_matrx_extend" };
  }

  const reply = await sendChromeRpc(
    snapshot.extensionId,
    "callTool",
    { toolName, args },
    {
      timeoutMs:
        tool.tier === "action"
          ? ACTION_TOOL_TIMEOUT_MS
          : READ_TOOL_TIMEOUT_MS,
    },
  );
  if (!reply.ok) {
    return {
      handled: true,
      ok: false,
      error: reply.error ?? "Matrx Extend tool execution failed.",
    };
  }

  return { handled: true, ok: true, output: recordOutput(reply.result) };
}

/** Test-only cache reset; production callers never need to invalidate it. */
export function resetMatrxExtendClientCache(): void {
  cachedSnapshot = null;
  unavailableUntil = 0;
  inFlightSnapshot = null;
}
