import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, AlertCircle, Info, CheckCircle2, Bug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import type { ReduxLog } from "@/utils/logger/types";

const LogLevel = ({ level }: { level: string }) => {
  const getColorClass = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
        return "text-destructive";
      case "warn":
        return "text-warning";
      case "info":
        return "text-info";
      case "debug":
        return "text-muted-foreground";
      default:
        return "text-success";
    }
  };

  const getIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case "error":
        return <AlertCircle className="w-4 h-4" />;
      case "warn":
        return <AlertCircle className="w-4 h-4" />;
      case "info":
        return <Info className="w-4 h-4" />;
      case "debug":
        return <Bug className="w-4 h-4" />;
      default:
        return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  return (
    <div className={`flex items-center gap-1 ${getColorClass(level)}`}>
      {getIcon(level)}
      <span className="font-medium">{level.toUpperCase()}</span>
    </div>
  );
};

const DetailSection = ({ title, content }: { title: string; content: unknown }) => (
  <div className="mb-4">
    <h3 className="text-sm font-semibold text-muted-foreground mb-2">
      {title}
    </h3>
    <pre className="bg-muted p-3 rounded-md text-sm overflow-auto">
      {typeof content === "object"
        ? JSON.stringify(content, null, 2)
        : String(content)}
    </pre>
  </div>
);

const LogDetailView = ({ log }: { log: ReduxLog }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="p-2 rounded border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <LogLevel level={log.level} />
              <span className="text-xs font-medium text-muted-foreground shrink-0 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(log.context.timestamp).toLocaleString()}
              </span>
              <span className="text-sm font-medium text-foreground truncate">
                {log.message}
              </span>
            </div>
            {log.action?.type && (
              <div>
                <code className="text-xs px-1 py-0.5 rounded bg-muted text-muted-foreground break-all">
                  {log.action.type}
                </code>
              </div>
            )}
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="w-screen h-dvh max-w-full z-[9999]">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <LogLevel level={log.level} />
            <span>{log.message}</span>
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon">
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogHeader>
        <ScrollArea className="h-full mt-4">
          <div className="space-y-6">
            <DetailSection title="Context" content={log.context} />
            <DetailSection title="Action" content={log.action} />
            <DetailSection title="Previous State" content={log.prevState} />
            <DetailSection title="Next State" content={log.nextState} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default LogDetailView;
