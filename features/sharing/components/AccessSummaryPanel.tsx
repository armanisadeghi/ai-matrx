/**
 * features/sharing/components/AccessSummaryPanel.tsx
 *
 * "Who can see this, and why" — the truthful access explanation for ONE
 * entity. Works for any entity token, not just files: hand it a type + id.
 *
 * It lists every REASON access is granted, because the reason is the part
 * users act on. "Everyone in Titanium (via the Web Development scope)" tells
 * you what to detach; "Only you" told you nothing and was often wrong.
 */

"use client";

import { Globe, Lock, Loader2, Users, Boxes, AlertTriangle } from "lucide-react";
import { useAccessSummary } from "@/features/sharing/hooks/useAccessSummary";
import {
  describeAccessSummary,
  type AccessContainer,
  type AccessSummary,
} from "@/features/sharing/service/accessSummary";
import { cn } from "@/utils/cn";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface AccessSummaryPanelProps {
  entityType: EntityTypeToken;
  entityId: string | null;
  /** Load only when the surface is actually visible. */
  enabled?: boolean;
  className?: string;
}

export function AccessSummaryPanel({
  entityType,
  entityId,
  enabled = true,
  className,
}: AccessSummaryPanelProps) {
  const { summary, loading, error, reload } = useAccessSummary({
    entityType,
    entityId,
    enabled,
  });

  if (loading && !summary) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Working out who can see this…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive",
          className,
        )}
      >
        <p className="flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-3.5 w-3.5" />
          Couldn’t determine access
        </p>
        <p className="opacity-80">{error}</p>
        <button
          type="button"
          onClick={reload}
          className="mt-1 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const Icon = summary.isPublic
    ? Globe
    : isPrivate(summary)
      ? Lock
      : Users;

  return (
    <div className={cn("space-y-2 px-3 py-2", className)}>
      {/*
       * Visibility comes from the summary, NOT from the client-side Visibility
       * union — `toVisibility()` collapses `internal` into `personal`, so the
       * client type cannot tell "belongs to one person" from "readable by the
       * whole org". Rendering the collapsed value next to the true reasons
       * produced a visible contradiction ("Personal" above "…is internal in
       * that organization").
       */}
      <p className="text-[12px] text-muted-foreground">
        Visibility:{" "}
        <span className="text-foreground">
          {visibilityLabel(summary.visibility)}
        </span>
      </p>

      <p className="flex items-start gap-2 text-[13px] text-foreground">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>{describeAccessSummary(summary)}</span>
      </p>

      <ul className="space-y-1 text-[12px] text-muted-foreground">
        {summary.orgReadable && summary.organizationName ? (
          <ReasonRow
            icon={Users}
            title={`Everyone in ${summary.organizationName}`}
            detail={`This ${entityType.replace(/_/g, " ")} is ${summary.visibility} in that organization`}
          />
        ) : null}

        {summary.directGrantCount > 0 ? (
          <ReasonRow
            icon={Users}
            title={
              summary.directGrantCount === 1
                ? "1 direct share"
                : `${summary.directGrantCount} direct shares`
            }
            detail={
              summary.canManage && summary.directGrants.length > 0
                ? summary.directGrants
                    .map(
                      (g) =>
                        `${g.granteeLabel ?? g.granteeType} · ${g.level}`,
                    )
                    .join(", ")
                : "Open the Share tab to manage"
            }
          />
        ) : null}

        {summary.containers.map((container) => (
          <ReasonRow
            key={`${container.containerType}:${container.containerId}`}
            icon={Boxes}
            title={containerTitle(container)}
            detail={containerDetail(container)}
          />
        ))}
      </ul>

      {isPrivate(summary) ? (
        <p className="text-[12px] text-muted-foreground">
          Nothing else grants access to this yet.
        </p>
      ) : null}
    </div>
  );
}

function ReasonRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Users;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">
        <span className="text-foreground">{title}</span>
        {detail ? <span className="opacity-80"> — {detail}</span> : null}
      </span>
    </li>
  );
}

function containerTitle(container: AccessContainer): string {
  const kind = container.containerTypeLabel ?? container.containerType;
  return container.label ? `${container.label} (${kind})` : kind;
}

function containerDetail(container: AccessContainer): string {
  const parts: string[] = [`grants ${container.level}`];
  if (container.orgReadable && container.organizationName) {
    parts.push(`readable by everyone in ${container.organizationName}`);
  } else if (container.memberCount > 0) {
    parts.push(
      container.memberCount === 1
        ? "1 member"
        : `${container.memberCount} members`,
    );
  }
  return parts.join(" · ");
}

/** The entity's own visibility SETTING, in the DB's true vocabulary. */
function visibilityLabel(visibility: string): string {
  switch (visibility) {
    case "public":
      return "Public — anyone with the link";
    case "shared":
      return "Shared — specific grantees and share links";
    case "internal":
      return "Internal — readable inside the owning organization";
    case "personal":
      return "Personal — belongs to one person";
    default:
      return visibility;
  }
}

function isPrivate(summary: AccessSummary): boolean {
  return (
    !summary.isPublic &&
    !summary.orgReadable &&
    summary.directGrantCount === 0 &&
    summary.containers.length === 0
  );
}

export default AccessSummaryPanel;
