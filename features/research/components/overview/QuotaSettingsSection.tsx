"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TopicQuotaFields } from "../../types";

type QuotaKey = keyof TopicQuotaFields;

interface Props {
  values: TopicQuotaFields;
  onChange: (partial: Partial<TopicQuotaFields>) => void;
  disabled?: boolean;
}

interface FieldSpec {
  key: QuotaKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}

const VISIBLE_FIELDS: FieldSpec[] = [
  {
    key: "max_keywords",
    label: "Keywords",
    hint: "Cap on rs_keyword rows for this topic.",
    min: 1,
    max: 30,
  },
  {
    key: "scrapes_per_keyword",
    label: "Reads / keyword",
    hint: "Successful page reads attempted per keyword.",
    min: 1,
    max: 30,
  },
  {
    key: "analyses_per_keyword",
    label: "Analyses / keyword",
    hint: "Per-keyword cap on successful analyses (8-for-1 sharing applies).",
    min: 1,
    max: 30,
  },
  {
    key: "max_keyword_syntheses",
    label: "Keyword syntheses",
    hint: "Total cap. When below keyword count, picks keywords with most analyses.",
    min: 0,
    max: 20,
  },
  {
    // Topic-wide synthesis cap (renamed from the legacy "project synthesis"
    // vocabulary; DB column is max_topic_syntheses since the Phase-4 rename).
    key: "max_topic_syntheses",
    label: "Topic synthesis",
    hint: "Cap on full topic-wide reports. Almost always 1.",
    min: 0,
    max: 5,
  },
  {
    key: "max_documents",
    label: "Documents",
    hint: "Cap on assembled document versions.",
    min: 0,
    max: 5,
  },
];

const ADVANCED_FIELDS: FieldSpec[] = [
  {
    key: "max_tag_consolidations",
    label: "Tag consolidations",
    hint: "Cap on per-tag consolidations (LLM call). 0 disables.",
    min: 0,
    max: 50,
  },
  {
    key: "max_auto_tag_calls",
    label: "Auto-tag LLM calls",
    hint: "Cap on auto-tagger LLM calls per topic. 0 disables.",
    min: 0,
    max: 200,
  },
];

function FieldRow({
  spec,
  value,
  onChange,
  disabled,
}: {
  spec: FieldSpec;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <label
        htmlFor={`quota-${spec.key}`}
        className="text-[11px] font-medium text-muted-foreground"
      >
        {spec.label}
      </label>
      <Input
        id={`quota-${spec.key}`}
        type="number"
        min={spec.min}
        max={spec.max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="h-8 text-xs rounded-lg"
        style={{ fontSize: "16px" }}
      />
      <p className="text-[10px] text-muted-foreground/80 leading-snug">
        {spec.hint}
      </p>
    </div>
  );
}

/**
 * Quota ladder editor (per QUOTA_LADDER.md). Six visible fields plus an
 * "Advanced — costs money" disclosure for the two opt-in LLM caps.
 */
export function QuotaSettingsSection({ values, onChange, disabled }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(
    values.max_tag_consolidations > 0 || values.max_auto_tag_calls > 0,
  );

  return (
    <section className="space-y-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pipeline Limits
      </span>
      <p className="text-[11px] text-muted-foreground/85 leading-snug">
        Hard caps for each pipeline phase. Defaults are tuned for a low-cost
        first run.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {VISIBLE_FIELDS.map((spec) => (
          <FieldRow
            key={spec.key}
            spec={spec}
            value={values[spec.key] ?? 0}
            onChange={(n) => onChange({ [spec.key]: n })}
            disabled={disabled}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {advancedOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Advanced — opt-in LLM features
      </button>

      {advancedOpen && (
        <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
          <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
            These features are disabled by default and cost money per topic.
            Set above 0 to enable.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {ADVANCED_FIELDS.map((spec) => (
              <FieldRow
                key={spec.key}
                spec={spec}
                value={values[spec.key] ?? 0}
                onChange={(n) => onChange({ [spec.key]: n })}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
