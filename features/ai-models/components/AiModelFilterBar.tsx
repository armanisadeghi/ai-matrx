"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  X,
  FilterX,
  BrainCircuit,
  Plus,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  isDeprecatedFilterNonDefault,
  type AiModelFilters,
  type TabState,
} from "../hooks/useTabUrlState";
import type { AiModel } from "../types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { aiModelSummary, AI_MODELS_LOCATION } from "../format";

interface AiModelFilterBarProps {
  tabState: TabState;
  totalCount: number;
  filteredCount: number;
  models: AiModel[];
  onUpdateQ: (q: string) => void;
  onUpdateFilters: (filters: Partial<AiModelFilters>) => void;
  onClearAll: () => void;
  onCreate: () => void;
  onRefresh: () => void;
}

const DEBOUNCE_MS = 250;

function NumberRangeInput({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: number | undefined;
  max: number | undefined;
  onMinChange: (v: number | undefined) => void;
  onMaxChange: (v: number | undefined) => void;
}) {
  const [minDraft, setMinDraft] = useState(
    min !== undefined ? String(min) : "",
  );
  const [maxDraft, setMaxDraft] = useState(
    max !== undefined ? String(max) : "",
  );

  useEffect(() => {
    setMinDraft(min !== undefined ? String(min) : "");
  }, [min]);
  useEffect(() => {
    setMaxDraft(max !== undefined ? String(max) : "");
  }, [max]);

  const commit = (raw: string, setter: (v: number | undefined) => void) => {
    if (raw === "") {
      setter(undefined);
      return;
    }
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) setter(n);
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <Input
        value={minDraft}
        onChange={(e) => setMinDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value, onMinChange)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="min"
        className="h-7 text-xs w-16 font-mono"
      />
      <span className="text-xs text-muted-foreground">–</span>
      <Input
        value={maxDraft}
        onChange={(e) => setMaxDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value, onMaxChange)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="max"
        className="h-7 text-xs w-16 font-mono"
      />
    </div>
  );
}

