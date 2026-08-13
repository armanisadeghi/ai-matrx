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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, Search, X } from "lucide-react";
import {
  filtersFromSearchParams,
  filtersToSearchParams,
} from "../utils/filters";
import type { CxFilters } from "../types/cxDashboardTypes";

type Props = {
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
      const newFilters = { ...filters, [key]: value, page: undefined };
      const params = filtersToSearchParams(newFilters);
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [filters, pathname, router],
  );

  const clearFilters = useCallback(() => {
    startTransition(() => {
      router.push(pathname);
    });
  }, [pathname, router]);

  const hasActiveFilters = searchParams.toString().length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Timeframe */}
      <Select
        value={filters.timeframe}
        onValueChange={(v) => updateFilter("timeframe", v)}
      >
        <SelectTrigger className="w-[120px] h-8 text-xs">
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
          <SelectTrigger className="w-[120px] h-8 text-xs">
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
          <SelectTrigger className="w-[120px] h-8 text-xs">
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
          <Input
            className="h-8 text-xs pl-7 w-[180px]"
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
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={clearFilters}
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}

        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
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
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={onExportCSV}
              >
                <Download className="w-3 h-3 mr-1" />
                CSV
              </Button>
            )}
            {onExportJSON && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={onExportJSON}
              >
                <Download className="w-3 h-3 mr-1" />
                JSON
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
