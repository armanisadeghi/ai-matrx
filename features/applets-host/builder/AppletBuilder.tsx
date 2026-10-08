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

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { readAppletCatalogue } from "@ai-matrx/applets/catalogue";
import type { HeldWrite } from "@ai-matrx/applets/preview";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { useHeadlessAgentJson } from "@ai-matrx/chat/agents/hooks/useHeadlessAgentJson";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { Badge, Button, EmptyState } from "@ai-matrx/design-system/controls";
import { AppWindow, ExternalLink, Table2, Wrench } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { ProTextarea } from "@/components/official/ProTextarea";
import { APPLETS_SURFACE_NAME, createAppletsScope } from "@/features/surfaces/manifests/applets.manifest";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useOpenLiveRunWindow, type LiveRunWindowHandle } from "@/features/overlays/openers/liveRunWindow";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { tableHref } from "@/features/records-tool-display/readRecordsAnswer";
import { useSourceTableNames } from "@/features/applets/hooks/useSourceTableNames";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { appletState, appletVersionLabel, publishConsequence } from "@/features/applets/lib/applet-state";
import {
  BuildRefused,
  checkBuildAnswer,
  coerceBuildAnswer,
  publishApplet,
  readBuilderApplet,
  saveBuiltApplet,
  SAVED_APPLET_COLUMNS,
  boundTableIds,
  tablesToMake,
  type BuildAnswer,
  type BuilderApplet,
  type BuilderSource,
  type SavedApplet,
} from "./build-applet";
import { readBuildRecord, type BuildEntry } from "./build-session";
import { useAppletBuildSession } from "./useAppletBuildSession";
import { BuildHistory } from "./BuildHistory";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

// Declared in aidream (client_mandates.py, applets.build / applets.fix); allowlisted in
// scripts/mandate-keys-allowlist.json until @ai-matrx/agents publishes MANDATE_KEYS.applets__build.
const BUILD = storedMandateKey("applets.build");
const FIX = storedMandateKey("applets.fix");
const DISCLOSURE = [
  { mandateKey: BUILD, does: "builds your Applet from your sentence" },
  { mandateKey: FIX, does: "fixes an error in your Applet" },
] as const;

type Phase = { kind: "idle" } | { kind: "building" } | { kind: "publishing" } | { kind: "failed"; why: string };

/** The saved draft as the card shows it: the tables "Use it" will make, then the tables it made. */
type SavedCard = SavedApplet & {
  note: string;
  toMake: ReturnType<typeof tablesToMake>;
  /** Her existing tables it reads, by id (named in words on the card). */
  bound: string[];
  made: { name: string; table_id: string }[];
};

type Fix = { where: string; message: string };

