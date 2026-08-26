"use client";

// Shared interactive surface for the retained demo and organization route.

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { captureElementsToPDF } from "@/lib/block-print/dom-capture-print-utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { jsonExportItem } from "@/components/agent-copy/export";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  organizationPerformanceReviewsManifest,
  performanceReviewRatingSurfaceName,
  PERFORMANCE_REVIEW_SURFACE_NAME,
} from "@/features/surfaces/manifests/organization-performance-reviews.manifest";
import {
  surfaceGroupLabels,
  surfaceValueLabels,
} from "@/features/surfaces/utils/surface-display";
import { buildPerformanceReviewSurfaceScope } from "@/features/employee-performance-reviews/surface-scope";
import {
  buildPerformanceReviewQuestionsPayload,
  buildPerformanceReviewValuesPayload,
  formatPerformanceReviewForHumans,
  performanceReviewValuesData,
} from "@/features/employee-performance-reviews/copy";
import {
  buildReviewReportHtml,
  openReviewPrintView,
  REVIEW_REPORT_STYLES,
  reviewReportFilename,
} from "@/features/employee-performance-reviews/review-report";
import {
  Plus,
  Copy,
  Upload,
  Printer,
  Trash2,
  Search,
  ClipboardList,
  CircleCheck,
  FileDown,
  FileText,
  Loader2,
  PenLine,
} from "lucide-react";
import {
  RATING_SCHEMA,
  OVERALL_OPTIONS,
  SCALE_LEGEND,
  LIST_SECTIONS,
  MAX_LIST_ITEMS,
  isRatingValue,
  ratingKey,
} from "@/features/employee-performance-reviews/schema";
import { useReviews } from "@/features/employee-performance-reviews/use-reviews";
import {
  SectionCard,
  Field,
  ListEditor,
  RatingScale,
  AvgBadge,
  StatTile,
} from "@/features/employee-performance-reviews/components/review-form-components";

const L = surfaceValueLabels(organizationPerformanceReviewsManifest);
const G = surfaceGroupLabels(organizationPerformanceReviewsManifest);

export interface PerformanceReviewOrganizationContext {
  id: string;
  slug: string;
  name: string;
  viewerRole: string;
}

export interface PerformanceReviewAppProps {
  storageKey?: string;
  organization?: PerformanceReviewOrganizationContext;
  showHero?: boolean;
}

