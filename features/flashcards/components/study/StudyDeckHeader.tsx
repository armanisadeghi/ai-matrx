"use client";

import type { ReactNode } from "react";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

export function StudyDeckHeader({
  title,
  backHref,
  onBack,
  actions,
}: {
  title: string;
  backHref?: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 items-center gap-0 p-0">
      <ChevronLeftTapButton
        variant="transparent"
        ariaLabel="Back"
        href={backHref}
        onClick={onBack}
      />
      <h1 className="ml-2 min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </h1>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
