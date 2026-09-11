"use client";

import React from "react";
import { Bug } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setActiveTab } from "../redux/terminalSlice";
import { Button } from "@/components/ui/button";

interface DebugConsoleTabProps {
  className?: string;
}

export const DebugConsoleTab: React.FC<DebugConsoleTabProps> = ({
  className,
}) => {
  const dispatch = useAppDispatch();
  return (
    <div
      className={cn(
        "flex h-full items-center justify-center bg-background p-4 text-muted-foreground",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <Bug size={28} strokeWidth={1.2} />
        <p className="text-sm">Run your debugger in the terminal.</p>
        <p className="text-xs">
          This panel does not receive interactive debugger output yet.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch(setActiveTab("terminal"))}
        >
          Open terminal
        </Button>
      </div>
    </div>
  );
};
