"use client";

import React, { useState } from "react";
import {
  Building2,
  Users,
  Settings,
  Crown,
  Shield,
  User as UserIcon,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OrganizationWithRole } from "../types";
import { cn } from "@/lib/utils";
import { InlineMediaRef } from "@/features/files";

interface OrganizationCardProps {
  organization: OrganizationWithRole;
  onUpdate?: () => void;
}

/**
 * OrganizationCard - Card display for a single organization
 *
 * Features:
 * - Shows org name, description, member count
 * - Role badge (Owner/Admin/Member/Personal)
 * - Quick action buttons based on role
 * - Click to navigate to org settings
 * - Special styling for personal orgs
 */
export function OrganizationCard({
  organization,
  onUpdate,
}: OrganizationCardProps) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const isPersonal = organization.isPersonal;
  const role = organization.role;

  // Get role icon and color
  const getRoleDisplay = () => {
    if (isPersonal) {
      return {
        icon: <UserIcon className="h-3 w-3" />,
        label: "Personal",
        color:
          "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
      };
    }

    switch (role) {
      case "owner":
        return {
          icon: <Crown className="h-3 w-3" />,
          label: "Owner",
          color:
            "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
        };
      case "admin":
        return {
          icon: <Shield className="h-3 w-3" />,
          label: "Admin",
          color:
            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
        };
      case "member":
        return {
          icon: <UserIcon className="h-3 w-3" />,
          label: "Member",
          color:
            "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        };
      default:
        return {
          icon: <UserIcon className="h-3 w-3" />,
          label: "Member",
          color:
            "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        };
    }
  };

  const roleDisplay = getRoleDisplay();

  const settingsPath = `/organizations/${organization.id}/settings`;

  const handleNavigate = (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    setIsNavigating(true);
    router.push(settingsPath);
  };

  const handleViewSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleNavigate(e);
  };

  // Determine available actions based on role
  const canManageSettings = role === "owner" || role === "admin";
  const canManageMembers = role === "owner" || role === "admin";

  return (
    <Card
      className={cn(
        "p-5 transition-all duration-200 hover:shadow-md cursor-pointer group",
        isPersonal &&
          "border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10",
        isNavigating && "opacity-50 pointer-events-none",
      )}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) {
          window.open(settingsPath, "_blank");
          return;
        }
        handleNavigate();
      }}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left side - Org info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            {/* Icon */}
            <div
              className={cn(
                "flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center",
                isPersonal
                  ? "bg-purple-100 dark:bg-purple-900/50"
                  : "bg-blue-100 dark:bg-blue-900/50",
              )}
            >
              <InlineMediaRef
                ref={organization.logoUrl ?? null}
                size="fill"
                fit="cover"
                rounded="lg"
                fallbackIcon={
                  <Building2
                    className={cn(
                      "h-6 w-6",
                      isPersonal
                        ? "text-purple-600 dark:text-purple-400"
                        : "text-blue-600 dark:text-blue-400",
                    )}
                  />
                }
                alt={organization.name}
              />
            </div>

            {/* Name and Role */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {organization.name}
                </h3>
                <Badge
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    roleDisplay.color,
                  )}
                >
                  {roleDisplay.icon}
                  {roleDisplay.label}
                </Badge>
              </div>
              {organization.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {organization.description}
                </p>
              )}
            </div>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-3">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>
                {organization.memberCount === 1
                  ? "1 member"
                  : `${organization.memberCount || 0} members`}
              </span>
            </div>
            {organization.website && (
              <a
                href={organization.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Website</span>
              </a>
            )}
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex flex-col gap-2 items-end">
          {canManageSettings && !isPersonal && (
            <Link
              href={settingsPath}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate(e);
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </Link>
          )}

          {isPersonal && (
            <Link
              href={settingsPath}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate(e);
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/30"
              >
                View
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          )}

          {!canManageSettings && !isPersonal && (
            <Link
              href={settingsPath}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleNavigate(e);
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-600 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                View
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
