"use client";

/**
 * CloudBrowserBody — the Cloud Browser surface WITHOUT any window chrome.
 *
 * This is the single source of the Cloud Browser UI. It renders bare (no
 * border, no background, no title bar) so a HOST FRAME supplies the chrome —
 * per CLAUDE.md "a host frame either IS the chrome or has none":
 *   - inside the Canvas pane (`CanvasBody` → `case "cloud_browser"`), where
 *     `CanvasPane` already draws the frame + header — the PRIMARY host now;
 *   - inside `CloudBrowserWindow`, which wraps this in a `WindowPanel` for the
 *     standalone/overlay opener that is kept working.
 *
 * Default face is WRITTEN PROGRESS (D-8). "Screenshots" opens the bounded
 * screenshot session. The takeover canvas appears ONLY while a person is
 * driving. The controller banner always names who is in control.
 */

import React, { useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { toast } from "@/lib/toast";
import { cn } from "@/utils/cn";
import { Globe, FileText, Camera, MonitorPlay, BellRing } from "lucide-react";

import { CLOUD_BROWSER_ASSIST_SURFACE } from "../constants";
import { useCloudBrowser } from "../hooks/useCloudBrowser";
import { useScreenshotSession } from "../hooks/useScreenshotSession";
import { mintStreamTicket } from "../service";
import type { StreamTicketEnvelope } from "../types";

import { WrittenProgressFace } from "./WrittenProgressFace";
import { ScreenshotFace } from "./ScreenshotFace";
import { TakeoverCanvas } from "./TakeoverCanvas";
import { ControllerBanner } from "./ControllerBanner";
import { ProfileSelector } from "./ProfileSelector";
import { TelemetrySurface } from "./TelemetrySurface";
import { NotificationConsent } from "./NotificationConsent";
import { AuditTimeline } from "./AuditTimeline";
import { HealthWarnings } from "./HealthWarnings";
import { AccountSettings } from "./AccountSettings";
import { ShareControl } from "./ShareControl";
import { DeletionFlow } from "./DeletionFlow";
import { Walkthrough } from "./Walkthrough";
import { LoginCapturePanel } from "./LoginCapturePanel";
import { AuthenticatorPanel } from "./AuthenticatorPanel";

type FaceTab = "written" | "screenshots" | "takeover";

export interface CloudBrowserBodyProps {
  initialProfileId?: string;
  className?: string;
}

/** The chrome-free Cloud Browser surface. The host (canvas pane or window)
 *  owns the frame + title. */
export function CloudBrowserBody({
  initialProfileId,
  className,
}: CloudBrowserBodyProps) {
  const cb = useCloudBrowser(initialProfileId);
  const shots = useScreenshotSession(cb.run?.id ?? null);

  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<StreamTicketEnvelope | null>(null);
  const [connecting, setConnecting] = useState(false);

  const controller = cb.controller;
  const isMeDriving = controller?.kind === "human" && controller.isMe;

  // The media face the primary pane shows.
  const face: FaceTab = isMeDriving
    ? "takeover"
    : shots.active
      ? "screenshots"
      : "written";

  const canShare = cb.activeProfile
    ? cb.activeProfile.accessLevel !== "viewer"
    : false;
  const canDelete = cb.activeProfile?.accessLevel === "admin";

  const openStream = useCallback(async () => {
    if (!cb.run) return;
    setConnecting(true);
    try {
      const t = await mintStreamTicket(cb.run.id, "control");
      setTicket(t);
    } finally {
      setConnecting(false);
    }
  }, [cb.run]);

  const onTake = useCallback(async () => {
    setBusy(true);
    try {
      await cb.takeControl();
      await openStream();
      toast.info("You are now driving this browser.");
    } finally {
      setBusy(false);
    }
  }, [cb, openStream]);

  const onReturn = useCallback(async () => {
    setBusy(true);
    try {
      await cb.returnControl();
      setTicket(null);
      toast.success("Control returned to the agent.");
    } finally {
      setBusy(false);
    }
  }, [cb]);

  const needsNotificationPrompt =
    !!cb.notificationConsent && cb.notificationConsent.acknowledgedAt === null;

  return (
    <div className={cn("flex h-full flex-col gap-2 p-2", className)}>
      {/* Header: profile + live page + assists */}
      <div className="flex flex-col gap-2">
        <ProfileSelector
          profiles={cb.profiles}
          activeProfileId={cb.activeProfileId}
          quota={cb.quota}
          onSelect={cb.selectProfile}
        />
        {cb.run?.currentUrl ? (
          <div className="flex items-center gap-1.5 truncate rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {cb.run.currentTitle ?? cb.run.currentUrl}
            </span>
          </div>
        ) : null}
        <AssistStrip surfaceName={CLOUD_BROWSER_ASSIST_SURFACE} />
      </div>

      {/* Front-and-centre notification consent at first use (D-14). */}
      {needsNotificationPrompt && cb.notificationConsent ? (
        <NotificationConsent
          variant="prompt"
          consent={cb.notificationConsent}
          onChange={cb.updateNotificationConsent}
          onAcknowledge={() =>
            void cb.updateNotificationConsent(cb.notificationConsent!)
          }
        />
      ) : null}

      {controller ? (
        <ControllerBanner
          controller={controller}
          onTake={onTake}
          onReturn={onReturn}
          onRequest={onTake}
          busy={busy}
        />
      ) : null}

      <Tabs defaultValue="live" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="live">
            <MonitorPlay className="mr-1.5 h-3.5 w-3.5" /> Live
          </TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="help">Help</TabsTrigger>
        </TabsList>

        {/* LIVE — the three media tiers */}
        <TabsContent value="live" className="min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col gap-2">
            {/* Face switcher — written vs screenshots (takeover is auto). */}
            {face !== "takeover" ? (
              <div className="flex items-center gap-1.5 text-xs">
                <Button
                  size="sm"
                  variant={face === "written" ? "default" : "outline"}
                  onClick={() => shots.stop()}
                >
                  <FileText className="mr-1 h-3.5 w-3.5" /> Written progress
                </Button>
                <Button
                  size="sm"
                  variant={face === "screenshots" ? "default" : "outline"}
                  onClick={() => (shots.active ? shots.stop() : shots.start())}
                  disabled={!cb.run}
                >
                  <Camera className="mr-1 h-3.5 w-3.5" /> Screenshots
                </Button>
              </div>
            ) : null}
            {isMeDriving &&
            cb.handoff?.reason === "mfa_required" &&
            cb.handoff.origin &&
            cb.run ? (
              <AuthenticatorPanel
                runId={cb.run.id}
                pageUrl={cb.handoff.origin}
              />
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
              {face === "takeover" && controller ? (
                <div className="h-full p-2">
                  <TakeoverCanvas
                    controller={controller}
                    ticket={ticket}
                    connecting={connecting}
                    onReconnect={openStream}
                  />
                </div>
              ) : face === "screenshots" ? (
                <ScreenshotFace
                  active={shots.active}
                  frames={shots.frames}
                  autoOffAt={shots.autoOffAt}
                  onStart={shots.start}
                  onStop={shots.stop}
                  onRearm={shots.rearm}
                  disabled={!cb.run}
                />
              ) : (
                <WrittenProgressFace events={cb.progress} />
              )}
            </div>

            {cb.handoff && cb.handoff.state === "requested" ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="flex-1">
                  <p className="text-foreground">{cb.handoff.message}</p>
                  <div className="mt-1.5">
                    <Button size="sm" onClick={onTake} disabled={busy}>
                      Step in and help
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            {isMeDriving &&
            cb.handoff?.reason === "credentials_missing" &&
            cb.handoff.origin &&
            cb.run ? (
              <LoginCapturePanel
                runId={cb.run.id}
                profileId={cb.run.profileId}
                pageUrl={cb.handoff.origin}
              />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent
          value="people"
          className="min-h-0 flex-1 overflow-auto p-1"
        >
          {cb.activeProfile ? (
            <ShareControl
              profileId={cb.activeProfile.id}
              profileName={cb.activeProfile.displayName}
              canShare={canShare}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="accounts"
          className="min-h-0 flex-1 overflow-auto p-1"
        >
          <HealthWarnings bindings={cb.bindings} />
        </TabsContent>

        <TabsContent value="usage" className="min-h-0 flex-1 overflow-auto">
          <TelemetrySurface
            telemetry={cb.telemetry}
            onRefresh={cb.refreshTelemetry}
          />
        </TabsContent>

        <TabsContent value="history" className="min-h-0 flex-1">
          <AuditTimeline events={cb.progress} />
        </TabsContent>

        <TabsContent
          value="settings"
          className="min-h-0 flex-1 overflow-auto p-1"
        >
          <div className="flex flex-col gap-4">
            {cb.consent ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">
                  What the agent may do on its own
                </h3>
                <AccountSettings
                  consent={cb.consent}
                  onChange={cb.updateConsent}
                />
              </section>
            ) : null}
            {cb.notificationConsent ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">
                  How we reach you
                </h3>
                <NotificationConsent
                  variant="inline"
                  consent={cb.notificationConsent}
                  onChange={cb.updateNotificationConsent}
                />
              </section>
            ) : null}
            {cb.activeProfile ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">
                  Delete
                </h3>
                <DeletionFlow
                  profileId={cb.activeProfile.id}
                  profileName={cb.activeProfile.displayName}
                  canDelete={canDelete}
                />
              </section>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="help" className="min-h-0 flex-1">
          <Walkthrough />
        </TabsContent>
      </Tabs>

      {cb.error ? (
        <p
          className={cn(
            "rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400",
          )}
        >
          {cb.error}
        </p>
      ) : null}
    </div>
  );
}

export default CloudBrowserBody;
