"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  FlaskConical,
  GitCommitHorizontal,
  Loader2,
  Plus,
  RefreshCw,
  SearchCheck,
  Target,
  XCircle,
} from "lucide-react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import DataRowWindow from "@/components/official/matrx-data-table/DataRowWindow.dynamic";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KeywordInput } from "@/features/marketing/seo/keyword/KeywordInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  InlineQueryError,
  LoadingSurface,
  QueryError,
  SectionCard,
  formatDate,
  formatDateOnly,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  createSeoChange,
  getMetricEvidence,
  getSeoChangeBundle,
  listSeoChanges,
  listSeoPages,
  listUntrackedChanges,
  recordMetricAssessment,
  updateSeoChange,
  verifySeoChangeItemManually,
  type CreateSeoChangeInput,
  type MetricEvidence,
  type SeoChangeBundle,
  type SeoChangeItem,
  type SeoChangeMetric,
  type SeoChangeSummary,
  type SeoChangeTheory,
  type SeoPageOption,
  type UntrackedSnapshotChange,
} from "./data";

const STATUS_OPTIONS = [
  "planned",
  "ready",
  "in_progress",
  "deployed",
  "measuring",
  "completed",
  "cancelled",
  "rolled_back",
] as const;

const CHANGE_KINDS = [
  ["new_page", "New page"],
  ["content", "Content"],
  ["metadata", "Metadata"],
  ["media", "Image or media"],
  ["internal_links", "Internal links"],
  ["structured_data", "Structured data"],
  ["technical", "Technical SEO"],
  ["redirect", "Redirect"],
  ["mixed", "Mixed change"],
  ["other", "Other"],
] as const;

const METRICS = [
  ["gsc_clicks", "GSC clicks", "gsc"],
  ["gsc_impressions", "GSC impressions", "gsc"],
  ["gsc_ctr", "GSC click-through rate", "gsc"],
  ["gsc_average_position", "GSC average position", "gsc"],
  ["ga4_sessions", "GA4 sessions", "ga4"],
  ["ga4_users", "GA4 users", "ga4"],
  ["ga4_engaged_sessions", "GA4 engaged sessions", "ga4"],
  ["ga4_conversions", "GA4 conversions", "ga4"],
  ["ga4_revenue", "GA4 revenue", "ga4"],
  ["rank_position", "Tracked rank position", "rank"],
  ["crawl_health_score", "Crawl health score", "crawl"],
  ["manual", "Manual measure", "manual"],
] as const;

const FIELD_KINDS = [
  ["page_published", "Page is published"],
  ["title", "Title tag"],
  ["meta_description", "Meta description"],
  ["canonical_url", "Canonical URL"],
  ["h1", "H1"],
  ["content_changed", "Body content changed"],
  ["image", "Image or alt content"],
  ["structured_data", "Structured data"],
  ["http_status", "HTTP status"],
  ["manual", "Manual verification"],
] as const;

const key = {
  changes: (siteId: string) => ["marketing", "seo-changes", siteId] as const,
  pages: (siteId: string) => ["marketing", "seo-change-pages", siteId] as const,
  untracked: (siteId: string) =>
    ["marketing", "seo-untracked", siteId] as const,
  detail: (id: string) => ["marketing", "seo-change", id] as const,
};

function statusTone(
  status: string | null,
): "success" | "warning" | "destructive" | "secondary" | "outline" {
  if (["completed", "supported", "matched"].includes(status ?? ""))
    return "success";
  if (
    ["deployed", "measuring", "watching", "too_early", "pending"].includes(
      status ?? "",
    )
  )
    return "warning";
  if (["refuted", "mismatch", "rolled_back"].includes(status ?? ""))
    return "destructive";
  return status ? "secondary" : "outline";
}

function StatusPill({ value }: { value: string | null }) {
  return (
    <Badge variant={statusTone(value)} className="whitespace-nowrap capitalize">
      {(value ?? "unknown").replaceAll("_", " ")}
    </Badge>
  );
}

function number(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
  }).format(value);
}

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return `${value >= 0 ? "+" : ""}${number(value, 1)}%`;
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface ComposerSeed {
  pageId?: string;
  title?: string;
  changeKind?: string;
  deployedAt?: string;
  fieldKind?: string;
  expectedAfter?: string;
  observedSnapshot?: UntrackedSnapshotChange;
}

function createDraft(seed: ComposerSeed = {}) {
  const observedFields =
    seed.observedSnapshot?.changed_fields?.join(", ") ?? "";
  return {
    pageId: seed.pageId ?? "",
    title: seed.title ?? "",
    summary: observedFields
      ? `Crawl observed changes to ${observedFields}.`
      : "",
    rationale: observedFields
      ? `Document why the observed ${observedFields} change was made.`
      : "",
    businessOutcome: "",
    changeKind: seed.changeKind ?? "content",
    confidence: "60",
    deployedAt: seed.deployedAt ?? "",
    theoryTitle: "",
    hypothesis: "",
    mechanism: "",
    businessLink: "",
    keywordPhrase: "",
    metricKey: "gsc_clicks",
    direction: "increase",
    targetChangePct: "10",
    targetValue: "",
    baselineDays: "28",
    observationDays: "28",
    minimumDataDays: "7",
    fieldKind: seed.fieldKind ?? "content_changed",
    expectedAfter: seed.expectedAfter ?? "",
  };
}

