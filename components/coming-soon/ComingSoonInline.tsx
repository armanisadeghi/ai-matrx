// components/coming-soon/ComingSoonInline.tsx
//
// Platform primitive. Wraps an existing control (button, link, input) to show
// it as a not-yet-available preview: visually dimmed and non-interactive, with
// a tooltip explaining it's coming soon. Use for controls that will be wired
// later but should be visible now so the product vision is clear.

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ComingSoonInlineProps {
  children: React.ReactNode;
  tooltip?: string;
}

export function ComingSoonInline({
  children,
  tooltip = "Coming soon",
}: ComingSoonInlineProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed opacity-60">
          <span className="pointer-events-none" aria-disabled="true">
            {children}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
