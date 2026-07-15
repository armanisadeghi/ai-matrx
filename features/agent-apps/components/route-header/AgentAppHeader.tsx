"use client";

import {
  AppWindow,
  Code,
  History,
  Play,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  EntityModeHeader,
  type EntityHeaderAction,
} from "@/features/shell/components/header/templates/EntityModeHeader";
import type { RouteNavItem } from "@/features/shell/components/header/RouteModeNav";
import { AgentAppReferenceCopySlot } from "./AgentAppReferenceCopySlot";

export type AgentAppHeaderTab =
  | "overview"
  | "run"
  | "code"
  | "versions"
  | "settings";

interface AgentAppHeaderProps {
  appId: string;
  appName: string;
  active: AgentAppHeaderTab;
  /** Defaults to `/agent-apps`. Admin/org variants pass their own root. */
  basePath?: string;
  backHref?: string;
}

/**
 * Header shell for /agent-apps/[id] and its sub-routes.
 *
 * EntityModeHeader instance: back + entity name + RouteModeNav (Overview /
 * Run / Code / Versions / Settings) + the reference-copy action. Desktop
 * renders modes as a measurement-driven pill and the copy button as an
 * extra; mobile collapses everything into the back + name + "…" drawer.
 */
export function AgentAppHeader({
  appId,
  appName,
  active,
  basePath = "/agent-apps",
  backHref = "/agent-apps",
}: AgentAppHeaderProps) {
  const modes: RouteNavItem[] = [
    { name: "Overview", href: `${basePath}/${appId}`, icon: AppWindow },
    { name: "Run", href: `${basePath}/${appId}/run`, icon: Play },
    { name: "Code", href: `${basePath}/${appId}/code`, icon: Code },
    { name: "Versions", href: `${basePath}/${appId}/versions`, icon: History },
    {
      name: "Settings",
      href: `${basePath}/${appId}/settings`,
      icon: SettingsIcon,
    },
  ];
  void active; // active mode is resolved from pathname by RouteModeNav

  const actions: EntityHeaderAction[] = [];

  return (
    <EntityModeHeader
      backHref={backHref}
      entityLabel={appName}
      modes={modes}
      actions={actions}
      right={<AgentAppReferenceCopySlot appId={appId} appName={appName} />}
    />
  );
}
