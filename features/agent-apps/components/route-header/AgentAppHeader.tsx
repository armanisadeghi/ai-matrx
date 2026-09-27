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
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
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
      // A publication change reaches strangers, so the click says what it
      // will do before it happens (the destructive-click rule).
      const publicUrl = app?.slug ? `aimatrx.com/p/${app.slug}` : "its public link";
      const ok = await confirm(
        isPublished
          ? {
              title: `Unpublish ${appName}?`,
              description: `${publicUrl} stops working for everyone who has it. You can publish it again later.`,
              confirmLabel: "Unpublish",
              variant: "destructive",
            }
          : {
              title: `Publish ${appName}?`,
              description: `Anyone with the link can open and run it at ${publicUrl}, without signing in.`,
              confirmLabel: "Publish",
            },
      );
      if (!ok) return;
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
        // One word on a desktop; on a phone the name needs the room, so the
        // state is a colored dot with the same words for assistive tech
        // (the chip used to clip to "Publis" and squeeze the name to "Fa…").
        <span
          aria-label={isPublished ? "Published" : "Unpublished"}
          title={isPublished ? "Published" : "Unpublished"}
          className={
            isPublished
              ? "inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-xs font-medium text-success"
              : "inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning"
          }
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current sm:hidden" />
          <span className="hidden sm:inline">
            {isPublished ? "Published" : "Unpublished"}
          </span>
        </span>
      }
      modes={modes}
      actions={actions}
      right={<AgentAppReferenceCopySlot appId={appId} appName={appName} />}
    />
  );
}
