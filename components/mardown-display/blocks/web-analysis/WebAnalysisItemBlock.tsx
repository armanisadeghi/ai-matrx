"use client";

/**
 * The ONE renderer for the `web_analysis_item` kind family — the 83 registered
 * `web_*_v1` site-audit checks (`web_title_presence_v1`,
 * `web_broken_images_v1`, `web_cwv_lcp_v1`, …).
 *
 * Every one of those kinds carries the SAME verified shape; only the
 * `evidence[]` item properties differ per check:
 *
 *   { checked?: int, summary: string, issues_found: int,
 *     evidence?: object[], recommendations?: string[] }
 *
 * So they get ONE component, pointed at by one `content_ir.kind_component` row
 * per kind — never 85 near-identical renderers (THE CANONICAL COMPONENT LAW).
 * A check whose evidence rows are uniform renders as a real table; a ragged one
 * degrades to titled sections. Both come from {@link ResultValue}, the platform's
 * existing value renderer — this component contributes the audit VERDICT
 * (pass / issues found) and the fix list, nothing the platform already owns.
 *
 * Route contract: reached ONLY through `applyIrKindRoute`'s resolver-only path,
 * which CLEARS `serverData` (the raw region's `{ language: "json" }` annotation
 * is not kind data). The value comes from the envelope on `metadata.__ir`, with
 * the same descending-fidelity recovery the generic block uses so a region that
 * never parsed still shows its source verbatim.
 *
 * Bare by construction (THE WRAPPER LAW): every host that routes a block here
 * already draws chrome. This contributes flow spacing and no frame of its own.
 */

import React from "react";
import { Braces, CircleCheck, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { ResultMarkdown } from "@/features/tool-call-visualization/result-fields/ResultMarkdown";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import { reconstructRegionValue } from "@/features/content-ir/core/envelope-value";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";

export interface WebAnalysisItemBlockProps {
  /** The raw region source — the zero-loss floor when no envelope survived. */
  content: string;
  /** Carries `__ir` (the parsed envelope) and `__ir_route` (the seam marker). */
  metadata?: Record<string, unknown>;
  className?: string;
}

interface AuditCheckValue {
  checked: number | null;
  summary: string;
  issuesFound: number | null;
  evidence: unknown[];
  recommendations: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Same descending-fidelity recovery as the generic block: the envelope is the
 * source of truth (it merges residues back, so unknown keys survive), a bare
 * `JSON.parse` is the floor, and unparseable text is never swallowed.
 */
function readValue(
  content: string,
  metadata: Record<string, unknown> | undefined,
): unknown {
  const envelope = readEnvelope(metadata);
  if (envelope) return reconstructRegionValue(envelope);
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

/** Null-guarded read of the family shape; every field is optional in practice. */
function readCheck(value: unknown): AuditCheckValue | null {
  if (!isRecord(value)) return null;
  return {
    checked: readInt(value.checked),
    summary: typeof value.summary === "string" ? value.summary : "",
    issuesFound: readInt(value.issues_found),
    evidence: Array.isArray(value.evidence) ? value.evidence : [],
    recommendations: Array.isArray(value.recommendations)
      ? value.recommendations.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
}

/** `web_broken_images_v1` → "Broken images" (family prefix + version stripped). */
function checkTitle(kind: string): string {
  if (!kind) return "";
  const core = kind.replace(/^web_/, "").replace(/_v\d+$/, "");
  return core ? humanizeKey(core) : "";
}

const WebAnalysisItemBlock: React.FC<WebAnalysisItemBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const envelope = readEnvelope(metadata);
  const status = envelope?.root.status ?? "complete";
  const value = readValue(content, metadata);
  const check = readCheck(value);

  // The check's name comes from its own kind slug — `web_broken_images_v1`
  // reads as "Broken images". `KindDefinition` carries no label, and 85
  // hardcoded per-kind titles is exactly the duplication this component exists
  // to avoid.
  const kind = envelope?.root.kind ?? "";
  const label = checkTitle(kind);

  if (!check) {
    // Zero-data-loss backstop: the region never parsed as the family shape, so
    // show the source verbatim rather than an empty verdict.
    return (
      <pre
        className={cn(
          "my-2 max-h-96 overflow-auto font-mono text-xs leading-relaxed text-muted-foreground",
          className,
        )}
      >
        {content}
      </pre>
    );
  }

  const passed = check.issuesFound === 0;
  const hasCount = check.issuesFound !== null;

  return (
    <div className={cn("my-2 min-w-0 space-y-3", className)}>
      {status === "streaming" ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Braces className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          <span>Still arriving…</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {hasCount ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
              passed
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {passed ? (
              <CircleCheck className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            )}
            {passed
              ? "No issues found"
              : `${check.issuesFound!.toLocaleString()} ${
                  check.issuesFound === 1 ? "issue" : "issues"
                } found`}
          </span>
        ) : null}
        {label ? (
          <span className="text-sm font-medium text-foreground">{label}</span>
        ) : null}
        {check.checked !== null ? (
          <span className="text-xs text-muted-foreground">
            {check.checked.toLocaleString()} checked
          </span>
        ) : null}
      </div>

      {check.summary ? (
        <ResultMarkdown content={check.summary} density="full" />
      ) : null}

      {check.recommendations.length > 0 ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            What to fix
          </div>
          <ol className="ml-4 list-decimal space-y-1 text-sm text-foreground marker:text-muted-foreground">
            {check.recommendations.map((item, index) => (
              <li key={index} className="pl-1">
                {item}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {check.evidence.length > 0 ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            Evidence
          </div>
          {/* Uniform rows become a real table; ragged ones become titled
              sections — both from the platform's existing value renderer. */}
          <ResultValue value={check.evidence} density="full" />
        </div>
      ) : null}
    </div>
  );
};

export default WebAnalysisItemBlock;
