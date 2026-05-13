"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { STATUS_PHASES, STATUS_CONFIG } from "../constants";
import type { ContextItemManifest, ContextItemStatus } from "../types";

type Props = {
  items: ContextItemManifest[];
  onStatusChange?: (itemId: string, status: ContextItemStatus) => void;
};

export function ContextKanban({ items, onStatusChange }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const byPhase = STATUS_PHASES.map((phase) => ({
    ...phase,
    items: items.filter((i) => phase.statuses.includes(i.status)),
  }));

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 min-h-[400px]">
      {byPhase.map((phase) => (
        <div key={phase.key} className="min-w-[220px] w-[220px] shrink-0">
          <div className="flex items-center gap-2 mb-2 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {phase.label}
            </h3>
            <Badge variant="outline" className="h-4 text-[10px] px-1">
              {phase.items.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {phase.items.map((item) => {
              const config = STATUS_CONFIG[item.status];
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border border-border p-2.5 cursor-pointer hover:border-primary/30 transition-colors bg-card ${isPending ? "opacity-60" : ""}`}
                  onClick={() =>
                    startTransition(() =>
                      router.push(`/agent-context/items/${item.id}`),
                    )
                  }
                >
                  <p className="text-xs font-medium truncate mb-1">
                    {item.display_name}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${config.colorDot}`}
                    />
                    <span className={`text-[10px] ${config.colorText}`}>
                      {config.label}
                    </span>
                  </div>
                  {item.category && (
                    <Badge
                      variant="outline"
                      className="h-4 text-[10px] px-1 mt-1.5"
                    >
                      {item.category}
                    </Badge>
                  )}
                  {item.char_count != null && item.char_count > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      ~{item.char_count.toLocaleString()} chars
                    </p>
                  )}
                </div>
              );
            })}
            {phase.items.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/50 p-4 text-center">
                <p className="text-[10px] text-muted-foreground">No items</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
