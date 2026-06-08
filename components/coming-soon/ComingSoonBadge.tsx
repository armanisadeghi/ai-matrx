// components/coming-soon/ComingSoonBadge.tsx
//
// Platform primitive. A small, consistent "Coming soon" pill used to mark UI
// that is built but not yet wired to the backend. Use it inline next to a
// feature label, control, or section heading so the product vision is visible.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ComingSoonBadgeProps {
  label?: string;
  className?: string;
}

export function ComingSoonBadge({ label = "Coming soon", className }: ComingSoonBadgeProps) {
  return (
    <Badge variant="secondary" className={cn("text-[10px]", className)}>
      {label}
    </Badge>
  );
}
