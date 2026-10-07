"use client";

// features/applets-host/builder/AppletBuilder.tsx — "describe what you want → an Applet" (AP-0 lane D, G5).
//
// One sentence in; a working multi-page Applet on HER tables out. Champions: Lovable (sentence → running
// app, chat edits, "try to fix"), Bolt (instant preview). We beat them on her data being there already and
// on a preview that reads her real rows while holding every write back.
//
//   left  — the sentence box ("Build" for a new app, "Change it" for this one), the builder's one-line note,
//           and Fix it when the preview reported an error;
//   right — the preview: the saved version mounted through the real host with HELD writes; "Use it"
//           publishes it at /applets/<slug>.
// While the builder works its run streams in the floating LiveRunWindow (never a spinner).

import { useEffect, useState } from "react";
import Link from "next/link";
import { readAppletCatalogue } from "@ai-matrx/applets/catalogue";
import type { HeldWrite } from "@ai-matrx/applets/preview";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { useHeadlessAgentJson } from "@ai-matrx/chat/agents/hooks/useHeadlessAgentJson";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { Badge, Button, EmptyState, Textarea } from "@ai-matrx/design-system/controls";
import { AppWindow, ExternalLink, Wrench } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOpenLiveRunWindow, type LiveRunWindowHandle } from "@/features/overlays/openers/liveRunWindow";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import { BuildRefused, checkBuildAnswer, coerceBuildAnswer, publishApplet, readBuilderApplet, saveBuiltApplet, type BuildAnswer, type BuilderApplet, type SavedApplet } from "./build-applet";

// Declared in aidream (client_mandates.py, applets.build / applets.fix); allowlisted in
// scripts/mandate-keys-allowlist.json until @ai-matrx/agents publishes MANDATE_KEYS.applets__build.
const BUILD = storedMandateKey("applets.build");
const FIX = storedMandateKey("applets.fix");
const DISCLOSURE = [
  { mandateKey: BUILD, does: "builds your app from your sentence" },
  { mandateKey: FIX, does: "fixes an error in your app" },
] as const;

type Phase = { kind: "idle" } | { kind: "building" } | { kind: "failed"; why: string };

