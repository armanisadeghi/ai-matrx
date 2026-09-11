"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTerminalLines } from "../redux/terminalSlice";

interface OutputTabProps {
  className?: string;
}

export const OutputTab: React.FC<OutputTabProps> = ({ className }) => {
  const lines = useAppSelector(selectTerminalLines);
  const outputLines = lines.filter(
    (line) => line.tab === "output" || line.source === "agent",
  );

  return (
    <div
      className={cn(
        "h-full overflow-y-auto bg-background px-3 py-2 font-mono text-xs text-foreground",
        className,
      )}
    >
      {outputLines.length === 0 ? (
        <div className="text-muted-foreground">
          No task output yet. Commands run by workspace tools appear here.
        </div>
      ) : (
        outputLines.map((line) => (
          <div key={line.id} className="whitespace-pre-wrap">
            {line.text}
          </div>
        ))
      )}
    </div>
  );
};
