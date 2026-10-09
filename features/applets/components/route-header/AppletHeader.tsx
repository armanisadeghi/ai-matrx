"use client";

import {
  AppWindow,
  Bookmark,
  Code,
  EyeOff,
  History,
  Play,
  Rocket,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  RecordPageHeader,
  type RecordPageAction,
} from "@/features/shell/components/header/templates/RecordPageHeader";
import type { RouteNavItem } from "@/features/shell/components/header/RouteModeNav";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAppById } from "@/features/agents/redux/applets/selectors";
import { setAppletPublication } from "@/features/agents/redux/applets/thunks";
import { toast } from "@/lib/toast";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { copyReferenceFence } from "@/features/matrx-envelope/referenceClipboard";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { AppStatus } from "@/features/applets/types";
import { appletState, publishConsequence } from "@/features/applets/lib/applet-state";

export type AppletHeaderTab =
  "overview" | "run" | "code" | "versions" | "settings";

interface AppletHeaderProps {
  appId: string;
  appName: string;
  initialStatus: AppStatus;
  initialPublishedToWeb: boolean;
  active: AppletHeaderTab;
  /** Defaults to `/applets/manage` (the owner pages). Admin/org variants pass their own root. */
  basePath?: string;
  backHref?: string;
}

/**
 * Header shell for /applets/manage/[id] and its sub-routes.
 *
 * The RecordPageHeader template (one line): back + "Applets" + the Applet
 * + its status + RouteModeNav (Overview /
 * Run / Code / Versions / Settings) + Copy reference + Publish. Desktop
 * renders modes as a measurement-driven pill; mobile collapses everything
 * into the back + name + "…" drawer.
 */
export function AppletHeader({
  appId,
  appName,
  initialStatus,
  initialPublishedToWeb,
  active,
  basePath = "/applets/manage",
  backHref = "/applets",
}: AppletHeaderProps) {
  const dispatch = useAppDispatch();
  const app = useAppSelector((state) => selectAppById(state, appId));
  const [publicationBusy, setPublicationBusy] = useState(false);

  // THE state (`appletState`) — the same answer the /applets list and the builder give for this row.
  const state = appletState({
    status: app?.status ?? initialStatus,
    published_to_web: app?.published_to_web ?? initialPublishedToWeb,
  });
  const isPublished = state.live;

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
  const actions: RecordPageAction[] = [];
  actions.push({
    label: "Copy reference",
    icon: Bookmark,
    onPress: async () => {
      const copied = await copyReferenceFence(
        buildRecordReferenceFence({ type: "agent_app", id: appId, label: appName }),
      );
      if (copied) {
        toast.success("Reference copied to clipboard", { description: appName });
      }
    },
  });
  actions.push({
    label: isPublished ? "Unpublish" : "Publish",
    icon: isPublished ? EyeOff : Rocket,
    primary: !isPublished,
    disabled: publicationBusy,
    onPress: async () => {
      // A publication change reaches strangers, so the click says what it
      // will do before it happens (the destructive-click rule).
      const publicUrl = app?.slug ? `aimatrx.com/applets/${app.slug}` : "its public link";
      const ok = await confirm(
        isPublished
          ? {
              title: `Unpublish ${appName}?`,
              description: `${publicUrl} stops working for everyone who has it. You can publish it again later.`,
              confirmLabel: "Unpublish",
              variant: "destructive",
            }
          : { ...publishConsequence({ name: appName, slug: app?.slug }), confirmLabel: "Publish" },
      );
      if (!ok) return;
      setPublicationBusy(true);
      try {
        await dispatch(
          setAppletPublication({ appId, published: !isPublished }),
        ).unwrap();
        toast.success(isPublished ? "Applet unpublished." : "Applet published.");
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
    <RecordPageHeader
      backHref={backHref}
      parents={[{ label: "Applets", href: backHref }]}
      record={{ name: appName }}
      status={{ label: state.label, tone: state.tone }}
      modes={modes}
      actions={actions}
    />
  );
}
