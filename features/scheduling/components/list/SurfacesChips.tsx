// features/scheduling/components/list/SurfacesChips.tsx

"use client";

import { Badge } from "@/components/ui/badge";
import { SURFACE_META } from "../../constants/surfaces";
import type { Surface } from "../../types";

interface Props {
  surfaces: Surface[];
  max?: number;
}

export function SurfacesChips({ surfaces, max = 3 }: Props) {
  if (!surfaces || surfaces.length === 0) return null;

  const visible = surfaces.slice(0, max);
  const overflow = surfaces.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((s) => (
        <Badge
          key={s}
          variant="secondary"
          className="text-[10px] uppercase tracking-wide font-medium"
          title={SURFACE_META[s]?.description}
        >
          {SURFACE_META[s]?.label ?? s}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="secondary" className="text-[10px]">
          +{overflow}
        </Badge>
      )}
    </div>
  );
}
