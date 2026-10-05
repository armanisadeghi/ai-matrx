"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, Search, X } from "lucide-react";
import {
  clearCxTableFilters,
  hasActiveCxSourceFilters,
  filtersFromSearchParams,
  updateCxSourceFilter,
} from "../utils/filters";
import type { CxFilters } from "../types/cxDashboardTypes";

type Props = {
  /** Hide the local Clear action when the canonical table owns it. */
  hideClear?: boolean;
  showSearch?: boolean;
  showStatusFilter?: boolean;
  showProviderFilter?: boolean;
  statusOptions?: string[];
  providerOptions?: string[];
  onExportCSV?: () => void;
  onExportJSON?: () => void;
  onRefresh?: () => void;
};

export function CxFiltersBar({
  hideClear = false,
  showSearch = true,
  showStatusFilter = true,
  showProviderFilter = false,
  statusOptions = ["completed", "pending", "error"],
  providerOptions = [],
  onExportCSV,
  onExportJSON,
  onRefresh,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const filters = filtersFromSearchParams(searchParams);

  const updateFilter = useCallback(
    (key: keyof CxFilters, value: string | undefined) => {
      const params = updateCxSourceFilter(new URLSearchParams(window.location.search), key, value);
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router],
  );

  const clearFilters = useCallback(() => {
    startTransition(() => {
      const params = clearCxTableFilters(new URLSearchParams(window.location.search));
      const query = params.toString();
      router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    });
  }, [pathname, router]);

  const hasActiveFilters = hasActiveCxSourceFilters(new URLSearchParams(searchParams));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Timeframe */}
      <Select
        value={filters.timeframe}
        onValueChange={(v) => updateFilter("timeframe", v)}
      >
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="Timeframe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">Last 24h</SelectItem>
          <SelectItem value="week">Last 7d</SelectItem>
          <SelectItem value="month">Last 30d</SelectItem>
          <SelectItem value="quarter">Last 90d</SelectItem>
          <SelectItem value="all">All Time</SelectItem>
        </SelectContent>
      </Select>

      {/* Status */}
      {showStatusFilter && (
        <Select
          value={filters.status || "all_values"}
          onValueChange={(v) =>
            updateFilter("status", v === "all_values" ? undefined : v)
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_values">All Status</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Provider */}
      {showProviderFilter && providerOptions.length > 0 && (
        <Select
          value={filters.provider || "all_values"}
          onValueChange={(v) =>
            updateFilter("provider", v === "all_values" ? undefined : v)
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_values">All Providers</SelectItem>
            {providerOptions.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Search */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input adornment="start"
            key={filters.search ?? ""}
            className="w-[180px]"
            placeholder="Search..."
            defaultValue={filters.search || ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateFilter(
                  "search",
                  (e.target as HTMLInputElement).value || undefined,
                );
              }
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-1 ml-auto">
        {!hideClear && hasActiveFilters && (
          <Button
            icon={<X />}
            variant="quiet"
            onClick={clearFilters}
          >
            Clear
          </Button>
        )}

        {onRefresh && (
          <Button
            variant="quiet"
            onClick={onRefresh}
            disabled={isPending}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`}
            />
          </Button>
        )}

        {(onExportCSV || onExportJSON) && (
          <div className="flex items-center">
            {onExportCSV && (
              <Button
                icon={<Download />}
                variant="quiet"
                onClick={onExportCSV}
              >
                CSV
              </Button>
            )}
            {onExportJSON && (
              <Button
                icon={<Download />}
                variant="quiet"
                onClick={onExportJSON}
              >
                JSON
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
