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

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { readAppletCatalogue } from "@ai-matrx/applets/catalogue";
import type { HeldWrite } from "@ai-matrx/applets/preview";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { useHeadlessAgentJson } from "@ai-matrx/chat/agents/hooks/useHeadlessAgentJson";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { Badge, Button, EmptyState, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { AppWindow, Copy, ExternalLink, Loader2, Table2, Wrench } from "lucide-react";
import { copyText } from "@ai-matrx/kit/clipboard";
import { formatDurationMs } from "@ai-matrx/kit/format";

import { createClient } from "@/utils/supabase/client";
import { ProTextarea } from "@/components/official/ProTextarea";
import { APPLETS_SURFACE_NAME, createAppletsScope } from "@/features/surfaces/manifests/applets.manifest";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useOpenLiveRunWindow, type LiveRunWindowHandle } from "@/features/overlays/openers/liveRunWindow";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { tableHref } from "@/features/records-tool-display/readRecordsAnswer";
import { useSourceTableNames } from "@/features/applets/hooks/useSourceTableNames";
import { APPLET_AUDIENCE_LABELS, appletAudience, appletState, appletVersionLabel, type AppletAudience } from "@/features/applets/lib/applet-state";
import { continueAgentJson } from "@ai-matrx/chat/agents/redux/execution-system/thunks/continue-agent-json";
import { loadConversation } from "@ai-matrx/chat/agents/redux/execution-system/thunks/load-conversation.thunk";
import { AgentConversationDisplay } from "@ai-matrx/chat/agents/components/messages-display/AgentConversationDisplay";
import {
  BuildRefused,
  coerceBuildAnswer,
  publishApplet,
  publishBlockedBy,
  repairs,
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
import { appletLink, buildConversationId, buildingStep, fixHostTurn, doneLine, fixLabel, fixNarration, heldHint, previewLine, readBuildRecord, reopenOutcome, type BuildEntry, type BuildRecord } from "./build-session";
import { UseAppletDialog } from "./UseAppletDialog";
import { useAppletBuildSession } from "./useAppletBuildSession";
import { BuildHistory } from "./BuildHistory";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

// The preview (the Applet host, its frame and compiler) is needed only once a saved version exists, so it
// loads then — never with the first screen. One edge, ssr:false (it mounts browser-only code), gated on
// `saved` below (code-splitting skill, Method A).
const AppletHostMount = dynamic(() => import("@/features/applets-host/AppletHostMount").then((m) => m.AppletHostMount), {
  ssr: false,
  loading: () => <RegionSkeleton />,
});

/** ONE live window per build: a fix round re-binds the build's window, never stacks a second (F6). */
const buildWindowId = (appletId: string | null) => `applet-build:${appletId ?? "new"}`;

const noopSubscribe = () => () => {};
/** False in the server HTML and the hydration render, true once the page answers clicks. */
const useHydrated = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

// Declared in aidream (client_mandates.py, applets.build); allowlisted in
// scripts/mandate-keys-allowlist.json until @ai-matrx/agents publishes MANDATE_KEYS.applets__build.
// ONE CONVERSATION PER BUILD (lane F6b): the first run starts it on `applets.build`; the automatic fix round
// (a host turn), "Change it" and her replies are its next turns — never a second job or conversation.
const BUILD = storedMandateKey("applets.build");
const DISCLOSURE = [{ mandateKey: BUILD, does: "builds and fixes your Applet as you talk to it" }] as const;
const SURFACE_KEY = "applets:build";

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


/** Every job key the check may meet: the catalogue's, the Applet's own, and (for a stored answer) the answer's. */
function jobKeysOf(catalogue: { jobs: { key: string }[] }, applet: { mandates: { key: string }[] } | null, answer: unknown): string[] {
  const keys = new Set<string>([...catalogue.jobs.map((j) => j.key), ...(applet?.mandates ?? []).map((m) => m.key)]);
  const raw = typeof answer === "object" && answer !== null ? (answer as { applet?: { mandates?: unknown } }).applet?.mandates : undefined;
  if (Array.isArray(raw)) for (const m of raw) if (typeof m === "object" && m !== null && typeof (m as { key?: unknown }).key === "string") keys.add((m as { key: string }).key);
  return [...keys];
}

export function AppletBuilder({
  appletId: initialId,
  routed = false,
  initialRecord = null,
}: {
  appletId: string | null;
  routed?: boolean;
  /** The build's record as the server render read it, so a refresh mid-build opens on the build (B1). */
  initialRecord?: BuildRecord | null;
}) {
  // org-filter: write-target the Applet is saved in the organization new things go to; reads are her own
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const writer = useHeadlessAgentJson();
  const openRunWindow = useOpenLiveRunWindow();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  useDeclaredSurfaceMandates(DISCLOSURE);
  // A reply sent while a round runs steers the NEXT round: it waits here, and goes the moment this one ends.
  const [queued, setQueued] = useState<string | null>(null);
  const queuedRef = useRef<string | null>(null);

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
  // ONE clock per request: a new step changes the words, never the start time (audit9 B3 — it reset at each step).
  const [step, setStep] = useState<{ label: string; since: number } | null>(null);
  const stepTo = (label: string) => setStep((prev) => ({ label, since: prev?.since ?? Date.now() }));
  // The live window of the run in flight (a live one or a rejoined one). When its answer is saved the result
  // is on the card and in the preview, so the window closes and its kept instance is let go (audit9 B13).
  const runWindow = useRef<{ handle: LiveRunWindowHandle; conversationId: string | null } | null>(null);
  const closeRunWindow = () => {
    const open = runWindow.current;
    runWindow.current = null;
    if (!open) return;
    // A closed window is never re-opened by a late "stop waiting" update (that re-dispatches the overlay).
    if (rejoinWindow.current === open.handle) rejoinWindow.current = null;
    // The build's conversation stays: the left panel shows it, and the next round continues it.
    open.handle.close();
  };
  // "Use it" asks who can open it first (B8): the dialog is open while this holds the choice.
  const [useItOpen, setUseItOpen] = useState(false);

  // The build's record (the draft Applet + its request history) — the truth a refresh reopens.
  const session = useAppletBuildSession({
    appletId: initialId,
    initialRecord,
    routed,
    onRejoin: (entry) => {
      setPhase({ kind: "building" });
      setStep({ label: entry.fix ? fixNarration(entry.fix.message) : "Writing your Applet", since: Date.parse(entry.started_at) || Date.now() });
      rejoinWindow.current = openRunWindow({ conversationId: entry.conversation_id, label: entry.fix ? "Fixing your Applet" : "Building your Applet", instanceId: buildWindowId(initialId) });
      runWindow.current = { handle: rejoinWindow.current, conversationId: null };
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
        const [{ appletImportProblems }, { checkBuildAnswer }] = await Promise.all([import("@ai-matrx/applets/frame"), import("./check-build-answer")]);
        const answer = checkBuildAnswer(value, coerceBuildAnswer(value), { organizationId: org, tables: catalogue.tables, importProblems: appletImportProblems });
        await finish(id, entry, answer, current?.applet ?? null, org);
      } catch (err) {
        await failed(id, entry, err);
        // A run rejoined after a refresh is refused exactly like a live one: it goes to the fix round too
        // (its own live window; the rejoined run's window stops waiting first).
        if (repairs(entry, err)) {
          // ONE window at a time (F6): the refused run's window closes; the fix round's opens in its place.
          closeRunWindow();
          rejoinWindow.current = null;
          await repairRefusal(entry, err);
        }
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
    // A repair round's note ("Fixed import locations…") says what the FIX did, never what the Applet is.
    const lastNote = [...record.requests].reverse().find((r) => r.state === "saved" && !r.fix)?.note ?? "";
    void loadSaved(initialId, lastNote);
    const outcome = reopenOutcome(record.requests);
    if (outcome.kind === "start-fix") {
      // Refused moments ago and its tab closed before the fix round started: it starts now, through THE FIX
      // CLAIM (two tabs opening it start one round). An older refusal waits for her "Fix it".
      const { refused } = outcome;
      void run("Fix this error", { where: "record", message: refused.error ?? "Not saved." }, { refusedApplet: refused.refused_applet, refusedEntryId: refused.id });
    } else if (outcome.kind === "show-refused") {
      setRefused(outcome.refused.refused_applet);
      setLastError({ where: "record", message: outcome.refused.error ?? "Not saved." });
    } else if (outcome.kind === "failed") {
      const { entry } = outcome;
      setPhase({ kind: "failed", why: entry.error ?? "The builder stopped." });
      // Never lose what she typed: a request that failed comes back into the box.
      if (!entry.fix) setSentence((s) => s || entry.text);
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
    closeRunWindow();
    setSaved({ ...result, note: entry.fix ? "" : answer.note, toMake: tablesToMake(answer.applet), bound: boundTableIds(answer.applet), made: [] });
    // The page header (and tab title) read the Applet's name on the server when the page opened — the draft's
    // "Untitled Applet". The first saved answer names it, so the header re-reads (social planner, 2026-10-08).
    if (initialId && routed) router.refresh();
    setHeld(0);
    setLastError(null);
    setRefused(null);
    setPhase({ kind: "idle" });
  };

  /** How a request ended without a save — written to its history, and said on screen. */
  const failed = async (id: string, entry: BuildEntry, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    shown.current = `${id}|${entry.id}:${err instanceof BuildRefused ? "refused" : "failed"}`;
    // A refused request of hers goes straight to the fix round: nothing about it is put on screen.
    if (!repairs(entry, err)) {
      if (err instanceof BuildRefused) {
        setRefused(err.applet);
        setLastError({ where: "record", message: err.message });
      }
      setPhase({ kind: "failed", why: message });
    }
    await session
      .settle(id, entry.id, err instanceof BuildRefused ? { state: "refused", error: message, refused_applet: err.applet } : { state: "failed", error: message })
      .catch((writeErr) => console.error("[applet-build] could not record how the request ended", writeErr));
  };

  /**
   * EVERY REFUSAL OF HER REQUEST GOES TO THE ONE AUTOMATIC FIX ROUND — from a live run, from a run
   * rejoined after a refresh (the social planner's first build was refused there and sat on "Fix it" for
   * five minutes, v0.4.3010), and from one refused while no tab was open. Only a refused fix round is shown.
   */
  const repairRefusal = async (entry: BuildEntry, err: unknown) => {
    if (!repairs(entry, err) || !(err instanceof BuildRefused)) return;
    await run("Fix this error", { where: "record", message: err.message }, { refusedApplet: err.applet, refusedEntryId: entry.id });
  };

  /**
   * One request. A NEW build or change whose answer the checks refuse gets ONE automatic fix round
   * (a host turn on the build's one conversation, the refused answer and the reason as context) before anything is shown — she asked for an
   * app, not a list of what is wrong with it. A refused fix round is shown with "Fix it", as before.
   */
  const run = async (request: string, fix: Fix | null, retry: { refusedApplet: BuilderApplet; refusedEntryId: string } | null = null) => {
    setPhase({ kind: "building" });
    // The clock starts once, here; every later step keeps it (B3).
    setStep({ label: retry && fix ? fixNarration(fix.message) : "Saving your request", since: Date.now() });
    const client = createClient();
    const live: { handle: LiveRunWindowHandle | null } = { handle: null };
    let started: { id: string; entry: BuildEntry } | null = null;
    try {
      // A new app needs an organization: with none set, the picker asks and THIS build continues with the pick.
      const org = appletId || retry ? null : (organizationId ?? (await ensureOrgId(null)));
      // The request is written BEFORE anything runs — a new app is born here and the address becomes its own.
      // An automatic fix round is claimed instead: exactly one tab runs it, every other tab follows that run.
      let begun: { record: BuildRecord; entry: BuildEntry };
      if (retry && fix && appletIdRef.current) {
        const fixRound = await session.beginFix({ appletId: appletIdRef.current, refusedEntryId: retry.refusedEntryId, text: request, fix });
        if (!fixRound.claimed) {
          setPhase({ kind: "idle" });
          setStep(null);
          await session.follow(appletIdRef.current);
          return;
        }
        begun = { record: fixRound.record, entry: fixRound.entry };
      } else {
        begun = await session.begin({ appletId: retry ? appletIdRef.current : appletId, organizationId: org ?? "", text: request, fix });
      }
      const { record, entry } = begun;
      started = { id: record.id, entry };
      setAppletId(record.id);
      setSentence("");
      appletIdRef.current = record.id;
      stepTo("Reading your tables");
      const current = record.hasContent ? await readBuilderApplet(client, record.id) : null;
      const runOrg = current?.organizationId ?? record.organizationId;
      const catalogue = await readAppletCatalogue(client, { organizationId: runOrg, request });
      // The frame (already the preview's) answers which names each module really exports; the checks read
      // the code's syntax tree, so both load here, on demand — never with the builder's first screen.
      const [{ appletImportProblems }, { checkBuildAnswer }] = await Promise.all([import("@ai-matrx/applets/frame"), import("./check-build-answer")]);
      stepTo("Starting the builder");
      let attached: Promise<void> = Promise.resolve();
      const check = (v: unknown) => checkBuildAnswer(v, coerceBuildAnswer(v), { organizationId: runOrg, tables: catalogue.tables, importProblems: appletImportProblems });
      const onConversation = (cid: string) => {
        entry.conversation_id = cid;
        attached = session.running(record.id, entry.id, cid).catch((err) => console.error("[applet-build] could not record the run", err));
        live.handle = openRunWindow({ conversationId: cid, label: fix ? "Fixing your Applet" : appletId ? "Changing your Applet" : "Building your Applet", instanceId: buildWindowId(record.id) });
        runWindow.current = { handle: live.handle, conversationId: cid };
        stepTo(fix ? fixNarration(fix.message) : "Writing your Applet");
      };
      // The build's one conversation (every earlier request's run), when it has one.
      const conversation = buildConversationId(record.requests.filter((r) => r.id !== entry.id));
      const fixedApplet = fix ? (retry?.refusedApplet ?? refused) : null;
      let answer: BuildAnswer;
      if (conversation) {
        onConversation(conversation);
        const result = await continueAgentJson(dispatch, store.getState, {
          conversationId: conversation,
          surfaceKey: SURFACE_KEY,
          ...(fix ? { hostTurn: fixHostTurn(fix.message) } : { userInput: request }),
          // Structured parts ride context, never her message: the record as it stands (the refused answer
          // in a fix round) and the check that refused it (removed on her own turns).
          context: {
            applet: fixedApplet ? JSON.stringify(fixedApplet) : current ? JSON.stringify(current.applet) : null,
            last_check: fix ? JSON.stringify({ file: fix.where, message: fix.message }) : null,
          },
        });
        if (!result.success) throw new Error(result.error ?? "The builder finished without an answer.");
        answer = check(result.data);
      } else {
        answer = await writer.run<BuildAnswer>({
          mandateKey: BUILD,
          surfaceKey: SURFACE_KEY,
          sourceFeature: "agent-app",
          expect: "json",
          initiation: "user",
          // The window renders the stream and keeps it after the run ends, so it never goes blank between
          // "Done" and the save (B13); the instance stays for the build's conversation in the left panel.
          displayMode: "direct",
          keepInstance: true,
          organizationId: runOrg,
          variables: {
            request,
            applet: fixedApplet ? JSON.stringify(fixedApplet) : current ? JSON.stringify(current.applet) : "",
            catalogue: JSON.stringify(catalogue),
            last_check: fix ? JSON.stringify({ file: fix.where, message: fix.message }) : "",
          },
          onConversationCreated: onConversation,
          coerce: check,
        });
      }
      await attached;
      await finish(record.id, entry, answer, current?.applet ?? null, runOrg);
    } catch (err) {
      if (started) await failed(started.id, started.entry, err);
      else setPhase({ kind: "failed", why: err instanceof Error ? err.message : String(err) });
      if (started && repairs(started.entry, err)) {
        // ONE window at a time (F6: "Building — Done" sat over "Fixing — processing"): close it first.
        if (live.handle && runWindow.current?.handle === live.handle) closeRunWindow();
        else live.handle?.close();
        live.handle = null;
        await repairRefusal(started.entry, err);
        return;
      }
    } finally {
      // Still this run's open window (not closed on save, not replaced by a fix round's): stop waiting.
      if (live.handle && runWindow.current?.handle === live.handle) live.handle.update({ pending: false });
      setStep(null);
    }
    // Her reply sent during this round steers the next one (an automatic fix round included).
    const next = queuedRef.current;
    if (next && !retry) {
      queuedRef.current = null;
      setQueued(null);
      await run(next, null);
    }
  };

  /** Send what she typed: now when nothing runs, else as the next round (it never waits on a disabled button). */
  const send = (text: string) => {
    if (!text) return;
    if (!busy) return void run(text, null);
    queuedRef.current = text;
    setQueued(text);
    setSentence("");
  };

  // "Use it" never puts a broken Applet in use: while the preview reports an error, Fix it is the action.
  const blockedBy = publishBlockedBy(lastError);
  /** "Use it" for the audience she chose in the dialog — her organization unless she picked the web. */
  const putInUse = async (audience: AppletAudience) => {
    if (!saved || !userId || blockedBy) return;
    setUseItOpen(false);
    setPhase({ kind: "publishing" });
    try {
      const { made } = await publishApplet(createClient(), saved.id, userId, audience);
      // The record now reads the made tables by id (a new content version): the preview remounts on it.
      const { data } = await createClient().schema("app").from("definition").select(SAVED_APPLET_COLUMNS).eq("id", saved.id).maybeSingle();
      setSaved({ ...saved, ...(data ?? { status: "published", published_to_web: audience === "web" }), toMake: [], made });
      setPhase({ kind: "idle" });
    } catch (err) {
      setPhase({ kind: "failed", why: err instanceof Error ? err.message : String(err) });
    }
  };

  // The held "Fix it to use it" on the draft's card is THE fix button; the toolbar's shows only without it.
  const heldOnCard = Boolean(saved && appletState(saved).kind === "draft" && blockedBy);
  const busy = phase.kind === "building" || phase.kind === "publishing" || session.rejoining || buildingStep(session.record?.requests) !== null;
  // Until the page is interactive the button says so, instead of sitting silently disabled.
  const hydrated = useHydrated();
  const boundNames = useSourceTableNames(saved?.bound ?? []);
  // The build's one conversation, read into this tab once so the left panel shows it after a refresh.
  const conversationId = buildConversationId(session.record?.requests ?? []);
  const loadedConversation = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId || loadedConversation.current === conversationId) return;
    loadedConversation.current = conversationId;
    if (store.getState().conversations.byConversationId[conversationId]) return;
    dispatch(loadConversation({ conversationId }))
      .unwrap()
      .catch((err: unknown) => console.error("[applet-build] could not read the build's conversation", { conversationId, err }));
  }, [conversationId, dispatch, store]);
  // A request still open on the record is a build in progress even before this tab rejoins it (B1).
  const shownStep = step ?? buildingStep(session.record?.requests);
  return (
    // Phone: ONE scrolling column — the card (Use it, Open) then the preview below it, never layered over
    // it (audit9 B2). Desktop: two columns, each owning its own height.
    <div
      className="grid h-full min-h-0 grid-cols-1 content-start gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(320px,2fr)_5fr] lg:content-stretch lg:overflow-hidden"
      data-matrx-page-scroll=""
    >
      <div className="flex min-h-0 flex-col gap-3">
        {conversationId ? (
          // THE BUILD'S CONVERSATION: her requests and replies, the builder's answers and questions, the fix
          // rounds — one transcript through the platform's one renderer (never a hand-rendered stream).
          <div className="min-h-48 flex-1 overflow-y-auto" data-applet-build-conversation="">
            <AgentConversationDisplay conversationId={conversationId} surfaceKey={SURFACE_KEY} compact bottomPinned />
          </div>
        ) : null}
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
          {hydrated ? (
            <Button
              variant="primary"
              disabled={!sentence.trim()}
              title={!sentence.trim() ? "Say what you want first" : busy ? "It goes to the builder when this round ends" : undefined}
              onClick={() => send(sentence.trim())}
              data-applet-send=""
            >
              {busy ? "Send next" : appletId ? "Change it" : "Build"}
            </Button>
          ) : (
            <Button variant="primary" disabled aria-busy icon={<Loader2 className="animate-spin" />} data-applet-build-pending="">
              Getting ready
            </Button>
          )}
          {lastError && !heldOnCard ? (
            <Button variant="outline" disabled={busy} onClick={() => void run("Fix this error", lastError)} data-applet-fix="">
              <Wrench className="h-4 w-4" /> {fixLabel(saved ? appletState(saved).kind : null)}
            </Button>
          ) : null}
        </div>
        {phase.kind === "failed" ? <p className="text-sm text-destructive">{phase.why}</p> : null}
        {queued ? (
          <p className="truncate text-xs text-muted-foreground" title={queued} data-applet-queued="">
            Next: {queued}
          </p>
        ) : null}
        {conversationId ? null : <BuildHistory requests={session.record?.requests ?? []} />}
        {lastError ? <p className="text-sm text-destructive" data-applet-error="">{lastError.message}</p> : null}
        {saved ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-medium" data-applet-card-name="">{saved.name}</span>
              {appletVersionLabel(saved.content_version) ? <Badge>{appletVersionLabel(saved.content_version)}</Badge> : null}
              <Badge tone={appletState(saved).tone}>{appletState(saved).label}</Badge>
              {appletState(saved).kind === "published" || appletState(saved).kind === "in_use" ? (
                <span className="text-xs text-muted-foreground" data-applet-audience="">
                  {APPLET_AUDIENCE_LABELS[appletAudience(saved)]}
                </span>
              ) : null}
            </div>
            {saved.description ? <p className="text-muted-foreground">{saved.description}</p> : null}
            {saved.note && saved.note !== saved.description ? <p>{saved.note}</p> : null}
            {!busy ? <p className="text-xs font-medium" data-applet-done="">{doneLine(appletState(saved).kind)}</p> : null}
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
              {appletState(saved).kind === "draft" && blockedBy ? (
                <Button variant="primary" disabled={busy} title={blockedBy} onClick={() => lastError && void run("Fix this error", lastError)} data-applet-use-it-held="">
                  <Wrench className="h-4 w-4" /> Fix it to use it
                </Button>
              ) : appletState(saved).kind === "draft" ? (
                <Button variant="primary" disabled={busy || !userId} title="Choose who can open it, then it goes live" onClick={() => setUseItOpen(true)}>
                  Use it
                </Button>
              ) : null}
              <Link href={`/applets/${saved.slug}`} target="_blank" title="Try it in a new tab" className="inline-flex items-center gap-1 text-primary">
                <ExternalLink className="h-4 w-4" /> Open
              </Link>
            </div>
            <AppletLinkRow slug={saved.slug} />
          </div>
        ) : null}
      </div>
      <div className="flex min-h-[70dvh] flex-col overflow-hidden rounded-lg border border-border bg-card lg:min-h-0">
        {appletId && saved ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              <span>
                {previewLine(appletVersionLabel(saved.content_version))}
              </span>
              {held ? (
                <Badge tone="warning" title={heldHint(held)} data-applet-held="">
                  {held} held in preview
                </Badge>
              ) : null}
              {shownStep ? <BuildStep step={shownStep} inline /> : null}
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
        ) : shownStep ? (
          <BuildStep step={shownStep} />
        ) : (
          <EmptyState icon={<AppWindow />} title="Your Applet shows here" line="Say what you want, then Build." />
        )}
      </div>
      {saved ? (
        <UseAppletDialog
          open={useItOpen}
          onOpenChange={setUseItOpen}
          name={saved.name}
          slug={saved.slug}
          tablesToMake={saved.toMake.map((t) => t.name)}
          busy={phase.kind === "publishing"}
          onConfirm={(audience) => void putInUse(audience)}
        />
      ) : null}
    </div>
  );
}

