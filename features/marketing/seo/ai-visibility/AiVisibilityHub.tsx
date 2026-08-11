"use client";

import { useState } from "react";
import { Globe2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { AiVisibilityWorkspace } from "./AiVisibilityWorkspace";

export function AiVisibilityHub() {
  const sites = useSiteOptions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (sites.isLoading) return <LoadingSurface label="Loading sites…" />;
  if (sites.isError) {
    return (
      <QueryError error={sites.error} onRetry={() => void sites.refetch()} />
    );
  }
  const options = sites.data ?? [];
  const site = options.find((item) => item.id === selectedId) ?? options[0];
  if (!site) {
    return (
      <main className="flex h-full items-center justify-center bg-textured p-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <Globe2 className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-base font-semibold">Add a site first</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI visibility compares answers against a managed site and its brand
            context.
          </p>
        </div>
      </main>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-card px-3 py-2 sm:px-4">
        <Select value={site.id} onValueChange={setSelectedId}>
          <SelectTrigger
            className="h-8 w-full sm:w-80"
            aria-label="Site to analyze"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name} · {option.domain || option.root_url}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1">
        <AiVisibilityWorkspace
          site={site}
          sitePath={marketingRoutes.site(site.brand_id, site.id)}
        />
      </div>
    </div>
  );
}
