"use client";

/**
 * Canonical renderers for the commerce pipeline kinds.
 *
 * The shapes are Python-owned (`aidream/aidream/kinds/commerce.py`) and the
 * payload types are generated from the live kind registry. Every renderer
 * accepts the uniform streaming bridge or a bare nested value and reads every
 * field defensively. Shared chrome is presentation only; each registered
 * shape has exactly one named renderer below.
 */

import React from "react";
import {
  BadgeCheck,
  Boxes,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FilePenLine,
  Microscope,
  PackageSearch,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";
import { KindPanel } from "@/components/kind-kit/KindPanel";
import { KindPanelGrid } from "@/components/kind-kit/KindPanelGrid";
import { TagList } from "@/components/kind-kit/TagList";
import {
  readSearchKindValue,
  strings,
  text,
} from "../search-kinds/search-kind-data";

interface CommerceBlockProps {
  serverData?: unknown;
  className?: string;
}

function humanize(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "Not supplied";
}

function percent(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : null;
}

function money(value: unknown, currency = "USD"): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value)
    : null;
}

function plainHtml(value: string | null): string | null {
  return (
    value
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

function CommerceShell({
  slug,
  title,
  subtitle,
  icon,
  value,
  isComplete,
  stats,
  className,
  children,
}: {
  slug: string;
  title: string;
  subtitle?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  value: object;
  isComplete: boolean;
  stats?: { label: string; value: React.ReactNode }[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-kind-renderer={slug}
      className={cn(
        "my-3 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <KindHeaderBar
        icon={icon}
        title={title}
        subtitle={subtitle}
        stats={stats}
        streaming={!isComplete}
        copy={{
          label: title,
          human: () => JSON.stringify(value, null, 2),
          json: () => value,
          agent: () => ({
            kind: slug,
            location: "AI Matrx commerce kind renderer",
            description: `One ${slug} output from the commerce pipeline.`,
            data: value,
          }),
        }}
      />
      {children}
    </section>
  );
}

function StatusPill({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        tone === "good" && "border-success/40 bg-success/10 text-success",
        tone === "warn" && "border-warning/40 bg-warning/10 text-warning",
        tone === "bad" &&
          "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {humanize(value)}
    </span>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/40 px-2.5 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">
        {children ?? "—"}
      </dd>
    </div>
  );
}

function Narrative({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
  );
}

export function IntakePhotoGroupingBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"intake_photo_grouping">(serverData);
  const groups = value.groups ?? [];
  const unassigned = strings(value.unassignable_photo_ids);
  return (
    <CommerceShell
      slug="intake_photo_grouping"
      title="Photo grouping"
      subtitle="Every intake photo is accounted for."
      icon={Camera}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "groups", value: groups.length },
        { label: "unassigned", value: unassigned.length },
      ]}
      className={className}
    >
      <KindPanelGrid minColumnWidth={250}>
        {groups.map((group, index) => (
          <KindPanel
            key={index}
            title={
              group.suspected_lot
                ? `Suspected lot ${index + 1}`
                : `Item group ${index + 1}`
            }
            count={(group.photo_ids ?? []).length}
            subline={`${humanize(text(group.boundary_source))} boundary${percent(group.boundary_confidence) ? ` · ${percent(group.boundary_confidence)} confidence` : ""}`}
          >
            <TagList
              items={(group.photo_ids ?? []).map((id) => ({ label: id }))}
            />
          </KindPanel>
        ))}
      </KindPanelGrid>
      {unassigned.length > 0 && (
        <KindPanel
          title="Needs assignment"
          icon={TriangleAlert}
          count={unassigned.length}
        >
          <TagList items={unassigned.map((label) => ({ label }))} />
        </KindPanel>
      )}
      <Narrative>{text(value.reasoning)}</Narrative>
    </CommerceShell>
  );
}

export function ItemVisionExtractionBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"item_vision_extraction">(serverData);
  const products = value.products ?? [];
  return (
    <CommerceShell
      slug="item_vision_extraction"
      title="Vision extraction"
      subtitle={
        text(value.status_notes) ??
        `${value.image_count_received ?? 0} photos inspected`
      }
      icon={ScanSearch}
      value={value}
      isComplete={isComplete}
      stats={[{ label: "products", value: products.length }]}
      className={className}
    >
      <div className="flex flex-wrap gap-2">
        <StatusPill
          value={value.status ?? "processing"}
          tone={value.status === "complete" ? "good" : "warn"}
        />
      </div>
      <KindPanelGrid minColumnWidth={280}>
        {products.map((product, index) => {
          const identity = product.identification;
          const unseen = product.unseen ?? [];
          return (
            <KindPanel
              key={product.product_index ?? index}
              title={text(identity?.summary) ?? `Product ${index + 1}`}
              count={(product.image_indices ?? []).length}
              subline={text(product.analyst_notes)}
            >
              <dl className="grid gap-2 sm:grid-cols-2">
                <Fact label="Category">
                  {text(identity?.category) ?? "Unknown"}
                </Fact>
                <Fact label="Quantity">
                  {humanize(text(product.quantity?.unit_type))}
                </Fact>
                <Fact label="Brand">
                  {text(identity?.brand?.value) ?? "Not resolved"}
                </Fact>
                <Fact label="Model">
                  {text(identity?.model_name?.value) ?? "Not resolved"}
                </Fact>
              </dl>
              {unseen.length > 0 && (
                <div className="mt-2">
                  <TagList
                    items={unseen.map((item) => ({
                      label:
                        text(item.what_is_needed) ?? "Additional view needed",
                      meta: text(item.value_impact),
                    }))}
                  />
                </div>
              )}
            </KindPanel>
          );
        })}
      </KindPanelGrid>
    </CommerceShell>
  );
}

