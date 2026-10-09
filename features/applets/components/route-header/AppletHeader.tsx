"use client";

import {
  AppWindow,
  AtSign,
  MessageSquare,
  CircleStop,
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
import { setAppletAudience, setAppletPublication } from "@/features/agents/redux/applets/thunks";
import { toast } from "@/lib/toast";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { copyReferenceFence } from "@/features/matrx-envelope/referenceClipboard";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { AppStatus } from "@/features/applets/types";
import { appletHeaderTransitions, appletState, type AppletTransitionTarget } from "@/features/applets/lib/applet-state";

const TRANSITION_ICONS: Record<AppletTransitionTarget, typeof Rocket> = {
  web: Rocket,
  organization: EyeOff,
  draft: CircleStop,
};

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
 * Run / Change with AI / Versions / Settings) + Copy reference + Publish. Desktop
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

  const modes: RouteNavItem[] = [
    { name: "Overview", href: `${basePath}/${appId}`, icon: AppWindow },
    { name: "Run", href: `${basePath}/${appId}/run`, icon: Play },
    // The /code page is where the Applet is CHANGED by talking to its builder (with its code one
    // click away) — named for what a person does there, never "Code" (live audit 2026-10-09, M5).
    { name: "Change with AI", href: `${basePath}/${appId}/code`, icon: MessageSquare },
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
    icon: AtSign,
    onPress: async () => {
      const copied = await copyReferenceFence(
        buildRecordReferenceFence({ type: "agent_app", id: appId, label: appName }),
      );
      if (copied) {
        toast.success("Reference copied to clipboard", { description: appName });
      }
    },
  });
  // Publication on the audience model (Draft → In use → on the web): taking it off the web leaves it in
  // use for her organization; only "Stop using" returns it to a draft. Each press is labelled and names
  // its consequence before it acts (audit M1; `appletHeaderTransitions`).
  for (const transition of appletHeaderTransitions(state, { name: appName, slug: app?.slug })) {
    actions.push({
      label: transition.label,
      icon: TRANSITION_ICONS[transition.target],
      primary: transition.primary,
      showLabel: !transition.primary,
      disabled: publicationBusy,
      onPress: async () => {
        const ok = await confirm(transition.confirm);
        if (!ok) return;
        setPublicationBusy(true);
        try {
          if (transition.target === "draft") {
            await dispatch(setAppletPublication({ appId, published: false })).unwrap();
          } else {
            await dispatch(setAppletAudience({ appId, audience: transition.target })).unwrap();
          }
          toast.success(transition.done);
        } catch (error) {
          toast.error(error instanceof Error ? `Not changed: ${error.message}` : "Not changed.");
        } finally {
          setPublicationBusy(false);
        }
      },
    });
  }

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
