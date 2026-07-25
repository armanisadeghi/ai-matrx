"use client";

/**
 * VARIABLE PREVIEW — the exact text each agent variable will contain.
 *
 * This exists because "I selected 40 pages" is not the same claim as "the agent
 * received 40 pages". Between the two sit filters, ordering, the budget, empty
 * bodies and rendering — so the only honest preview is the resolved payload
 * itself, produced by the same `resolveBundle` the run calls.
 *
 * Resolution is on demand (it reads bodies), and the report is shown ALONGSIDE
 * the text: what was included, what was dropped, and why.
 */

import { useState } from "react";
import { ChevronRight, Eye, Loader2, AlertTriangle, Copy } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatChars, formatTokens } from "@/lib/tokens/estimate";
import { resolveBundle } from "../../resources/resolve";
import { kindDef } from "../../resources/catalog";
import type {
  ContextBundle,
  ResolutionReport,
  ResourceManifest,
} from "../../resources/types";

interface VariablePreviewProps {
  manifest: ResourceManifest;
  bundle: ContextBundle;
  /** Extra variables the caller will send alongside (tone profile etc.). */
  extraVariables?: Record<string, string>;
  disabled?: boolean;
}

export function VariablePreview({
  manifest,
  bundle,
  extraVariables,
  disabled,
}: VariablePreviewProps) {
  const [resolving, setResolving] = useState(false);
  const [result, setResult] = useState<{
    variables: Record<string, string>;
    report: ResolutionReport;
  } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setResolving(true);
    setError(null);
    try {
      const resolved = await resolveBundle(manifest, bundle, {
        extraVariables,
      });
      setResult(resolved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the preview");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={run}
          disabled={disabled || resolving || bundle.selectors.length === 0}
        >
          {resolving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          Build preview
        </Button>
        {result && (
          <span className="text-[11px] text-muted-foreground">
            {Object.keys(result.variables).length} variables ·{" "}
            {formatChars(result.report.totalChars)} chars · ~
            {formatTokens(result.report.totalTokens)} tokens
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/[0.06] px-2.5 py-2 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {result && (
        <>
          {(result.report.truncated || result.report.exceedsBudget) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Not everything selected made it in
              </div>
              <ul className="space-y-0.5 pl-5 text-[11px] text-amber-700/90 dark:text-amber-400/90">
                {result.report.notes.map((note, i) => (
                  <li key={i} className="list-disc">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.report.emptyKinds.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Selected but empty:{" "}
              {result.report.emptyKinds
                .map((k) => kindDef(k)?.label ?? k)
                .join(", ")}
              .
            </div>
          )}

          <div className="rounded-lg border border-border/60 divide-y divide-border/50 overflow-hidden">
            {Object.entries(result.variables).map(([name, text]) => {
              const isOpen = open === name;
              const kinds = result.report.perKind.filter(
                (k) => k.variable === name && k.included > 0,
              );
              return (
                <div key={name} className="bg-card/30">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : name)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent/30"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                    <code className="text-xs font-medium text-foreground">
                      {name}
                    </code>
                    <div className="flex-1 min-w-0 truncate text-[10px] text-muted-foreground">
                      {kinds
                        .map(
                          (k) =>
                            `${kindDef(k.kind)?.label ?? k.kind} ×${k.included}`,
                        )
                        .join(" · ")}
                    </div>
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] tabular-nums">
                      {formatChars(text.length)}
                    </Badge>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border/50 bg-muted/30">
                      <div className="flex items-center justify-end px-2 py-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 text-[10px]"
                          onClick={() => {
                            void navigator.clipboard.writeText(text);
                            toast.success(`Copied ${name}`);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                      </div>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-2.5 pb-2.5 text-[11px] leading-relaxed text-foreground/85">
                        {text}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