export function LotDetectionBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"lot_detection">(serverData);
  const range = value.quantity_estimate;
  const quantity = range
    ? `${range.min ?? "?"}–${range.max ?? "?"}`
    : "Not estimated";
  return (
    <CommerceShell
      slug="lot_detection"
      title={value.is_lot ? "Lot detected" : "Single item"}
      subtitle={text(value.notes)}
      icon={Boxes}
      value={value}
      isComplete={isComplete}
      stats={[{ label: "units", value: quantity }]}
      className={className}
    >
      <dl className="grid gap-2 sm:grid-cols-3">
        <Fact label="Composition">{humanize(text(value.unit_type))}</Fact>
        <Fact label="Estimated quantity">{quantity}</Fact>
        <Fact label="Derived during">{humanize(text(value.folded_from))}</Fact>
      </dl>
    </CommerceShell>
  );
}

export function ProductResearchBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"product_research">(serverData);
  const identity = value.identity;
  const specs = value.specs ?? [];
  return (
    <CommerceShell
      slug="product_research"
      title={text(identity?.product_name) ?? "Product research"}
      subtitle={
        text(identity?.manufacturer) ??
        (value.identity_unresolved ? "Identity unresolved" : undefined)
      }
      icon={PackageSearch}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "confidence", value: percent(value.confidence) ?? "—" },
        { label: "sources", value: (value.sources ?? []).length },
      ]}
      className={className}
    >
      <dl className="grid gap-2 sm:grid-cols-3">
        <Fact label="Part number">
          {text(identity?.part_number) ?? "Unresolved"}
        </Fact>
        <Fact label="Family">{text(identity?.family) ?? "Unresolved"}</Fact>
        <Fact label="Channel references">
          {(value.channel_refs ?? []).length}
        </Fact>
      </dl>
      {specs.length > 0 && (
        <KindPanel title="Sourced specifications" count={specs.length}>
          {specs.map((spec, index) => (
            <div
              key={`${spec.field ?? "spec"}-${index}`}
              className="border-b border-border py-2 last:border-0"
            >
              <div className="text-sm font-medium">
                {text(spec.field) ?? "Specification"}: {text(spec.value) ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                {text(spec.source)}
              </div>
            </div>
          ))}
        </KindPanel>
      )}
      <Narrative>{text(value.reasoning)}</Narrative>
    </CommerceShell>
  );
}