function ChangeComposer({
  open,
  onOpenChange,
  pages,
  seed,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: SeoPageOption[];
  seed: ComposerSeed;
  onCreated: (input: CreateSeoChangeInput) => Promise<void>;
}) {
  const { site } = useMarketingSite();
  const [draft, setDraft] = useState(() => createDraft(seed));
  const [saving, setSaving] = useState(false);

  const metric =
    METRICS.find(([value]) => value === draft.metricKey) ?? METRICS[0];
  const requiresExpected = ![
    "content_changed",
    "page_published",
    "manual",
  ].includes(draft.fieldKind);
  const canSave =
    draft.pageId &&
    draft.title.trim().length >= 3 &&
    draft.rationale.trim().length >= 10 &&
    draft.businessOutcome.trim().length >= 10 &&
    draft.theoryTitle.trim().length >= 3 &&
    draft.hypothesis.trim().length >= 10 &&
    draft.mechanism.trim().length >= 10 &&
    draft.businessLink.trim().length >= 10 &&
    (!requiresExpected || draft.expectedAfter.trim()) &&
    (draft.targetChangePct.trim() || draft.targetValue.trim());

  const set = (field: keyof typeof draft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onCreated({
        organizationId: site.organization_id,
        siteId: site.id,
        pageId: draft.pageId,
        title: draft.title,
        summary: draft.summary,
        rationale: draft.rationale,
        businessOutcome: draft.businessOutcome,
        changeKind: draft.changeKind,
        confidence: Number(draft.confidence),
        deployedAt: draft.deployedAt
          ? new Date(draft.deployedAt).toISOString()
          : null,
        theoryTitle: draft.theoryTitle,
        hypothesis: draft.hypothesis,
        mechanism: draft.mechanism,
        businessLink: draft.businessLink,
        keywordPhrase: draft.keywordPhrase,
        metricKey: draft.metricKey,
        metricLabel: metric[1],
        dataSource: metric[2],
        direction: draft.direction,
        targetChangePct: draft.targetChangePct
          ? Number(draft.targetChangePct)
          : null,
        targetValue: draft.targetValue ? Number(draft.targetValue) : null,
        baselineDays: Number(draft.baselineDays),
        observationDays: Number(draft.observationDays),
        minimumDataDays: Number(draft.minimumDataDays),
        fieldKind: draft.fieldKind,
        expectedAfter: draft.expectedAfter,
        observedSnapshot: seed.observedSnapshot,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document an SEO change and its theory</DialogTitle>
          <DialogDescription>
            State the intervention, why it should work, how it reaches a
            business result, and what evidence will decide it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {seed.observedSnapshot ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium">
                Retrospective record from crawl evidence
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The crawl saw {seed.observedSnapshot.changed_fields?.join(", ")}{" "}
                on {formatDate(seed.observedSnapshot.captured_at)}. Add the
                missing intent so this milestone stops being unexplained.
              </p>
            </div>
          ) : null}

          <FormSection
            number="1"
            title="The intervention"
            description="What changed, where, and when?"
          >
            <Field label="Page">
              <Select
                value={draft.pageId}
                onValueChange={(value) => set("pageId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a canonical page" />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.path || page.url}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Change type">
              <Select
                value={draft.changeKind}
                onValueChange={(value) => set("changeKind", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANGE_KINDS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Change title" wide>
              <Input
                value={draft.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="Rewrite service page title for commercial intent"
              />
            </Field>
            <Field label="What is changing?" wide>
              <Textarea
                value={draft.summary}
                onChange={(event) => set("summary", event.target.value)}
                className="min-h-20"
                placeholder="A concrete summary of the page, content, metadata, image, link, or technical update."
              />
            </Field>
            <Field label="Why make this change?" wide>
              <Textarea
                value={draft.rationale}
                onChange={(event) => set("rationale", event.target.value)}
                className="min-h-20"
                placeholder="The evidence or problem that makes this intervention worth testing."
              />
            </Field>
            <Field label="Deployment time">
              <Input
                type="datetime-local"
                value={draft.deployedAt}
                onChange={(event) => set("deployedAt", event.target.value)}
                disabled={Boolean(seed.observedSnapshot)}
              />
            </Field>
            <Field label="Confidence (0–100)">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.confidence}
                onChange={(event) => set("confidence", event.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection
            number="2"
            title="The theory"
            description="A falsifiable chain from intervention to outcome."
          >
            <Field label="Theory name" wide>
              <Input
                value={draft.theoryTitle}
                onChange={(event) => set("theoryTitle", event.target.value)}
                placeholder="Commercial-title relevance theory"
              />
            </Field>
            <Field label="If we do this, what should happen?" wide>
              <Textarea
                value={draft.hypothesis}
                onChange={(event) => set("hypothesis", event.target.value)}
                className="min-h-20"
                placeholder="If the page better matches the searcher's intent, qualified impressions and clicks should increase."
              />
            </Field>
            <Field label="Why should it happen?" wide>
              <Textarea
                value={draft.mechanism}
                onChange={(event) => set("mechanism", event.target.value)}
                className="min-h-20"
                placeholder="Explain the causal mechanism—not merely the desired result."
              />
            </Field>
            <Field label="How does this create business value?" wide>
              <Textarea
                value={draft.businessLink}
                onChange={(event) => set("businessLink", event.target.value)}
                className="min-h-20"
                placeholder="Connect educational traffic to the commercial page, conversion path, or money keyword it is meant to support."
              />
            </Field>
            <Field label="Business outcome" wide>
              <Textarea
                value={draft.businessOutcome}
                onChange={(event) => set("businessOutcome", event.target.value)}
                className="min-h-20"
                placeholder="The valuable end state: qualified leads, purchases, pipeline, or support for a named commercial keyword cluster."
              />
            </Field>
            <Field label="Target keyword (optional)">
              <KeywordInput
                value={draft.keywordPhrase}
                onChange={(value) => set("keywordPhrase", value)}
                scope={{
                  siteId: site.id,
                  organizationId: site.organization_id,
                  pageId: draft.pageId || undefined,
                }}
                placeholder="emergency dentist seattle"
              />
            </Field>
          </FormSection>

          <FormSection
            number="3"
            title="Success definition"
            description="Choose the primary evidence and decision window before looking at results."
          >
            <Field label="Primary metric">
              <Select
                value={draft.metricKey}
                onValueChange={(value) => set("metricKey", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Expected direction">
              <Select
                value={draft.direction}
                onValueChange={(value) => set("direction", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">Increase</SelectItem>
                  <SelectItem value="decrease">Decrease</SelectItem>
                  <SelectItem value="maintain">Maintain</SelectItem>
                  <SelectItem value="reach">Reach a value</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Target change (%)">
              <Input
                type="number"
                value={draft.targetChangePct}
                onChange={(event) => set("targetChangePct", event.target.value)}
              />
            </Field>
            <Field label="Target absolute value">
              <Input
                type="number"
                value={draft.targetValue}
                onChange={(event) => set("targetValue", event.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Baseline days">
              <Input
                type="number"
                min={1}
                max={365}
                value={draft.baselineDays}
                onChange={(event) => set("baselineDays", event.target.value)}
              />
            </Field>
            <Field label="Observation days">
              <Input
                type="number"
                min={1}
                max={365}
                value={draft.observationDays}
                onChange={(event) => set("observationDays", event.target.value)}
              />
            </Field>
            <Field label="Minimum data days">
              <Input
                type="number"
                min={1}
                max={365}
                value={draft.minimumDataDays}
                onChange={(event) => set("minimumDataDays", event.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection
            number="4"
            title="Implementation proof"
            description="Define what the next crawl must observe so doing the work is separate from measuring its effect."
          >
            <Field label="Verification target">
              <Select
                value={draft.fieldKind}
                onValueChange={(value) => set("fieldKind", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_KINDS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={
                requiresExpected
                  ? "Expected live value"
                  : "Expected value (optional)"
              }
              wide
            >
              <Input
                value={draft.expectedAfter}
                onChange={(event) => set("expectedAfter", event.target.value)}
                placeholder={
                  draft.fieldKind === "page_published"
                    ? "The next crawl will verify a successful HTTP response."
                    : "Exact title, canonical, status, or text fragment expected on the live page"
                }
              />
            </Field>
          </FormSection>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!canSave || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="mr-2 h-4 w-4" />
            )}
            Save experiment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({
  number: n,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-muted/10 p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {n}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", wide && "sm:col-span-2")}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={tone}>{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function OverviewTab({
  bundle,
  brandId,
}: {
  bundle: SeoChangeBundle;
  brandId: string;
}) {
  const { change, theories } = bundle;
  return (
    <div className="grid gap-3 p-4 lg:grid-cols-2">
      <SectionCard title="Intervention" className="lg:col-span-2">
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Status">
            <StatusPill value={change.status} />
          </Detail>
          <Detail label="Change type">{titleCase(change.change_kind)}</Detail>
          <Detail label="Confidence">{change.confidence}%</Detail>
          <Detail label="Deployed">{formatDate(change.deployed_at)}</Detail>
          <Detail label="What changed" wide>
            {change.summary || "No summary recorded."}
          </Detail>
          <Detail label="Why" wide>
            {change.rationale}
          </Detail>
          <Detail label="Business outcome" wide>
            {change.business_outcome}
          </Detail>
          {change.primary_page_id ? (
            <Detail label="Canonical page" wide>
              <EntityRef
                token="web_page"
                id={change.primary_page_id}
                name="Open page workspace"
                href={marketingRoutes.sitePage(
                  brandId,
                  change.site_id,
                  change.primary_page_id,
                )}
                openInNewTab
                wrap
              />
            </Detail>
          ) : null}
        </dl>
      </SectionCard>
      <SectionCard title="Causal chain" className="lg:col-span-2">
        <div className="flex flex-wrap items-stretch gap-2 p-4 text-xs">
          <ChainNode label="Intervention" value={change.title} />
          <ArrowUpRight className="self-center text-muted-foreground" />
          <ChainNode
            label="Mechanism"
            value={theories[0]?.mechanism ?? "No theory recorded"}
          />
          <ArrowUpRight className="self-center text-muted-foreground" />
          <ChainNode
            label="SEO result"
            value={theories[0]?.hypothesis ?? "No expected result recorded"}
          />
          <ArrowUpRight className="self-center text-muted-foreground" />
          <ChainNode
            label="Business result"
            value={theories[0]?.business_link ?? change.business_outcome}
          />
        </div>
      </SectionCard>
    </div>
  );
}

function Detail({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(wide && "sm:col-span-2 lg:col-span-4")}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">{children}</dd>
    </div>
  );
}

function ChainNode({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[180px] flex-1 rounded-lg border bg-background p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
        {label}
      </p>
      <p className="mt-1 leading-relaxed">{value}</p>
    </div>
  );
}

function TheoriesTab({
  bundle,
  brandId,
}: {
  bundle: SeoChangeBundle;
  brandId: string;
}) {
  const openKeyword = useOpenKeywordWindow();
  return (
    <div className="space-y-3 p-4">
      {bundle.theories.map((theory, index) => {
        const phrase = theory.keyword_id
          ? bundle.keywordPhrases[theory.keyword_id]
          : null;
        const metrics = bundle.metrics.filter(
          (metric) => metric.theory_id === theory.id,
        );
        return (
          <SectionCard
            key={theory.id}
            title={`Theory ${index + 1}: ${theory.title}`}
          >
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <div className="space-y-3">
                <Detail label="Verdict">
                  <StatusPill value={theory.status} />
                </Detail>
                <Detail label="Hypothesis">{theory.hypothesis}</Detail>
                <Detail label="Mechanism">{theory.mechanism}</Detail>
                <Detail label="Business link">{theory.business_link}</Detail>
              </div>
              <div className="space-y-3">
                {phrase ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Keyword
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 h-8"
                      onClick={() =>
                        openKeyword({
                          phrase,
                          organizationId: theory.organization_id,
                          siteId: theory.site_id,
                          pageId: theory.page_id ?? undefined,
                          brandId,
                        })
                      }
                    >
                      {phrase}
                      <Target className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
                {theory.page_id ? (
                  <EntityRef
                    token="web_page"
                    id={theory.page_id}
                    name="Open theory page"
                    href={marketingRoutes.sitePage(
                      brandId,
                      theory.site_id,
                      theory.page_id,
                    )}
                    openInNewTab
                  />
                ) : null}
                <div className="space-y-2">
                  {metrics.map((metric) => (
                    <div
                      key={metric.id}
                      className="rounded-lg border p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{metric.label}</span>
                        {metric.is_primary ? (
                          <Badge variant="info">Primary</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {titleCase(metric.direction)} ·{" "}
                        {metric.target_change_pct !== null
                          ? `${metric.target_change_pct}% target`
                          : `target ${number(metric.target_value, 2)}`}{" "}
                        · {metric.baseline_days}d baseline /{" "}
                        {metric.observation_days}d observation
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}

function ImplementationItem({
  item,
  onChanged,
  brandId,
}: {
  item: SeoChangeItem;
  onChanged: () => void;
  brandId: string;
}) {
  const [note, setNote] = useState(item.notes ?? "");
  const verify = useMutation({
    mutationFn: (status: "matched" | "mismatch") =>
      verifySeoChangeItemManually(item, status, note),
    onSuccess: () => {
      toast.success("Verification recorded");
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{item.label}</p>
          <p className="text-xs text-muted-foreground">
            {titleCase(item.field_kind)} · verified by{" "}
            {item.verification_method}
          </p>
        </div>
        <StatusPill value={item.verification_status} />
      </div>
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="font-medium text-muted-foreground">
            Expected live value
          </p>
          <p className="mt-1 break-words">
            {item.expected_after || "Presence or change is sufficient"}
          </p>
        </div>
        <div>
          <p className="font-medium text-muted-foreground">
            Observed live value
          </p>
          <p className="mt-1 max-h-28 overflow-auto break-words">
            {item.observed_after || "Waiting for a crawl or manual check"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <EntityRef
          token="web_page"
          id={item.page_id}
          name="Open page"
          href={marketingRoutes.sitePage(brandId, item.site_id, item.page_id)}
          openInNewTab
        />
        {item.source_snapshot_id ? (
          <Link
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            target="_blank"
            href={`${marketingRoutes.sitePage(brandId, item.site_id, item.page_id)}/snapshots/${item.source_snapshot_id}`}
          >
            Open evidence snapshot
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Manual verification note"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={verify.isPending}
          onClick={() => verify.mutate("mismatch")}
        >
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          Mismatch
        </Button>
        <Button
          size="sm"
          disabled={verify.isPending}
          onClick={() => verify.mutate("matched")}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Matches
        </Button>
      </div>
    </div>
  );
}

function ImplementationTab({
  bundle,
  brandId,
  onChanged,
}: {
  bundle: SeoChangeBundle;
  brandId: string;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-3 p-4">
      {bundle.items.map((item) => (
        <ImplementationItem
          key={item.id}
          item={item}
          brandId={brandId}
          onChanged={onChanged}
        />
      ))}
      {bundle.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No implementation checks were defined.
        </p>
      ) : null}
    </div>
  );
}

function EvidenceCard({
  bundle,
  theory,
  metric,
  onChanged,
}: {
  bundle: SeoChangeBundle;
  theory: SeoChangeTheory;
  metric: SeoChangeMetric;
  onChanged: () => void;
}) {
  const phrase = theory.keyword_id
    ? (bundle.keywordPhrases[theory.keyword_id] ?? null)
    : null;
  const evidence = useQuery({
    queryKey: [
      "marketing",
      "seo-change-evidence",
      bundle.change.id,
      metric.id,
      bundle.change.deployed_at,
    ],
    queryFn: ({ signal }) =>
      getMetricEvidence(bundle.change, metric, theory, phrase, signal),
    enabled: Boolean(
      bundle.change.deployed_at && ["gsc", "ga4"].includes(metric.data_source),
    ),
  });
  const [note, setNote] = useState("");
  const assess = useMutation({
    mutationFn: (value: MetricEvidence) =>
      recordMetricAssessment(bundle, theory, value, note),
    onSuccess: () => {
      toast.success("Assessment snapshot recorded");
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });

  if (!bundle.change.deployed_at)
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Add a deployment time before measuring {metric.label}.
      </div>
    );
  if (!["gsc", "ga4"].includes(metric.data_source))
    return (
      <ManualEvidenceCard
        bundle={bundle}
        theory={theory}
        metric={metric}
        onChanged={onChanged}
      />
    );
  if (evidence.isLoading)
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading {metric.label} evidence…
      </div>
    );
  if (evidence.isError)
    return (
      <InlineQueryError
        what={metric.label}
        error={evidence.error}
        onRetry={() => void evidence.refetch()}
      />
    );
  const value = evidence.data;
  if (!value) return null;
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{metric.label}</p>
          <p className="text-xs text-muted-foreground">
            {value.baselineStart}–{value.baselineEnd} vs{" "}
            {value.observationStart}–{value.observationEnd}
          </p>
        </div>
        <StatusPill value={value.verdict} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <EvidenceValue
          label="Baseline"
          value={number(value.baselineValue, 2)}
        />
        <EvidenceValue
          label="Observed"
          value={number(value.observedValue, 2)}
        />
        <EvidenceValue
          label="Change"
          value={percent(value.deltaPct)}
          tone={
            (value.deltaPct ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"
          }
        />
      </div>
      {value.normalizedPerDay ? (
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">
          Values are normalized per day so an incomplete observation window is
          compared fairly with the full baseline.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Decision rule: {titleCase(metric.direction)}{" "}
        {metric.target_change_pct !== null
          ? `by ${metric.target_change_pct}%`
          : `to ${number(metric.target_value, 2)}`}
        ; minimum {metric.minimum_data_days} data days. {value.dataDays}{" "}
        collected.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Interpretation or confounders"
        />
        <Button
          size="sm"
          disabled={assess.isPending}
          onClick={() => assess.mutate(value)}
        >
          Record assessment
        </Button>
      </div>
    </div>
  );
}

function ManualEvidenceCard({
  bundle,
  theory,
  metric,
  onChanged,
}: {
  bundle: SeoChangeBundle;
  theory: SeoChangeTheory;
  metric: SeoChangeMetric;
  onChanged: () => void;
}) {
  const [baseline, setBaseline] = useState("");
  const [observed, setObserved] = useState("");
  const [note, setNote] = useState("");
  const [verdict, setVerdict] =
    useState<MetricEvidence["verdict"]>("inconclusive");
  const deploymentDay = bundle.change.deployed_at?.slice(0, 10) ?? "";
  const dayBefore = deploymentDay
    ? new Date(`${deploymentDay}T12:00:00Z`)
    : null;
  dayBefore?.setUTCDate(dayBefore.getUTCDate() - 1);
  const baselineStart = deploymentDay
    ? new Date(`${deploymentDay}T12:00:00Z`)
    : null;
  baselineStart?.setUTCDate(baselineStart.getUTCDate() - metric.baseline_days);
  const baselineValue = baseline.trim() ? Number(baseline) : null;
  const observedValue = observed.trim() ? Number(observed) : null;
  const delta =
    baselineValue === null || observedValue === null
      ? null
      : observedValue - baselineValue;
  const deltaPct =
    delta === null || baselineValue === null || baselineValue === 0
      ? null
      : (delta / Math.abs(baselineValue)) * 100;
  const save = useMutation({
    mutationFn: () =>
      recordMetricAssessment(
        bundle,
        theory,
        {
          metric,
          baselineStart: baselineStart?.toISOString().slice(0, 10) ?? "",
          baselineEnd: dayBefore?.toISOString().slice(0, 10) ?? "",
          observationStart: deploymentDay,
          observationEnd: new Date().toISOString().slice(0, 10),
          baselineValue,
          observedValue,
          delta,
          deltaPct,
          verdict,
          dataDays: Math.max(
            1,
            Math.floor(
              (Date.now() - new Date(`${deploymentDay}T12:00:00Z`).getTime()) /
                86_400_000,
            ) + 1,
          ),
          normalizedPerDay: false,
        },
        note,
      ),
    onSuccess: () => {
      toast.success("Manual assessment recorded");
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{metric.label}</p>
          <p className="text-xs text-muted-foreground">
            {titleCase(metric.data_source)} evidence · manual observation
          </p>
        </div>
        <StatusPill value={verdict} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Baseline value">
          <Input
            type="number"
            value={baseline}
            onChange={(event) => setBaseline(event.target.value)}
          />
        </Field>
        <Field label="Observed value">
          <Input
            type="number"
            value={observed}
            onChange={(event) => setObserved(event.target.value)}
          />
        </Field>
        <Field label="Verdict">
          <Select
            value={verdict}
            onValueChange={(value) =>
              setVerdict(value as MetricEvidence["verdict"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="supported">Supported</SelectItem>
              <SelectItem value="refuted">Refuted</SelectItem>
              <SelectItem value="inconclusive">Inconclusive</SelectItem>
              <SelectItem value="too_early">Too early</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Source, interpretation, and known confounders"
        />
        <Button
          size="sm"
          disabled={save.isPending || !deploymentDay}
          onClick={() => save.mutate()}
        >
          Record assessment
        </Button>
      </div>
    </div>
  );
}

function EvidenceValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone)}>
        {value}
      </p>
    </div>
  );
}

function ResultsTab({
  bundle,
  onChanged,
}: {
  bundle: SeoChangeBundle;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-3 p-4">
      {bundle.metrics.map((metric) => {
        const theory = bundle.theories.find(
          (item) => item.id === metric.theory_id,
        );
        return theory ? (
          <EvidenceCard
            key={metric.id}
            bundle={bundle}
            theory={theory}
            metric={metric}
            onChanged={onChanged}
          />
        ) : null;
      })}
      {bundle.metrics.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No success metrics were defined.
        </p>
      ) : null}
    </div>
  );
}

function TimelineTab({
  bundle,
  brandId,
}: {
  bundle: SeoChangeBundle;
  brandId: string;
}) {
  return (
    <div className="space-y-0 p-4">
      {bundle.events.map((event, index) => (
        <div key={event.id} className="relative flex gap-3 pb-5">
          {index < bundle.events.length - 1 ? (
            <div className="absolute left-[11px] top-6 h-full w-px bg-border" />
          ) : null}
          <div className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background">
            <GitCommitHorizontal className="h-3 w-3" />
          </div>
          <div className="min-w-0 flex-1 rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{event.title}</p>
              <span className="text-[11px] text-muted-foreground">
                {formatDate(event.occurred_at)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
              <Badge variant="outline">{event.source}</Badge>
              {event.source_snapshot_id && bundle.change.primary_page_id ? (
                <Link
                  target="_blank"
                  className="text-primary hover:underline"
                  href={`${marketingRoutes.sitePage(brandId, event.site_id, bundle.change.primary_page_id)}/snapshots/${event.source_snapshot_id}`}
                >
                  Evidence snapshot
                </Link>
              ) : null}
              {event.source_crawl_session_id ? (
                <Link
                  target="_blank"
                  className="text-primary hover:underline"
                  href={`${marketingRoutes.site(brandId, event.site_id)}/crawls/${event.source_crawl_session_id}`}
                >
                  Source crawl
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ))}
      {bundle.events.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No milestones have been recorded.
        </p>
      ) : null}
    </div>
  );
}

function AssessmentsTab({ bundle }: { bundle: SeoChangeBundle }) {
  return (
    <div className="space-y-3 p-4">
      {bundle.assessments.map((assessment) => (
        <div key={assessment.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <StatusPill value={assessment.verdict} />
            <span className="text-[11px] text-muted-foreground">
              {formatDate(assessment.assessed_at)}
            </span>
          </div>
          <p className="mt-2 text-sm">
            {assessment.evidence_note || "No interpretation note was recorded."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Baseline {number(assessment.baseline_value, 2)} → observed{" "}
            {number(assessment.observed_value, 2)} (
            {percent(assessment.delta_pct)})
          </p>
        </div>
      ))}
      {bundle.assessments.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No frozen assessments yet. The live Results tab can create the first
          one without rewriting history.
        </p>
      ) : null}
    </div>
  );
}

function ChangeDetail({
  changeId,
  brandId,
}: {
  changeId: string;
  brandId: string;
}) {
  const queryClient = useQueryClient();
  const bundle = useQuery({
    queryKey: key.detail(changeId),
    queryFn: ({ signal }) => getSeoChangeBundle(changeId, signal),
  });
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: key.detail(changeId) });
    void queryClient.invalidateQueries({
      queryKey: ["marketing", "seo-changes"],
    });
  };
  if (bundle.isLoading)
    return <LoadingSurface label="Loading the complete change record…" />;
  if (bundle.isError || !bundle.data)
    // "Change not found" was a guess. A zero-row read is equally a denial or a
    // stale link, and the platform can tell the difference.
    return (
      <AccessGate
        token="seo_change_set"
        id={changeId}
        error={bundle.error}
        onRetry={() => void bundle.refetch()}
      />
    );
  return (
    <Tabs
      defaultValue="overview"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="shrink-0 border-b px-4 py-2">
        <TabsList className="h-8">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="theories">Theories</TabsTrigger>
          <TabsTrigger value="implementation">Implementation</TabsTrigger>
          <TabsTrigger value="results">Live results</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview" className="min-h-0 flex-1 overflow-auto">
        <OverviewTab bundle={bundle.data} brandId={brandId} />
      </TabsContent>
      <TabsContent value="theories" className="min-h-0 flex-1 overflow-auto">
        <TheoriesTab bundle={bundle.data} brandId={brandId} />
      </TabsContent>
      <TabsContent
        value="implementation"
        className="min-h-0 flex-1 overflow-auto"
      >
        <ImplementationTab
          bundle={bundle.data}
          brandId={brandId}
          onChanged={changed}
        />
      </TabsContent>
      <TabsContent value="results" className="min-h-0 flex-1 overflow-auto">
        <ResultsTab bundle={bundle.data} onChanged={changed} />
      </TabsContent>
      <TabsContent value="assessments" className="min-h-0 flex-1 overflow-auto">
        <AssessmentsTab bundle={bundle.data} />
      </TabsContent>
      <TabsContent value="timeline" className="min-h-0 flex-1 overflow-auto">
        <TimelineTab bundle={bundle.data} brandId={brandId} />
      </TabsContent>
    </Tabs>
  );
}

function ChangeEdit({
  changeId,
  onChanged,
}: {
  changeId: string;
  onChanged: () => void;
}) {
  const bundle = useQuery({
    queryKey: key.detail(changeId),
    queryFn: ({ signal }) => getSeoChangeBundle(changeId, signal),
  });
  if (!bundle.data) return <LoadingSurface label="Loading edit controls…" />;
  return (
    <ChangeEditForm
      key={bundle.data.change.updated_at}
      changeId={changeId}
      initialStatus={bundle.data.change.status}
      initialDeployedAt={bundle.data.change.deployed_at?.slice(0, 16) ?? ""}
      onChanged={onChanged}
    />
  );
}

function ChangeEditForm({
  changeId,
  initialStatus,
  initialDeployedAt,
  onChanged,
}: {
  changeId: string;
  initialStatus: string;
  initialDeployedAt: string;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [deployedAt, setDeployedAt] = useState(initialDeployedAt);
  const save = useMutation({
    mutationFn: () =>
      updateSeoChange(changeId, {
        status,
        deployed_at: deployedAt ? new Date(deployedAt).toISOString() : null,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      }),
    onSuccess: () => {
      toast.success("Change updated");
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });
  return (
    <div className="mx-auto grid max-w-xl gap-5 overflow-auto p-6">
      <div>
        <h3 className="font-semibold">Measurement state</h3>
        <p className="text-sm text-muted-foreground">
          Status and deployment timing change the experiment timeline and when
          crawl verification starts.
        </p>
      </div>
      <Field label="Status">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {titleCase(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Deployment time">
        <Input
          type="datetime-local"
          value={deployedAt}
          onChange={(event) => setDeployedAt(event.target.value)}
        />
      </Field>
      <Button
        disabled={
          save.isPending ||
          (["deployed", "measuring", "completed", "rolled_back"].includes(
            status,
          ) &&
            !deployedAt)
        }
        onClick={() => save.mutate()}
      >
        {save.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Save state
      </Button>
    </div>
  );
}

function UntrackedTable({
  rows,
  brandId,
  onDocument,
}: {
  rows: UntrackedSnapshotChange[];
  brandId: string;
  onDocument: (row: UntrackedSnapshotChange) => void;
}) {
  const { site } = useMarketingSite();
  const columns = useMemo<MatrxColumnDef<UntrackedSnapshotChange>[]>(
    () => [
      {
        id: "page",
        header: "Page",
        accessorFn: (row) => row.page_path ?? row.page_url,
        cell: (row) => row.page_path || row.page_url || "Unknown page",
        entityToken: "web_page",
        entityId: (row) => row.page_id,
        href: (row) =>
          marketingRoutes.sitePage(brandId, row.site_id, row.page_id),
        width: 320,
      },
      {
        id: "changed_fields",
        header: "Observed change",
        accessorFn: (row) => row.changed_fields?.join(", ") ?? "",
        cell: (row) => (
          <div className="flex flex-wrap gap-1">
            {row.changed_fields?.map((field) => (
              <Badge key={field} variant="outline">
                {titleCase(field)}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "captured_at",
        header: "Observed",
        cell: (row) => formatDate(row.captured_at),
        width: 180,
      },
    ],
    [brandId],
  );
  return (
    <MatrxDataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      pageSize={25}
      toolbar={{ searchPlaceholder: "Search untracked pages or change types…" }}
      copy={{
        label: "Untracked page change",
        listLabel: "Untracked page changes",
        location: webLocation(
          `SEO change tracking — ${site.root_url} — Untracked`,
        ),
        rowKind: "web-untracked-page-change",
        listKind: "web-untracked-page-changes",
        humanRow: (row) =>
          humanLines([
            ["Page", row.page_path || row.page_url || row.page_id],
            ["Observed change", row.changed_fields?.map(titleCase).join(", ")],
            ["Observed", formatDate(row.captured_at)],
          ]),
      }}
      rowActions={(row) => (
        <Button size="sm" className="h-7" onClick={() => onDocument(row)}>
          <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
          Document
        </Button>
      )}
      emptyState={{
        icon: <SearchCheck className="h-8 w-8 text-emerald-500" />,
        title: "No unexplained crawl changes",
        description:
          "Every recent observed page change is associated with a documented intervention.",
      }}
    />
  );
}

export function SeoChangeTrackingWorkspace() {
  const { site } = useMarketingSite();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"tracked" | "untracked">("tracked");
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("change"),
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [seed, setSeed] = useState<ComposerSeed>({});
  const changes = useQuery({
    queryKey: key.changes(site.id),
    queryFn: ({ signal }) => listSeoChanges(site.id, signal),
  });
  const pages = useQuery({
    queryKey: key.pages(site.id),
    queryFn: ({ signal }) => listSeoPages(site.id, signal),
  });
  const untracked = useQuery({
    queryKey: key.untracked(site.id),
    queryFn: ({ signal }) => listUntrackedChanges(site.id, signal),
  });
  const create = useMutation({
    mutationFn: createSeoChange,
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key.changes(site.id) }),
        queryClient.invalidateQueries({ queryKey: key.untracked(site.id) }),
      ]);
      setSelectedId(id);
      toast.success("SEO experiment documented");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : String(error)),
  });
  const rows = changes.data ?? [];
  // The parent site layout rejects a route whose site has no matching brand;
  // this workspace therefore always runs inside a brand-owned site.
  const brandId = site.brand_id as string;

  const columns = useMemo<MatrxColumnDef<SeoChangeSummary>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Change",
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.business_outcome}
            </p>
          </div>
        ),
        width: 300,
      },
      {
        accessorKey: "status",
        header: "Status",
        filter: "select",
        filterOptions: STATUS_OPTIONS.map((value) => ({
          value,
          label: titleCase(value),
        })),
        cell: (row) => <StatusPill value={row.status} />,
        width: 130,
      },
      {
        accessorKey: "change_kind",
        header: "Type",
        filter: "select",
        filterOptions: CHANGE_KINDS.map(([value, label]) => ({ value, label })),
        cell: (row) => titleCase(row.change_kind),
        width: 145,
      },
      {
        id: "page",
        header: "Page",
        accessorFn: (row) =>
          row.primary_page_path ?? row.primary_page_url ?? "",
        cell: (row) =>
          row.primary_page_path || row.primary_page_url || "Site-wide",
        entityToken: (row) => (row.primary_page_id ? "web_page" : undefined),
        entityId: (row) => row.primary_page_id ?? undefined,
        href: (row) =>
          row.primary_page_id
            ? marketingRoutes.sitePage(
                brandId,
                row.site_id,
                row.primary_page_id,
              )
            : undefined,
        width: 220,
      },
      {
        id: "theories",
        header: "Theories",
        accessorFn: (row) => row.theory_count ?? 0,
        cell: (row) => (
          <span className="tabular-nums">
            {row.theory_count ?? 0}{" "}
            <span className="text-emerald-600">
              ✓{row.supported_theory_count ?? 0}
            </span>{" "}
            <span className="text-destructive">
              ×{row.refuted_theory_count ?? 0}
            </span>
          </span>
        ),
        width: 110,
      },
      {
        id: "implementation",
        header: "Implementation",
        accessorFn: (row) =>
          row.item_count
            ? ((row.verified_item_count ?? 0) / row.item_count) * 100
            : 0,
        cell: (row) => (
          <div className="min-w-24">
            <div className="flex justify-between text-[11px]">
              <span>
                {row.verified_item_count ?? 0}/{row.item_count ?? 0}
              </span>
              {(row.mismatched_item_count ?? 0) > 0 ? (
                <span className="text-destructive">
                  {row.mismatched_item_count} mismatch
                </span>
              ) : null}
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{
                  width: `${row.item_count ? ((row.verified_item_count ?? 0) / row.item_count) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ),
        width: 150,
      },
      {
        accessorKey: "deployed_at",
        header: "Deployed",
        cell: (row) => formatDateOnly(row.deployed_at),
        width: 130,
      },
      {
        accessorKey: "last_assessed_at",
        header: "Last assessed",
        cell: (row) => formatDateOnly(row.last_assessed_at),
        width: 140,
      },
    ],
    [brandId],
  );

  const active = rows.filter(
    (row) => !["completed", "cancelled", "rolled_back"].includes(row.status),
  ).length;
  const measuring = rows.filter(
    (row) => row.status === "measuring" || row.status === "deployed",
  ).length;
  const mismatches = rows.reduce(
    (sum, row) => sum + (row.mismatched_item_count ?? 0),
    0,
  );
  const supported = rows.reduce(
    (sum, row) => sum + (row.supported_theory_count ?? 0),
    0,
  );
  const selected = selectedId
    ? rows.find((row) => row.id === selectedId)
    : null;

  function startNew(nextSeed: ComposerSeed = {}) {
    setSeed(nextSeed);
    setComposerOpen(true);
  }
  function documentObserved(row: UntrackedSnapshotChange) {
    const fields = row.changed_fields ?? [];
    const kind = fields.includes("structured_data")
      ? "structured_data"
      : fields.includes("media")
        ? "media"
        : fields.includes("metadata")
          ? "metadata"
          : "content";
    const fieldKind = fields.includes("metadata")
      ? "title"
      : fields.includes("structured_data")
        ? "structured_data"
        : fields.includes("media")
          ? "image"
          : "content_changed";
    startNew({
      pageId: row.page_id,
      title: `Explain ${fields.join(" + ")} update`,
      changeKind: kind,
      deployedAt: row.captured_at?.slice(0, 16) ?? "",
      fieldKind,
      observedSnapshot: row,
    });
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi
          icon={<FlaskConical className="h-4 w-4" />}
          label="Active theories"
          value={active}
          detail="Planned, underway, or measuring"
        />
        <Kpi
          icon={<Clock3 className="h-4 w-4" />}
          label="Measuring now"
          value={measuring}
          detail="Deployed interventions collecting evidence"
          tone="text-amber-500"
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Supported"
          value={supported}
          detail="Theory assessments supporting the prediction"
          tone="text-emerald-500"
        />
        <Kpi
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Mismatches"
          value={mismatches}
          detail="Live implementation differs from the plan"
          tone="text-destructive"
        />
        <Kpi
          icon={<CircleDashed className="h-4 w-4" />}
          label="Untracked changes"
          value={untracked.data?.length ?? 0}
          detail="Observed crawl milestones missing intent"
          tone="text-amber-500"
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b">
        <button
          type="button"
          onClick={() => setView("tracked")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium",
            view === "tracked"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground",
          )}
        >
          Change experiments
        </button>
        <button
          type="button"
          onClick={() => setView("untracked")}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium",
            view === "untracked"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground",
          )}
        >
          Untracked crawl changes{" "}
          {untracked.data?.length ? (
            <Badge variant="warning" className="ml-1">
              {untracked.data.length}
            </Badge>
          ) : null}
        </button>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              void changes.refetch();
              void untracked.refetch();
            }}
            disabled={changes.isFetching || untracked.isFetching}
          >
            <RefreshCw
              className={cn(
                "mr-1.5 h-3.5 w-3.5",
                (changes.isFetching || untracked.isFetching) && "animate-spin",
              )}
            />
            Refresh
          </Button>
          <Button size="sm" className="h-8" onClick={() => startNew()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New change
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "tracked" ? (
          changes.isError ? (
            <QueryError
              error={changes.error}
              onRetry={() => void changes.refetch()}
            />
          ) : (
            <MatrxDataTable
              data={rows}
              columns={columns}
              getRowId={(row) => row.id}
              isLoading={changes.isLoading}
              isFetching={changes.isFetching}
              pageSize={25}
              selectedId={selectedId}
              onSelectedIdChange={setSelectedId}
              onRowOpen={(row) => setSelectedId(row.id)}
              detail={{ enabled: false }}
              toolbar={{
                searchPlaceholder:
                  "Search changes, outcomes, pages, status, or type…",
              }}
              copy={{
                label: "SEO change",
                listLabel: "SEO change experiments",
                location: `${site.root_url} SEO change tracking`,
                rowKind: "seo-change",
                listKind: "seo-change-list",
                humanRow: (row) =>
                  `${row.title}\n${row.business_outcome ?? ""}\nStatus: ${row.status}`,
              }}
              emptyState={{
                icon: (
                  <FlaskConical className="h-9 w-9 text-muted-foreground" />
                ),
                title: "No SEO changes documented yet",
                description:
                  "Create the first theory-backed intervention before the next website update.",
                action: (
                  <Button size="sm" onClick={() => startNew()}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Document first change
                  </Button>
                ),
              }}
            />
          )
        ) : untracked.isError ? (
          <QueryError
            error={untracked.error}
            onRetry={() => void untracked.refetch()}
          />
        ) : untracked.isLoading ? (
          <LoadingSurface label="Finding unexplained crawl changes…" />
        ) : (
          <UntrackedTable
            rows={untracked.data ?? []}
            brandId={brandId}
            onDocument={documentObserved}
          />
        )}
      </div>

      {composerOpen ? (
        <ChangeComposer
          open
          onOpenChange={setComposerOpen}
          pages={pages.data ?? []}
          seed={seed}
          onCreated={async (input) => {
            await create.mutateAsync(input);
          }}
        />
      ) : null}
      {selectedId ? (
        <DataRowWindow
          isOpen
          onClose={() => setSelectedId(null)}
          title={selected?.title ?? "SEO change"}
          row={{ id: selectedId }}
          width={1120}
          height={760}
          windowId={`seo-change-${selectedId}`}
          defaultTab="view"
          viewContent={<ChangeDetail changeId={selectedId} brandId={brandId} />}
          editContent={
            <ChangeEdit
              changeId={selectedId}
              onChanged={() => {
                void queryClient.invalidateQueries({
                  queryKey: key.detail(selectedId),
                });
                void queryClient.invalidateQueries({
                  queryKey: key.changes(site.id),
                });
              }}
            />
          }
        />
      ) : null}
    </main>
  );
}
