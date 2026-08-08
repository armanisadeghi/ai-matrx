"use client";

/**
 * The dig-rule editor — name/dimension/conditions/sort/limit/base-filter
 * form over `GscDigRuleContent`. Validation mirrors the server whitelist
 * (`lib/dig-rules.ts`); Preview runs the UNSAVED draft through the same
 * stateless RPC a saved rule uses, so what you preview is exactly what
 * you save.
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  metricRequiresCompare,
  validateDigRule,
  type GscDigRuleContent,
} from "@/features/marketing/search-console/lib/dig-rules";
import type {
  GscDigCondition,
  GscDigMetric,
  GscDigOp,
} from "@/features/marketing/search-console/types";
import type { GscTrafficClass } from "@/features/marketing/search-console/types";
import { GSC_TRAFFIC_CLASSES } from "@/features/marketing/search-console/types";
import {
  GSC_DIG_METRICS,
  GSC_DIG_OPS,
} from "@/features/marketing/search-console/types";

export interface DigRuleDraft {
  name: string;
  description: string;
  content: GscDigRuleContent;
}

export function DigRuleEditor({
  draft,
  onChange,
  onPreview,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  draft: DigRuleDraft;
  onChange: (next: DigRuleDraft) => void;
  onPreview: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  // Value inputs hold free text while typing; commit parses to number.
  const [valueDrafts, setValueDrafts] = useState<Record<number, string>>({});

  const { content } = draft;
  // Preview needs only runnable content; a name is required only to SAVE.
  const contentErrors = validateDigRule(content, true);
  const errors = contentErrors.concat(
    draft.name.trim() === "" ? ["Name is required (to save)."] : [],
  );
  const usesCompare =
    content.conditions.some((c) => metricRequiresCompare(c.metric)) ||
    metricRequiresCompare(content.sortMetric);

  const setContent = (next: Partial<GscDigRuleContent>) =>
    onChange({ ...draft, content: { ...content, ...next } });

  const setCondition = (index: number, next: Partial<GscDigCondition>) =>
    setContent({
      conditions: content.conditions.map((c, i) =>
        i === index ? { ...c, ...next } : c,
      ),
    });

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-2.5">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Rule name"
          className="h-7 text-xs"
          aria-label="Rule name"
        />
        <Select
          value={content.dimension}
          onValueChange={(next) =>
            setContent({ dimension: next as "query" | "page" })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Dimension">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="query" className="text-xs">
              Queries
            </SelectItem>
            <SelectItem value="page" className="text-xs">
              Pages
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        placeholder="What does this rule find? (optional)"
        className="h-7 text-xs"
        aria-label="Rule description"
      />
      {/* Class pin — dig within ONE traffic class (money / educational /
          brand / mismatch / unclassified). "Money keywords losing ground"
          is one rule, not an eyeball join across tabs. */}
      <Select
        value={content.trafficClass ?? "all"}
        onValueChange={(next) =>
          setContent({
            trafficClass:
              next === "all" ? null : (next as GscTrafficClass),
          })
        }
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-full text-xs"
          aria-label="Traffic class"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">
            All traffic classes
          </SelectItem>
          {GSC_TRAFFIC_CLASSES.map((cls) => (
            <SelectItem key={cls.key} value={cls.key} className="text-xs">
              {cls.label} only
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          Conditions (all must pass)
        </p>
        {content.conditions.map((condition, index) => (
          <div key={index} className="flex items-center gap-1">
            <Select
              value={condition.metric}
              onValueChange={(next) =>
                setCondition(index, { metric: next as GscDigMetric })
              }
            >
              <SelectTrigger
                size="sm"
                className="h-7 flex-1 text-xs"
                aria-label={`Condition ${index + 1} metric`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GSC_DIG_METRICS.map((metric) => (
                  <SelectItem
                    key={metric.key}
                    value={metric.key}
                    className="text-xs"
                  >
                    {metric.label}
                    {metric.requiresCompare ? " (needs compare)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={condition.op}
              onValueChange={(next) =>
                setCondition(index, { op: next as GscDigOp })
              }
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-14 text-xs"
                aria-label={`Condition ${index + 1} operator`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GSC_DIG_OPS.map((op) => (
                  <SelectItem key={op.key} value={op.key} className="text-xs">
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={valueDrafts[index] ?? String(condition.value)}
              onChange={(e) => {
                setValueDrafts((prev) => ({ ...prev, [index]: e.target.value }));
                const parsed = Number(e.target.value);
                // A blank field must not commit 0 mid-edit (Number("")===0).
                if (e.target.value.trim() !== "" && Number.isFinite(parsed)) {
                  setCondition(index, { value: parsed });
                }
              }}
              onBlur={() =>
                setValueDrafts((prev) => {
                  const next = { ...prev };
                  delete next[index];
                  return next;
                })
              }
              inputMode="decimal"
              className="h-7 w-24 text-xs tabular-nums"
              aria-label={`Condition ${index + 1} value`}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              aria-label={`Remove condition ${index + 1}`}
              onClick={() => {
                // Drafts are index-keyed; removal shifts indices — drop them
                // all so no draft string paints against the wrong condition.
                setValueDrafts({});
                setContent({
                  conditions: content.conditions.filter((_, i) => i !== index),
                });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() =>
            setContent({
              conditions: [
                ...content.conditions,
                { metric: "impressions", op: "gt", value: 100 },
              ],
            })
          }
        >
          <Plus className="h-3 w-3" />
          Add condition
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Select
          value={content.sortMetric}
          onValueChange={(next) =>
            setContent({ sortMetric: next as GscDigRuleContent["sortMetric"] })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GSC_DIG_METRICS.map((metric) => (
              <SelectItem key={metric.key} value={metric.key} className="text-xs">
                Sort: {metric.label}
              </SelectItem>
            ))}
            <SelectItem value="key" className="text-xs">
              Sort: Name
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={content.sortDir}
          onValueChange={(next) =>
            setContent({ sortDir: next as "asc" | "desc" })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Sort direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc" className="text-xs">
              Descending
            </SelectItem>
            <SelectItem value="asc" className="text-xs">
              Ascending
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={1}
          max={1000}
          value={content.rowLimit}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(parsed)) {
              setContent({ rowLimit: parsed });
            }
          }}
          className="h-7 text-xs tabular-nums"
          aria-label="Row limit"
        />
        <div className="flex items-center text-[11px] text-muted-foreground">
          rows max
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <Input
          value={content.baseFilters.query_contains ?? ""}
          onChange={(e) =>
            setContent({
              baseFilters: {
                ...content.baseFilters,
                query_contains: e.target.value,
              },
            })
          }
          placeholder="Only queries containing… (optional)"
          className="h-7 text-xs"
          aria-label="Query contains filter"
        />
        <Input
          value={content.baseFilters.page_contains ?? ""}
          onChange={(e) =>
            setContent({
              baseFilters: {
                ...content.baseFilters,
                page_contains: e.target.value,
              },
            })
          }
          placeholder="Only pages containing… (optional)"
          className="h-7 text-xs"
          aria-label="Page contains filter"
        />
      </div>

      {usesCompare ? (
        <p className="text-[11px] text-muted-foreground">
          Uses compare metrics — runs against the previous period automatically
          when no compare is selected.
        </p>
      ) : null}
      {errors.length > 0 ? (
        <ul className="space-y-0.5">
          {errors.map((error) => (
            <li key={error} className="text-[11px] text-destructive">
              {error}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onPreview}
          disabled={contentErrors.length > 0}
        >
          Preview
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={onSave}
          disabled={saving || errors.length > 0}
        >
          {isNew ? "Save rule" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
