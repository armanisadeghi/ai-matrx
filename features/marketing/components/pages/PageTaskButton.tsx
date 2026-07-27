"use client";

/**
 * PageTaskButton — the ONE "create a task from this" affordance for the page
 * workspace. Rendered in the identity header and as a `headerExtra` on every
 * card; each call site passes its own finding payload (indexability issue,
 * link gap, keyword research follow-up…) as the pre-populated title/
 * description. Opens the existing task quick-create window pre-linked to the
 * page (source = web_page), so the saved task lands in PageTasksCard and
 * every TaskChipRow without any extra wiring.
 */

import { ListTodo } from "lucide-react";
import { useOpenTaskQuickCreateWindow } from "@/features/overlays/openers/taskQuickCreateWindow";
import type { MarketingPage } from "@/features/marketing/types";
import { cn } from "@/lib/utils";

export function PageTaskButton({
  page,
  title,
  description,
  ariaLabel = "Create a task for this",
  className,
}: {
  page: MarketingPage;
  /** Pre-populated task title (e.g. "Fix canonical on /pricing"). */
  title?: string;
  /** Pre-populated task description — the finding payload. */
  description?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const openTaskWindow = useOpenTaskQuickCreateWindow();
  return (
    <button
      type="button"
      onClick={() =>
        openTaskWindow({
          source: {
            entity_type: "web_page",
            entity_id: page.id,
            label: page.path || page.url,
          },
          prePopulate: {
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
          },
        })
      }
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <ListTodo className="h-3.5 w-3.5" />
    </button>
  );
}