export function AppletBuilder({ appletId: initialId, routed = false }: { appletId: string | null; routed?: boolean }) {
  // org-filter: write-target the Applet is saved in the organization new things go to; reads are her own
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const writer = useHeadlessAgentJson();
  const openRunWindow = useOpenLiveRunWindow();
  useDeclaredSurfaceMandates(DISCLOSURE);

  const [sentence, setSentence] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const userId = useAppSelector(selectUserId);
  const [saved, setSaved] = useState<SavedCard | null>(null);
  const [appletId, setAppletId] = useState<string | null>(initialId);
  const [held, setHeld] = useState(0);
  const [lastError, setLastError] = useState<Fix | null>(null);
  // An answer refused before saving: "Fix it" hands it back with the reason, so nothing is lost.
  const [refused, setRefused] = useState<BuilderApplet | null>(null);
  const rejoinWindow = useRef<LiveRunWindowHandle | null>(null);
  // The record a request belongs to, readable inside the automatic fix round (state lags a render).
  const appletIdRef = useRef<string | null>(initialId);
  // What the build is doing right now — the preview never sits on a bare placeholder while it works.
  const [step, setStep] = useState<{ label: string; since: number } | null>(null);

  // The build's record (the draft Applet + its request history) — the truth a refresh reopens.
  const session = useAppletBuildSession({
    appletId: initialId,
    routed,
    onRejoin: (entry) => {
      setPhase({ kind: "building" });
      setStep({ label: entry.fix ? "Fixing your Applet" : "Writing your Applet", since: Date.parse(entry.started_at) || Date.now() });
      rejoinWindow.current = openRunWindow({ conversationId: entry.conversation_id, label: entry.fix ? "Fixing your Applet" : "Building your Applet" });
    },
    onReopenedAnswer: async ({ entry, value }) => {
      const id = initialId;
      if (!id) return;
      const client = createClient();
      try {
        const record = await readBuildRecord(client, id);
        const current = record.hasContent ? await readBuilderApplet(client, id) : null;
        const org = current?.organizationId ?? record.organizationId;
        const catalogue = await readAppletCatalogue(client, { organizationId: org, request: entry.text });
        const answer = checkBuildAnswer(value, coerceBuildAnswer(value), { organizationId: org, tables: catalogue.tables });
        await finish(id, entry, answer, current?.applet ?? null, org);
      } catch (err) {
        await failed(id, entry, err);
      }
    },
  });

  // The rejoined run has ended (saved, refused or failed): the live window stops waiting.
  const rejoining = session.rejoining;
  useEffect(() => {
    if (rejoining || !rejoinWindow.current) return;
    rejoinWindow.current.update({ pending: false });
    rejoinWindow.current = null;
    setStep(null);
    setPhase((p) => (p.kind === "building" ? { kind: "idle" } : p));
  }, [rejoining]);

  // The saved app as the card and the preview show it (null while a new build has no app yet).
  const loadSaved = async (id: string, note: string) => {
    const { data, error } = await createClient().schema("app").from("definition").select(`${SAVED_APPLET_COLUMNS}, sources, entry`).eq("id", id).maybeSingle();
    if (error || !data) {
      setPhase({ kind: "failed", why: error?.message ?? "That app is not there, or it has not been shared with you." });
      return;
    }
    const { sources, entry, ...row } = data;
    if (!entry) return;
    const list = (Array.isArray(sources) ? sources : []) as unknown as BuilderSource[];
    setSaved({ ...row, note, toMake: tablesToMake({ sources: list }), bound: boundTableIds({ sources: list }), made: [] });
  };

  // Reopening a build (or changing an existing Applet): its saved version, and how its last request ended.
  const shown = useRef<string | null>(null);
  const showOutcome = useEffectEvent((key: string) => {
    const record = session.record;
    if (!initialId || !record || shown.current === key) return;
    shown.current = key;
    const latest = record.requests.at(-1);
    const lastNote = [...record.requests].reverse().find((r) => r.state === "saved")?.note ?? "";
    void loadSaved(initialId, lastNote);
    if (latest?.state === "refused" && latest.refused_applet) {
      setRefused(latest.refused_applet);
      setLastError({ where: "record", message: latest.error ?? "Not saved." });
    } else if (latest?.state === "failed") {
      setPhase({ kind: "failed", why: latest.error ?? "The builder stopped." });
      // Never lose what she typed: a request that failed comes back into the box.
      if (!latest.fix) setSentence((s) => s || latest.text);
    }
  });
  const latest = session.record?.requests.at(-1) ?? null;
  const outcomeKey = session.record ? `${session.record.id}|${latest ? `${latest.id}:${latest.state}` : "none"}` : null;
  useEffect(() => {
    if (outcomeKey) showOutcome(outcomeKey);
  }, [outcomeKey]);

  /** Save an answer exactly once (the claim), then show it. Shared by a live run and a rejoined one. */
  const finish = async (id: string, entry: BuildEntry, answer: BuildAnswer, current: BuilderApplet | null, org: string) => {
    const client = createClient();
    if (!(await session.claim(id, entry.id))) {
      // Another tab saved this answer first: show what it saved.
      await session.refresh(id);
      return;
    }
    const result = await saveBuiltApplet(client, { organizationId: org, appletId: id, current, answer, request: entry.text, conversationId: entry.conversation_id });
    await session.settle(id, entry.id, { state: "saved", version: result.content_version, note: answer.note });
    shown.current = `${id}|${entry.id}:saved`;
    setSaved({ ...result, note: answer.note, toMake: tablesToMake(answer.applet), bound: boundTableIds(answer.applet), made: [] });
    setHeld(0);
    setLastError(null);
    setRefused(null);
    setPhase({ kind: "idle" });
  };

  /** How a request ended without a save — written to its history, and said on screen. */
  const failed = async (id: string, entry: BuildEntry, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    shown.current = `${id}|${entry.id}:${err instanceof BuildRefused ? "refused" : "failed"}`;
    if (err instanceof BuildRefused) {
      setRefused(err.applet);
      setLastError({ where: "record", message: err.message });
    }
    setPhase({ kind: "failed", why: message });
    await session
      .settle(id, entry.id, err instanceof BuildRefused ? { state: "refused", error: message, refused_applet: err.applet } : { state: "failed", error: message })
      .catch((writeErr) => console.error("[applet-build] could not record how the request ended", writeErr));
  };

  /**
   * One request. A NEW build or change whose answer the checks refuse gets ONE automatic fix round
   * (`applets.fix` with the refused answer and the reason) before anything is shown — she asked for an
   * app, not a list of what is wrong with it. A refused fix round is shown with "Fix it", as before.
   */
  const run = async (request: string, fix: Fix | null, retry: { refusedApplet: BuilderApplet } | null = null) => {
    setPhase({ kind: "building" });
    setStep({ label: retry ? "Fixing what the check found" : "Saving your request", since: Date.now() });
    const client = createClient();
    const live: { handle: LiveRunWindowHandle | null } = { handle: null };
    let started: { id: string; entry: BuildEntry } | null = null;
    try {
      // A new app needs an organization: with none set, the picker asks and THIS build continues with the pick.
      const org = appletId || retry ? null : (organizationId ?? (await ensureOrgId(null)));
      // The request is written BEFORE anything runs — a new app is born here and the address becomes its own.
      const { record, entry } = await session.begin({ appletId: retry ? appletIdRef.current : appletId, organizationId: org ?? "", text: request, fix });
      started = { id: record.id, entry };
      setAppletId(record.id);
      setSentence("");
      appletIdRef.current = record.id;
      setStep({ label: "Reading your tables", since: Date.now() });
      const current = record.hasContent ? await readBuilderApplet(client, record.id) : null;
      const runOrg = current?.organizationId ?? record.organizationId;
      const catalogue = await readAppletCatalogue(client, { organizationId: runOrg, request });
      setStep({ label: "Starting the builder", since: Date.now() });
      let attached: Promise<void> = Promise.resolve();
      const answer = await writer.run<BuildAnswer>({
        mandateKey: fix ? FIX : BUILD,
        surfaceKey: "applets:build",
        sourceFeature: "agent-app",
        expect: "json",
        initiation: "user",
        organizationId: runOrg,
        variables: {
          request,
          applet: fix && (retry?.refusedApplet ?? refused) ? JSON.stringify(retry?.refusedApplet ?? refused) : current ? JSON.stringify(current.applet) : "",
          catalogue: JSON.stringify(catalogue),
          last_check: fix ? JSON.stringify({ file: fix.where, message: fix.message }) : "",
        },
        onConversationCreated: (cid) => {
          entry.conversation_id = cid;
          attached = session.running(record.id, entry.id, cid).catch((err) => console.error("[applet-build] could not record the run", err));
          live.handle = openRunWindow({ conversationId: cid, label: fix ? "Fixing your Applet" : appletId ? "Changing your Applet" : "Building your Applet" });
          setStep({ label: fix ? "Fixing your Applet" : "Writing your Applet", since: Date.now() });
        },
        coerce: (v) => checkBuildAnswer(v, coerceBuildAnswer(v), { organizationId: runOrg, tables: catalogue.tables }),
      });
      await attached;
      await finish(record.id, entry, answer, current?.applet ?? null, runOrg);
    } catch (err) {
      if (started) await failed(started.id, started.entry, err);
      else setPhase({ kind: "failed", why: err instanceof Error ? err.message : String(err) });
      if (started && err instanceof BuildRefused && !fix && !retry) {
        live.handle?.update({ pending: false });
        live.handle = null;
        await run("Fix this error", { where: "record", message: err.message }, { refusedApplet: err.applet });
        return;
      }
    } finally {
      live.handle?.update({ pending: false });
      setStep(null);
    }
  };

  const publishAndUse = async () => {
    if (!saved || !userId) return;
    // "Use it" publishes AND creates tables: the click names both before it does either.
    const ok = await confirm({ ...publishConsequence({ name: saved.name, slug: saved.slug, tablesToMake: saved.toMake.map((t) => t.name) }), confirmLabel: "Publish" });
    if (!ok) return;
    setPhase({ kind: "publishing" });
    try {
      const { made } = await publishApplet(createClient(), saved.id, userId);
      // The record now reads the made tables by id (a new content version): the preview remounts on it.
      const { data } = await createClient().schema("app").from("definition").select(SAVED_APPLET_COLUMNS).eq("id", saved.id).maybeSingle();
      setSaved({ ...saved, ...(data ?? { status: "published", published_to_web: true }), toMake: [], made });
      setPhase({ kind: "idle" });
    } catch (err) {
      setPhase({ kind: "failed", why: err instanceof Error ? err.message : String(err) });
    }
  };

  const busy = phase.kind === "building" || phase.kind === "publishing" || session.rejoining;
  const boundNames = useSourceTableNames(saved?.bound ?? []);
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(320px,2fr)_5fr]">
      <div className="flex min-h-0 flex-col gap-3">
        <ProTextarea
          aria-label="What you want"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder={appletId ? "Add a tab for this week's schedule" : "A page where I see my clients and approve their posts"}
          rows={4}
          autoGrow
          minHeight={96}
          maxHeight={320}
          surfaceName={APPLETS_SURFACE_NAME}
          getApplicationScope={() =>
            createAppletsScope({
              ...(appletId ? { app_id: appletId } : {}),
              ...(saved ? { app_slug: saved.slug, app_status: appletState(saved).kind, app_version: saved.content_version } : {}),
            })
          }
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
        {phase.kind === "failed" ? <p className="text-sm text-destructive">{phase.why}</p> : null}
        <BuildHistory requests={session.record?.requests ?? []} />
        {lastError ? <p className="text-sm text-destructive" data-applet-error="">{lastError.message}</p> : null}
        {saved ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">/applets/{saved.slug}</span>
              {appletVersionLabel(saved.content_version) ? <Badge>{appletVersionLabel(saved.content_version)}</Badge> : null}
              <Badge tone={appletState(saved).tone}>{appletState(saved).label}</Badge>
            </div>
            {saved.note ? <p className="text-muted-foreground">{saved.note}</p> : null}
            {saved.bound.length ? (
              <div className="flex flex-wrap items-center gap-2 text-xs" data-applet-bound-tables="">
                {saved.bound.map((id) => (
                  <Link key={id} href={tableHref(id)} target="_blank" className="inline-flex min-w-0 items-center gap-1 text-primary">
                    <Table2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {boundNames[id]?.name ?? "Table"}
                      {boundNames[id]?.organizationName ? ` · ${boundNames[id]?.organizationName}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
            {saved.toMake.length ? (
              <div className="flex flex-col gap-1" data-applet-new-tables="">
                <span className="text-xs font-medium">Using it creates {saved.toMake.length === 1 ? "1 table" : `${saved.toMake.length} tables`}</span>
                {saved.toMake.map((t) => (
                  <div key={t.alias} className="flex min-w-0 items-center gap-2 text-xs">
                    <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 font-medium">{t.name}</span>
                    <span className="truncate text-muted-foreground" title={t.fields.join(", ")}>
                      {t.fields.join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {saved.made.length ? (
              <div className="flex flex-wrap items-center gap-2 text-xs" data-applet-made-tables="">
                {saved.made.map((t) => (
                  <Link key={t.table_id} href={tableHref(t.table_id)} target="_blank" className="inline-flex items-center gap-1 text-primary">
                    <Table2 className="h-3.5 w-3.5" /> {t.name}
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {appletState(saved).kind === "draft" ? (
                <Button variant="primary" disabled={busy || !userId} onClick={() => void publishAndUse()}>
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
              <span>
                {[appletState(saved).label, appletVersionLabel(saved.content_version)].filter(Boolean).join(" ")} · preview changes are not saved
              </span>
              {held ? <Badge tone="warning">{held} not saved</Badge> : null}
              {step ? <BuildStep step={step} inline /> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AppletHostMount
                key={`${appletId}:${saved.content_version}`}
                appletId={appletId}
                slug={saved.slug}
                preview={{
                  onHeld: (writes: HeldWrite[]) => setHeld(writes.length),
                  onError: (e) => setLastError(e),
                }}
              />
            </div>
          </>
        ) : step ? (
          <BuildStep step={step} />
        ) : (
          <EmptyState icon={<AppWindow />} title="Your Applet shows here" line="Say what you want, then Build." />
        )}
      </div>
    </div>
  );
}

/**
 * What the build is doing, with how long it has been at it — never a bare placeholder while the builder
 * works (the live window opens only once the run exists; reading her tables and starting the run took
 * ~45 s with nothing said, 2026-10-08).
 */
function BuildStep({ step, inline = false }: { step: { label: string; since: number }; inline?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.round((now - step.since) / 1000));
  if (inline) return <Badge tone="info" data-applet-build-step="">{`${step.label} · ${seconds}s`}</Badge>;
  return (
    <div className="flex h-full min-h-0 items-center justify-center" data-applet-build-step="" aria-live="polite">
      <EmptyState icon={<AppWindow />} title={step.label} line={`${seconds}s so far`} />
    </div>
  );
}
