"use client";

// features/education/onboard/components/StartHero.tsx
//
// THE one page that creates a study kit (/education/kits/new — the agents
// pattern: list → New → one create route → the kit page). Two modes over ONE
// Source input: "Build with AI" (below) and "Saved aids" (`SavedAidsKitForm`:
// bundle study aids already saved, nothing generated). Both make the same
// multi-source kit (kitScope.ts). `?source=<fileId>` pre-picks that file; a link
// naming an existing kit forwards to the kit page, where adding happens.
//
// Build with AI: the person picks their
// material in the ONE Source input (`features/resource-manager/source-input`,
// the same input as /education/flashcards/new: Upload · Paste text · Web page ·
// YouTube · Recording · Image, and Use existing) → picks what to make → one
// grounded, cited study kit. The picked Sources travel as ONE `SourceSet` and
// are read by the server resolver (useSourceSet().resolve, inside
// useKitGeneration → useIngest); the converter owns text→artifact
// (useContentConverter); this component owns the flow + progressive UI.
// Targets light up as their generators register (isTargetAvailable).

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { createSourceRef } from "@ai-matrx/agents/sources";
import { youtubeId } from "@ai-matrx/rich-content/utils/youtube";
import type { SourceTileId } from "@ai-matrx/agents/sources/runtime";
import { Button } from "@/components/ui/button";
import { Input, SegmentedControl } from "@ai-matrx/design-system/controls";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { getGenerator, isTargetAvailable } from "@/features/education/convert/registry";
import { ALL_TARGET_KINDS, type TargetKind } from "@/features/education/convert/types";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import type { CoverageDepth } from "@/features/education/convert/coverage";
import { SourceInput } from "@/features/resource-manager/source-input/components/SourceInput";
import { useSourceSet } from "@/features/resource-manager/source-input/useSourceSet";
import { useSourceIntake } from "@/features/resource-manager/source-input/useSourceIntake";
import { useKitGeneration } from "../useKitGeneration";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { KitBoard } from "./KitBoard";
import { KitDepthPicker } from "./KitDepthPicker";
import { ErrorNotice } from "@ai-matrx/design-system";
import { describeFailure } from "@/lib/failure/transport";
import { RunStoppedNotice } from "@/lib/wizard-draft/RunStoppedNotice";
import { filesDb } from "@/features/files/filesDb";
import { supabase } from "@/utils/supabase/client";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { EDUCATION_START_SURFACE_NAME } from "@/features/surfaces/manifests/education-start.manifest";
import { parseKitRequestDraftValue } from "../startAgentWrites";
import { buildEducationStartScope } from "../startSurfaceScope";
import { SavedAidsKitForm } from "@/features/education/kits/components/SavedAidsKitForm";
import { isManualKitSourceType, kitHref, readKit } from "@/features/education/kits/kitService";
import { KIT_TOKEN } from "@/features/education/kits/kitScope";
import { getFileMetadata } from "@/features/files/api/files";

type CreateMode = "ai" | "saved";
const CREATE_MODES: { value: CreateMode; label: string }[] = [
  { value: "ai", label: "Build with AI" },
  { value: "saved", label: "Saved aids" },
];

/** The Source input's key on this page — picks are held and kept under it. */
export const EDUCATION_START_SOURCES_KEY = "education:start";

/**
 * What the kit can be made from: every Add new door and Use existing. Not
 * "Topic" — a study kit is grounded in material; the focus line carries a topic.
 */
const KIT_SOURCE_KINDS: readonly SourceTileId[] = [
  "upload",
  "paste",
  "web",
  "youtube",
  "audio",
  "image",
  "existing",
];

/**
 * How a kit can use a Source: its TEXT, handed over up front. The kit's
 * generators read the resolved text and nothing else, so "Let the AI look it
 * up" would reach them as nothing (same reason as flashcards).
 */
const KIT_SOURCE_DELIVERIES = ["direct"] as const;

/** How often a held build re-reads whether its Sources are clean yet. */
const WAIT_POLL_MS = 5_000;

/**
 * A build that stopped this recently continues by itself when the page comes
 * back (a reload, a restored tab); an older one waits for a Continue.
 */
const AUTO_CONTINUE_WITHIN_MS = 30 * 60 * 1000;

/**
 * Look up a file the learner owns (an agent's `file_id`). Throws a sentence
 * the agent can act on.
 */
async function loadOwnedFile(fileId: string): Promise<{ fileId: string; fileName: string }> {
  const { data, error } = await filesDb(supabase)
    .from("files")
    .select("id, file_name")
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("That file is no longer available — choose another.");
  }
  return { fileId: data.id, fileName: data.file_name };
}

