"use client";

// features/scopes/components/active-context/ActiveContextLensChip.tsx
//
// Lens Chip trigger → Popover/Sheet → ActiveContextTree (the promoted dense
// ContextTree). Clear lives in the tree footer. Writes appContextSlice via
// the same bridge as ContextDocsMenu / PlusAttachMenu.

import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { ContextSheet } from "@/features/scopes/components/context-assignment/ContextSheet";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveScopeTypeIds,
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { ActiveContextTree } from "./ActiveContextTree";
import { LensChip, type LensChipNode } from "./LensChip";

export interface ActiveContextLensChipProps {
  align?: "start" | "center" | "end";
  className?: string;
  conversationId?: string;
}

export function ActiveContextLensChip({
  align = "start",
  className,
  conversationId,
}: ActiveContextLensChipProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { organizations } = useScopeTree();

  const orgId = useAppSelector(selectOrganizationId);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const activeScopeTypeIds = useAppSelector(selectActiveScopeTypeIds);

  const scopeIds = Object.values(scopeSelections).filter(
    (value): value is string => Boolean(value),
  );

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

  const trigger = (
    <span className="inline-flex min-w-0 max-w-full overflow-hidden">
      <LensChip
        nodes={chipNodes}
        onClick={isMobile ? () => setOpen(true) : () => {}}
        className={className}
      />
    </span>
  );

  return (
    <div className="inline-flex min-w-0 max-w-full items-center overflow-hidden">
      {isMobile ? (
        <>
          {trigger}
          <ContextSheet
            open={open}
            onOpenChange={setOpen}
            title="Working context"
          >
            {picker}
          </ContextSheet>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align={align} className="w-auto p-0">
            {picker}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
