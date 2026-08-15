"use client";

import {
  AppWindow,
  Code,
  EyeOff,
  History,
  Play,
  Rocket,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  EntityModeHeader,
  type EntityHeaderAction,
} from "@/features/shell/components/header/templates/EntityModeHeader";
import type { RouteNavItem } from "@/features/shell/components/header/RouteModeNav";
import { AgentAppReferenceCopySlot } from "./AgentAppReferenceCopySlot";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAppById } from "@/features/agents/redux/agent-apps/selectors";
import { setAgentAppPublication } from "@/features/agents/redux/agent-apps/thunks";
import { useOpenAgentRunHistoryWindow } from "@/features/overlays/openers/agentRunHistoryWindow";
import { toast } from "@/lib/toast-service";
import type { AppStatus, AppVisibility } from "@/features/agent-apps/types";

export type AgentAppHeaderTab =
  "overview" | "run" | "code" | "versions" | "settings";

interface AgentAppHeaderProps {
  appId: string;
  appName: string;
  agentId: string;
  initialStatus: AppStatus;
  initialVisibility: AppVisibility;
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
  agentId,
  initialStatus,
  initialVisibility,
  active,
  basePath = "/agent-apps",
  backHref = "/agent-apps",
}: AgentAppHeaderProps) {
  const dispatch = useAppDispatch();
  const app = useAppSelector((state) => selectAppById(state, appId));
  const openRunHistory = useOpenAgentRunHistoryWindow();
  const [publicationBusy, setPublicationBusy] = useState(false);

  const status = app?.status ?? initialStatus;
  const visibility = app?.visibility ?? initialVisibility;
  const isPublished = status === "published" && visibility === "public";

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
  const actions: EntityHeaderAction[] = [];
  if (active === "run") {
    actions.push({
      label: "Run history",
      icon: History,
      onPress: () => openRunHistory({ agentId }),
    });
  }
  actions.push({
    label: isPublished ? "Unpublish" : "Publish",
    icon: isPublished ? EyeOff : Rocket,
    primary: !isPublished,
    disabled: publicationBusy,
    onPress: async () => {
      setPublicationBusy(true);
      try {
        await dispatch(
          setAgentAppPublication({ appId, published: !isPublished }),
        ).unwrap();
        toast.success(isPublished ? "App unpublished." : "App published.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `Publication failed: ${error.message}`
            : "Publication failed.",
        );
      } finally {
        setPublicationBusy(false);
      }
    },
  });

  return (
    <EntityModeHeader
      backHref={backHref}
      entityLabel={appName}
      entityStatus={
        <span
          className={
            isPublished
              ? "rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success"
              : "rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
          }
        >
          {isPublished ? "Published" : "Unpublished"}
        </span>
      }
      modes={modes}
      actions={actions}
      right={<AgentAppReferenceCopySlot appId={appId} appName={appName} />}
    />
  );
}
