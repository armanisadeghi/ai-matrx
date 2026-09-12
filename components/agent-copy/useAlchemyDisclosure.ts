"use client";

import {
  useContentTransferCapabilities,
  useContentTransferSurface,
} from "@ai-matrx/design-system/content-transfer";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { useDeclaredSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";

// Agent-native surfaces are excluded by the disclosure law even when a shared
// utility offers a fixed worker. Their agents are the subject of the surface.
const AGENT_NATIVE_SURFACES = new Set([
  "matrx-user/agents",
  "matrx-user/agent-apps",
  "matrx-user/agent-builder",
  "matrx-user/agent-advanced-editor",
  "matrx-user/agent-run",
  "matrx-user/agent-run-history",
  "matrx-user/agent-settings",
  "matrx-user/agent-shortcuts",
  "matrx-user/agent-connections",
  "matrx-user/agent-gate",
  "matrx-admin/agent-apps",
  "matrx-admin/agent-review",
  "matrx-admin/agent-review-item",
  "matrx-admin/system-agents",
  "matrx-admin/mandates",
  "matrx-admin/mandate-workspace",
  "matrx-public/p",
]);

/** UI-free disclosure for a mounted menu's exact local surface. */
export function useAlchemyDisclosure(enabled = true): void {
  const capabilities = useContentTransferCapabilities();
  const surface = useContentTransferSurface();
  const name = surface?.surfaceName;
  const manifest = name ? getManifest(name) : undefined;
  useDeclaredSurfaceMandates(
    enabled &&
      capabilities.ai &&
      name &&
      manifest &&
      manifest.agentRosterMode !== "universal" &&
      !AGENT_NATIVE_SURFACES.has(name)
      ? [
          {
            mandateKey: MANDATE_KEYS.alchemy__prepare_content,
            surfaceName: name,
            does: "Prepares the content you choose in Alchemy for use with AI.",
          },
        ]
      : [],
  );
}