export function ValueAssessmentBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"value_assessment">(serverData);
  const estimate = value.estimated_value;
  const currency = text(estimate?.currency) ?? "USD";
  const range = estimate
    ? `${money(estimate.min, currency) ?? "?"}–${money(estimate.max, currency) ?? "?"}`
    : "No estimate";
  const unknowns = value.unknowns ?? [];
  return (
    <CommerceShell
      slug="value_assessment"
      title="Value assessment"
      subtitle={text(value.bucket_reasoning)}
      icon={Sparkles}
      value={value}
      isComplete={isComplete}
      stats={[{ label: "confidence", value: percent(value.confidence) ?? "—" }]}
      className={className}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          value={value.bucket ?? "unknown"}
          tone={
            value.bucket === "definite_value"
              ? "good"
              : value.bucket === "no_value"
                ? "bad"
                : "warn"
          }
        />
        {value.is_gem_candidate && (
          <StatusPill value="gem candidate" tone="good" />
        )}
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <Fact label="Estimated value">{range}</Fact>
        <Fact label="Basis">{text(estimate?.basis) ?? "Not supplied"}</Fact>
      </dl>
      {unknowns.length > 0 && (
        <KindPanel
          title="Value-changing unknowns"
          icon={TriangleAlert}
          count={unknowns.length}
        >
          {unknowns.map((unknown, index) => (
            <div
              key={`${unknown.field_key ?? "unknown"}-${index}`}
              className="border-b border-border py-2 text-sm last:border-0"
            >
              <div className="font-medium">
                {text(unknown.question) ?? "Unknown"}
              </div>
              <div className="text-xs text-muted-foreground">
                {humanize(text(unknown.value_impact))} impact · resolve by{" "}
                {humanize(text(unknown.resolution_method))}
              </div>
            </div>
          ))}
        </KindPanel>
      )}
      <Narrative>{text(value.reasoning)}</Narrative>
    </CommerceShell>
  );
}

export function AssetGradingBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"asset_grading">(serverData);
  const tests = value.test_results ?? [];
  return (
    <CommerceShell
      slug="asset_grading"
      title="Asset grading"
      subtitle={`Fulfilled by ${humanize(text(value.fulfillment_source))}`}
      icon={BadgeCheck}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "confidence", value: percent(value.confidence) ?? "—" },
        { label: "tests", value: tests.length },
      ]}
      className={className}
    >
      <dl className="grid gap-2 sm:grid-cols-4">
        <Fact label="Standard">{text(value.standard) ?? "—"}</Fact>
        <Fact label="Functional">
          {text(value.functional_grade) ?? "Not graded"}
        </Fact>
        <Fact label="Cosmetic">
          {text(value.cosmetic_grade) ?? "Not graded"}
        </Fact>
        <Fact label="Sanitization">
          {humanize(text(value.data_sanitization_status))}
        </Fact>
      </dl>
      {tests.length > 0 && (
        <KindPanel title="Bench tests" count={tests.length}>
          {tests.map((test, index) => (
            <div
              key={`${test.test ?? "test"}-${index}`}
              className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0"
            >
              <div>
                <div className="text-sm font-medium">
                  {humanize(text(test.test))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {text(test.notes)}
                </div>
              </div>
              <StatusPill
                value={test.outcome ?? "unknown"}
                tone={
                  test.outcome === "pass"
                    ? "good"
                    : test.outcome === "fail"
                      ? "bad"
                      : "warn"
                }
              />
            </div>
          ))}
        </KindPanel>
      )}
      <TagList
        items={strings(value.missing_components).map((label) => ({
          label: `Missing: ${label}`,
        }))}
      />
      <Narrative>{text(value.reasoning)}</Narrative>
    </CommerceShell>
  );
}

