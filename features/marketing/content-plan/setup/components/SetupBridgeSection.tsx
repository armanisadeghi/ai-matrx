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
  Globe,
  Hammer,
  Link2,
  Loader2,
  RefreshCw,
  Sparkles,
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
import { slugify } from "../archetypes";
import { fetchFreshSite } from "../draft";
import {
  bridgeFillCancel,
  bridgeFillPreview,
  bridgeFillStart,
  bridgeFillStatus,
  bridgePublish,
  bridgeRealize,
  bridgeReconcile,
  bridgeStarterKit,
  recordCmsLink,
  type BridgeAlignResult,
  type BridgePublishResult,
  type BridgeReport,
  type FillPreviewResult,
  type FillStatus,
} from "../bridge";
import { setupKeys } from "../hooks";
import { normalizeDomain, type CmsFacts } from "../readiness";
import { SetupSection } from "./SetupSection";

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
}: {
  site: MarketingSite;
  cms: CmsFacts | null;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  const linked = Boolean(cms?.link.linked && cms.link.cmsSiteId);
  const candidates = useLinkCandidates(Boolean(cms) && !linked);
  // Always name the CMS side explicitly when we know it: the bridge then
  // proves (and on first contact, records) the client_sites.web_site_id
  // pairing instead of failing on a half-linked site — the state rung 1
  // leaves behind if its reconcile step failed mid-flight.
  const knownCmsSite = cms?.link.cmsSiteId ?? undefined;

  const [busy, setBusy] = useState<
    | "link"
    | "kit"
    | "check"
    | "preview"
    | "apply"
    | "fillPreview"
    | "fillStart"
    | "fillCancel"
    | "publishPreview"
    | "publishApply"
    | null
  >(null);
  const [linkChoice, setLinkChoice] = useState<string>("__create__");
  const [report, setReport] = useState<BridgeReport | null>(null);
  const [alignResult, setAlignResult] = useState<BridgeAlignResult | null>(null);
  const [fillPreview, setFillPreview] = useState<FillPreviewResult | null>(null);
  const [fillStatus, setFillStatus] = useState<FillStatus | null>(null);
  const [publishResult, setPublishResult] = useState<BridgePublishResult | null>(null);

  const fillRunning = fillStatus?.status === "pending" || fillStatus?.status === "processing";

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
    if (fillStatus && (fillStatus.failed > 0 || fillStatus.deadLetter > 0)) {
      toast.error(
        `Content generation finished: ${fillStatus.succeeded} written, ` +
          `${fillStatus.failed + fillStatus.deadLetter} failed — see the rows below.`,
      );
    } else if (current === "completed") {
      toast.success(`Content generation finished: ${fillStatus?.succeeded ?? 0} page(s) written.`);
    }

  }, [fillStatus?.status]);

  // ── rung 1: create (or pick) the CMS counterpart and link both sides ──────
  const handleLink = async () => {
    setBusy("link");
    try {
      let cmsSiteId: string;
      let cmsSlug: string;
      if (linkChoice === "__create__") {
        const slug =
          slugify(normalizeDomain(site.domain).replace(/\./g, "-")) ||
          slugify(site.name);
        if (!slug) throw new Error("Could not derive a CMS slug from this site.");
        const created = await CmsSiteService.createSite({
          name: site.name,
          slug,
          domain: normalizeDomain(site.domain) || undefined,
          // The rungs below (starter kit, realize) write through aidream's
          // guarded seams, where an unset agent_write_policy means BLOCKED.
          // Seed `full` exactly like aidream's site_service.create does for a
          // site the creator intends to author immediately.
          settings: { agent_write_policy: "full" },
        });
        cmsSiteId = created.id;
        cmsSlug = created.slug;
      } else {
        const chosen = (candidates.data ?? []).find((row) => row.id === linkChoice);
        if (!chosen) throw new Error("Pick a CMS site to link.");
        cmsSiteId = chosen.id;
        cmsSlug = chosen.slug;
      }
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
        cmsSiteId,
        cmsSlug,
      });
      const first = await bridgeReconcile(dispatch, site.id, { cmsSite: cmsSiteId });
      setReport(first);
      await invalidateCms();
      toast.success(`Linked CMS site "${cmsSlug}" — both sides recorded.`);
    } catch (error) {
      toast.error(`Linking failed: ${extractErrorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  // ── rung 2: starter kit ────────────────────────────────────────────────────
  const runKit = async (force: boolean) => {
    setBusy("kit");
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
      setBusy(null);
    }
  };

  // ── rung 3: reconcile → dry-run preview → apply ───────────────────────────
  const handleCheck = async () => {
    setBusy("check");
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
      setBusy(null);
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
    setBusy(dryRun ? "preview" : "apply");
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
      setBusy(null);
    }
  };

  // ── rung 4: generate content — preview ONE authored page, then fan out ────
  const handleFillPreview = async () => {
    setBusy("fillPreview");
    try {
      const outcome = await bridgeFillPreview(dispatch, site.id, {
        cmsSite: knownCmsSite,
      });
      setFillPreview(outcome);
      toast.success(`Authored "${outcome.title}" (${outcome.route}) — nothing was written.`);
    } catch (error) {
      toast.error(`Content preview failed: ${extractErrorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleFillStart = async () => {
    const estimate = report?.matched ?? null;
    const ok = await confirm({
      title: "Generate content for the drafted pages?",
      description:
        `Every unpublished draft page linked to a plan node on CMS site "${cms?.link.cmsSlug ?? ""}" ` +
        `gets its content written from its brief${estimate ? ` (~${estimate} page(s))` : ""}. ` +
        "Pages that already have content are skipped; nothing is published. " +
        "The job is crash-safe and survives restarts — you can leave this page.",
      confirmLabel: "Generate content",
    });
    if (!ok) return;
    setBusy("fillStart");
    try {
      const started = await bridgeFillStart(dispatch, site.id, { cmsSite: knownCmsSite });
      for (const line of started.skipped) toast.info(line);
      toast.success(`Generating content for ${started.seeded} page(s)…`);
      setFillStatus(await bridgeFillStatus(dispatch, site.id));
    } catch (error) {
      toast.error(`Content generation failed to start: ${extractErrorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleFillCancel = async () => {
    if (!fillStatus?.jobId) return;
    setBusy("fillCancel");
    try {
      setFillStatus(await bridgeFillCancel(dispatch, site.id, fillStatus.jobId));
      toast.info("Content generation stopped — in-flight pages finish, nothing else starts.");
    } catch (error) {
      toast.error(`Cancel failed: ${extractErrorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  // ── rung 5: publish — dry-run preview, then destructive-confirmed apply ───
  const handlePublish = async (dryRun: boolean) => {
    if (!dryRun) {
      const pending = publishResult?.wouldPublish ?? 0;
      const ok = await confirm({
        title: `Publish ${pending} page${pending === 1 ? "" : "s"}?`,
        description:
          `Every listed page on CMS site "${cms?.link.cmsSlug ?? ""}" goes LIVE on the public site. ` +
          `Pages fail or succeed individually — one bad page never blocks the rest.`,
        confirmLabel: "Publish site",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setBusy(dryRun ? "publishPreview" : "publishApply");
    try {
      const outcome = await bridgePublish(dispatch, site.id, {
        dryRun,
        cmsSite: knownCmsSite,
      });
      setPublishResult(outcome);
      if (!dryRun) {
        await Promise.all([
          invalidateCms(),
          queryClient.invalidateQueries({ queryKey: planKeys.nodes(site.id) }),
        ]);
        if (outcome.failed > 0) {
          toast.error(
            `Published ${outcome.published} page(s); ${outcome.failed} failed — see the rows below.`,
          );
        } else if (outcome.published > 0) {
          toast.success(`Published ${outcome.published} page(s) — the site is live.`);
        } else {
          toast.info("Nothing had pending changes — the live site is already current.");
        }
        if (outcome.remainingCandidates > 0) {
          toast.info(
            `${outcome.remainingCandidates} more page(s) still pending — run Publish again to continue.`,
          );
        }
      }
    } catch (error) {
      toast.error(`Publish failed: ${extractErrorMessage(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const cmsUnknown = cms === null;
  const ghostCount = report?.ghosts.length ?? null;
  const publishPending = publishResult?.dryRun ? publishResult.wouldPublish : null;

  return (
    <SetupSection title="Make it real">
      <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
        The checklist above measures; these steps act. Steps 1–4 are safe to
        re-run and never publish anything; step 5 is the deliberate one — it
        takes the drafted site live, behind a preview and a confirm.
      </p>
      <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {/* ── 1 · CMS site ── */}
        <Rung
          index={1}
          done={linked}
          label="CMS site"
          doneDetail={linked ? `Linked to "${cms?.link.cmsSlug}"` : null}
        >
          {linked ? null : cmsUnknown ? (
            <span className="text-[11px] text-muted-foreground">
              Waiting for the CMS check…
            </span>
          ) : (
            <div className="flex w-full flex-wrap items-center gap-1.5">
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
            </div>
          )}
        </Rung>

        {/* ── 2 · Site shell ── */}
        <Rung
          index={2}
          done={Boolean(
            linked &&
              cms &&
              cms.components.some((c) => c.component_type === "header" && c.is_active) &&
              cms.components.some((c) => c.component_type === "footer" && c.is_active),
          )}
          label="Site shell (starter kit)"
          doneDetail={
            linked && cms
              ? "Header + footer components are in place"
              : null
          }
          blockedReason={linked ? null : "Link a CMS site first."}
        >
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
            Run starter kit
          </Button>
        </Rung>

        {/* ── 3 · Realize pages ── */}
        <Rung
          index={3}
          done={Boolean(report && report.ghosts.length === 0 && report.matched > 0)}
          label="Realize planned pages"
          doneDetail={
            report && report.ghosts.length === 0 && report.matched > 0
              ? `All ${report.matched} planned page(s) exist in the CMS`
              : null
          }
          blockedReason={linked ? null : "Link a CMS site first."}
        >
          <div className="flex flex-wrap items-center gap-1.5">
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
              Check alignment
            </Button>
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
                  title={
                    alignResult === null || !alignResult.dryRun
                      ? "Preview first — nothing is written the user has not seen."
                      : undefined
                  }
                  onClick={() => void handleRealize(false)}
                >
                  {busy === "apply" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  Create {ghostCount} draft{ghostCount === 1 ? "" : "s"}
                </Button>
              </>
            ) : null}
          </div>
        </Rung>

        {/* ── 4 · Generate content ── */}
        <Rung
          index={4}
          done={Boolean(
            fillStatus &&
              fillStatus.status === "completed" &&
              fillStatus.failed === 0 &&
              fillStatus.deadLetter === 0 &&
              fillStatus.succeeded > 0,
          )}
          label="Generate content from briefs"
          doneDetail={
            fillStatus && fillStatus.status === "completed"
              ? `${fillStatus.succeeded} page(s) written`
              : null
          }
          blockedReason={linked ? null : "Link a CMS site first."}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {fillRunning ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {fillStatus.succeeded + fillStatus.failed + fillStatus.deadLetter} /{" "}
                  {fillStatus.total} pages
                  {fillStatus.inProgress > 0 ? ` · ${fillStatus.inProgress} writing now` : ""}
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
                <Button
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={!linked || busy !== null || fillPreview === null}
                  title={
                    fillPreview === null
                      ? "Preview one authored page first — nothing fans out sight-unseen."
                      : undefined
                  }
                  onClick={() => void handleFillStart()}
                >
                  {busy === "fillStart" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Generate content
                </Button>
              </>
            )}
          </div>
        </Rung>

        {/* ── 5 · Publish ── */}
        <Rung
          index={5}
          done={Boolean(
            publishResult && !publishResult.dryRun && publishResult.failed === 0 &&
              publishResult.remainingCandidates === 0,
          )}
          label="Publish the site"
          doneDetail={
            publishResult && !publishResult.dryRun && publishResult.failed === 0
              ? `${publishResult.published} page(s) published`
              : null
          }
          blockedReason={linked ? null : "Link a CMS site first."}
        >
          <div className="flex flex-wrap items-center gap-1.5">
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
              Preview publish
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              disabled={
                !linked ||
                busy !== null ||
                publishPending === null ||
                publishPending === 0
              }
              title={
                publishPending === null
                  ? "Preview first — nothing goes live the user has not seen."
                  : publishPending === 0
                    ? "Nothing has pending changes."
                    : undefined
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
          </div>
        </Rung>
      </ol>

      {report ? <ReportSummary report={report} /> : null}
      {alignResult ? <AlignSummary result={alignResult} /> : null}
      {fillPreview ? (
        <FillPreviewPanel preview={fillPreview} onClose={() => setFillPreview(null)} />
      ) : null}
      {fillStatus ? <FillStatusSummary status={fillStatus} /> : null}
      {publishResult ? <PublishSummary result={publishResult} /> : null}
    </SetupSection>
  );
}

function Rung({
  index,
  done,
  label,
  doneDetail,
  blockedReason,
  children,
}: {
  index: number;
  done: boolean;
  label: string;
  doneDetail: string | null;
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
      </div>
      {blockedReason ? (
        <p className="pl-7 text-[11px] text-muted-foreground">{blockedReason}</p>
      ) : (
        <div className="pl-7">{children}</div>
      )}
    </li>
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

/** Live fill progress + failures, verbatim from queue counts. */
function FillStatusSummary({ status }: { status: FillStatus }) {
  const done = status.succeeded + status.failed + status.deadLetter;
  const failures = status.failed + status.deadLetter;
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
        Content generation {status.status}: {done}/{status.total} pages ·{" "}
        {status.succeeded} written
        {status.inProgress > 0 ? ` · ${status.inProgress} writing now` : ""}
        {failures > 0 ? ` · ${failures} failed` : ""}
      </p>
      {status.total > 0 ? (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round((done / status.total) * 100)}%` }}
          />
        </div>
      ) : null}
      {status.error ? <p className="mt-0.5 text-warning">{status.error}</p> : null}
      {status.problems.slice(0, 30).map((problem) => (
        <p key={`${problem.route}-${problem.status}`} className="mt-0.5 text-foreground">
          {problem.route} — {problem.status} after {problem.attempts} attempt
          {problem.attempts === 1 ? "" : "s"}
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
