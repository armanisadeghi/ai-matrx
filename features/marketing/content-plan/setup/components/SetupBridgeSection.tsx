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
 *
 * Every number shown is a server report, never an assumption (readiness.ts
 * honesty rule). Failures arrive as per-item rows and are shown verbatim —
 * the bridge isolates per item, so partial success is a real outcome and is
 * reported as exactly that.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Hammer,
  Link2,
  Loader2,
  RefreshCw,
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
import {
  bridgeRealize,
  bridgeReconcile,
  bridgeStarterKit,
  recordCmsLink,
  type BridgeAlignResult,
  type BridgeReport,
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

  const [busy, setBusy] = useState<"link" | "kit" | "check" | "preview" | "apply" | null>(null);
  const [linkChoice, setLinkChoice] = useState<string>("__create__");
  const [report, setReport] = useState<BridgeReport | null>(null);
  const [alignResult, setAlignResult] = useState<BridgeAlignResult | null>(null);

  const invalidateCms = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: setupKeys.cms(site.id) }),
      queryClient.invalidateQueries({ queryKey: marketingKeys.siteOptions() }),
    ]);

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
      await recordCmsLink({
        siteId: site.id,
        expectedVersion: site.version,
        currentSettings: site.settings,
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

  const cmsUnknown = cms === null;
  const ghostCount = report?.ghosts.length ?? null;

  return (
    <SetupSection title="Make it real">
      <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
        The checklist above measures; these steps act. Each one is safe to
        re-run — nothing is published, and existing pages are never touched.
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
      </ol>

      {report ? <ReportSummary report={report} /> : null}
      {alignResult ? <AlignSummary result={alignResult} /> : null}
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
