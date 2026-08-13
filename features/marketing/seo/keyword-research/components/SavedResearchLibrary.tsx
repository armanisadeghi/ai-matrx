"use client";

/**
 * The org's saved keyword-research artifacts, as doors.
 *
 * Every run persists a `content_ir.kind_instance`, but until now the only way
 * back to one was to retype its exact phrase — the artifacts existed with no
 * surface listing them (a dead end by the Door Law). This popover lists them
 * newest-first and gives each row its two doors: open the full report
 * (`/shapes/instances/[id]`) and share it (the canonical ShareButton), which is
 * also the workbench's page-level share affordance.
 */

import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { listSavedKeywordResearch } from "@/features/marketing/seo/keyword-research/data/queries";
import { ShareButton } from "@/features/sharing/components/ShareButton";

export function savedKeywordResearchListQueryKey(
  organizationId: string | null,
) {
  return ["seo", "keyword-research", "saved-list", organizationId] as const;
}

export default function SavedResearchLibrary({
  organizationId: explicitOrganizationId,
}: {
  organizationId?: string | null;
}) {
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const organizationId = explicitOrganizationId ?? effectiveOrgId ?? null;

  const saved = useQuery({
    queryKey: savedKeywordResearchListQueryKey(organizationId),
    queryFn: ({ signal }) =>
      organizationId
        ? listSavedKeywordResearch(organizationId, { signal })
        : Promise.resolve([]),
    enabled: Boolean(organizationId),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <FolderOpen className="h-3.5 w-3.5" />
          Saved research
          {saved.data?.length ? (
            <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
              {saved.data.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-foreground">
            Saved keyword research
          </p>
          <p className="text-[11px] text-muted-foreground">
            Every run your organization has saved. Open the report or share it
            with a client.
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {saved.isLoading ? (
            <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading saved research…
            </p>
          ) : saved.error ? (
            <p className="px-3 py-4 text-xs text-destructive">
              Could not load saved research:{" "}
              {saved.error instanceof Error
                ? saved.error.message
                : String(saved.error)}
            </p>
          ) : !saved.data?.length ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No saved research yet. Run research above and it is saved here
              automatically.
            </p>
          ) : (
            saved.data.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 last:border-0"
              >
                <Link
                  href={`/shapes/instances/${row.id}`}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-medium text-foreground hover:underline">
                    {row.artifact.primary_keyword}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {(row.artifact.keyword_lists ?? []).reduce(
                      (total, list) => total + (list.keywords?.length ?? 0),
                      0,
                    )}{" "}
                    keywords · {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                </Link>
                <ShareButton
                  resourceType="content_ir_kind_instance"
                  resourceId={row.id}
                  resourceName={
                    row.title ??
                    `Keyword research: ${row.artifact.primary_keyword}`
                  }
                  size="sm"
                  variant="ghost"
                />
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
