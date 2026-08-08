"use client";

/**
 * LinksPlan — the PLAN half of the internal-link contract for one canonical
 * page (Plan lane; the observed evidence stays in PageLinksCard).
 *
 * Three authored slices, each on its own `useDesiredValueSlice` key:
 *   - `accepted_anchor_texts` — anchors other pages may use linking HERE;
 *   - `inbound_links`  — pages that SHOULD link here (+ preferred anchor);
 *   - `outbound_links` — links this page SHOULD carry (+ planned anchor).
 *
 * Every planned entry is scored live against the observed current edges:
 * linked (acceptable anchor) / wrong anchor / not linked yet.
 */

import { useId, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Plus,
  X,
} from "lucide-react";
import TextArrayInput from "@/components/official/TextArrayInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { DesiredSection } from "@/features/marketing/components/pages/desired/DesiredSection";
import { useDesiredValueSlice } from "@/features/marketing/components/pages/desired/useDesiredValueSlice";
import {
  acceptedAnchorTextsFromDesiredValues,
  acceptedAnchorsByTargetUrl,
  inboundPlanObservations,
  normalizePlanUrl,
  outboundPlanObservations,
  sanitizeAcceptedAnchorTexts,
  sanitizePlannedLinks,
  scorePlannedLinks,
  summarizePlannedLinkScores,
  usePageInboundLinks,
  usePageOutboundLinks,
  type PlannedLinkScore,
} from "@/features/marketing/data/page-links";
import { useSitePagePlanRows } from "@/features/marketing/data/site-link-compliance";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage, PlannedLinkEntry } from "@/features/marketing/types";

export function PlannedLinkStatusBadge({
  score,
  pending,
}: {
  score: PlannedLinkScore | undefined;
  pending: boolean;
}) {
  if (pending || !score) {
    return (
      <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
        <CircleDashed className="mr-1 h-3 w-3" />
        checking
      </Badge>
    );
  }
  if (score.status === "linked") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-400"
      >
        <CheckCircle2 className="mr-1 h-3 w-3" />
        linked
      </Badge>
    );
  }
  if (score.status === "wrong_anchor") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400"
      >
        <CircleAlert className="mr-1 h-3 w-3" />
        wrong anchor
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="shrink-0 text-[10px]">
      not linked
    </Badge>
  );
}

function PlanSummaryLine({
  scores,
  pending,
}: {
  scores: PlannedLinkScore[];
  pending: boolean;
}) {
  if (scores.length === 0 || pending) return null;
  const summary = summarizePlannedLinkScores(scores);
  return (
    <p className="text-[11px] text-muted-foreground">
      <span className="font-semibold text-foreground">
        {summary.linked}/{summary.planned}
      </span>{" "}
      planned links in place
      {summary.wrongAnchor > 0 ? (
        <>
          {" · "}
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {summary.wrongAnchor} wrong anchor
          </span>
        </>
      ) : null}
      {summary.missing > 0 ? (
        <>
          {" · "}
          <span className="font-semibold text-destructive">
            {summary.missing} missing
          </span>
        </>
      ) : null}
    </p>
  );
}

