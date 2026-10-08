"use client";

import type { ReactNode } from "react";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";

export function StudyDeckHeader({
  title,
  mode,
  backHref,
  onBack,
  actions,
}: {
  title: string;
  /** The study mode, shown as a quiet tag before the deck name ("Learn"). */
  mode?: string;
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
      {mode ? (
        <span className="ml-2 shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary-ink">
          {mode}
        </span>
      ) : null}
      <h1 className="ml-2 min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </h1>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