// THE HEADLINE FLOW'S PAYLOAD, taken from the vision verbatim: "a student drops
// in a PDF, records a lecture, pastes a link or photographs their notes, and gets
// back a deck, a summary, a quiz, a mind map and an audio overview — everything
// they need to study, from one action" (VISION §5, amended by Arman 2026-08-20).
// The defaults ARE the promise: a student who changes nothing must get what the
// front door says they get, so `quiz` and `audio` are on. Notes stays on too —
// ingest already produces the one clean document notes organize, so the artifact
// that merely structures material in hand was the odd one to leave unchecked.
//
// Memory aids and practice tests stay OFF: both are deliberate follow-ups a
// learner reaches for once they know the material, not part of the first
// thirty seconds. Everything here is one tap to change.
const DEFAULT_TARGETS: TargetKind[] = [
  "deck",
  "summary",
  "quiz",
  "mind_map",
  "audio",
  "notes",
];

export function StartHero({
  onMade,
}: {
  /** A Board tile takes the made kit (either mode); the page itself opens or shows it. */
  onMade?: (kit: { sourceType: string; sourceId: string; title: string }) => void;
} = {}) {
  const kit = useKitGeneration();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<CreateMode>("ai");
  const ingestGuard = useEntitlementGuard("education.ingest_document");
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();
  // THE ORGANIZATION IS RESOLVED AT THE BUTTON, never inside the run. A kit run
  // is dozens of org-scoped requests (upload, namer, every generator's agent
  // call and write); if the first of them to need an organization asks, the
  // run stops mid-stream behind a blocking picker (2026-09-28). So: no
  // workspace chosen → the press is HELD, the inline workspace notice appears
  // beside the button, and the moment one is chosen the same press replays
  // with that organization carried by every request of the run.
  const { organizationState, organizationId } = useOrganizationRequired();
  const [heldForWorkspace, setHeldForWorkspace] = useState(false);

  // The material: THE one Source input's picks (kept across a reload by the
  // input itself). The intake is for the agent's kit_request_draft fills.
  const set = useSourceSet(EDUCATION_START_SOURCES_KEY, {
    deliveries: KIT_SOURCE_DELIVERIES,
  });
  const intake = useSourceIntake(set, {});

  // `?source=<id>&from=<type>` (default file): a source that already has a kit
  // opens that kit (adding happens there); a file without one is pre-picked.
  const requestedSource = searchParams.get("source");
  const requestedFrom = searchParams.get("from") ?? "file";
  const [pickError, setPickError] = useState<string | null>(null);
  const seedFile = useEffectEvent((fileId: string, name: string) => {
    if (set.hasRef("file", fileId)) return;
    set.addReady({ kind: "files", label: name, ref: createSourceRef("file", fileId), fileId });
  });
  useEffect(() => {
    if (!requestedSource) return;
    let active = true;
    void (async () => {
      const existing = isManualKitSourceType(requestedFrom)
        ? await readKit(requestedFrom, requestedSource)
        : null;
      if (!active) return;
      if (existing) {
        router.replace(kitHref(existing.sourceType, existing.sourceId));
        return;
      }
      if (requestedFrom !== "file") throw new Error("This kit no longer exists.");
      const file = await getFileMetadata(requestedSource);
      if (active) seedFile(requestedSource, file.data.file_name);
    })().catch((cause: unknown) => {
      if (active) setPickError(describeFailure(cause, { action: "opening this material", read: true, fallback: "Could not open this material." }).sentence);
    });
    return () => { active = false; };
  }, [requestedSource, requestedFrom, router]);
  const [holdingForClean, setHoldingForClean] = useState(false);

  const [selected, setSelected] = useState<Set<TargetKind>>(
    () => new Set(DEFAULT_TARGETS),
  );
  const [focus, setFocus] = useState("");
  // How much kit to build. `depth` scales everything; `count` is the exact
  // number for a student who knows what they want (blank = size to the source).
  const [depth, setDepth] = useState<CoverageDepth>("standard");
  const [count, setCount] = useState("");

  const toggleTarget = useCallback((kind: TargetKind) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const ready = set.sources.filter((c) => c.status === "ready" && c.draft.ref);
  const landing = set.sources.filter(
    (c) => c.status === "pending" || c.status === "resolving",
  );
  const waitingForClean = ready.filter(
    (c) => c.draft.waitForClean && c.manifest?.state !== "ready",
  );
  // Every picked Source has landed: a build never starts without one of them.
  const hasInput = ready.length > 0 && landing.length === 0;

  const canGenerate = hasInput && selected.size > 0 && !kit.busy;

  const onGenerate = useCallback(async () => {
    if (!canGenerate) return;
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts a run.
    if (!(await coppa.ensureAllowed())) return;
    if (organizationState !== "ready" || !organizationId) {
      setHeldForWorkspace(true);
      return;
    }
    const runOrgId = organizationId;
    setHeldForWorkspace(false);
    // Canonical guard (P8): server-truth check BEFORE spending; a cap-hit opens
    // the respectful contextual paywall and never starts the kit build.
    await ingestGuard.guard(async () => {
      const kinds = [...selected].filter(isTargetAvailable);
      const requested = Number.parseInt(count, 10);
      // Meter only a real ingest; an empty selection / failed ingest burns nothing.
      const ok = await kit.run(set.toSourceSet(), kinds, {
        focus: focus.trim() || undefined,
        depth,
        count: Number.isFinite(requested) && requested > 0 ? requested : undefined,
      }, runOrgId);
      if (ok) {
        await ingestGuard.commit();
        // The kit holds the material now; the input starts empty next time.
        for (const card of set.sources) set.remove(card.id);
      }
    });
  }, [
    canGenerate,
    ingestGuard,
    selected,
    set,
    focus,
    depth,
    count,
    kit,
    coppa,
    organizationState,
    organizationId,
  ]);

  // A BUILD THAT STOPPED WITH ITS PAGE CONTINUES (`useKitGeneration`). Right
  // after a reload it continues by itself — the person pressed Build, and the
  // same kit picks up where it was (nothing saved is made again). Found later
  // (a tab closed yesterday), it is offered with one Continue.
  const continueKit = useEffectEvent(async () => {
    if (kit.busy) return;
    await ingestGuard.guard(async () => {
      const ok = await kit.continueStopped();
      if (ok) {
        await ingestGuard.commit();
        for (const card of set.sources) set.remove(card.id);
      }
    });
  });
  const stoppedAt = kit.stopped?.stoppedAt ?? null;
  const autoContinue =
    stoppedAt !== null && Date.now() - stoppedAt < AUTO_CONTINUE_WITHIN_MS;
  useEffect(() => {
    if (!autoContinue || kit.phase !== "idle") return;
    queueMicrotask(() => void continueKit());
  }, [autoContinue, kit.phase]);

  // "Wait for the clean version" on a Source: the press is held, visibly, and
  // the build starts by itself once every such Source is clean.
  const onBuild = () => {
    if (!canGenerate) return;
    if (waitingForClean.length > 0) {
      setHoldingForClean(true);
      return;
    }
    void onGenerate();
  };
  const waitingCount = waitingForClean.length;
  const pollClean = useEffectEvent(() => void set.manifest());
  const releaseClean = useEffectEvent(() => {
    setHoldingForClean(false);
    void onGenerate();
  });
  useEffect(() => {
    if (!holdingForClean) return;
    if (waitingCount === 0) {
      queueMicrotask(releaseClean);
      return;
    }
    const t = setInterval(pollClean, WAIT_POLL_MS);
    return () => clearInterval(t);
  }, [holdingForClean, waitingCount]);

  // Replay the held press the moment a workspace is chosen (hold-and-replay).
  const releaseWorkspace = useEffectEvent(() => {
    setHeldForWorkspace(false);
    void onGenerate();
  });
  useEffect(() => {
    if (!heldForWorkspace || organizationState !== "ready" || !organizationId)
      return;
    queueMicrotask(releaseWorkspace);
  }, [heldForWorkspace, organizationState, organizationId]);
  const showWorkspaceNotice =
    organizationState !== "ready" &&
    organizationState !== "resolving" &&
    (heldForWorkspace ||
      organizationState === "required" ||
      organizationState === "unavailable");

  // A Board tile becomes the kit once the AI build is done.
  const madeKitId = kit.phase === "done" ? kit.source?.ref?.kitId ?? null : null;
  const reportedKit = useRef<string | null>(null);
  const reportMade = useEffectEvent((kitId: string) => {
    onMade?.({ sourceType: KIT_TOKEN, sourceId: kitId, title: kit.kitTitle?.title ?? "Study kit" });
  });
  useEffect(() => {
    if (!madeKitId || reportedKit.current === madeKitId) return;
    reportedKit.current = madeKitId;
    reportMade(madeKitId);
  }, [madeKitId]);

  // The board goes up the INSTANT the run starts — ingest included. Hiding it
  // until generation began is what left a multi-minute upload+extract behind a
  // single button spinner with nothing to read.
  const showResults =
    kit.phase === "ingesting" ||
    kit.phase === "generating" ||
    kit.phase === "done";

  // ── Surface (matrx-user/education-start) ────────────────────────────────
  const outputOptions = ALL_TARGET_KINDS.map((kind) => ({
    kind,
    label: getGenerator(kind)?.label ?? kind,
    available: isTargetAvailable(kind),
  }));
  const getScope = () =>
    buildEducationStartScope({
      sources: set.sources,
      selected,
      options: outputOptions,
      depth,
      count,
      focus,
      canBuild: canGenerate,
      kit,
    });

  // Write half: fill the form through its own setters. Nothing is built —
  // building spends the allowance and runs the consent/plan gates, so the
  // person presses the button. The whole value (and a file id, looked up
  // exactly as the picker does) is checked before the approval card.
  const checkKitDraft = async (value: unknown) => {
    if (kit.busy || showResults) {
      refuseSurfaceWrite(
        "A kit is being built or its results are showing, so the form is hidden. Ask the person to press Make another first.",
      );
    }
    const fields = parseKitRequestDraftValue(
      value,
      ALL_TARGET_KINDS.filter(isTargetAvailable),
    );
    const owned = fields.fileId
      ? await loadOwnedFile(fields.fileId).catch(() =>
          refuseSurfaceWrite(
            `No file ${fields.fileId} is available to this person. Use the id of a file they own, or ask them to pick it under Use existing.`,
          ),
        )
      : null;
    return { fields, owned };
  };
  const getWriteHandlers = () => ({
    kit_request_draft: {
      validate: async (value: unknown) => {
        await checkKitDraft(value);
      },
      apply: async (value: unknown) => {
        const { fields, owned } = await checkKitDraft(value);
        // Each input ADDS a Source through the input's own doors — the same
        // landing (and the same card) as the person adding it by hand.
        const adding: Promise<void>[] = [];
        if (fields.pasteText?.trim()) adding.push(intake.addPastedText(fields.pasteText));
        if (fields.url) {
          adding.push(
            youtubeId(fields.url) ? intake.addYouTube(fields.url) : intake.addWebPage(fields.url),
          );
        }
        if (owned && !set.hasRef("file", owned.fileId)) {
          set.addReady({
            kind: "files",
            label: owned.fileName,
            ref: createSourceRef("file", owned.fileId),
            fileId: owned.fileId,
          });
        }
        // Landing continues on the cards; the fill does not wait for it.
        for (const p of adding) {
          p.catch((err: unknown) => console.error("[StartHero] agent-added Source failed:", err));
        }
        setMode("ai");
        if (fields.outputs !== undefined) setSelected(new Set(fields.outputs));
        if (fields.depth !== undefined) setDepth(fields.depth);
        if (fields.count !== undefined) {
          setCount(fields.count === null ? "" : String(fields.count));
        }
        if (fields.focus !== undefined) setFocus(fields.focus);
        const filled = Object.keys(value as Record<string, unknown>);
        // The agent's page snapshot predates this fill, so say what the form
        // now holds (the same shape as the kit_request_draft value).
        return {
          summary: `Filled the Create a study kit form (${filled.join(", ")}). Nothing is built until the person presses Build my study kit.`,
          data: {
            sources: [
              ...set.sources.map((c) => ({ name: c.draft.label, status: c.status })),
              ...(fields.pasteText?.trim() ? [{ name: "Pasted text", status: "pending" }] : []),
              ...(fields.url ? [{ name: fields.url, status: "pending" }] : []),
            ],
            outputs: ALL_TARGET_KINDS.filter((k) =>
              (fields.outputs ? new Set(fields.outputs) : selected).has(k),
            ),
            depth: fields.depth ?? depth,
            count:
              fields.count !== undefined
                ? fields.count
                : Number.parseInt(count, 10) > 0
                  ? Number.parseInt(count, 10)
                  : null,
            focus: fields.focus ?? focus,
          },
        };
      },
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_START_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
    <NonEditableContextMenu
      sourceFeature="education-ingest"
      surfaceName={EDUCATION_START_SURFACE_NAME}
      menuVersion={1}
      getApplicationScope={getScope}
      contentSource={{ type: "raw" }}
    >
    <div className="matrx-touch-targets mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Create a study kit
        </h1>
        {!showResults && (
          <div className="flex justify-center">
            <SegmentedControl
              aria-label="How to make the kit"
              value={mode}
              onValueChange={(value) => setMode(value as CreateMode)}
              data={CREATE_MODES}
            />
          </div>
        )}
      </header>

      {!showResults && (
        <>
          <div data-surface-value="kit_request_draft">
            <SourceInput
              surfaceKey={EDUCATION_START_SOURCES_KEY}
              title="Material"
              purpose="your study kit"
              required
              kinds={KIT_SOURCE_KINDS}
              deliveries={KIT_SOURCE_DELIVERIES}
            />
          </div>
          {pickError && (
            <ErrorNotice size="inline" message={pickError} error={pickError} operation="Open material for a study kit" />
          )}
        </>
      )}

      {!showResults && mode === "saved" && <SavedAidsKitForm set={set} onMade={onMade} />}

      {!showResults && mode === "ai" && (
        <>

          {kit.stopped && !autoContinue && (
            <RunStoppedNotice
              message={
                kit.stopped.savedCount > 0
                  ? `${kit.stopped.title ?? "Your kit"} stopped · ${kit.stopped.savedCount} of ${kit.stopped.request.kinds.length} saved`
                  : `${kit.stopped.title ?? "Your kit"} stopped`
              }
              redoLabel="Continue"
              onRedo={() => void continueKit()}
              onDismiss={kit.dismissStopped}
            />
          )}

          {kit.runningElsewhere && (
            <p role="status" className="text-center text-xs text-muted-foreground">
              A kit is building in another tab
            </p>
          )}

          {kit.phase === "error" && kit.error && (
            <ErrorNotice
              title="Kit not built"
              message={describeFailure(kit.errorCause ?? kit.error, {
                action: "building your kit",
                read: true,
                fallback: kit.error,
              }).sentence}
              error={kit.errorCause ?? kit.error}
              operation="Build a study kit"
            />
          )}

          <KitPicker selected={selected} onToggle={toggleTarget} />

          <KitDepthPicker
            depth={depth}
            onDepth={setDepth}
            count={count}
            onCount={setCount}
          />

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Focus (optional)
            </label>
            <Input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. focus on the causes, or I have an exam on chapter 3"
            />
          </div>

          <div className="flex justify-center">
            <EntitlementMeter
              capability="education.ingest_document"
              showAllWindows
            />
          </div>
          <ingestGuard.Paywall />
          <coppa.Gate />

          {showWorkspaceNotice && (
            <OrganizationContextNotice
              state={organizationState}
              title="Choose a workspace"
              description=""
              compact
            />
          )}

          <Button hero
            variant="primary"
            className="w-full"
            disabled={!canGenerate || ingestGuard.isChecking || holdingForClean}
            onClick={onBuild}
          >
            {kit.busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Building your kit…
              </>
            ) : landing.length > 0 ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Adding your sources…
              </>
            ) : holdingForClean ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the clean version…
              </>
            ) : heldForWorkspace ? (
              <>
                Waiting for a workspace — then building{" "}
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Build my study kit <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          {holdingForClean && (
            // A held build is never a dead end: the raw text is already usable.
            <Button
              variant="quiet"
              className="w-full"
              onClick={() => {
                setHoldingForClean(false);
                void onGenerate();
              }}
            >
              Build with the raw text now
            </Button>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
            Grounded in your material ·{" "}
            <Link href="/education/data" className="underline hover:text-foreground">
              Export anytime
            </Link>
          </p>
        </>
      )}

      {showResults && <KitBoard kit={kit} onReset={kit.reset} />}
    </div>
    </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}

// ─── Kit picker ──────────────────────────────────────────────────────────────

function KitPicker(props: {
  selected: Set<TargetKind>;
  onToggle: (k: TargetKind) => void;
}) {
  return (
    <div className="space-y-2" data-surface-value="output_options">
      <label className="text-xs font-medium text-muted-foreground">
        What should we make?
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ALL_TARGET_KINDS.map((kind) => {
          const gen = getGenerator(kind);
          const available = isTargetAvailable(kind);
          const Icon = TARGET_PRESENTATION[kind].icon;
          const on = props.selected.has(kind);
          return (
            <button
              key={kind}
              disabled={!available}
              onClick={() => props.onToggle(kind)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors sm:px-3 sm:py-2.5",
                !available && "cursor-not-allowed opacity-50",
                available && on
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  available && on ? "text-primary" : "",
                )}
              />
              <span className="min-w-0 flex-1 font-medium leading-tight">
                {gen?.label ?? kind}
              </span>
              {available ? (
                on && <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  soon
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
