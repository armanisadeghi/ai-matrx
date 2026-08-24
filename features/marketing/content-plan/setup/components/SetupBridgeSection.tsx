"use client";

/**
 * "Make it real" — the actionable rungs under the readiness checklist. The
 * checklist DIAGNOSES; this section ACTS, in the order the plan→live pipeline
 * actually runs:
 *
 *   1. CMS site      — create the site's CMS counterpart and record the link
 *                      on BOTH sides (web.site.settings.cms + the bridge's
 *                      client_sites.web_site_id pairing, written by the first
 *                      reconcile).
 *   2. Site shell    — aidream's starter kit: design tokens → global CSS,
 *                      header/footer components, primary nav.
 *   3. Realize pages — the plan↔CMS bridge: reconcile (the diff), then
 *                      realize every ghost as a draft CMS page. ALWAYS
 *                      dry-run preview before apply; nothing is written the
 *                      user has not seen.
 *   4. Generate content — the durable fill pipeline: author every linked
 *                      draft's html_content from its plan node's brief +
 *                      keyword + attributes (aidream cms-fill job; DB
 *                      frontier, crash-safe, restart-agnostic). ALWAYS
 *                      preview ONE authored page before fanning out; live
 *                      progress is polled from queue counts.
 *   5. Publish site  — bulk publish every page with something pending
 *                      (never published, or draft newer than live) through
 *                      the server's ONE per-page publish path. Dry-run
 *                      preview first, always; apply is behind a destructive
 *                      confirm — this is the rung that changes the live site.
 *
 * Every number shown is a server report, never an assumption (readiness.ts
 * honesty rule). Failures arrive as per-item rows and are shown verbatim —
 * the bridge isolates per item, so partial success is a real outcome and is
 * reported as exactly that.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Globe,
  Hammer,
  Link2,
  Loader2,
  RefreshCw,
  PenLine,
  ScanSearch,
  Square,
} from "lucide-react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CmsSiteService } from "@/features/cms/services/cmsService";
import type { MarketingSite } from "@/features/marketing/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";

import { planKeys } from "../../data/hooks";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { Textarea } from "@/components/ui/textarea";

import {
  fetchFreshSite,
  readSiteDesignGuidance,
  saveSiteDesignGuidance,
  saveSiteEffortTier,
} from "../draft";
import {
  DEFAULT_EFFORT_TIER,
  EFFORT_TIERS,
  EFFORT_TIER_BLURB,
  EFFORT_TIER_LABEL,
  EFFORT_TIER_STEPS,
  readSiteEffortTier,
  type EffortTier,
} from "../effort";
import {
  bridgeFillCancel,
  bridgeFillPreview,
  bridgeFillStart,
  bridgeFillStatus,
  bridgePublish,
  bridgeShellCheck,
  bridgeRealize,
  bridgeReconcile,
  bridgeStarterKit,
  createAndLinkCmsSite,
  recordCmsLink,
  type BridgeAlignResult,
  type BridgePublishResult,
  type BridgeReport,
  type FillPreviewResult,
  type FillStatus,
  type FillStepCounts,
  type ShellCheckSummary,
} from "../bridge";
import { setupKeys } from "../hooks";
import { useCmsPageMap } from "../../hooks/useCmsPageMap";
import {
  COMPARE_STAGES,
  FILL_SEED_STAGES,
  KIT_STAGES,
  LINK_STAGES,
  PUBLISH_PREVIEW_STAGES,
  PUBLISH_STAGES,
  REALIZE_STAGES,
  stageLabel,
  useElapsedSeconds,
  WRITE_STAGES,
  type RunStage,
} from "../../hooks/useRunStage";
import type { CmsFacts } from "../readiness";
import { SetupSection } from "./SetupSection";

type BridgeAction =
  | "link"
  | "kit"
  | "check"
  | "preview"
  | "apply"
  | "fillPreview"
  | "fillStart"
  | "fillCancel"
  | "publishPreview"
  | "publishApply";

/**
 * What each rung narrates while it runs. Every entry here is an action that
 * routinely outlives a couple of seconds — several of them are full LLM passes
 * — so none of them may sit behind a bare spinner.
 *
 * `fillCancel` is deliberately ABSENT: cancelling is a single fast write, and a
 * plain busy state on the button is the honest thing to show for it.
 */
const RUN_STAGES: Partial<Record<BridgeAction, readonly RunStage[]>> = {
  link: LINK_STAGES,
  kit: KIT_STAGES,
  check: COMPARE_STAGES,
  // The realize dry run does the same read-both-sides work as a compare.
  preview: COMPARE_STAGES,
  apply: REALIZE_STAGES,
  // The SAME endpoint the node panel's Write action calls — one shared table.
  fillPreview: WRITE_STAGES,
  fillStart: FILL_SEED_STAGES,
  publishPreview: PUBLISH_PREVIEW_STAGES,
  publishApply: PUBLISH_STAGES,
};

/**
 * A rung's action row, and the stage line that replaces it while it runs.
 *
 * 🚨 ZERO PAGE SHIFT, structurally: the buttons stay in the DOM and keep their
 * exact box (`invisible`), and the stage line is laid over them. A row that
 * wraps to two lines therefore cannot collapse to one when a run starts —
 * nothing below the running rung moves by a pixel.
 */
function RunRow({
  stage,
  elapsed,
  className,
  children,
}: {
  /** The current stage label, or null when nothing is running on this rung. */
  stage: string | null;
  elapsed: number;
  className?: string;
  children: React.ReactNode;
}) {
  const row = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        className,
        stage !== null && "invisible",
      )}
      aria-hidden={stage !== null}
    >
      {children}
    </div>
  );
  if (stage === null) return row;
  return (
    <div className="relative">
      <div className="pointer-events-none">{row}</div>
      <div
        className="absolute inset-0 flex items-center gap-2 text-[11px] text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 truncate">{stage}</span>
        <span className="ml-auto shrink-0 tabular-nums">{elapsed}s</span>
      </div>
    </div>
  );
}

/** Candidate CMS sites for "link existing" — only loaded while unlinked. */
function useLinkCandidates(enabled: boolean) {
  return useQuery({
    queryKey: ["content-plan", "setup", "cms-link-candidates"],
    enabled,
    staleTime: 60 * 1000,
    queryFn: () => CmsSiteService.listSites(),
  });
}

