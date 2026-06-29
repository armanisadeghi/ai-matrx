"use client";

import React, {
  useState,
  useCallback,
  ErrorInfo,
  ReactNode,
  Component,
} from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ChevronRight, ChevronDown } from "lucide-react";

// =============================================================================
// ERROR BOUNDARY
// =============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RenderErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ResponseViewer render error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// =============================================================================
// JSON EXPLORER
// =============================================================================

interface JsonNodeProps {
  data: unknown;
  keyName?: string;
  depth?: number;
  defaultExpanded?: boolean;
}

function JsonNode({
  data,
  keyName,
  depth = 0,
  defaultExpanded = true,
}: JsonNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded && depth < 2);

  const isExpandable = data !== null && typeof data === "object";
  const isArray = Array.isArray(data);

  const getPreview = () => {
    if (isArray) return `Array(${(data as unknown[]).length})`;
    if (typeof data === "object" && data !== null) {
      const keys = Object.keys(data);
      return `{${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", ..." : ""}}`;
    }
    return "";
  };

  const renderValue = () => {
    if (data === null) return <span className="text-orange-500">null</span>;
    if (data === undefined)
      return <span className="text-muted-foreground">undefined</span>;
    if (typeof data === "boolean")
      return (
        <span className="text-purple-500 dark:text-purple-400">
          {String(data)}
        </span>
      );
    if (typeof data === "number")
      return <span className="text-blue-500 dark:text-blue-400">{data}</span>;
    if (typeof data === "string") {
      return (
        <span className="text-green-600 dark:text-green-400">"{data}"</span>
      );
    }
    return null;
  };

  if (!isExpandable) {
    return (
      <div
        className="flex items-start gap-2 py-0.5"
        style={{ paddingLeft: depth * 16 }}
      >
        {keyName && (
          <span className="text-rose-600 dark:text-rose-400 font-medium shrink-0">
            "{keyName}":
          </span>
        )}
        {renderValue()}
      </div>
    );
  }

  const entries = isArray
    ? (data as unknown[]).map(
        (item, index) => [index, item] as [number, unknown],
      )
    : Object.entries(data as object);

  return (
    <div className="py-0.5">
      <div
        className="flex items-center gap-1 cursor-pointer hover:bg-muted rounded px-1 -mx-1"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        {keyName && (
          <span className="text-rose-600 dark:text-rose-400 font-medium">
            "{keyName}":
          </span>
        )}
        <span className="text-muted-foreground text-xs">{getPreview()}</span>
      </div>
      {expanded && (
        <div>
          {entries.map(([key, value]) => (
            <JsonNode
              key={String(key)}
              data={value}
              keyName={String(key)}
              depth={depth + 1}
              defaultExpanded={depth < 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTreeViewer({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [data]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-border bg-muted shrink-0">
        <span className="text-xs text-muted-foreground">JSON Explorer</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span className="ml-1.5 text-xs">{copied ? "Copied!" : "Copy"}</span>
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs">
        <JsonNode data={data} defaultExpanded={true} />
      </div>
    </div>
  );
}

// =============================================================================
// RAW JSON VIEW
// =============================================================================

function RawJsonView({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [jsonString]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-border bg-muted shrink-0">
        <span className="text-xs text-muted-foreground">
          Raw JSON ({(jsonString.length / 1024).toFixed(1)} KB)
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span className="ml-1.5 text-xs">{copied ? "Copied!" : "Copy"}</span>
        </Button>
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs text-foreground font-mono whitespace-pre-wrap">
        {jsonString}
      </pre>
    </div>
  );
}
