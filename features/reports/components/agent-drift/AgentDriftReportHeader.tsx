"use client";

import { Loader2, RotateCw } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import IconButton from "@/features/shell/components/IconButton";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

interface AgentDriftReportHeaderProps {
  mode: "user" | "admin";
  loading?: boolean;
  /** Mobile detail drill-in — show back to list instead of reports landing. */
  mobileDetail?: boolean;
  onBackFromDetail?: () => void;
  onRefresh: () => void;
}

const BACK_HREF = {
  user: "/reports",
  admin: "/administration/reports",
} as const;

export function AgentDriftReportHeader({
  mode,
  loading = false,
  mobileDetail = false,
  onBackFromDetail,
  onRefresh,
}: AgentDriftReportHeaderProps) {
  const title = mobileDetail
    ? "Agent detail"
    : mode === "admin"
      ? "Agent Drift · all users"
      : "Agent Drift";

  const backHref = BACK_HREF[mode];

  return (
    <PageHeader>
      <div className="flex items-center w-full min-w-0 gap-0 px-0">
        {mobileDetail ? (
          <ChevronLeftTapButton
            variant="transparent"
            ariaLabel="Back to report"
            onClick={onBackFromDetail}
          />
        ) : (
          <ChevronLeftTapButton
            href={backHref}
            variant="transparent"
            ariaLabel="Back to reports"
          />
        )}
        <h1 className="ml-2 text-sm font-medium text-foreground truncate">
          {title}
        </h1>
        {!mobileDetail ? (
          <div className="ml-auto shrink-0 flex items-center">
            <IconButton
              icon={
                loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )
              }
              onClick={onRefresh}
              label="Refresh report"
              disabled={loading}
            />
          </div>
        ) : null}
      </div>
    </PageHeader>
  );
}