export function SetupBridgeSection({
  site,
  cms,
  planNodeIds,
}: {
  site: MarketingSite;
  cms: CmsFacts | null;
  /** Live plan node ids — compared against the CMS page map for real status. */
  planNodeIds: string[];
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  const linked = Boolean(cms?.link.linked && cms.link.cmsSiteId);

  // The server's own answer to "what already happened here" — the paired CMS
  // site's pages, read on mount. Every rung shows its REAL state from this on
  // load, so returning to Setup after work was done never looks like day zero.
  const pageMap = useCmsPageMap(
    linked ? site.id : null,
    linked ? (cms?.link.cmsSiteId ?? null) : null,
  );
  const planLinkedPages = (pageMap.map?.pages ?? []).filter((page) =>
    page.planNodeId !== null && planNodeIds.includes(page.planNodeId),
  );
  const realizedCount = planLinkedPages.length;
  const publishedPages = (pageMap.map?.pages ?? []).filter(
    (page) => page.isPublished,
  );
  const liveUrl =
    publishedPages.find((page) => page.isHomePage)?.liveUrl ??
    publishedPages.find((page) => page.liveUrl)?.liveUrl ??
    null;
  const allRealized = planNodeIds.length > 0 && realizedCount === planNodeIds.length;
  // "Everything is live" requires everything to EXIST first — pages that were
  // never realized can't be counted as published by omission.
  const allPublished =
    allRealized &&
    planLinkedPages.every((page) => page.isPublished && !page.hasDraft);
  const candidates = useLinkCandidates(Boolean(cms) && !linked);
  // Always name the CMS side explicitly when we know it: the bridge then
  // proves (and on first contact, records) the client_sites.web_site_id
  // pairing instead of failing on a half-linked site — the state rung 1
  // leaves behind if its reconcile step failed mid-flight.
  const knownCmsSite = cms?.link.cmsSiteId ?? undefined;

  const [busy, setBusy] = useState<BridgeAction | null>(null);
  // When the current run started, so its stage line can narrate and count.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const elapsed = useElapsedSeconds(startedAt);

  const startBusy = (action: BridgeAction) => {
    setBusy(action);
    setStartedAt(Date.now());
  };
  const endBusy = () => {
    setBusy(null);
    setStartedAt(null);
  };

  /**
   * The stage line for a rung: non-null only while one of ITS actions runs, so
   * exactly one rung narrates at a time and the others keep their buttons.
   */
  const stageFor = (actions: readonly BridgeAction[]): string | null => {
    if (busy === null || !actions.includes(busy)) return null;
    const stages = RUN_STAGES[busy];
    return stages ? stageLabel(stages, elapsed) : null;
  };
  const [linkChoice, setLinkChoice] = useState<string>("__create__");
  const [report, setReport] = useState<BridgeReport | null>(null);
  const [alignResult, setAlignResult] = useState<BridgeAlignResult | null>(null);
  const [fillPreview, setFillPreview] = useState<FillPreviewResult | null>(null);
  // THE EFFORT TIER — a named pathway, not a cap (Arman, 2026-08-16). The
  // site's recorded default seeds the picker; changing it here IS the site
  // setting, and any page carrying its own override still wins at run time.
  const [effortTier, setEffortTier] = useState<EffortTier>(
    () => readSiteEffortTier(site.settings) ?? DEFAULT_EFFORT_TIER,
  );
  const [savingTier, setSavingTier] = useState(false);
  const [fillStatus, setFillStatus] = useState<FillStatus | null>(null);
  const [publishResult, setPublishResult] = useState<BridgePublishResult | null>(null);
  // On-demand rendered-page inspection (the same check every publish runs
  // automatically) — a human can point it at the live site any time.
  const [shellSummary, setShellSummary] = useState<ShellCheckSummary | null>(null);
  const [shellBusy, setShellBusy] = useState(false);
  // Site design direction — saved on blur; the builder reads it on every run.
  const [designGuidance, setDesignGuidance] = useState(() =>
    readSiteDesignGuidance(site.settings),
  );
  const [designGuidanceSaving, setDesignGuidanceSaving] = useState(false);
  const savedGuidanceRef = useRef(readSiteDesignGuidance(site.settings));
  const handleDesignGuidanceSave = async () => {
    if (designGuidance.trim() === savedGuidanceRef.current.trim()) return;
    setDesignGuidanceSaving(true);
    try {
      await saveSiteDesignGuidance(site.id, designGuidance);
      savedGuidanceRef.current = designGuidance;
    } catch (error) {
      toast.error(`Could not save the design direction: ${extractErrorMessage(error)}`);
    } finally {
      setDesignGuidanceSaving(false);
    }
  };
  const handleShellCheck = async () => {
    setShellBusy(true);
    try {
      setShellSummary(await bridgeShellCheck(dispatch, site.id, { limit: 10 }));
    } catch (error) {
      toast.error(`Could not inspect the site: ${extractErrorMessage(error)}`);
    } finally {
      setShellBusy(false);
    }
  };
  const fillRunning = fillStatus?.status === "pending" || fillStatus?.status === "processing";

  // ESTIMATE BEFORE THE BUTTON — every tier priced for THIS site from measured
  // history, per-page overrides honoured. Never enforced: it informs the click
  // and nothing else (a mid-run budget kill spends the money AND loses the work).
  const overrideCount = 0;

  // Restart-agnostic progress: hydrate the latest fill job once linked, then
  // poll live queue counts while one is running. A page reload (or a server
  // deploy mid-run) changes nothing — the DB frontier is the truth.
  useEffect(() => {
    if (!linked) return;
    let stop = false;
    const read = async () => {
      try {
        const status = await bridgeFillStatus(dispatch, site.id);
        if (!stop) setFillStatus(status.status === "none" ? null : status);
      } catch {
        // Transient poll failure — the next tick retries; never toast a loop.
      }
    };
    void read();
    const timer = setInterval(() => {
      if (fillRunning) void read();
    }, 2500);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [linked, fillRunning, site.id]);

  const invalidateCms = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: setupKeys.cms(site.id) }),
      queryClient.invalidateQueries({ queryKey: marketingKeys.siteOptions() }),
      // WF-11 overlay: realized/published/filled pages change the node→page map.
      queryClient.invalidateQueries({ queryKey: planKeys.cmsPages(site.id) }),
    ]);

  // Announce the run's end exactly once and refresh the CMS facts the other
  // rungs read (a filled page changes has-content everywhere).
  const prevFillStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevFillStatusRef.current;
    const current = fillStatus?.status ?? null;
    prevFillStatusRef.current = current;
    const wasRunning = prev === "pending" || prev === "processing";
    const ended = current !== null && current !== "pending" && current !== "processing";
    if (!wasRunning || !ended) return;
    void invalidateCms();
    // A publish job speaks in "live", not "built" — and its finish is the
    // moment the automatic rendered-page inspection runs (the queue path's
    // equivalent of the one-shot publish's server-side shell check).
    const publishStep = fillStatus?.steps.find((row) => row.step === "p7_publish");
    const isPublishJob =
      publishStep != null &&
      fillStatus != null &&
      fillStatus.steps.every((row) => row.step === "p7_publish");
    if (isPublishJob) {
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(site.id) });
      // Refresh the rung's numbers from truth — a re-run dry preview says what
      // (if anything) still has pending changes, instead of a stale count.
      void bridgePublish(dispatch, site.id, { dryRun: true, cmsSite: knownCmsSite })
        .then(setPublishResult)
        .catch(() => {
          // The next manual "See what would go live" recovers; never toast here.
        });
      const live = publishStep.succeeded + publishStep.skipped;
      if (fillStatus.failed > 0 || fillStatus.deadLetter > 0) {
        toast.error(
          `Publish finished: ${live} of ${publishStep.total} page(s) live, ` +
            `${fillStatus.failed + fillStatus.deadLetter} failed — see the rows below.`,
        );
      } else if (current === "completed") {
        toast.success(`Published — ${live} page(s) are live. Inspecting the rendered pages…`);
      }
      if (current === "completed") void handleShellCheck();
      return;
    }
    if (fillStatus && (fillStatus.failed > 0 || fillStatus.deadLetter > 0)) {
      toast.error(
        `Content build finished: ${fillStatus.pagesBuilt} of ${fillStatus.pages} page(s) built, ` +
          `${fillStatus.failed + fillStatus.deadLetter} step(s) failed — see the rows below.`,
      );
    } else if (current === "completed") {
      toast.success(
        `Content build finished: ${fillStatus?.pagesBuilt ?? 0} page(s) built` +
          (fillStatus?.costUsd != null ? ` for $${fillStatus.costUsd.toFixed(2)}` : "") +
          ".",
      );
    }
  }, [fillStatus?.status]);

  // ── rung 1: create (or pick) the CMS counterpart and link both sides ──────
  const handleLink = async () => {
    startBusy("link");
    try {
      let cmsSlug: string;
      if (linkChoice === "__create__") {
        // ONE implementation, shared with the guided setup checklist's
        // "Set it up for me" step — see bridge.ts#createAndLinkCmsSite.
        cmsSlug = (await createAndLinkCmsSite(dispatch, site)).cmsSlug;
      } else {
        const chosen = (candidates.data ?? []).find((row) => row.id === linkChoice);
        if (!chosen) throw new Error("Pick a CMS site to link.");
        // Plan side first (settings.cms), then the bridge pairing — the first
        // reconcile with cms_site writes client_sites.web_site_id.
        // FRESH row, not the query cache's copy: Setup's draft autosaves bump
        // `version` continuously, so the cached version is deterministically
        // stale and the guarded write would match zero rows.
        const freshSite = await fetchFreshSite(site.id);
        await recordCmsLink({
          siteId: site.id,
          expectedVersion: freshSite.version,
          currentSettings: freshSite.settings,
          cmsSiteId: chosen.id,
          cmsSlug: chosen.slug,
        });
        setReport(await bridgeReconcile(dispatch, site.id, { cmsSite: chosen.id }));
        cmsSlug = chosen.slug;
      }
      await invalidateCms();
      toast.success(`Linked CMS site "${cmsSlug}" — both sides recorded.`);
    } catch (error) {
      toast.error(`Linking failed: ${extractErrorMessage(error)}`);
    } finally {
      endBusy();
    }
  };

  // ── rung 2: starter kit ────────────────────────────────────────────────────
  const runKit = async (force: boolean) => {
    startBusy("kit");
    try {
      const outcome = await bridgeStarterKit(dispatch, site.id, {
        force,
        dryRun: false,
        cmsSite: knownCmsSite,
      });
      await invalidateCms();
      toast.success(
        `Starter kit applied: ${outcome.componentCount} component(s), ` +
          `${outcome.globalCssChars} chars of CSS` +
          (outcome.navigationSeeded ? ", navigation seeded." : "."),
      );
      for (const note of outcome.notes) toast.info(note);
    } catch (error) {
      const message = extractErrorMessage(error);
      if (!force && /not empty/i.test(message)) {
        const ok = await confirm({
          title: "Replace the existing shell?",
          description: `${message} Running with force replaces the site's global CSS and header/footer components.`,
          confirmLabel: "Replace shell",
          variant: "destructive",
        });
        if (ok) {
          await runKit(true);
          return;
        }
      } else {
        toast.error(`Starter kit failed: ${message}`);
      }
    } finally {
      endBusy();
    }
  };

  // ── rung 3: reconcile → dry-run preview → apply ───────────────────────────
  const handleCheck = async () => {
    startBusy("check");
    setAlignResult(null);
    try {
      const next = await bridgeReconcile(dispatch, site.id, { cmsSite: knownCmsSite });
      setReport(next);
      if (next.linksWritten > 0) {
        toast.success(`Proved and recorded ${next.linksWritten} plan↔page link(s).`);
      }
    } catch (error) {
      toast.error(`Alignment check failed: ${extractErrorMessage(error)}`);
    } finally {
      endBusy();
    }
  };

  const handleRealize = async (dryRun: boolean) => {
    if (!report || report.ghosts.length === 0) return;
    if (!dryRun) {
      const ok = await confirm({
        title: `Create ${report.ghosts.length} draft page${report.ghosts.length === 1 ? "" : "s"}?`,
        description:
          `Every planned page missing from CMS site "${report.cmsSiteSlug}" is created as an EMPTY, UNPUBLISHED draft and linked to its plan node. Nothing is published and nothing existing is touched.`,
        confirmLabel: "Create drafts",
      });
      if (!ok) return;
    }
    startBusy(dryRun ? "preview" : "apply");
    try {
      const outcome = await bridgeRealize(
        dispatch,
        site.id,
        report.ghosts.map((ghost) => ghost.nodeId),
        { dryRun, cmsSite: knownCmsSite },
      );
      setAlignResult(outcome);
      if (!dryRun) {
        await Promise.all([
          invalidateCms(),
          queryClient.invalidateQueries({ queryKey: planKeys.nodes(site.id) }),
        ]);
        const next = await bridgeReconcile(dispatch, site.id, {
          cmsSite: knownCmsSite,
        });
        setReport(next);
        if (outcome.failed > 0) {
          toast.error(
            `Created ${outcome.applied} page(s); ${outcome.failed} failed — see the rows below.`,
          );
        } else {
          toast.success(`Created ${outcome.applied} draft page(s).`);
        }
      }
    } catch (error) {
      toast.error(`Realize failed: ${extractErrorMessage(error)}`);
    } finally {
      endBusy();
    }
  };

  // ── rung 4: generate content — preview ONE authored page, then fan out ────
  const handleFillPreview = async () => {
    startBusy("fillPreview");
    try {
      const outcome = await bridgeFillPreview(dispatch, site.id, {
        cmsSite: knownCmsSite,
      });
      setFillPreview(outcome);
      toast.success(`Authored "${outcome.title}" (${outcome.route}) — nothing was written.`);
    } catch (error) {
      toast.error(`Content preview failed: ${extractErrorMessage(error)}`);
    } finally {
      endBusy();
    }
  };

  const handleFillStart = async () => {
    // The whole job's cost, stated BEFORE the commit — pages, exact calls, and
    // a price measured from what these agents actually charged.
    const pages = report?.matched ?? null;
    const steps = EFFORT_TIER_STEPS[effortTier];
    const ok = await confirm({
      title: `Build the content for every drafted page — ${EFFORT_TIER_LABEL[effortTier]}?`,
      description:
        `Every unpublished draft page linked to a plan node on CMS site "${cms?.link.cmsSlug ?? ""}" ` +
        `runs the ${EFFORT_TIER_LABEL[effortTier].toLowerCase()} pathway (${steps.join(" → ")}). ` +
        EFFORT_TIER_BLURB[effortTier] +
        (pages ? ` That covers ${pages} page(s).` : "") +
        " Pages with their own effort setting keep it. Work that is already done is skipped, so re-running resumes rather than repeats. " +
        "Nothing is published. The job is crash-safe and survives restarts — you can leave this page.",
      confirmLabel: "Build the content",
    });
    if (!ok) return;
    startBusy("fillStart");
    try {
      const started = await bridgeFillStart(dispatch, site.id, {
        cmsSite: knownCmsSite,
        effortTier,
      });
      for (const line of started.skipped) toast.info(line);
      toast.success(
        `Building ${started.estimate.pages} page(s) — ${started.estimate.calls} AI step(s)` +
          (started.estimate.usd != null
            ? `, about $${started.estimate.usd.toFixed(2)}`
            : "") +
          "…",
      );
      setFillStatus(await bridgeFillStatus(dispatch, site.id));
    } catch (error) {
      toast.error(`Content generation failed to start: ${extractErrorMessage(error)}`);
    } finally {
      endBusy();
    }
  };

  /** Changing the picker IS the site's default — recorded, not just this run. */
  const handleEffortTierChange = async (next: EffortTier) => {
    const previous = effortTier;
    setEffortTier(next);
    setSavingTier(true);
    try {
      await saveSiteEffortTier(site.id, next);
    } catch (error) {
      setEffortTier(previous);
      toast.error(`Could not save the effort tier: ${extractErrorMessage(error)}`);
    } finally {
      setSavingTier(false);
    }
  };

  const handleFillCancel = async () => {
    if (!fillStatus?.jobId) return;
    startBusy("fillCancel");
    try {
      setFillStatus(await bridgeFillCancel(dispatch, site.id, fillStatus.jobId));
      toast.info("Content generation stopped — in-flight pages finish, nothing else starts.");
    } catch (error) {
      toast.error(`Cancel failed: ${extractErrorMessage(error)}`);
    } finally {
      endBusy();
    }
  };

  // ── rung 5: publish — dry-run preview, then a destructive-confirmed QUEUE
  // job. Apply used to be one giant /cms-publish request that walked the whole
  // site inside a single HTTP call — it died at the gateway timeout at page 9
  // of the first real 29-page publish. Now it seeds `steps=["p7_publish"]` on
  // the same durable fill queue every other step runs on: crash-safe,
  // resumable, one item per page, progress in the same rows below.
  const handlePublish = async (dryRun: boolean) => {
    if (dryRun) {
      startBusy("publishPreview");
      try {
        setPublishResult(
          await bridgePublish(dispatch, site.id, { dryRun: true, cmsSite: knownCmsSite }),
        );
      } catch (error) {
        toast.error(`Publish preview failed: ${extractErrorMessage(error)}`);
      } finally {
        endBusy();
      }
      return;
    }
    const pending = publishResult?.wouldPublish ?? 0;
    const ok = await confirm({
      title: `Publish ${pending} page${pending === 1 ? "" : "s"}?`,
      description:
        `Every listed page on CMS site "${cms?.link.cmsSlug ?? ""}" goes LIVE on the public site, ` +
        `one durable step per page — pages fail or succeed individually, and the job ` +
        `survives restarts (you can leave this page). The rendered pages are inspected ` +
        `for site-level problems when it finishes.`,
      confirmLabel: "Publish site",
      variant: "destructive",
    });
    if (!ok) return;
    startBusy("publishApply");
    try {
      const started = await bridgeFillStart(dispatch, site.id, {
        cmsSite: knownCmsSite,
        steps: ["p7_publish"],
      });
      for (const line of started.skipped) toast.info(line);
      toast.success(`Publishing ${started.estimate.pages} page(s) — progress below…`);
      // The preview that gated this click is now HISTORY — a stale
      // `wouldPublish` would keep labeling the button with the pre-publish
      // count. Cleared here; the end-of-run effect refreshes it from truth.
      setPublishResult(null);
      setFillStatus(await bridgeFillStatus(dispatch, site.id));
    } catch (error) {
      toast.error(`Publish failed to start: ${extractErrorMessage(error)}`);
    } finally {
      endBusy();
    }
  };

  const cmsUnknown = cms === null;
  const ghostCount = report?.ghosts.length ?? null;
  const publishPending = publishResult?.dryRun ? publishResult.wouldPublish : null;

  const activeHeaderFooter = Boolean(
    linked &&
      cms &&
      cms.components.some((c) => c.component_type === "header" && c.is_active) &&
      cms.components.some((c) => c.component_type === "footer" && c.is_active),
  );

  // "What exists right now", straight from the server reads — never from what
  // was clicked this session.
  const cmsStatus = pageMap.isLoading
    ? "Checking what already exists in the CMS…"
    : pageMap.map
      ? `${realizedCount} of ${planNodeIds.length} planned page(s) exist in the CMS · ${publishedPages.length} live`
      : null;

  return (
    <SetupSection title="Make it real">
      <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
        Five steps take this plan from a list of URLs to a live website. Each
        step shows what already exists before you run anything, and every step
        is safe to re-run — only step 5 changes the public site, behind a
        preview and a confirm.
      </p>
      <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {/* ── 1 · CMS site ── */}
        <Rung
          index={1}
          done={linked}
          label="CMS site"
          description="Where the pages will live. Creates (or links) this plan's website in the CMS."
          doneDetail={linked ? `Linked to "${cms?.link.cmsSlug}"` : null}
          doors={
            linked && cms?.link.cmsSiteId ? (
              <DoorLink
                href={`/cms/${cms.link.cmsSiteId}`}
                label="Open the CMS site"
              />
            ) : null
          }
        >
          {linked ? null : cmsUnknown ? (
            <span className="text-[11px] text-muted-foreground">
              Waiting for the CMS check…
            </span>
          ) : (
            <RunRow
              className="w-full"
              stage={stageFor(["link"])}
              elapsed={elapsed}
            >
              <Select value={linkChoice} onValueChange={setLinkChoice}>
                <SelectTrigger className="h-7 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__create__">Create a new CMS site</SelectItem>
                  {(candidates.data ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      Link existing: {row.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs"
                disabled={busy !== null}
                onClick={() => void handleLink()}
              >
                {busy === "link" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {linkChoice === "__create__" ? "Create & link" : "Link"}
              </Button>
            </RunRow>
          )}
        </Rung>

        {/* ── 2 · Site shell ── */}
        <Rung
          index={2}
          done={activeHeaderFooter}
          label="Site shell"
          description="The site's design: global styles, header, footer, and menu. The starter kit generates a first version of all four."
          doneDetail={
            activeHeaderFooter && cms
              ? `In place — ${cms.components.filter((c) => c.is_active).length} active component(s)`
              : null
          }
          doors={
            activeHeaderFooter && cms?.link.cmsSiteId ? (
              <DoorLink
                href={`/cms/${cms.link.cmsSiteId}`}
                label="See it in the CMS"
              />
            ) : null
          }
          blockedReason={linked ? null : "Link a CMS site first (step 1)."}
        >
          <RunRow stage={stageFor(["kit"])} elapsed={elapsed}>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={!linked || busy !== null}
              onClick={() => void runKit(false)}
            >
              {busy === "kit" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Hammer className="h-3.5 w-3.5" />
              )}
              {activeHeaderFooter ? "Re-run starter kit" : "Run starter kit"}
            </Button>
            {activeHeaderFooter ? (
              <span className="text-[11px] text-muted-foreground">
                Re-running replaces the current styles, header, and footer, and
                adds any missing library sections — it will ask before it does.
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Prefer to design it yourself? Skip this and build the shell in
                the CMS instead.
              </span>
            )}
          </RunRow>
          {/* THE DESIGN SEAM, site half: one paragraph in the owner's words
              that the page builder receives on EVERY build (aidream offers it
              to content_plan.page_build as design_guidance). Optional — empty
              means the theme and shell carry the look alone. */}
          <div className="mt-2 space-y-1">
            <label
              className="text-[11px] font-medium text-foreground"
              htmlFor={`design-guidance-${site.id}`}
            >
              Design direction for every page
            </label>
            <Textarea
              id={`design-guidance-${site.id}`}
              value={designGuidance}
              rows={2}
              placeholder="e.g. Calm, clinical and premium — generous whitespace, no stock-photo clichés, one clear action per page."
              className="min-h-0 text-xs"
              onChange={(event) => setDesignGuidance(event.target.value)}
              onBlur={() => void handleDesignGuidanceSave()}
            />
            <p className="text-[11px] text-muted-foreground">
              {designGuidanceSaving
                ? "Saving…"
                : "Every page the factory builds honors this. Individual pages can add their own note on their Build tab."}
            </p>
          </div>
        </Rung>

        {/* ── 3 · Realize pages ── */}
        <Rung
          index={3}
          done={
            // Either source of truth may mark this done: the freshest signal
            // wins, so a stale compare report can't hide completion the live
            // page map already proves (and vice versa).
            (report !== null && report.ghosts.length === 0 && report.matched > 0) ||
            allRealized
          }
          label="Create the pages in the CMS"
          description="Every planned page becomes a real (empty, unpublished) draft page in the CMS, linked to its plan row."
          status={cmsStatus}
          doneDetail={
            report && report.ghosts.length === 0 && report.matched > 0
              ? `All ${report.matched} planned page(s) exist in the CMS`
              : allRealized
                ? `All ${planNodeIds.length} planned page(s) exist in the CMS`
                : null
          }
          blockedReason={linked ? null : "Link a CMS site first (step 1)."}
        >
          <RunRow
            stage={stageFor(["check", "preview", "apply"])}
            elapsed={elapsed}
          >
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={!linked || busy !== null}
              onClick={() => void handleCheck()}
            >
              {busy === "check" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {report ? "Compare again" : "Compare plan to CMS"}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Reads both sides page-by-page and shows the exact differences
              below — it creates nothing.
            </span>
            {ghostCount !== null && ghostCount > 0 ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={busy !== null}
                  onClick={() => void handleRealize(true)}
                >
                  {busy === "preview" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Preview {ghostCount}
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={busy !== null || alignResult === null || !alignResult.dryRun}
                  onClick={() => void handleRealize(false)}
                >
                  {busy === "apply" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  Create {ghostCount} draft{ghostCount === 1 ? "" : "s"}
                </Button>
                {alignResult === null || !alignResult.dryRun ? (
                  <span className="text-[11px] text-muted-foreground">
                    Run Preview first — nothing is created sight-unseen.
                  </span>
                ) : null}
              </>
            ) : null}
          </RunRow>
        </Rung>

        {/* ── 4 · Generate content ── */}
        <Rung
          index={4}
          done={Boolean(
            fillStatus &&
              fillStatus.status === "completed" &&
              fillStatus.failed === 0 &&
              fillStatus.deadLetter === 0 &&
              // Built, not "paid to build" — a resumed job skips every step and
              // still leaves the site finished.
              fillStatus.pagesBuilt > 0,
          )}
          label="Build the page content"
          description="Each drafted page goes through the whole pipeline — work out what belongs on this page and not its siblings, write the content, review and fact-check it, then build the page. Work already done is skipped; nothing is published."
          doneDetail={
            fillStatus && fillStatus.status === "completed"
              ? `${fillStatus.pagesBuilt} page(s) built` +
                (fillStatus.costUsd !== null
                  ? ` · $${fillStatus.costUsd.toFixed(2)}`
                  : "")
              : null
          }
          blockedReason={linked ? null : "Link a CMS site first (step 1)."}
        >
          {/* The fan-out run narrates from REAL queue counts below; these two
            actions are single request/response calls, so they narrate from
            their stage tables instead. */}
          <RunRow
            stage={stageFor(["fillPreview", "fillStart"])}
            elapsed={elapsed}
          >
            {fillRunning ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {fillStatus.pagesBuilt} / {fillStatus.pages} pages built ·{" "}
                  {fillStatus.succeeded + fillStatus.skipped + fillStatus.failed +
                    fillStatus.deadLetter}{" "}
                  / {fillStatus.total} steps
                  {fillStatus.inProgress > 0 ? ` · ${fillStatus.inProgress} running` : ""}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={busy !== null}
                  onClick={() => void handleFillCancel()}
                >
                  {busy === "fillCancel" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  Stop
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={!linked || busy !== null}
                  onClick={() => void handleFillPreview()}
                >
                  {busy === "fillPreview" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Preview one page
                </Button>
                <select
                  aria-label="Content build effort"
                  className="h-7 min-h-[44px] rounded-md border border-input bg-background px-1.5 text-xs sm:min-h-0"
                  value={effortTier}
                  disabled={!linked || busy !== null || savingTier}
                  title={EFFORT_TIER_BLURB[effortTier]}
                  onChange={(event) => {
                    const next = EFFORT_TIERS.find(
                      (candidate) => candidate === event.target.value,
                    );
                    if (next) void handleEffortTierChange(next);
                  }}
                >
                  {EFFORT_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {EFFORT_TIER_LABEL[tier]} ·{" "}
                      {EFFORT_TIER_STEPS[tier].length} call
                      {EFFORT_TIER_STEPS[tier].length === 1 ? "" : "s"}/page
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={!linked || busy !== null || fillPreview === null}
                  title={
                    "The live service does not currently provide a cost estimate."
                  }
                  onClick={() => void handleFillStart()}
                >
                  {busy === "fillStart" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PenLine className="h-3.5 w-3.5" />
                  )}
                  Build {report?.matched ?? "all"} pages
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {EFFORT_TIER_BLURB[effortTier]}
                  {overrideCount > 0
                    ? ` ${overrideCount} page(s) keep their own effort setting.`
                    : ""}
                </span>
                {fillPreview === null ? (
                  <span className="text-[11px] text-muted-foreground">
                    Preview one page first so you see the writing style before
                    it runs on every page.
                  </span>
                ) : null}
              </>
            )}
          </RunRow>
        </Rung>

        {/* ── 5 · Publish ── */}
        <Rung
          index={5}
          done={Boolean(
            (publishResult &&
              !publishResult.dryRun &&
              publishResult.failed === 0 &&
              publishResult.remainingCandidates === 0) ||
              allPublished,
          )}
          label="Publish the site"
          description="The only step that changes the public site: every finished draft goes live."
          status={
            pageMap.map && publishedPages.length > 0
              ? `${publishedPages.length} page(s) are live right now`
              : null
          }
          doneDetail={
            publishResult && !publishResult.dryRun && publishResult.failed === 0
              ? `${publishResult.published} page(s) published`
              : allPublished
                ? "Every page is live with no pending changes"
                : null
          }
          doors={
            liveUrl ? <DoorLink href={liveUrl} label="Open the live site" /> : null
          }
          blockedReason={linked ? null : "Link a CMS site first (step 1)."}
        >
          <RunRow
            stage={stageFor(["publishPreview", "publishApply"])}
            elapsed={elapsed}
          >
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={!linked || busy !== null}
              onClick={() => void handlePublish(true)}
            >
              {busy === "publishPreview" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              See what would go live
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={
                !linked ||
                busy !== null ||
                // One active job per site is the server's law — clicking
                // Publish mid-build would only bounce off it with an error.
                fillRunning ||
                publishPending === null ||
                publishPending === 0
              }
              onClick={() => void handlePublish(false)}
            >
              {busy === "publishApply" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Globe className="h-3.5 w-3.5" />
              )}
              {publishPending !== null && publishPending > 0
                ? `Publish ${publishPending} page${publishPending === 1 ? "" : "s"}`
                : "Publish"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={!linked || shellBusy}
              title="Fetch the rendered pages and check the site shell — header, menu, footer, brand, styling — plus title/meta/h1 basics. Runs automatically on every publish; this runs it now."
              onClick={() => void handleShellCheck()}
            >
              {shellBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ScanSearch className="h-3.5 w-3.5" />
              )}
              Inspect rendered pages
            </Button>
            {publishPending === null ? (
              <span className="text-[11px] text-muted-foreground">
                Run &quot;See what would go live&quot; first — nothing publishes
                sight-unseen.
              </span>
            ) : publishPending === 0 ? (
              <span className="text-[11px] text-muted-foreground">
                Nothing has pending changes — the live site is already current.
              </span>
            ) : null}
          </RunRow>
        </Rung>
      </ol>

      {report ? <ReportSummary report={report} /> : null}
      {alignResult ? <AlignSummary result={alignResult} /> : null}
      {fillPreview ? (
        <FillPreviewPanel preview={fillPreview} onClose={() => setFillPreview(null)} />
      ) : null}
      {fillStatus ? <FillStatusSummary status={fillStatus} /> : null}
      {publishResult ? <PublishSummary result={publishResult} /> : null}
      {shellSummary ? <ShellSummaryBlock summary={shellSummary} /> : null}
    </SetupSection>
  );
}

/** The on-demand rendered-page inspection result — same shape the automatic
 * post-publish check renders inside PublishSummary. */
function ShellSummaryBlock({ summary }: { summary: ShellCheckSummary }) {
  const clean = summary.siteIssues.length === 0;
  return (
    <div
      className={cn(
        "mt-2 max-h-44 overflow-y-auto rounded-md border px-2.5 py-1.5 text-[11px]",
        clean
          ? "border-success/40 bg-success/10"
          : "border-destructive/40 bg-destructive/10",
      )}
    >
      <p className="font-medium text-foreground">
        Rendered-page inspection: {summary.pagesPassed}/{summary.pagesChecked}{" "}
        clean
        {clean
          ? " — header, menu, footer, brand and styling all present."
          : ""}
      </p>
      {summary.siteIssues.map((issue) => (
        <p key={issue.key} className="mt-0.5 text-warning">
          {issue.message} ({issue.pagesAffected} page
          {issue.pagesAffected === 1 ? "" : "s"})
        </p>
      ))}
      {summary.pages
        .filter((page) => !page.ok)
        .slice(0, 15)
        .map((page) => (
          <p key={page.url} className="mt-0.5 text-muted-foreground">
            {page.route || page.url}:{" "}
            {page.issues.map((issue) => issue.message).join(" ")}
          </p>
        ))}
      {summary.truncationNote ? (
        <p className="mt-0.5 text-muted-foreground">{summary.truncationNote}</p>
      ) : null}
    </div>
  );
}

function Rung({
  index,
  done,
  label,
  description,
  status,
  doneDetail,
  doors,
  blockedReason,
  children,
}: {
  index: number;
  done: boolean;
  label: string;
  /** What this step actually does, in the user's language — always visible. */
  description: string;
  /** Server-measured current state ("14 of 26 pages exist…") — always visible. */
  status?: string | null;
  doneDetail: string | null;
  /** Doors to the results (open the CMS site, open the live site, …). */
  doors?: React.ReactNode;
  blockedReason?: string | null;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1.5 bg-card px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {done ? <Check className="h-3 w-3" /> : index}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {label}
        </span>
        {done && doneDetail ? (
          <span className="truncate text-[11px] text-success">{doneDetail}</span>
        ) : null}
        {doors}
      </div>
      <p className="pl-7 text-[11px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      {status ? (
        <p className="pl-7 text-[11px] font-medium tabular-nums text-foreground">
          {status}
        </p>
      ) : null}
      {blockedReason ? (
        <p className="pl-7 text-[11px] text-muted-foreground">{blockedReason}</p>
      ) : (
        <div className="pl-7">{children}</div>
      )}
    </li>
  );
}

/** A small always-new-tab door to a result the step produced. */
function DoorLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  );
}

/** The reconcile buckets, verbatim counts — a diff, not a promise. */
function ReportSummary({ report }: { report: BridgeReport }) {
  const chips: [string, number][] = [
    ["matched", report.matched],
    ["to create", report.ghosts.length],
    ["only in CMS", report.orphans],
    ["conflicts", report.conflicts],
    ["retired", report.retired],
  ];
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">
          Plan vs CMS &quot;{report.cmsSiteSlug}&quot;
        </span>
        {chips.map(([label, value]) => (
          <span key={label} className={cn(value > 0 && label === "conflicts" && "text-warning")}>
            {label} {value}
          </span>
        ))}
      </p>
      {[...report.warnings, ...report.problems].map((line) => (
        <p key={line} className="mt-0.5 text-[11px] text-warning">
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * One authored page, rendered the way the real site will render it: the
 * site's global CSS + header + fragment + footer composed into a sandboxed
 * iframe (scripts blocked). What you see is the server's actual output.
 */
function FillPreviewPanel({
  preview,
  onClose,
}: {
  preview: FillPreviewResult;
  onClose: () => void;
}) {
  const srcDoc =
    "<!doctype html><html><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width, initial-scale=1'>" +
    `<style>${preview.globalCss}</style><style>${preview.css}</style></head>` +
    `<body>${preview.headerHtml}${preview.html}${preview.footerHtml}</body></html>`;
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2.5 py-1.5 text-[11px]">
        <span className="font-medium text-foreground">
          Authored preview: {preview.title} ({preview.route})
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {preview.metaTitle}
        </span>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <iframe
        title={`Authored preview of ${preview.route}`}
        sandbox=""
        srcDoc={srcDoc}
        className="h-96 w-full bg-white"
      />
      <p className="border-t border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
        Nothing was written — this is what &quot;Generate content&quot; will produce for
        every drafted page.
      </p>
    </div>
  );
}

/**
 * One per-page step's progress. A site build is now FOUR AI steps per page
 * (family → write → review → build), so "12 written, 4 reviewed, 2 built" is
 * the only honest way to show it — a single bar hides three quarters of the
 * work behind one number.
 */
function FillStepRow({ step }: { step: FillStepCounts }) {
  const settled = step.succeeded + step.skipped + step.failed + step.deadLetter;
  const failures = step.failed + step.deadLetter;
  return (
    <div className="mt-1 grid grid-cols-[7.5rem_1fr_auto] items-center gap-2">
      <span className="truncate text-foreground">{step.label}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            failures > 0 ? "bg-destructive" : "bg-primary",
          )}
          style={{
            width: `${step.total ? Math.round((settled / step.total) * 100) : 0}%`,
          }}
        />
      </div>
      <span className="tabular-nums text-muted-foreground">
        {step.succeeded}/{step.total}
        {step.inProgress > 0 ? ` · ${step.inProgress} now` : ""}
        {step.blocked > 0 ? ` · ${step.blocked} waiting` : ""}
        {step.skipped > 0 ? ` · ${step.skipped} skipped` : ""}
        {failures > 0 ? ` · ${failures} failed` : ""}
      </span>
    </div>
  );
}

/** Live fill progress + failures, verbatim from queue counts. */
function FillStatusSummary({ status }: { status: FillStatus }) {
  const failures = status.failed + status.deadLetter;
  const money = (value: number) => `$${value.toFixed(2)}`;
  return (
    <div
      className={cn(
        "mt-2 rounded-md border px-2.5 py-1.5 text-[11px]",
        failures > 0
          ? "border-destructive/40 bg-destructive/10"
          : "border-border bg-muted/40",
      )}
    >
      <p className="font-medium tabular-nums text-foreground">
        Content generation {status.status}: {status.pagesBuilt}/{status.pages} page(s)
        built
        {status.inProgress > 0 ? ` · ${status.inProgress} step(s) running` : ""}
        {failures > 0 ? ` · ${failures} failed` : ""}
      </p>
      {/* Per step, because a page is four AI steps now. The single bar is the
        fallback for a job that ran before the steps existed. */}
      {status.steps.length > 0 ? (
        status.steps.map((step) => <FillStepRow key={step.step} step={step} />)
      ) : status.total > 0 ? (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${Math.round(((status.succeeded + failures) / status.total) * 100)}%`,
            }}
          />
        </div>
      ) : null}
      {status.estimate || status.costUsd !== null ? (
        <p className="mt-1.5 tabular-nums text-muted-foreground">
          {status.estimate ? `${status.estimate.calls} AI call(s)` : null}
          {status.estimate?.usd != null
            ? ` · estimated ${money(status.estimate.usd)}`
            : null}
          {status.costUsd !== null ? ` · spent ${money(status.costUsd)}` : null}
        </p>
      ) : null}
      {status.error ? <p className="mt-0.5 text-warning">{status.error}</p> : null}
      {status.problems.slice(0, 30).map((problem) => (
        <p
          key={`${problem.route}-${problem.step}-${problem.status}`}
          className="mt-0.5 text-foreground"
        >
          {problem.route}
          {problem.stepLabel ? ` — ${problem.stepLabel}` : ""} — {problem.status} after{" "}
          {problem.attempts} attempt{problem.attempts === 1 ? "" : "s"}
          {problem.error ? `: ${problem.error}` : ""}
        </p>
      ))}
      {status.problems.length > 30 ? (
        <p className="mt-0.5 text-muted-foreground">
          …and {status.problems.length - 30} more rows with the same treatment.
        </p>
      ) : null}
    </div>
  );
}

/** Per-page publish results, verbatim — the server isolates per item. */
function PublishSummary({ result }: { result: BridgePublishResult }) {
  const failures = result.items.filter((item) => item.status === "failed");
  return (
    <div
      className={cn(
        "mt-2 max-h-44 overflow-y-auto rounded-md border px-2.5 py-1.5 text-[11px]",
        failures.length > 0
          ? "border-destructive/40 bg-destructive/10"
          : "border-success/40 bg-success/10",
      )}
    >
      <p className="font-medium text-foreground">
        {result.dryRun ? "Dry run — nothing went live. " : ""}
        {result.dryRun ? result.wouldPublish : result.published}{" "}
        {result.dryRun ? "would publish" : "published"}
        {result.skippedNoChanges > 0 ? ` · ${result.skippedNoChanges} already current` : ""}
        {failures.length > 0 ? ` · ${failures.length} failed` : ""}
        {result.remainingCandidates > 0
          ? ` · ${result.remainingCandidates} more pending (re-run to continue)`
          : ""}
      </p>
      {result.statusesAdvanced.length > 0 ? (
        <p className="mt-0.5 text-muted-foreground">
          {result.statusesAdvanced.length} plan node(s) advanced to published.
        </p>
      ) : null}
      {[...result.warnings].map((line) => (
        <p key={line} className="mt-0.5 text-warning">
          {line}
        </p>
      ))}
      {result.items.slice(0, 30).map((item, index) => (
        <p
          key={item.pageId || index}
          className={cn(
            "mt-0.5",
            item.status === "failed" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {item.route ?? item.slug}
          {item.reason ? ` — ${item.reason === "never_published" ? "first publish" : "draft pending"}` : ""}
          {item.error ? ` — ${item.error}` : ""}
        </p>
      ))}
      {result.items.length > 30 ? (
        <p className="mt-0.5 text-muted-foreground">
          …and {result.items.length - 30} more rows with the same treatment.
        </p>
      ) : null}
      {result.shellCheck ? (
        <div className="mt-1.5 border-t border-border/60 pt-1">
          <p className="font-medium text-foreground">
            Rendered-page inspection: {result.shellCheck.pagesPassed}/
            {result.shellCheck.pagesChecked} clean
            {result.shellCheck.siteIssues.length === 0
              ? " — header, menu, footer, brand and styling all present."
              : ""}
          </p>
          {result.shellCheck.siteIssues.map((issue) => (
            <p key={issue.key} className="mt-0.5 text-warning">
              {issue.message} ({issue.pagesAffected} page
              {issue.pagesAffected === 1 ? "" : "s"})
            </p>
          ))}
          {result.shellCheck.pages
            .filter((page) => !page.ok)
            .slice(0, 10)
            .map((page) => (
              <p key={page.url} className="mt-0.5 text-muted-foreground">
                {page.route || page.url}:{" "}
                {page.issues.map((issue) => issue.message).join(" ")}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/** Per-item realize results, verbatim — the bridge isolates per item. */
function AlignSummary({ result }: { result: BridgeAlignResult }) {
  const failures = result.items.filter((item) => !item.ok);
  return (
    <div
      className={cn(
        "mt-2 max-h-44 overflow-y-auto rounded-md border px-2.5 py-1.5 text-[11px]",
        failures.length > 0
          ? "border-destructive/40 bg-destructive/10"
          : "border-success/40 bg-success/10",
      )}
    >
      <p className="font-medium text-foreground">
        {result.dryRun ? "Dry run — nothing was written. " : ""}
        {result.applied} {result.dryRun ? "would be created" : "created"} ·{" "}
        {result.unchanged} already in place
        {failures.length > 0 ? ` · ${failures.length} failed` : ""}
      </p>
      {result.statusesAdvanced.length > 0 ? (
        <p className="mt-0.5 text-muted-foreground">
          {result.statusesAdvanced.length} plan node(s) advanced to published.
        </p>
      ) : null}
      {result.items.slice(0, 30).map((item, index) => (
        <p
          key={`${item.nodeId ?? item.pageId ?? index}`}
          className={cn("mt-0.5", item.ok ? "text-muted-foreground" : "text-foreground")}
        >
          {item.error ?? item.detail}
        </p>
      ))}
      {result.items.length > 30 ? (
        <p className="mt-0.5 text-muted-foreground">
          …and {result.items.length - 30} more rows with the same treatment.
        </p>
      ) : null}
    </div>
  );
}