export function EnrichmentVerificationBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"enrichment_verification">(serverData);
  const resolved = value.resolved_unknowns ?? [];
  const changed = value.changed_conclusions ?? [];
  return (
    <CommerceShell
      slug="enrichment_verification"
      title="Enrichment verification"
      subtitle={text(value.unchanged_summary)}
      icon={CheckCircle2}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "resolved", value: resolved.length },
        { label: "changed", value: changed.length },
      ]}
      className={className}
    >
      <KindPanelGrid minColumnWidth={280}>
        <KindPanel title="Resolved unknowns" count={resolved.length}>
          {resolved.map((item, index) => (
            <div
              key={`${item.field_key ?? "answer"}-${index}`}
              className="border-b border-border py-2 last:border-0"
            >
              <div className="text-sm font-medium">{text(item.question)}</div>
              <div className="text-sm text-foreground">{text(item.answer)}</div>
              <div className="text-xs text-muted-foreground">
                Source: {humanize(text(item.answer_source))}
              </div>
            </div>
          ))}
        </KindPanel>
        <KindPanel title="Changed conclusions" count={changed.length}>
          {changed.map((item, index) => (
            <div
              key={`${item.field ?? "change"}-${index}`}
              className="border-b border-border py-2 last:border-0"
            >
              <div className="text-sm font-medium">
                {humanize(text(item.field))}: {text(item.was)} →{" "}
                {text(item.now)}
              </div>
              <div className="text-xs text-muted-foreground">
                {text(item.because)}
              </div>
            </div>
          ))}
        </KindPanel>
      </KindPanelGrid>
      {value.updated_value_assessment && (
        <ValueAssessmentBlock
          serverData={value.updated_value_assessment}
          className="my-0"
        />
      )}
      <Narrative>{text(value.reasoning)}</Narrative>
    </CommerceShell>
  );
}

export function PricingProposalBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"pricing_proposal">(serverData);
  const currency = text(value.price?.currency) ?? "USD";
  const evidence = value.evidence ?? [];
  return (
    <CommerceShell
      slug="pricing_proposal"
      title={money(value.price?.value, currency) ?? "Pricing proposal"}
      subtitle={text(value.reasoning)}
      icon={CircleDollarSign}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "confidence", value: percent(value.confidence) ?? "—" },
        { label: "evidence", value: evidence.length },
      ]}
      className={className}
    >
      <div className="flex flex-wrap gap-2">
        <StatusPill
          value={`${value.evidence_quality ?? "unknown"} evidence`}
          tone={value.evidence_quality === "strong" ? "good" : "warn"}
        />
      </div>
      <dl className="grid gap-2 sm:grid-cols-4">
        <Fact label="Range">
          {money(value.range?.min, currency)}–
          {money(value.range?.max, currency)}
        </Fact>
        <Fact label="Floor">
          {money(value.floor?.value, text(value.floor?.currency) ?? currency) ??
            "None"}
        </Fact>
        <Fact label="Auto accept">
          {money(value.best_offer?.auto_accept, currency) ?? "None"}
        </Fact>
        <Fact label="Days to sell">
          {value.expected_days_to_sell?.estimate ?? "—"}
        </Fact>
      </dl>
      {evidence.length > 0 && (
        <KindPanel title="Price evidence" count={evidence.length}>
          {evidence.map((item, index) => (
            <div
              key={`${item.ref ?? "evidence"}-${index}`}
              className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm last:border-0"
            >
              <StatusPill value={item.type ?? "evidence"} />
              <span className="min-w-0 flex-1 break-words">
                {text(item.ref)}
              </span>
              {item.weight && (
                <span className="text-xs text-muted-foreground">
                  {item.weight} weight
                </span>
              )}
            </div>
          ))}
        </KindPanel>
      )}
    </CommerceShell>
  );
}