export function AppletBuilder({ appletId: initialId }: { appletId: string | null }) {
  // org-filter: write-target the Applet is saved in the organization new things go to; reads are her own
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const writer = useHeadlessAgentJson();
  const openRunWindow = useOpenLiveRunWindow();
  useDeclaredSurfaceMandates(DISCLOSURE);

  const [sentence, setSentence] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [saved, setSaved] = useState<(SavedApplet & { note: string }) | null>(null);
  const [appletId, setAppletId] = useState<string | null>(initialId);
  const [held, setHeld] = useState(0);
  const [lastError, setLastError] = useState<{ where: string; message: string } | null>(null);
  // An answer refused before saving: "Fix it" hands it back with the reason, so nothing is lost.
  const [refused, setRefused] = useState<BuilderApplet | null>(null);
  const [askOrganization, setAskOrganization] = useState(false);

  // Changing an existing Applet: show its current version in the preview first.
  useEffect(() => {
    if (!initialId) return;
    let cancelled = false;
    void createClient()
      .schema("app")
      .from("definition")
      .select("id, slug, version, status")
      .eq("id", initialId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setPhase({ kind: "failed", why: error?.message ?? "That app is not there, or it has not been shared with you." });
        else setSaved({ ...data, note: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [initialId]);

  const run = async (request: string, fix: { where: string; message: string } | null) => {
    if (!organizationId) {
      setAskOrganization(true);
      return;
    }
    setAskOrganization(false);
    setPhase({ kind: "building" });
    const client = createClient();
    const live: { handle: LiveRunWindowHandle | null } = { handle: null };
    let conversationId: string | null = null;
    try {
      const current = appletId ? await readBuilderApplet(client, appletId) : null;
      const catalogue = await readAppletCatalogue(client, { organizationId: current?.organizationId ?? organizationId, request });
      const answer = await writer.run<BuildAnswer>({
        mandateKey: fix ? FIX : BUILD,
        surfaceKey: "applets:build",
        sourceFeature: "applet",
        expect: "json",
        initiation: "user",
        organizationId: current?.organizationId ?? organizationId,
        variables: {
          request,
          applet: fix && refused ? JSON.stringify(refused) : current ? JSON.stringify(current.applet) : "",
          catalogue: JSON.stringify(catalogue),
          last_check: fix ? JSON.stringify({ file: fix.where, message: fix.message }) : "",
        },
        onConversationCreated: (cid) => {
          conversationId = cid;
          live.handle = openRunWindow({ conversationId: cid, label: fix ? "Fixing your app" : appletId ? "Changing your app" : "Building your app" });
        },
        coerce: (v) => checkBuildAnswer(v, coerceBuildAnswer(v)),
      });
      const result = await saveBuiltApplet(client, {
        organizationId: current?.organizationId ?? organizationId,
        appletId,
        current: current?.applet ?? null,
        answer,
        request,
        conversationId,
      });
      setAppletId(result.id);
      setSaved({ ...result, note: answer.note });
      setHeld(0);
      setLastError(null);
      setRefused(null);
      setSentence("");
      setPhase({ kind: "idle" });
    } catch (err) {
      if (err instanceof BuildRefused) {
        setRefused(err.applet);
        setLastError({ where: "record", message: err.message });
      }
      setPhase({ kind: "failed", why: err instanceof Error ? err.message : String(err) });
    } finally {
      live.handle?.update({ pending: false });
    }
  };

  const useIt = async () => {
    if (!saved) return;
    try {
      await publishApplet(createClient(), saved.id);
      setSaved({ ...saved, status: "published" });
    } catch (err) {
      setPhase({ kind: "failed", why: err instanceof Error ? err.message : String(err) });
    }
  };

  const busy = phase.kind === "building";
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(320px,2fr)_5fr]">
      <div className="flex min-h-0 flex-col gap-3">
        <Textarea
          aria-label="What you want"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder={appletId ? "Add a tab for this week's schedule" : "A page where I see my clients and approve their posts"}
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={busy || !sentence.trim()} onClick={() => void run(sentence.trim(), null)}>
            {appletId ? "Change it" : "Build"}
          </Button>
          {lastError ? (
            <Button variant="outline" disabled={busy} onClick={() => void run("Fix this error", lastError)}>
              <Wrench className="h-4 w-4" /> Fix it
            </Button>
          ) : null}
        </div>
        {askOrganization ? (
          <OrganizationContextNotice
            state={active.organizationState === "ready" ? "required" : active.organizationState}
            what="Your app"
            description="New apps are saved in the organization you choose"
            compact
          />
        ) : null}
        {phase.kind === "failed" ? <p className="text-sm text-destructive">{phase.why}</p> : null}
        {lastError ? <p className="text-sm text-destructive" data-applet-error="">{lastError.message}</p> : null}
        {saved ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">/apps/{saved.slug}</span>
              <Badge tone={saved.status === "published" ? "success" : "neutral"}>v{saved.version}</Badge>
              {saved.status === "published" ? <Badge tone="success">Live</Badge> : null}
            </div>
            {saved.note ? <p className="text-muted-foreground">{saved.note}</p> : null}
            <div className="flex flex-wrap gap-2">
              {saved.status !== "published" ? (
                <Button variant="primary" onClick={() => void useIt()}>
                  Use it
                </Button>
              ) : null}
              <Link href={`/applets/${saved.slug}`} target="_blank" className="inline-flex items-center gap-1 text-primary">
                <ExternalLink className="h-4 w-4" /> Open
              </Link>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
        {appletId && saved ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              <span>Preview — changes are not saved</span>
              {held ? <Badge tone="warning">{held} held</Badge> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AppletHostMount
                key={`${appletId}:${saved.version}`}
                appletId={appletId}
                slug={saved.slug}
                preview={{
                  onHeld: (writes: HeldWrite[]) => setHeld(writes.length),
                  onError: (e) => setLastError(e),
                }}
              />
            </div>
          </>
        ) : (
          <EmptyState icon={<AppWindow />} title="Your app shows here" line="Say what you want, then Build." />
        )}
      </div>
    </div>
  );
}
