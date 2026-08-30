import React from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UninitializedShell({
  sendBtnClass,
  singleRow,
}: {
  sendBtnClass: string;
  singleRow: boolean;
}) {
  if (singleRow) {
    return (
      <div className="flex items-center gap-1 bg-card rounded-full border border-border px-2 py-1 w-full shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]">
        <textarea
          disabled
          placeholder="Initializing..."
          className="flex-1 bg-transparent border-none outline-none text-xs text-muted-foreground/50 placeholder:text-muted-foreground/40 resize-none leading-5"
          style={{ minHeight: 20, maxHeight: 20 }}
          rows={1}
        />
        <Button disabled className={sendBtnClass}>
          <ArrowUp className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-[28px] border border-border overflow-hidden shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]">
      <div className="px-3 pt-3">
        <textarea
          disabled
          placeholder="Initializing..."
          className="w-full bg-transparent border-none outline-none text-base text-muted-foreground/50 placeholder:text-muted-foreground/40 resize-none leading-7"
          style={{ minHeight: 40, maxHeight: 200 }}
          rows={1}
        />
      </div>
      <div className="flex items-center justify-end px-2 pb-2">
        <Button disabled className={sendBtnClass}>
          <ArrowUp className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
