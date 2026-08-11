"use client";

/**
 * The rendered half of `lib/records/recordUnavailable.ts`: a zero-row read is
 * a fork in the road, not a full stop. It says which case it is (deletion only
 * when PROVEN) and hands over every door the user can still take — the list
 * they came from, the org switcher (an access gap is the most common cause,
 * and the fix is almost always "you're in the wrong org / hold no membership"),
 * and a way to report it.
 */

import { useState } from "react";
import Link from "next/link";
import { Building2, LifeBuoy, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";
import { useOpenFeedbackWindow } from "@/features/overlays/openers/feedbackDialog";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { RecordUnavailableError } from "@/lib/records/recordUnavailable";

export function RecordUnavailableNotice({
  error,
  onRetry,
}: {
  error: RecordUnavailableError;
  onRetry?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const openFeedback = useOpenFeedbackWindow();
  const deleted = error.reason === "deleted";

  return (
    <div className="flex h-full min-h-40 items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          {deleted ? (
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {deleted
                ? `This ${error.entity} was deleted`
                : `We couldn't open this ${error.entity}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {deleted
                ? `It was removed, so it can no longer be opened.`
                : `It may have been deleted, or it may belong to an organization you don't have access to. Nothing here proves it is gone.`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {onRetry ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={onRetry}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
              ) : null}
              <Button size="sm" variant="outline" className="h-7" asChild>
                <Link href={marketingRoutes.sites()}>All sites</Link>
              </Button>
              <Button size="sm" variant="outline" className="h-7" asChild>
                <Link href={marketingRoutes.brands()}>All brands</Link>
              </Button>
              {deleted ? null : (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7">
                      <Building2 className="mr-1.5 h-3.5 w-3.5" />
                      Switch organization
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-1">
                    <OrganizationPickerPanel />
                  </PopoverContent>
                </Popover>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() =>
                  openFeedback({
                    title: `Can't open this ${error.entity}`,
                  })
                }
              >
                <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
                Report this
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
