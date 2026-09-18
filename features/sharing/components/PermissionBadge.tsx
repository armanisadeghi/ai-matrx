"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import type { PermissionLevel } from "@/utils/permissions/types";
import { Crown, Shield, Eye, MessageSquare, Users, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PermissionBadgeProps {
  level: PermissionLevel | "owner";
  variant?: "default" | "compact";
  showIcon?: boolean;
}

/**
 * PermissionBadge - Visual indicator for permission levels
 *
 * Displays color-coded badges for different permission levels
 * Used throughout the app to show user permissions
 *
 * @example
 * <PermissionBadge level="editor" />
 * <PermissionBadge level="owner" showIcon />
 */
export function PermissionBadge({
  level,
  variant = "default",
  showIcon = false,
}: PermissionBadgeProps) {
  // Every level on the ladder appears here. The map is typed against
  // `PermissionLevel` (utils/permissions/levels.ts — THE ONE declaration), so a
  // level added there fails this file rather than reaching a viewer as
  // `undefined.label` (`commenter` did exactly that until 2026-09-18).
  const config: Record<
    PermissionLevel | "owner",
    { label: string; className: string; icon: LucideIcon }
  > = {
    owner: {
      label: "Owner",
      className:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-300",
      icon: Crown,
    },
    admin: {
      label: "Admin",
      className:
        "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300",
      icon: Shield,
    },
    commenter: {
      label: "Commenter",
      className:
        "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border-purple-300",
      icon: MessageSquare,
    },
    editor: {
      label: "Editor",
      className:
        "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-300",
      icon: Users,
    },
    viewer: {
      label: "Viewer",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300",
      icon: Eye,
    },
  };

  const { label, className, icon: Icon } = config[level];

  if (variant === "compact") {
    return (
      <Badge className={`${className} text-xs px-2 py-0.5`}>
        {showIcon && <Icon className="w-3 h-3 mr-1" />}
        {label}
      </Badge>
    );
  }

  return (
    <Badge className={`${className} px-3 py-1`}>
      {showIcon && <Icon className="w-3.5 h-3.5 mr-1.5" />}
      {label}
    </Badge>
  );
}

/**
 * PublicBadge - Badge specifically for public resources
 */
export function PublicBadge({
  variant = "default",
}: {
  variant?: "default" | "compact";
}) {
  const className =
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300";

  if (variant === "compact") {
    return (
      <Badge className={`${className} text-xs px-2 py-0.5`}>
        <Globe className="w-3 h-3 mr-1" />
        Public
      </Badge>
    );
  }

  return (
    <Badge className={`${className} px-3 py-1`}>
      <Globe className="w-3.5 h-3.5 mr-1.5" />
      Public
    </Badge>
  );
}

/**
 * PermissionLevelDescription - Show what each level can do
 */
export function PermissionLevelDescription({
  level,
}: {
  level: PermissionLevel;
}) {
  // THE SCOPE-QUALIFIED ADMIN RULE (common-docs/systems/platform/access/DECISIONS.md,
  // 2026-09-10, CFL-360): the word "admin" never stands alone in an access surface — it carries
  // the noun of the thing it governs, so the item level is never read as the organization-admin
  // role. "Full access" was the retired label for this same level (AI Matrx Data Doctrine R19:
  // "Admin is the top level on a thing; there is no 'full.'").
  const descriptions: Record<PermissionLevel, string> = {
    viewer: "Can view",
    commenter: "Can view and comment",
    editor: "Can view and edit",
    admin: "Admin of this item (view, edit, share, delete)",
  };

  return (
    <span className="text-xs text-muted-foreground">{descriptions[level]}</span>
  );
}
