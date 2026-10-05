import React from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@ai-matrx/design-system";

const SEND_BTN_CLASS =
  "h-9 w-9 p-0 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-25 disabled:shadow-none shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_1px_2px_0_rgba(0,0,0,0.25)]";

export function UninitializedShell() {
  return (
    <div className="bg-card rounded-[20px] border border-border overflow-hidden shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]">
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
        <Button
          disabled
          className={SEND_BTN_CLASS}
          aria-label="Send message (still initializing)"
        >
          <ArrowUp className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
