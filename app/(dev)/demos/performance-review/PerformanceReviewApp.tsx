"use client";

// Main interactive surface for the Performance Review demo.
// This is the single client entry the server page renders.

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Plus,
  Copy,
  Download,
  Upload,
  Printer,
  Trash2,
  Search,
  ClipboardList,
  CircleCheck,
  Loader2,
} from "lucide-react";
import {
  RATING_SCHEMA,
  OVERALL_OPTIONS,
  SCALE_LEGEND,
  LIST_SECTIONS,
  ratingKey,
} from "./schema";
import { useReviews } from "./use-reviews";
import {
  SectionCard,
  Field,
  ListEditor,
  RatingScale,
  AvgBadge,
  StatTile,
} from "./components";

export default function PerformanceReviewApp() {
  const store = useReviews();
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const filtered = store.reviews.filter((rev) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return `${rev.employeeName} ${rev.title} ${rev.department}`
      .toLowerCase()
      .includes(q);
  });

  const overallLabel =
    OVERALL_OPTIONS.find((o) => o.key === r.overall)?.label ?? "Not set";

  const handleImportClick = () => fileInputRef.current?.click();
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => store.importReviews(txt));
    e.target.value = "";
  };

  return (
    <div className="flex h-full overflow-hidden bg-textured">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex w-72 flex-none flex-col border-r border-border bg-card/60 print:hidden">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-violet-500 font-bold text-white">
            PR
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight">
              Performance Reviews
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
              className="h-8 pl-8 text-xs"
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        store.deleteReview(rev.id);
                      }}
                      className="flex-none rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete review"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
        {/* Top bar */}
        <div className="flex flex-none items-center gap-4 border-b border-border bg-card/70 px-6 py-3 backdrop-blur print:hidden">
          <div className="flex flex-1 items-center gap-3">
            <Progress value={store.stats.completionPct} className="max-w-[320px]" />
            <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {store.stats.completionPct}% complete
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {store.saveState === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
            )}
            {store.saveState === "saving" ? "Saving…" : "Saved"}
          </div>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" onClick={store.duplicateReview}>
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={store.exportActive}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            size="sm"
            onClick={() => typeof window !== "undefined" && window.print()}
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </Button>
        </div>

        {/* Scrollable sheet */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-5 p-6 pb-24">
            {/* Hero */}
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Employee Performance Review
                </h1>
                <p className="text-xs text-muted-foreground">
                  Autosaves locally · export or print anytime · database-backed
                  version coming later
                </p>
              </div>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile
                label="Overall Score"
                value={
                  store.stats.average !== null
                    ? store.stats.average.toFixed(2)
                    : "—"
                }
                sub={store.stats.average !== null ? "/ 5" : undefined}
              />
              <StatTile
                label="Items Rated"
                value={store.stats.ratedCount}
                sub={`/ ${store.stats.totalCount}`}
              />
              <StatTile label="Overall Rating" value={
                <span className="text-base">{overallLabel}</span>
              } />
            </div>

            {/* Employee details */}
            <SectionCard badge="i" title="Employee Details">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Employee Name">
                  <Input
                    value={r.employeeName}
                    onChange={(e) => store.updateField("employeeName", e.target.value)}
                    placeholder="e.g. Kendall Sampson"
                  />
                </Field>
                <Field label="Title">
                  <Input
                    value={r.title}
                    onChange={(e) => store.updateField("title", e.target.value)}
                    placeholder="e.g. VP of Procurement"
                  />
                </Field>
                <Field label="Department">
                  <Input
                    value={r.department}
                    onChange={(e) => store.updateField("department", e.target.value)}
                    placeholder="e.g. Procurement"
                  />
                </Field>
                <Field label="Date of Hire">
                  <Input
                    type="date"
                    value={r.dateOfHire}
                    onChange={(e) => store.updateField("dateOfHire", e.target.value)}
                  />
                </Field>
                <Field label="Review Period">
                  <Input
                    value={r.reviewPeriod}
                    onChange={(e) => store.updateField("reviewPeriod", e.target.value)}
                    placeholder="e.g. Jan–Dec 2025"
                  />
                </Field>
                <Field label="Date of Evaluation">
                  <Input
                    type="date"
                    value={r.dateOfEvaluation}
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
                title={section.title}
                description={section.description}
              >
                <ListEditor
                  items={r[section.key]}
                  placeholder={section.placeholder}
                  onAdd={(t) => store.addListItem(section.key, t)}
                  onEdit={(i, t) => store.editListItem(section.key, i, t)}
                  onRemove={(i) => store.removeListItem(section.key, i)}
                  onMove={(i, d) => store.moveListItem(section.key, i, d)}
                />
              </SectionCard>
            ))}

            {/* Ratings */}
            <SectionCard
              badge="★"
              title="Performance Ratings"
              description="Rate each item from 1 (lowest) to 5 (highest). Click a selected number again to clear it."
            >
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {SCALE_LEGEND.map((s) => (
                  <span key={s.value}>
                    <span className="font-bold text-foreground">{s.value}</span>{" "}
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
                        <span className="text-sm font-semibold">{cat.label}</span>
                        <AvgBadge avg={store.stats.categoryAverages[cat.key]} />
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="divide-y divide-border">
                        {cat.items.map((item) => (
                          <div
                            key={item.key}
                            className="flex items-center justify-between gap-4 py-2"
                          >
                            <span className="text-sm">{item.label}</span>
                            <RatingScale
                              value={r.ratings[ratingKey(cat.key, item.key)]}
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
            <SectionCard badge="→" title="Goals & Objectives">
              <Textarea
                value={r.goals}
                onChange={(e) => store.updateField("goals", e.target.value)}
                placeholder="Concrete, checkable goals for the coming year…"
                minHeight={150}
                className="min-h-[150px]"
              />
            </SectionCard>

            {/* Overall rating */}
            <SectionCard badge="✓" title="Overall Performance Rating">
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
            <SectionCard badge="+" title="Additional Comments">
              <Textarea
                value={r.additionalComments}
                onChange={(e) =>
                  store.updateField("additionalComments", e.target.value)
                }
                placeholder="Closing comments…"
                minHeight={170}
                className="min-h-[170px]"
              />
            </SectionCard>

            <p className="pt-1 text-center text-xs text-muted-foreground print:hidden">
              Everything saves automatically to this browser. Use{" "}
              <span className="font-medium">Export</span> to back up as a file,
              or <span className="font-medium">Print / PDF</span> for a clean
              copy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