/** The Applet's full address, with a copy button — the real link, never a bare path (F6). */
function AppletLinkRow({ slug }: { slug: string }) {
  const hydrated = useHydrated();
  // The address is this site's own origin, read once the page is live (the server render has none).
  const url = hydrated ? appletLink(window.location.origin, slug) : null;
  if (!url) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs" data-applet-link="">
      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-primary" title={url}>
        {url}
      </a>
      <Button variant="quiet" icon={<Copy className="h-3.5 w-3.5" />} aria-label="Copy link" title="Copy link" onClick={() => void copyText(url)}>
        Copy
      </Button>
    </div>
  );
}

/**
 * What the build is doing, with how long it has been at it — never a bare placeholder while the builder
 * works (the live window opens only once the run exists; reading her tables and starting the run took
 * ~45 s with nothing said, 2026-10-08).
 */
function BuildStep({ step, inline = false }: { step: { label: string; since: number }; inline?: boolean }) {
  // The server render has no clock of the reader's: the time joins once the page is live (no mismatch).
  const hydrated = useHydrated();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = hydrated ? formatDurationMs(Math.max(0, now - step.since)) : null;
  if (inline) return <Badge tone="info" data-applet-build-step="">{elapsed ? `${step.label} · ${elapsed}` : step.label}</Badge>;
  return (
    <div className="flex h-full min-h-0 items-center justify-center" data-applet-build-step="" aria-live="polite">
      <EmptyState icon={<AppWindow />} title={step.label} line={elapsed ? `${elapsed} so far` : "Working"} />
    </div>
  );
}
