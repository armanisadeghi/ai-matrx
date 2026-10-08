"use client";

import { Loader2, RotateCw } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import IconButton from "@/features/shell/components/IconButton";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";

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
  admin: "/administration/reporting/reports",
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
    <RouteHeader
      left={
      <>
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
      </>
      }
      right={
        !mobileDetail ? (
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
        ) : undefined
      }
    />
  );
}
