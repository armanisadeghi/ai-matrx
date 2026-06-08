// components/coming-soon/ComingSoonCard.tsx
//
// Platform primitive. A dashed-border placeholder card that previews a feature
// not yet built/wired. Drop it where the real surface will eventually live so
// the product vision is visible to users and the next agent knows what to wire.

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComingSoonBadge } from "./ComingSoonBadge";

interface ComingSoonCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}

export function ComingSoonCard({ icon: Icon, title, description, className }: ComingSoonCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center",
        className,
      )}
    >
      <Icon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
      <div className="flex items-center justify-center gap-2 font-medium text-foreground">
        {title}
        <ComingSoonBadge />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
