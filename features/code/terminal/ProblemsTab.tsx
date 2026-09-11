"use client";

import React from "react";
import { CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllDiagnostics } from "../redux/diagnosticsSlice";
import { selectCodeTabs, setActiveTab } from "../redux/tabsSlice";

interface ProblemsTabProps {
  className?: string;
}

export const ProblemsTab: React.FC<ProblemsTabProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const diagnostics = useAppSelector(selectAllDiagnostics);
  const tabs = useAppSelector(selectCodeTabs);
  const files = tabs.order.filter((id) => diagnostics[id]?.length);
  return (
    <div
      className={cn(
        "h-full overflow-y-auto bg-background text-foreground",
        className,
      )}
    >
      {files.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
          <Info size={22} aria-hidden />
          <p className="text-sm">No editor diagnostics in open files.</p>
          <p className="text-xs">
            Build and runtime errors appear in the terminal or logs.
          </p>
        </div>
      ) : (
        files.map((id) => (
          <section
            key={id}
            aria-label={tabs.byId[id].name}
            className="border-b border-border py-1"
          >
            <button
              type="button"
              onClick={() => dispatch(setActiveTab(id))}
              className="min-h-11 lg:min-h-7 w-full truncate px-3 text-left text-xs font-medium hover:bg-accent"
              title={tabs.byId[id].path}
            >
              {tabs.byId[id].name}{" "}
              <span className="text-muted-foreground">
                ({diagnostics[id].length})
              </span>
            </button>
            {diagnostics[id].map((item, index) => (
              <button
                key={`${item.startLine}:${item.startColumn}:${index}`}
                type="button"
                onClick={() => dispatch(setActiveTab(id))}
                className="flex min-h-11 lg:min-h-7 w-full items-start gap-2 px-4 py-1 text-left text-xs hover:bg-accent"
                title={`Open ${tabs.byId[id].name}`}
              >
                <CircleAlert
                  size={14}
                  aria-hidden
                  className={cn(
                    "mt-0.5 shrink-0",
                    item.severity === "error"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1 break-words">
                  {item.message}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {item.startLine}:{item.startColumn}
                </span>
              </button>
            ))}
          </section>
        ))
      )}
    </div>
  );
};