export default function PerformanceReviewApp({
  storageKey,
  organization,
  showHero = true,
}: PerformanceReviewAppProps) {
  const store = useReviews(storageKey);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "report">("edit");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportCaptureRef = useRef<HTMLDivElement>(null);

  if (!store.hydrated || !store.active) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reviews…
        </div>
      </div>
    );
  }

  const r = store.active;
  const reportHtml = buildReviewReportHtml(r, store.stats);
  const filtered = store.reviews.filter((rev) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return `${rev.employeeName} ${rev.title} ${rev.department}`
      .toLowerCase()
      .includes(q);
  });

  const overallLabel =
    OVERALL_OPTIONS.find((o) => o.key === r.overall)?.label ?? "Not set";
  const copyContext = {
    organizationId: organization?.id,
    organizationName: organization?.name,
    routeLabel: organization
      ? `${organization.name} — Performance Reviews`
      : "Performance Review Demo",
  };
  const getSurfaceScope = () =>
    buildPerformanceReviewSurfaceScope({
      organization,
      activeReview: r,
      reviews: store.reviews,
      stats: store.stats,
      currentView: viewMode,
      searchQuery: search,
      saveState: store.saveState,
      isExportingPdf,
    });

  const requireText = (target: string, value: unknown, maxLength: number) => {
    if (typeof value !== "string") {
      throw new Error(`${target} expects a plain text string.`);
    }
    if (value.length > maxLength) {
      throw new Error(
        `${target} accepts at most ${maxLength} characters; received ${value.length}.`,
      );
    }
    return value;
  };
  const requireDate = (target: string, value: unknown) => {
    const text = requireText(target, value, 10);
    if (text !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new Error(`${target} expects YYYY-MM-DD or an empty string.`);
    }
    return text;
  };
  const requireNarrativeList = (target: string, value: unknown) => {
    if (!Array.isArray(value)) {
      throw new Error(
        `${target} expects an array of 0-${MAX_LIST_ITEMS} non-empty strings, each at most 2,000 characters. The ideal number is three.`,
      );
    }
    const items = value.filter(
      (item: unknown): item is string => typeof item === "string",
    );
    if (
      items.length !== value.length ||
      items.length > MAX_LIST_ITEMS ||
      !items.every((item) => item.trim().length > 0 && item.length <= 2000)
    ) {
      throw new Error(
        `${target} expects an array of 0-${MAX_LIST_ITEMS} non-empty strings, each at most 2,000 characters. The ideal number is three.`,
      );
    }
    return items;
  };
  const ratingHandlers = Object.fromEntries(
    RATING_SCHEMA.flatMap((category) =>
      category.items.map((item) => [
        performanceReviewRatingSurfaceName(category.key, item.key),
        (value: unknown) => {
          if (!isRatingValue(value)) {
            throw new Error(
              `${performanceReviewRatingSurfaceName(category.key, item.key)} expects one whole number from 1 to 5.`,
            );
          }
          store.setRatingValue(category.key, item.key, value);
        },
      ]),
    ),
  );
  const getSurfaceWriteHandlers = () => ({
    employee_name: (value: unknown) =>
      store.updateField(
        "employeeName",
        requireText("employee_name", value, 200),
      ),
    job_title: (value: unknown) =>
      store.updateField("title", requireText("job_title", value, 200)),
    department: (value: unknown) =>
      store.updateField("department", requireText("department", value, 200)),
    date_of_hire: (value: unknown) =>
      store.updateField("dateOfHire", requireDate("date_of_hire", value)),
    review_period: (value: unknown) =>
      store.updateField(
        "reviewPeriod",
        requireText("review_period", value, 200),
      ),
    date_of_evaluation: (value: unknown) =>
      store.updateField(
        "dateOfEvaluation",
        requireDate("date_of_evaluation", value),
      ),
    responsibilities: (value: unknown) =>
      store.updateField(
        "responsibilities",
        requireNarrativeList("responsibilities", value),
      ),
    accomplishments: (value: unknown) =>
      store.updateField(
        "accomplishments",
        requireNarrativeList("accomplishments", value),
      ),
    strengths: (value: unknown) =>
      store.updateField("strengths", requireNarrativeList("strengths", value)),
    opportunities: (value: unknown) =>
      store.updateField(
        "opportunities",
        requireNarrativeList("opportunities", value),
      ),
    goals: (value: unknown) =>
      store.updateField("goals", requireText("goals", value, 12000)),
    overall_rating: (value: unknown) => {
      const next = requireText("overall_rating", value, 40);
      if (
        next !== "" &&
        !OVERALL_OPTIONS.some((option) => option.key === next)
      ) {
        throw new Error(
          `overall_rating expects one of: ${OVERALL_OPTIONS.map((option) => option.key).join(" | ")}; an empty string clears it.`,
        );
      }
      store.setOverall(next);
    },
    additional_comments: (value: unknown) =>
      store.updateField(
        "additionalComments",
        requireText("additional_comments", value, 12000),
      ),
    ...ratingHandlers,
  });

  const handleImportClick = () => fileInputRef.current?.click();
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => store.importReviews(txt));
    e.target.value = "";
  };

  const handlePdfExport = async () => {
    const reportHost = reportCaptureRef.current;
    if (!reportHost) {
      toast.error("The report preview is not ready yet.");
      return;
    }

    setIsExportingPdf(true);
    try {
      await document.fonts.ready;
      const pages = Array.from(
        reportHost.querySelectorAll<HTMLElement>("[data-review-report-page]"),
      );
      await captureElementsToPDF(pages, {
        filename: reviewReportFilename(r),
        paperSize: "letter",
        orientation: "portrait",
        scale: 2,
        background: "#ffffff",
        theme: "light",
        imageFormat: "jpeg",
        imageQuality: 0.94,
      });
      toast.success("PDF downloaded");
    } catch (error) {
      console.error("Performance review PDF export failed", error);
      toast.error("PDF export failed. Please try again.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={PERFORMANCE_REVIEW_SURFACE_NAME}
      getScope={getSurfaceScope}
      getWriteHandlers={getSurfaceWriteHandlers}
      isEditable
    >
      <div className="flex h-full overflow-hidden bg-textured">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="hidden w-72 flex-none flex-col border-r border-border bg-card/60 print:hidden lg:flex">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
              PR
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight">
                {organizationPerformanceReviewsManifest.label}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Saved in this browser
              </p>
            </div>
          </div>

          <div className="space-y-2 p-3">
            <Button className="w-full" onClick={store.createReview}>
              <Plus className="h-4 w-4" />
              New Review
            </Button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reviews…"
                className="h-8 pl-8 text-base sm:text-xs"
              />
            </div>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No matching reviews.
              </p>
            ) : (
              filtered.map((rev) => {
                const activeItem = rev.id === store.activeId;
                return (
                  <div
                    key={rev.id}
                    onClick={() => store.selectReview(rev.id)}
                    className={cn(
                      "group flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 transition-colors",
                      activeItem
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:bg-muted/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {rev.employeeName || "Untitled review"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          store.deleteReview(rev.id);
                        }}
                        className="h-7 w-7 flex-none text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        aria-label="Delete review"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted-foreground">
                        {rev.title || rev.department || "—"}
                      </span>
                      {rev.overall ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {
                            OVERALL_OPTIONS.find((o) => o.key === rev.overall)
                              ?.label
                          }
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border p-3">
            <span className="text-[11px] text-muted-foreground">
              {store.reviews.length} saved
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleImportClick}
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-none items-center gap-2 border-b border-border bg-card px-3 py-2 lg:hidden">
            <Select
              value={store.activeId ?? undefined}
              onValueChange={store.selectReview}
            >
              <SelectTrigger className="min-w-0 flex-1 text-base">
                <SelectValue placeholder="Choose a review" />
              </SelectTrigger>
              <SelectContent>
                {store.reviews.map((review) => (
                  <SelectItem key={review.id} value={review.id}>
                    {review.employeeName || "Untitled review"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              onClick={store.createReview}
              aria-label="New review"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Top bar */}
          <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border bg-card/70 px-3 py-2 backdrop-blur print:hidden sm:px-6 sm:py-3">
            <div
              className="flex min-w-[180px] flex-1 items-center gap-3"
              data-surface-value="completion_percent"
            >
              <Progress
                value={store.stats.completionPct}
                className="max-w-[320px]"
              />
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {store.stats.completionPct}%
                <span className="hidden sm:inline"> complete</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {store.saveState === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CircleCheck className="h-3.5 w-3.5 text-primary" />
              )}
              <span className="hidden sm:inline">
                {store.saveState === "saving" ? "Saving…" : "Saved"}
              </span>
            </div>
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <Button
              variant={viewMode === "edit" ? "secondary" : "ghost"}
              size="sm"
              className="max-sm:h-11"
              onClick={() => setViewMode("edit")}
            >
              <PenLine className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant={viewMode === "report" ? "secondary" : "ghost"}
              size="sm"
              className="max-sm:h-11"
              onClick={() => setViewMode("report")}
            >
              <FileText className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              className="hidden lg:inline-flex"
              variant="outline"
              size="sm"
              onClick={store.duplicateReview}
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </Button>
            <CopyButtons
              size="sm"
              label="Active performance review"
              human={() => formatPerformanceReviewForHumans(r, store.stats)}
              agent={() =>
                buildPerformanceReviewValuesPayload(r, store.stats, copyContext)
              }
              agentVariant={{
                id: "current-values",
                label: "Current values",
                hint: "Questions plus every value currently entered",
                position: "last",
              }}
              aiVariants={[
                {
                  id: "questions-only",
                  label: "Questions only",
                  hint: "Minimal guidance and no answers",
                  build: buildPerformanceReviewQuestionsPayload,
                },
              ]}
              export={{
                items: [
                  jsonExportItem(
                    () =>
                      performanceReviewValuesData(r, store.stats, copyContext),
                    "JSON (current review)",
                  ),
                ],
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="max-sm:h-11"
              onClick={() => openReviewPrintView(r, store.stats)}
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
            <Button
              size="sm"
              className="max-sm:h-11"
              onClick={handlePdfExport}
              disabled={isExportingPdf}
            >
              {isExportingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              {isExportingPdf ? "Building PDF…" : "Download PDF"}
            </Button>
          </div>

          {/* Scrollable sheet */}
          <div className="flex-1 overflow-y-auto">
            {viewMode === "report" ? (
              <div className="mx-auto max-w-[920px] p-3 pb-16 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
                  <div>
                    <h1 className="text-base font-semibold">
                      Finished report preview
                    </h1>
                    <p className="text-xs text-muted-foreground">
                      The print view and downloaded PDF use this same two-page
                      layout.
                    </p>
                  </div>
                  <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:inline-flex">
                    Letter · 2 pages
                  </span>
                </div>
                <style>{REVIEW_REPORT_STYLES}</style>
                <div
                  className="pr-report-preview"
                  dangerouslySetInnerHTML={{ __html: reportHtml }}
                />
              </div>
            ) : (
              <div className="mx-auto max-w-4xl space-y-5 p-3 pb-24 sm:p-6">
                {showHero ? (
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold tracking-tight">
                        Employee Performance Review
                      </h1>
                      <p className="text-xs text-muted-foreground">
                        Draft the review, then preview the finished two-page
                        report.
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* Stat tiles */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatTile
                    label="Overall Score"
                    anchor="average_score"
                    value={
                      store.stats.average !== null
                        ? store.stats.average.toFixed(2)
                        : "—"
                    }
                    sub={store.stats.average !== null ? "/ 5" : undefined}
                  />
                  <StatTile
                    label="Items Rated"
                    anchor="rated_count"
                    value={store.stats.ratedCount}
                    sub={`/ ${store.stats.totalCount}`}
                  />
                  <StatTile
                    label="Overall Rating"
                    anchor="overall_rating_label"
                    value={<span className="text-base">{overallLabel}</span>}
                  />
                </div>

                {/* Employee details */}
                <SectionCard
                  badge="01"
                  title={G.employee_details}
                  anchor="active_review"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label={L.employee_name} anchor="employee_name">
                      <Input
                        value={r.employeeName}
                        onChange={(e) =>
                          store.updateField("employeeName", e.target.value)
                        }
                        placeholder="e.g. Kendall Sampson"
                        className="text-base sm:text-sm"
                      />
                    </Field>
                    <Field label={L.job_title} anchor="job_title">
                      <Input
                        value={r.title}
                        onChange={(e) =>
                          store.updateField("title", e.target.value)
                        }
                        placeholder="e.g. VP of Procurement"
                        className="text-base sm:text-sm"
                      />
                    </Field>
                    <Field label={L.department} anchor="department">
                      <Input
                        value={r.department}
                        onChange={(e) =>
                          store.updateField("department", e.target.value)
                        }
                        placeholder="e.g. Procurement"
                        className="text-base sm:text-sm"
                      />
                    </Field>
                    <Field label={L.date_of_hire} anchor="date_of_hire">
                      <Input
                        type="date"
                        value={r.dateOfHire}
                        onChange={(e) =>
                          store.updateField("dateOfHire", e.target.value)
                        }
                        className="text-base sm:text-sm"
                      />
                    </Field>
                    <Field label={L.review_period} anchor="review_period">
                      <Input
                        value={r.reviewPeriod}
                        onChange={(e) =>
                          store.updateField("reviewPeriod", e.target.value)
                        }
                        placeholder="e.g. Jan–Dec 2025"
                        className="text-base sm:text-sm"
                      />
                    </Field>
                    <Field
                      label={L.date_of_evaluation}
                      anchor="date_of_evaluation"
                    >
                      <Input
                        type="date"
                        value={r.dateOfEvaluation}
                        className="text-base sm:text-sm"
                        onChange={(e) =>
                          store.updateField("dateOfEvaluation", e.target.value)
                        }
                      />
                    </Field>
                  </div>
                </SectionCard>

                {/* List sections */}
                {LIST_SECTIONS.map((section) => (
                  <SectionCard
                    key={section.key}
                    badge={section.index}
                    title={L[section.key]}
                    description={section.description}
                    anchor={section.key}
                  >
                    <ListEditor
                      items={r[section.key]}
                      placeholder={section.placeholder}
                      onAdd={(t) => store.addListItem(section.key, t)}
                      onEdit={(i, t) => store.editListItem(section.key, i, t)}
                      onRemove={(i) => store.removeListItem(section.key, i)}
                      onMove={(i, d) => store.moveListItem(section.key, i, d)}
                      surfaceName={PERFORMANCE_REVIEW_SURFACE_NAME}
                      getApplicationScope={getSurfaceScope}
                    />
                  </SectionCard>
                ))}

                {/* Ratings */}
                <SectionCard
                  badge="06"
                  title={G.performance_ratings}
                  description="Rate each item from 1 (lowest) to 5 (highest). Click a selected number again to clear it."
                  anchor="ratings"
                >
                  <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    {SCALE_LEGEND.map((s) => (
                      <span key={s.value}>
                        <span className="font-bold text-foreground">
                          {s.value}
                        </span>{" "}
                        {s.label}
                      </span>
                    ))}
                  </div>

                  <Accordion
                    type="multiple"
                    defaultValue={RATING_SCHEMA.map((c) => c.key)}
                    className="space-y-2"
                  >
                    {RATING_SCHEMA.map((cat, ci) => (
                      <AccordionItem
                        key={cat.key}
                        value={cat.key}
                        className="rounded-lg border border-border px-3"
                      >
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <span className="flex flex-1 items-center gap-2.5 pr-2">
                            <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                              {ci + 1}
                            </span>
                            <span className="text-sm font-semibold">
                              {cat.label}
                            </span>
                            <AvgBadge
                              avg={store.stats.categoryAverages[cat.key]}
                            />
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          <div className="divide-y divide-border">
                            {cat.items.map((item) => (
                              <div
                                key={item.key}
                                className="flex items-center justify-between gap-4 py-2"
                                data-surface-value={performanceReviewRatingSurfaceName(
                                  cat.key,
                                  item.key,
                                )}
                              >
                                <span className="text-sm">
                                  {
                                    L[
                                      performanceReviewRatingSurfaceName(
                                        cat.key,
                                        item.key,
                                      )
                                    ]
                                  }
                                </span>
                                <RatingScale
                                  value={
                                    r.ratings[ratingKey(cat.key, item.key)]
                                  }
                                  onSelect={(v) =>
                                    store.setRating(cat.key, item.key, v)
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </SectionCard>

                {/* Goals */}
                <SectionCard badge="07" title={L.goals} anchor="goals">
                  <ProTextarea
                    value={r.goals}
                    onChange={(e) => store.updateField("goals", e.target.value)}
                    placeholder="Concrete, checkable goals for the coming year…"
                    minHeight={150}
                    maxHeight={640}
                    surfaceName={PERFORMANCE_REVIEW_SURFACE_NAME}
                    getApplicationScope={getSurfaceScope}
                    enableTextStats
                    className="min-h-[150px] resize-y"
                  />
                </SectionCard>

                {/* Overall rating */}
                <SectionCard
                  badge="08"
                  title={L.overall_rating}
                  anchor="overall_rating"
                >
                  <RadioGroup
                    value={r.overall}
                    onValueChange={store.setOverall}
                    className="gap-2"
                  >
                    {OVERALL_OPTIONS.map((opt) => {
                      const selected = r.overall === opt.key;
                      return (
                        <label
                          key={opt.key}
                          htmlFor={`overall-${opt.key}`}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                            selected
                              ? "border-primary bg-primary/10"
                              : "border-border bg-muted/30 hover:border-primary/40",
                          )}
                        >
                          <RadioGroupItem
                            id={`overall-${opt.key}`}
                            value={opt.key}
                            className="mt-1"
                          />
                          <span>
                            <span className="block text-sm font-semibold">
                              {opt.label}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {opt.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </RadioGroup>
                </SectionCard>

                {/* Additional comments */}
                <SectionCard
                  badge="09"
                  title={L.additional_comments}
                  anchor="additional_comments"
                >
                  <ProTextarea
                    value={r.additionalComments}
                    onChange={(e) =>
                      store.updateField("additionalComments", e.target.value)
                    }
                    placeholder="Closing comments…"
                    minHeight={170}
                    maxHeight={720}
                    surfaceName={PERFORMANCE_REVIEW_SURFACE_NAME}
                    getApplicationScope={getSurfaceScope}
                    enableTextStats
                    className="min-h-[170px] resize-y"
                  />
                </SectionCard>

                <p className="pt-1 text-center text-xs text-muted-foreground print:hidden">
                  Everything saves automatically to this browser. Preview the
                  report before printing or downloading the final PDF.
                </p>
              </div>
            )}
          </div>

          <div
            ref={reportCaptureRef}
            aria-hidden="true"
            className="pointer-events-none fixed left-[-10000px] top-0 w-[816px]"
          >
            <style>{REVIEW_REPORT_STYLES}</style>
            <div dangerouslySetInnerHTML={{ __html: reportHtml }} />
          </div>
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
