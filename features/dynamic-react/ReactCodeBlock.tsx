"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Code2, Eye, Loader2, AlertTriangle, Boxes } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";
import { compileReactComponent } from "./compileReactComponent";

/**
 * ReactCodeBlock — auto-renders a ```jsx / ```tsx / ```react code block as a
 * live React component once it has finished streaming.
 *
 * Mirrors HtmlInlinePreview's state machine:
 *  1. Streaming / incomplete → plain code block.
 *  2. Complete + compiling   → loader.
 *  3. Success                → live component (in an error boundary) + a
 *                              "View code" toggle.
 *  4. Compile/runtime error  → silent code block + opt-in error detail.
 *
 * Execution uses the shared allowlist-scoped compiler (compileReactComponent):
 * curated imports only, runs in-app (trusted/first-party content). See that
 * module for the limitations + the single allowlist extension point.
 */

interface ReactCodeBlockProps {
  code: string;
  /** Raw fence language: jsx | tsx | react | ts | js. */
  language?: string;
  /** True once this block has fully streamed in and is finalized. */
  isComplete: boolean;
  className?: string;
  onCodeChange?: (newCode: string) => void;
}

// ── Error boundary (catches runtime errors thrown while rendering) ──────────
interface BoundaryProps {
  onError: (message: string) => void;
  children: React.ReactNode;
}
interface BoundaryState {
  hasError: boolean;
}
class ReactRenderBoundary extends React.Component<
  BoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error.message || "Component threw while rendering");
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function normalizeLanguage(language?: string): "jsx" | "tsx" {
  return language?.toLowerCase() === "jsx" ? "jsx" : "tsx";
}

const ReactCodeBlock: React.FC<ReactCodeBlockProps> = ({
  code,
  language,
  isComplete,
  className,
  onCodeChange,
}) => {
  const [Component, setComponent] = useState<ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "compiling" | "preview" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [showError, setShowError] = useState(false);

  const compiledForRef = useRef<string | null>(null);

  const fail = useCallback((message: string) => {
    setErrorMessage(message);
    setPhase("error");
  }, []);

  useEffect(() => {
    if (!isComplete) return;
    if (compiledForRef.current === code) return;

    compiledForRef.current = code;
    let cancelled = false;
    setShowCode(false);
    setShowError(false);
    setErrorMessage(null);
    setComponent(null);
    setPhase("compiling");

    (async () => {
      try {
        const compiled = await compileReactComponent({
          code,
          language: normalizeLanguage(language),
        });
        if (cancelled) return;
        setComponent(() => compiled);
        setPhase("preview");
      } catch (err) {
        if (cancelled) return;
        console.error("[ReactCodeBlock] compile failed:", err);
        fail(err instanceof Error ? err.message : "Failed to compile React");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isComplete, code, language, fail]);

  const renderCodeBlock = useCallback(
    () => (
      <CodeBlock
        code={code}
        language={language || "tsx"}
        fontSize={16}
        className="my-3"
        onCodeChange={onCodeChange}
        isStreamActive={!isComplete}
      />
    ),
    [code, language, onCodeChange, isComplete],
  );

  // 1. Streaming → plain code block.
  if (!isComplete) return renderCodeBlock();

  // 2. Compiling → loader.
  if (phase === "compiling" || phase === "idle") {
    return (
      <div
        className={cn(
          "my-3 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-6",
          className,
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            Compiling component…
          </span>
          <span className="text-xs text-muted-foreground">
            Rendering React from the code block
          </span>
        </div>
      </div>
    );
  }

  // 4. Error → code block (silent), with an opt-in reveal.
  if (phase === "error" || !Component) {
    return (
      <div className={cn("my-3", className)}>
        {renderCodeBlock()}
        {errorMessage && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowError((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              <AlertTriangle className="h-3 w-3" />
              <span>{showError ? "Hide details" : "Preview unavailable"}</span>
            </button>
            {showError && (
              <div className="mt-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive whitespace-pre-wrap">
                {errorMessage}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // 3. Success → live component (error-bounded) with a code toggle.
  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Boxes className="h-3.5 w-3.5 text-primary" />
          <span>React component</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-accent",
            showCode && "bg-accent text-foreground",
          )}
        >
          {showCode ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <Code2 className="h-3.5 w-3.5" />
          )}
          <span>{showCode ? "Preview" : "Code"}</span>
        </button>
      </div>
      {showCode ? (
        <div className="p-2">{renderCodeBlock()}</div>
      ) : (
        <div className="bg-textured p-4">
          <ReactRenderBoundary onError={fail}>
            <Component />
          </ReactRenderBoundary>
        </div>
      )}
    </div>
  );
};

export default ReactCodeBlock;
