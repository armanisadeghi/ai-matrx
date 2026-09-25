// The icon in a callout's title row (and the fold chevron of a foldable one).
// Environment-neutral: no hooks, renders on the server too.

import {
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Info,
  Lightbulb,
  MessageSquareWarning,
  OctagonAlert,
  Pencil,
  Quote,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  note: Pencil,
  tip: Lightbulb,
  important: MessageSquareWarning,
  warning: TriangleAlert,
  caution: OctagonAlert,
  info: Info,
  success: CircleCheck,
  question: CircleHelp,
  quote: Quote,
};

export function CalloutIcon(props: { "data-type"?: string }) {
  const type = props["data-type"] ?? "note";
  if (type === "chevron") {
    return (
      <ChevronRight
        aria-hidden
        className="ml-auto h-4 w-4 shrink-0 opacity-70 transition-transform group-open/callout:rotate-90"
      />
    );
  }
  const Icon = ICONS[type] ?? Info;
  return <Icon aria-hidden className="h-4 w-4 shrink-0" />;
}