export default function AiModelFilterBar({
  tabState,
  totalCount,
  filteredCount,
  models,
  onUpdateQ,
  onUpdateFilters,
  onClearAll,
  onCreate,
  onRefresh,
}: AiModelFilterBarProps) {
  const { q, filters } = tabState;
  const [expanded, setExpanded] = useState(false);

  // Derive unique values from actual data
  const providers = useMemo(
    () => [...new Set(models.map((m) => m.provider).filter(Boolean))].sort(),
    [models],
  );

  const modelClasses = useMemo(
    () => [...new Set(models.map((m) => m.model_class).filter(Boolean))].sort(),
    [models],
  );

  const apiClasses = useMemo(
    () => [...new Set(models.map((m) => m.api_class).filter(Boolean))].sort(),
    [models],
  );

  // Local debounced search
  const [localQ, setLocalQ] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setLocalQ(q);
  }, [q]);

  const handleSearchChange = (value: string) => {
    setLocalQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdateQ(value), DEBOUNCE_MS);
  };
  const handleClearSearch = () => {
    setLocalQ("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onUpdateQ("");
  };

  const activeFilterCount = [
    filters.provider,
    isDeprecatedFilterNonDefault(filters),
    filters.is_primary !== undefined,
    filters.is_premium !== undefined,
    filters.api_class,
    filters.model_class,
    filters.context_window_min !== undefined,
    filters.context_window_max !== undefined,
    filters.max_tokens_min !== undefined,
    filters.max_tokens_max !== undefined,
  ].filter(Boolean).length;

  const hasAny = !!(q || activeFilterCount > 0);

  return (
    <div className="flex-shrink-0 border-b bg-card">
      {/* ── Row 1: always visible ────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto">
        {/* Brand */}
        <div className="flex items-center gap-1.5 shrink-0 mr-1">
          <BrainCircuit className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold whitespace-nowrap">
            AI Models
          </span>
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-xs shrink-0 font-mono"
          >
            {filteredCount === totalCount
              ? totalCount
              : `${filteredCount}/${totalCount}`}
          </Badge>
        </div>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={localQ}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search id, name, provider…"
            className="h-7 pl-7 pr-6 text-xs w-52"
          />
          {localQ && (
            <button
              onClick={handleClearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Provider */}
        <Select
          value={filters.provider ?? "__all__"}
          onValueChange={(v) =>
            onUpdateFilters({ provider: v === "__all__" ? undefined : v })
          }
        >
          <SelectTrigger className="h-7 text-xs w-32 shrink-0">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Providers</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select
          value={
            filters.is_deprecated === true
              ? "true"
              : filters.is_deprecated === false
                ? "false"
                : "__all__"
          }
          onValueChange={(v) =>
            onUpdateFilters({
              is_deprecated: v === "__all__" ? undefined : v === "true",
            })
          }
        >
          <SelectTrigger className="h-7 text-xs w-28 shrink-0">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="false">Active</SelectItem>
            <SelectItem value="true">Deprecated</SelectItem>
          </SelectContent>
        </Select>

        {/* Model Class */}
        <Select
          value={filters.model_class ?? "__all__"}
          onValueChange={(v) =>
            onUpdateFilters({ model_class: v === "__all__" ? undefined : v })
          }
        >
          <SelectTrigger className="h-7 text-xs w-32 shrink-0">
            <SelectValue placeholder="Model Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Classes</SelectItem>
            {modelClasses.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Expand/collapse for secondary filters */}
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 text-xs gap-1 shrink-0 ${expanded ? "text-primary" : "text-muted-foreground"}`}
          onClick={() => setExpanded((v) => !v)}
          title="More filters"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          More
          {activeFilterCount >
            (filters.provider ? 1 : 0) +
              (isDeprecatedFilterNonDefault(filters) ? 1 : 0) +
              (filters.model_class ? 1 : 0) && (
            <Badge variant="secondary" className="h-4 px-1 text-xs">
              {activeFilterCount -
                (filters.provider ? 1 : 0) -
                (isDeprecatedFilterNonDefault(filters) ? 1 : 0) -
                (filters.model_class ? 1 : 0)}
            </Badge>
          )}
        </Button>

        {/* Clear */}
        {hasAny && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground shrink-0"
            onClick={onClearAll}
            title="Clear all filters"
          >
            <FilterX className="h-3.5 w-3.5" />
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-xs">
                {activeFilterCount + (q ? 1 : 0)}
              </Badge>
            )}
          </Button>
        )}

        <div className="flex-1 min-w-2" />

        {models.length > 0 && (
          <CopyButtons
            size="icon"
            label="AI models"
            human={() => models.map(aiModelSummary).join("\n\n")}
            agent={() => ({
              kind: "ai-models",
              location: AI_MODELS_LOCATION,
              description: "The full AI model registry.",
              data: models,
              attributes: { count: models.length, shown: filteredCount },
            })}
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onRefresh}
          title="Refresh"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onCreate}
          title="New Model"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Row 2: expanded filters ──────────────────────────── */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 pb-2 border-t pt-1.5">
          {/* Primary */}
          <Select
            value={
              filters.is_primary === true
                ? "true"
                : filters.is_primary === false
                  ? "false"
                  : "__all__"
            }
            onValueChange={(v) =>
              onUpdateFilters({
                is_primary: v === "__all__" ? undefined : v === "true",
              })
            }
          >
            <SelectTrigger className="h-7 text-xs w-28 shrink-0">
              <SelectValue placeholder="Primary" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="true">Primary only</SelectItem>
              <SelectItem value="false">Non-primary</SelectItem>
            </SelectContent>
          </Select>

          {/* Premium */}
          <Select
            value={
              filters.is_premium === true
                ? "true"
                : filters.is_premium === false
                  ? "false"
                  : "__all__"
            }
            onValueChange={(v) =>
              onUpdateFilters({
                is_premium: v === "__all__" ? undefined : v === "true",
              })
            }
          >
            <SelectTrigger className="h-7 text-xs w-28 shrink-0">
              <SelectValue placeholder="Premium" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="true">Premium only</SelectItem>
              <SelectItem value="false">Non-premium</SelectItem>
            </SelectContent>
          </Select>

          {/* API class */}
          <Select
            value={filters.api_class ?? "__all__"}
            onValueChange={(v) =>
              onUpdateFilters({ api_class: v === "__all__" ? undefined : v })
            }
          >
            <SelectTrigger className="h-7 text-xs w-36 shrink-0">
              <SelectValue placeholder="API Class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All API Classes</SelectItem>
              {apiClasses.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-px h-5 bg-border shrink-0" />

          {/* Context window range */}
          <NumberRangeInput
            label="Context"
            min={filters.context_window_min}
            max={filters.context_window_max}
            onMinChange={(v) => onUpdateFilters({ context_window_min: v })}
            onMaxChange={(v) => onUpdateFilters({ context_window_max: v })}
          />

          <div className="w-px h-5 bg-border shrink-0" />

          {/* Max tokens range */}
          <NumberRangeInput
            label="Max tokens"
            min={filters.max_tokens_min}
            max={filters.max_tokens_max}
            onMinChange={(v) => onUpdateFilters({ max_tokens_min: v })}
            onMaxChange={(v) => onUpdateFilters({ max_tokens_max: v })}
          />
        </div>
      )}
    </div>
  );
}
