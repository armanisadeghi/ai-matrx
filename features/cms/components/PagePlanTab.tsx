"use client";

/**
 * PagePlanTab — the BEFORE half of the CMS page hub (docs/handoffs/cms-page-hub.md W1).
 *
 * "Just because some step happens before we get here doesn't mean we forget it
 * once we're here." A CMS page realized from a content plan carries
 * `client_pages.plan_node_id`; this tab makes that node's context (label,
 * route, status, brief, target keyword, pipeline steps) visible where the page
 * is actually edited, and gives the node a real door into the plan workspace.
 *
 * READ-FOCUSED BY DESIGN. Editing a brief/keyword/status stays in the plan
 * workspace's NodePanel — the ONE editor for a plan node. Duplicating those
 * editors here would fork the canonical component (THE CANONICAL COMPONENT
 * LAW). The one write this tab owns is the thing the plan workspace cannot do
 * from here: adopting a plan-less page into the plan.
 *
 * Plan reads go DIRECT to Supabase (`content-plan/data/service.ts`); the adopt
 * is real server work behind aidream's `cms_align` (`setup/bridge.ts`).
 *
 * The plan context itself is the canonical `PlanContextPanel` — the SAME
 * component the measured page's workspace renders as its BEFORE.
 */
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Map as MapIcon, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { PlanContextPanel } from "@/features/marketing/content-plan/components/PlanContextPanel";
import { bridgeAdopt } from "@/features/marketing/content-plan/setup/bridge";
import type { ClientPage, ClientSite } from "@/features/cms/types";

interface PagePlanTabProps {
  page: ClientPage;
  site: ClientSite;
  /** Reload the CMS page row — after an adopt it carries a `plan_node_id`. */
  onPageChanged: () => void | Promise<void>;
}

/**
 * The page's OTHER origin story (before/during/after doctrine): a page
 * promoted from a quick-publish HTML page, an artifact, or a conversation
 * carries those ids — each one is a door, never a forgotten step. Renders
 * nothing for pages with no recorded origin.
 */
function PageOriginSection({ page }: { page: ClientPage }) {
  const doors = [
    page.source_html_page_id
      ? {
          label: "Quick-publish HTML page",
          href: `/cms/html-pages/${page.source_html_page_id}`,
        }
      : null,
    page.source_artifact_id
      ? { label: "Artifact", href: `/artifacts/${page.source_artifact_id}` }
      : null,
    page.source_conv_id
      ? { label: "Conversation", href: `/chat/${page.source_conv_id}` }
      : null,
  ].filter((door): door is { label: string; href: string } => door !== null);

  if (doors.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold text-foreground">Origin</h3>
      <p className="text-xs text-muted-foreground">
        This page was promoted into the CMS — where it came from is still
        reachable:
      </p>
      <div className="flex flex-wrap gap-2">
        {doors.map((door) => (
          <Button
            key={door.href}
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            asChild
          >
            <Link href={door.href} target="_blank" rel="noopener noreferrer">
              {door.label}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        ))}
      </div>
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-6">{children}</div>
    </div>
  );
}

/** No plan node yet, but the site IS paired — offer the real adopt. */
function AdoptIntoPlan({
  page,
  webSiteId,
  onPageChanged,
}: {
  page: ClientPage;
  webSiteId: string;
  onPageChanged: () => void | Promise<void>;
}) {
  const dispatch = useAppDispatch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The server's own per-item lines — shown verbatim, never summarized away. */
  const [resultLines, setResultLines] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  const runAdopt = async () => {
    setBusy(true);
    setResultLines(null);
    setFailed(false);
    try {
      const result = await bridgeAdopt(dispatch, webSiteId, [page.id], {
        dryRun: false,
      });
      const lines = [
        ...result.items.map((item) =>
          [
            item.action,
            item.ok ? (item.changed ? "applied" : "no change") : "failed",
            item.detail || null,
            item.error || null,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
        ...result.errors,
      ];
      setResultLines(
        lines.length > 0
          ? lines
          : ["The server returned no per-item detail for this run."],
      );
      setFailed(result.failed > 0);
      setConfirmOpen(false);
      await onPageChanged();
    } catch (error) {
      setResultLines([
        error instanceof Error
          ? error.message
          : "The adopt call failed with an unreadable error.",
      ]);
      setFailed(true);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-3 rounded-lg border border-dashed border-border p-5">
        <h2 className="text-sm font-semibold text-foreground">
          This page isn&apos;t in the content plan
        </h2>
        <p className="text-xs text-muted-foreground">
          It was built directly in the CMS, so there is no brief, target
          keyword, or pipeline history behind it. Creating a plan entry adopts
          the live page at{" "}
          <span className="font-mono">{page.route ?? `/${page.slug}`}</span> into
          this site&apos;s plan — nothing about the page itself changes, and the
          plan becomes where its brief and keyword live from now on.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Create plan entry
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
            <Link
              href={`/marketing/content-plan/${webSiteId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the plan workspace
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {resultLines ? (
        <div
          className={cn(
            "space-y-1 rounded-lg border p-4",
            failed
              ? "border-destructive/30 bg-destructive/5"
              : "border-border bg-muted/20",
          )}
        >
          <p className="text-xs font-semibold text-foreground">
            {failed ? "The plan entry was not created" : "Server result"}
          </p>
          {resultLines.map((line, index) => (
            <p
              key={`${index}-${line.slice(0, 24)}`}
              className="font-mono text-[11px] leading-relaxed text-muted-foreground"
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !busy && setConfirmOpen(open)}
        title="Create a plan entry for this page?"
        description="A planned page is created at this page's route and linked to it. The page's content, route, and published state are untouched."
        confirmLabel="Create plan entry"
        busy={busy}
        onConfirm={runAdopt}
      />
    </>
  );
}

export default function PagePlanTab({
  page,
  site,
  onPageChanged,
}: PagePlanTabProps) {
  // The plan is one origin; a promoted page has another (quick-publish page /
  // artifact / conversation). Both render — neither step is forgotten.
  if (page.plan_node_id) {
    return (
      <Shell>
        <PlanContextPanel
          planNodeId={page.plan_node_id}
          fallbackSiteId={site.web_site_id}
          intro="This page was planned before it was built. The brief, target keyword, and status below are edited in the plan workspace — this tab shows what the page is supposed to be while you write it."
        />
        <PageOriginSection page={page} />
      </Shell>
    );
  }

  if (site.web_site_id) {
    return (
      <Shell>
        <AdoptIntoPlan
          page={page}
          webSiteId={site.web_site_id}
          onPageChanged={onPageChanged}
        />
        <PageOriginSection page={page} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-3 rounded-lg border border-dashed border-border p-5">
        <h2 className="text-sm font-semibold text-foreground">
          This site isn&apos;t paired with a content plan
        </h2>
        <p className="text-xs text-muted-foreground">
          A content plan is where a site&apos;s pages are decided before they
          are built — the brief, the target keyword, and the pipeline that turns
          them into pages. Pairing happens once, in the plan workspace: open (or
          create) the plan for <span className="font-medium">{site.name}</span>{" "}
          and link it to this CMS site. After that, every page here can carry
          its plan.
        </p>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
          <Link
            href="/marketing/content-plan"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapIcon className="h-3.5 w-3.5" />
            Open content plans
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <PageOriginSection page={page} />
    </Shell>
  );
}
