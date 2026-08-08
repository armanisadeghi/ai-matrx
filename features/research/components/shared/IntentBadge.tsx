import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntentBadgeProps {
  /** `research_intent.label` for the topic's `intent_key`, or null when unset. */
  label: string | null;
  className?: string;
}

/**
 * Quiet muted chip naming the research intent driving this topic's pipeline
 * (`rs_topic.intent_key` → `research_intent.label`). Renders nothing when
 * unset — NULL means legacy/topic_deep_dive default behavior, not an error
 * state, so there is nothing to flag.
 */
export function IntentBadge({ label, className }: IntentBadgeProps) {
  if (!label) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      <Compass className="h-2.5 w-2.5 shrink-0 opacity-70" />
      {label}
    </span>
  );
}
