"use client";

// features/scopes/components/active-context/ActiveContextLensChip.tsx
//
// THE scope control — the one face of "what my agents act within" app-wide.
// Lens Chip trigger → Popover/Sheet → ActiveContextTree (the promoted dense
// ContextTree). Clear lives in the tree footer. Writes appContextSlice via
// the same bridge as ContextDocsMenu / PlusAttachMenu.
//
// States (one component, no second face):
//   iconOnly   — square 28px trigger with a count badge (rails, tight bars)
//   attention  — amber "this needs a scope" prompt
//   fill       — stretches to its row (sidebars, list headers)
//   onOpenPreview — adds the eye zone that opens "what the agent receives"

import React, { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { Button, SplitButton } from "@ai-matrx/design-system/controls";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { ContextSheet } from "@/features/scopes/components/context-assignment/ContextSheet";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveScopeTypeIds,
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { resolveColor } from "@/features/scopes/constants/scope-colors";
import { ActiveContextTree } from "./ActiveContextTree";
import {
  ensureEntityScopes,
  entityScopesKey,
} from "@/features/scopes/redux/thunks/ensureEntityScopes";
import { displayedSendScopeIds } from "@/features/scopes/utils/scopeMismatch";
import type { RootState } from "@/lib/redux/rootReducer";

const NO_IDS: readonly string[] = [];

/** A conversation the server has confirmed — its organization is frozen. */
function persistedConversationOrg(
  state: RootState,
  conversationId: string | undefined,
): string | null {
  if (!conversationId) return null;
  const record = state.conversations.byConversationId[conversationId];
  return record && record.cacheOnly === false
    ? (record.organizationId ?? null)
    : null;
}
import { LensChip, type LensChipNode } from "./LensChip";

export interface ActiveContextLensChipProps {
  align?: "start" | "center" | "end";
  className?: string;
  /** The chip's skin: `outline` (default) or `quiet` (a composer row). */
  variant?: "outline" | "quiet";
  conversationId?: string;
  /** Square 28px trigger with a count badge. */
  iconOnly?: boolean;
  /** Amber "this needs a scope" prompt. */
  attention?: boolean;
  /** Stretch to the row's width. */
  fill?: boolean;
  /** Adds the eye zone that opens the "what the agent receives" preview. */
  onOpenPreview?: () => void;
  /** True while that preview is open — keeps the eye zone lit. */
  previewOpen?: boolean;
}

export function ActiveContextLensChip({
  align = "start",
  className,
  variant,
  conversationId,
  iconOnly = false,
  attention = false,
  fill = false,
  onOpenPreview,
  previewOpen = false,
}: ActiveContextLensChipProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { organizations } = useScopeTree();

  const dispatch = useAppDispatch();
  // KEYED TO THE CONVERSATION, NOT THE SHELL (W-62). A persisted chat's
  // organization never moves, so switching the shell's active organization
  // must not change what this chip names: the org node is the chat's own, and
  // the scopes are what the next send carries — the sidebar selection, or,
  // when the switch cleared it, the chat's own durable tags (the gate sends
  // those; the chip used to drop them and read `ASW` while `COM · 1 scope`
  // still went out). A brand-new chat follows the shell as before.
  const activeOrgId = useAppSelector(selectOrganizationId);
  const conversationOrgId = useAppSelector((state) =>
    persistedConversationOrg(state, conversationId),
  );
  const orgId = conversationOrgId ?? activeOrgId;
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const activeScopeTypeIds = useAppSelector(selectActiveScopeTypeIds);
  const chatScopeIds = useAppSelector((state) => {
    if (!conversationOrgId || !conversationId) return NO_IDS;
    const entry =
      state.scopesTree.entityScopesByKey[
        entityScopesKey("conversation", conversationId)
      ];
    return entry?.status === "ready" ? entry.scope_ids : NO_IDS;
  });
  useEffect(() => {
    if (conversationOrgId && conversationId) {
      void dispatch(ensureEntityScopes("conversation", conversationId));
    }
  }, [dispatch, conversationOrgId, conversationId]);

  const activeScopeIds = Object.values(scopeSelections).filter(
    (value): value is string => Boolean(value),
  );
  const scopeIds = displayedSendScopeIds(activeScopeIds, chatScopeIds);

  const chipNodes: LensChipNode[] = [];
  if (orgId) {
    const selectedOrganization = organizations.find(
      (organization) => organization.id === orgId,
    );
    chipNodes.push({
      kind: "org",
      label: selectedOrganization?.abbreviation,
    });
  }

  const allTypes = organizations.flatMap(
    (organization) => organization.scope_types,
  );
  const typesWithScopes = new Set<string>();
  for (const scopeId of scopeIds) {
    const type = allTypes.find((candidate) =>
      candidate.scopes.some((scope) => scope.id === scopeId),
    );
    if (type) typesWithScopes.add(type.id);
    chipNodes.push({
      kind: "scope",
      colorSwatch: type ? resolveColor(type).swatch : undefined,
    });
  }
  for (const typeId of activeScopeTypeIds) {
    if (typesWithScopes.has(typeId)) continue;
    const type = allTypes.find((candidate) => candidate.id === typeId);
    chipNodes.push({
      kind: "type",
      colorSwatch: type ? resolveColor(type).swatch : undefined,
    });
  }

  if (projectId) chipNodes.push({ kind: "project" });
  if (taskId) chipNodes.push({ kind: "task" });

  // Keep the tree mounted while open so selection ↔ Redux stays live; remount
  // on every parent render was dropping in-flight expand/lazy-load state.
  const picker = open ? (
    <ActiveContextTree
      conversationId={conversationId}
      maxHeight={isMobile ? 420 : 320}
      className={isMobile ? "mx-3 mb-3 w-auto" : "w-[320px]"}
    />
  ) : null;

  const withPreview = Boolean(onOpenPreview);
  const trigger = (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full overflow-hidden",
        fill && "w-full",
      )}
    >
      <LensChip
        nodes={chipNodes}
        onClick={isMobile ? () => setOpen(true) : () => {}}
        iconOnly={iconOnly}
        attention={attention}
        fill={fill}
        variant={withPreview ? "quiet" : variant}
        className={withPreview ? undefined : className}
      />
    </span>
  );

  const chip = (
    <div
      className={cn(
        "inline-flex min-w-0 max-w-full items-center overflow-hidden",
        fill && "w-full",
      )}
    >
      {isMobile ? (
        <>
          {trigger}
          <ContextSheet
            open={open}
            onOpenChange={setOpen}
            title="Scopes"
          >
            {picker}
          </ContextSheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent /* sizing: fixed — content already decides its own width; no fixed box to remove */ align={align} className="w-auto p-0">
            {picker}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );

  if (!withPreview) return chip;

  return (
    <SplitButton className={cn("shrink-0", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="quiet"
            tone="primary"
            pressed={previewOpen}
            icon={<Eye />}
            onClick={onOpenPreview}
            aria-label="See exactly what the agent receives"
          />
        </TooltipTrigger>
        <TooltipContent side="top">
          See exactly what the agent receives
        </TooltipContent>
      </Tooltip>
      {chip}
    </SplitButton>
  );
}
