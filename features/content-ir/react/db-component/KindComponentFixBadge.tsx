"use client";

/**
 * KindComponentFixBadge — the in-render ownership affordance for DB kind
 * components. When the person viewing a rendered kind instance is the
 * component's creator (kind_component.created_by) or a super admin, a small
 * floating badge appears at the block's top-right corner. One click opens the
 * kind-creator agent in the shared floating run window (agentRunWindow),
 * pre-seeded with the kind slug and the exact instance content the user was
 * looking at — the agent fetches the component row itself via its kind_* tools.
 *
 * Renders nothing for everyone else, for compiled/bundled resolutions, and
 * when the creator agent is unconfigured (the click still screams in that
 * case rather than silently no-opping — same posture as KindAgentButton).
 *
 * Mounted by the DbKindComponent SHELL (not the lazy Impl) so it stays in the
 * always-client, Redux-provided layer and adds nothing to the Babel chunk.
 * It re-derives the kind from the envelope and re-resolves the registry row —
 * both synchronous, both already in the main bundle.
 */

import React from "react";
import { PencilRuler } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsSuperAdmin,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import { shapeCreatorAgentId } from "../../studio/constants";
import { composeKindComponentFixIntent } from "../../studio/kind-agent-intents";
import { readEnvelope } from "../../redux/render-block-envelope";
import { resolveComponent } from "../../registry/component-registry";

function readKindSlug(
  content: string,
  metadata: Record<string, unknown> | undefined,
): string | null {
  const envelope = readEnvelope(metadata);
  if (envelope?.root.kind) return envelope.root.kind;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).__kind === "string"
    ) {
      return (parsed as Record<string, unknown>).__kind as string;
    }
  } catch {
    // No kind derivable — the Impl screams about this case; the badge just hides.
  }
  return null;
}

export interface KindComponentFixBadgeProps {
  content: string;
  metadata?: Record<string, unknown>;
}

export const KindComponentFixBadge: React.FC<KindComponentFixBadgeProps> = ({
  content,
  metadata,
}) => {
  const userId = useAppSelector(selectUserId);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const openRun = useOpenAgentRunWindow();

  const kind = readKindSlug(content, metadata);
  if (!kind || !userId) return null;

  const resolution = resolveComponent(kind, "web", "output");
  if (!resolution || resolution.resolvedBy !== "db") return null;

  const canEdit = isSuperAdmin || resolution.createdBy === userId;
  if (!canEdit) return null;

  const launch = () => {
    const agentId = shapeCreatorAgentId();
    if (!agentId) {
      toast.error("The Shape creator agent is not configured", {
        description:
          "Set SHAPE_CREATOR_AGENT_ID in features/content-ir/studio/constants.ts.",
      });
      return;
    }
    openRun({
      initialAgentId: agentId,
      initialDraftText: composeKindComponentFixIntent({
        kind,
        instanceContent: content,
      }),
    });
  };

  return (
    <button
      type="button"
      onClick={launch}
      title={`You can edit this component (${kind}) — open the fix agent`}
      aria-label="Fix this component"
      className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-md opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
    >
      <PencilRuler className="h-3.5 w-3.5" />
    </button>
  );
};
