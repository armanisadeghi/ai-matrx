"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { Json } from "@/types/database.types";

export interface AccessPlannerProps {
  initialSnapshot: Json;
}

export const AccessPlanner = dynamic(
  () =>
    import("./AccessPlannerImpl").then((module) => module.AccessPlannerImpl),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Building the access map…
      </div>
    ),
  },
);