/** One direction's planned-link list editor with live per-row scoring. */
function PlannedLinkListEditor({
  entries,
  onChange,
  scoreByEntryId,
  pending,
  datalistId,
  sitePath,
  urlPlaceholder,
  anchorPlaceholder,
}: {
  entries: PlannedLinkEntry[];
  onChange: (next: PlannedLinkEntry[]) => void;
  scoreByEntryId: Map<string, PlannedLinkScore>;
  pending: boolean;
  datalistId: string;
  sitePath: string;
  urlPlaceholder: string;
  anchorPlaceholder: string;
}) {
  const [newUrl, setNewUrl] = useState("");
  const [newAnchor, setNewAnchor] = useState("");

  const add = () => {
    const url = newUrl.trim();
    if (!url) return;
    const anchor = newAnchor.trim().replace(/\s+/g, " ");
    onChange(
      sanitizePlannedLinks([
        ...entries,
        {
          id: crypto.randomUUID(),
          url,
          ...(anchor ? { anchor_text: anchor } : {}),
        },
      ]),
    );
    setNewUrl("");
    setNewAnchor("");
  };

  const update = (id: string, patch: Partial<PlannedLinkEntry>) => {
    onChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };

  return (
    <div className="grid gap-1.5">
      {entries.map((entry) => {
        const score = scoreByEntryId.get(entry.id);
        return (
          <div
            key={entry.id}
            className={cn(
              "rounded-md border border-border/70 p-2",
              score?.status === "wrong_anchor" &&
                "border-amber-500/40 bg-amber-500/5",
              score?.status === "missing" && "bg-destructive/5",
            )}
          >
            <div className="flex items-center gap-1.5">
              <Input
                value={entry.url}
                onChange={(event) =>
                  update(entry.id, { url: event.target.value })
                }
                list={datalistId}
                placeholder={urlPlaceholder}
                aria-label="Planned page URL"
                className="h-8 min-w-0 flex-1 font-mono text-xs"
              />
              <PlannedLinkStatusBadge score={score} pending={pending} />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove planned link"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onChange(entries.filter((item) => item.id !== entry.id))
                }
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Input
                value={entry.anchor_text ?? ""}
                onChange={(event) => {
                  const anchor = event.target.value;
                  update(
                    entry.id,
                    anchor
                      ? { anchor_text: anchor }
                      : { anchor_text: undefined },
                  );
                }}
                placeholder={anchorPlaceholder}
                aria-label="Planned anchor text"
                className="h-8 min-w-0 flex-1 text-xs"
              />
              {score?.partnerPageId ? (
                <Link
                  href={`${sitePath}/pages/${score.partnerPageId}`}
                  className="shrink-0 text-[11px] text-muted-foreground hover:text-primary"
                >
                  Open page
                </Link>
              ) : null}
            </div>
            {!entry.url.trim() ? (
              <p className="mt-1 text-[11px] text-destructive">
                A page URL is required — empty rows are dropped on save.
              </p>
            ) : null}
            {score?.status === "wrong_anchor" ? (
              <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                Currently linked as{" "}
                {score.observedAnchors.length
                  ? score.observedAnchors.map((a) => `“${a}”`).join(" · ")
                  : "(no anchor text)"}
                {score.acceptableAnchors.length ? (
                  <>
                    {" — use: "}
                    {score.acceptableAnchors
                      .map((anchor) => `“${anchor}”`)
                      .join(" · ")}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex items-center gap-1.5">
        <Input
          value={newUrl}
          onChange={(event) => setNewUrl(event.target.value)}
          list={datalistId}
          placeholder={urlPlaceholder}
          aria-label="New planned page URL"
          className="h-8 min-w-0 flex-1 font-mono text-xs"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Input
          value={newAnchor}
          onChange={(event) => setNewAnchor(event.target.value)}
          placeholder={anchorPlaceholder}
          aria-label="New planned anchor text"
          className="h-8 min-w-0 flex-1 text-xs"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          disabled={!newUrl.trim()}
          onClick={add}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

export function LinksPlan({ page }: { page: MarketingPage }) {
  const { site, sitePath } = useMarketingSite();
  const datalistId = useId();
  const anchors = useDesiredValueSlice(page, "accepted_anchor_texts");
  const inboundPlan = useDesiredValueSlice(page, "inbound_links");
  const outboundPlan = useDesiredValueSlice(page, "outbound_links");
  // Same queries as PageLinksCard — react-query dedupes; zero extra fetches
  // when both cards are mounted.
  const inbound = usePageInboundLinks(site.id, page.id, page.url);
  const outbound = usePageOutboundLinks(
    site.id,
    page.id,
    page.latest_snapshot_id,
  );
  // Bounded site pages directory (cap 2000): URL suggestions + target-policy
  // fallback for outbound scoring.
  const directory = useSitePagePlanRows(site.id);

  const acceptedDraft = sanitizeAcceptedAnchorTexts(anchors.draft ?? []);
  const inboundEntries = inboundPlan.draft ?? [];
  const outboundEntries = outboundPlan.draft ?? [];

  const inboundRows = inbound.data ?? [];
  const outboundRows = outbound.data ?? [];
  const inboundPending = inbound.isLoading;
  const outboundPending = outbound.isLoading;

  // Target-policy resolution for outbound plans: observed edges carry the
  // target page's slice; the directory covers planned targets with no edge.
  const observedPolicies = acceptedAnchorsByTargetUrl(outboundRows);
  const directoryPolicies = new Map<string, string[]>();
  for (const row of directory.data?.rows ?? []) {
    directoryPolicies.set(
      normalizePlanUrl(row.url),
      acceptedAnchorTextsFromDesiredValues(row.desired_values),
    );
  }
  const acceptedForTargetUrl = (normalizedUrl: string): string[] => {
    const observed = observedPolicies.get(normalizedUrl);
    if (observed && observed.length > 0) return observed;
    return directoryPolicies.get(normalizedUrl) ?? [];
  };

  const inboundScores = scorePlannedLinks(
    sanitizePlannedLinks(inboundEntries),
    inboundPlanObservations(inboundRows),
    () => acceptedDraft,
  );
  const outboundScores = scorePlannedLinks(
    sanitizePlannedLinks(outboundEntries),
    outboundPlanObservations(outboundRows),
    acceptedForTargetUrl,
  );
  const inboundScoreById = new Map(
    inboundScores.map((score) => [score.entry.id, score]),
  );
  const outboundScoreById = new Map(
    outboundScores.map((score) => [score.entry.id, score]),
  );

  const copy = webCopy({
    kind: "web-page-link-plan",
    label: "Link plan",
    description:
      "The authored internal-link plan for this page: accepted inbound anchor texts, planned inbound links (which pages should link here and how), and planned outbound links — each planned link scored against the observed current edges.",
    surface: `Link plan — ${page.url}`,
    data: {
      acceptedAnchorTexts: acceptedDraft,
      inboundPlan: inboundScores,
      outboundPlan: outboundScores,
    },
    lines: [
      ["URL", page.url],
      ["Accepted inbound anchors", acceptedDraft.join(" · ")],
      ["Planned inbound links", inboundScores.length],
      [
        "Planned inbound in place",
        `${summarizePlannedLinkScores(inboundScores).linked}/${inboundScores.length}`,
      ],
      ["Planned outbound links", outboundScores.length],
      [
        "Planned outbound in place",
        `${summarizePlannedLinkScores(outboundScores).linked}/${outboundScores.length}`,
      ],
    ],
    attributes: {
      page_id: page.id,
      planned_inbound: inboundScores.length,
      planned_outbound: outboundScores.length,
    },
  });

  return (
    <SectionCard title="Link plan" copy={copy} collapsible anchor="link_plan">
      <datalist id={datalistId}>
        {(directory.data?.rows ?? []).map((row) => (
          <option key={row.id} value={row.url} />
        ))}
      </datalist>

      <DesiredSection
        title="Accepted inbound anchor text"
        hint="Exact phrases other internal pages may use when linking here."
        dirty={anchors.dirty}
        saving={anchors.saving}
        onSave={() => void anchors.save()}
        onReset={anchors.reset}
        className="border-t-0"
      >
        <TextArrayInput
          value={anchors.draft ?? []}
          onChange={(values) =>
            anchors.setDraft(sanitizeAcceptedAnchorTexts(values))
          }
          placeholder="Type an acceptable anchor and press Enter (commas add several)"
          showCopyIcon={false}
          chipClassName="border border-primary/25 bg-primary/10 text-foreground"
          className="[&_input]:h-8 [&_input]:text-xs [&_span]:text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          Matching ignores capitalization and repeated whitespace. Empty anchor
          text is never acceptable when a list is configured.
        </p>
      </DesiredSection>

      <DesiredSection
        title={
          <span className="inline-flex items-center gap-1">
            <ArrowDownLeft className="h-3 w-3" />
            Planned inbound links
          </span>
        }
        hint="Pages that should link to this page, with the preferred anchor."
        dirty={inboundPlan.dirty}
        saving={inboundPlan.saving}
        onSave={() => void inboundPlan.save()}
        onReset={inboundPlan.reset}
      >
        <PlanSummaryLine scores={inboundScores} pending={inboundPending} />
        <PlannedLinkListEditor
          entries={inboundEntries}
          onChange={inboundPlan.setDraft}
          scoreByEntryId={inboundScoreById}
          pending={inboundPending}
          datalistId={datalistId}
          sitePath={sitePath}
          urlPlaceholder="Source page URL that should link here"
          anchorPlaceholder="Preferred anchor (empty = any accepted anchor)"
        />
      </DesiredSection>

      <DesiredSection
        title={
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" />
            Planned outbound links
          </span>
        }
        hint="Links this page should carry, with the planned anchor."
        dirty={outboundPlan.dirty}
        saving={outboundPlan.saving}
        onSave={() => void outboundPlan.save()}
        onReset={outboundPlan.reset}
      >
        <PlanSummaryLine scores={outboundScores} pending={outboundPending} />
        <PlannedLinkListEditor
          entries={outboundEntries}
          onChange={outboundPlan.setDraft}
          scoreByEntryId={outboundScoreById}
          pending={outboundPending}
          datalistId={datalistId}
          sitePath={sitePath}
          urlPlaceholder="Target page URL this page should link to"
          anchorPlaceholder="Planned anchor (empty = target's accepted anchors)"
        />
      </DesiredSection>
    </SectionCard>
  );
}