export function ListingDraftBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"listing_draft">(serverData);
  const specifics = value.item_specifics ?? [];
  const needsHuman = value.needs_human ?? [];
  return (
    <CommerceShell
      slug="listing_draft"
      title={text(value.title) ?? "Listing draft"}
      subtitle={text(value.condition_statement)}
      icon={FilePenLine}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "confidence", value: percent(value.confidence) ?? "—" },
        { label: "specifics", value: specifics.length },
      ]}
      className={className}
    >
      <KindPanel title="Description">
        <Narrative>{plainHtml(text(value.description_html))}</Narrative>
      </KindPanel>
      <KindPanelGrid minColumnWidth={280}>
        <KindPanel title="Item specifics" count={specifics.length}>
          {specifics.map((item, index) => (
            <div
              key={`${item.aspect ?? "aspect"}-${index}`}
              className="border-b border-border py-2 last:border-0"
            >
              <div className="text-sm">
                <span className="font-medium">{text(item.aspect)}:</span>{" "}
                {text(item.value)}
              </div>
              <div className="text-xs text-muted-foreground">
                {text(item.source)}
              </div>
            </div>
          ))}
        </KindPanel>
        <KindPanel
          title="Needs human"
          icon={TriangleAlert}
          count={needsHuman.length}
        >
          {needsHuman.map((item, index) => (
            <div
              key={`${item.field ?? "field"}-${index}`}
              className="border-b border-border py-2 last:border-0"
            >
              <div className="text-sm font-medium">{text(item.field)}</div>
              <div className="text-xs text-muted-foreground">
                {text(item.why)}
              </div>
            </div>
          ))}
        </KindPanel>
      </KindPanelGrid>
    </CommerceShell>
  );
}

export function ReviewVerdictBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"review_verdict">(serverData);
  const findings = value.findings ?? [];
  const tone =
    value.verdict === "approve"
      ? "good"
      : value.verdict === "reject"
        ? "bad"
        : "warn";
  return (
    <CommerceShell
      slug="review_verdict"
      title={`${humanize(value.lens)} review`}
      subtitle={text(value.reasoning)}
      icon={Microscope}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "confidence", value: percent(value.confidence) ?? "—" },
        { label: "findings", value: findings.length },
      ]}
      className={className}
    >
      <StatusPill value={value.verdict ?? "unknown"} tone={tone} />
      {findings.length > 0 && (
        <KindPanel title="Findings" count={findings.length}>
          {findings.map((finding, index) => (
            <blockquote
              key={`${finding.quote ?? "finding"}-${index}`}
              className="border-b border-border py-2 last:border-0"
            >
              <p className="text-sm font-medium">“{text(finding.quote)}”</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {text(finding.issue)}
              </p>
              {finding.suggestion && (
                <p className="mt-1 text-xs text-primary">
                  Suggested: {finding.suggestion}
                </p>
              )}
            </blockquote>
          ))}
        </KindPanel>
      )}
    </CommerceShell>
  );
}

export function PublishPreflightBlock({
  serverData,
  className,
}: CommerceBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"publish_preflight">(serverData);
  const failures = value.failures ?? [];
  const warnings = strings(value.warnings);
  const passed = value.verdict === "pass";
  return (
    <CommerceShell
      slug="publish_preflight"
      title={passed ? "Ready to publish" : "Publish blocked"}
      subtitle={
        passed
          ? "Every deterministic marketplace rule passed."
          : "Resolve every failure before publishing."
      }
      icon={passed ? ShieldCheck : ClipboardCheck}
      value={value}
      isComplete={isComplete}
      stats={[
        { label: "failures", value: failures.length },
        { label: "warnings", value: warnings.length },
      ]}
      className={className}
    >
      <StatusPill
        value={value.verdict ?? "unknown"}
        tone={passed ? "good" : "bad"}
      />
      {failures.length > 0 && (
        <KindPanel
          title="Blocking failures"
          icon={TriangleAlert}
          count={failures.length}
        >
          {failures.map((failure, index) => (
            <div
              key={`${failure.field ?? "failure"}-${index}`}
              className="border-b border-border py-2 last:border-0"
            >
              <div className="text-sm font-medium">
                {text(failure.field)} · {text(failure.rule)}
              </div>
              <div className="text-sm text-muted-foreground">
                {text(failure.message)}
              </div>
              {failure.fix && (
                <div className="mt-1 text-xs text-primary">
                  Fix: {failure.fix}
                </div>
              )}
            </div>
          ))}
        </KindPanel>
      )}
      {warnings.length > 0 && (
        <TagList items={warnings.map((label) => ({ label }))} />
      )}
    </CommerceShell>
  );
}
